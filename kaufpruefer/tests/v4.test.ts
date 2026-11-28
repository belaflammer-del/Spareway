import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import type { AIProvider, StructuredRequest } from "@/lib/ai/provider";
import { UsageMeter } from "@/lib/ai/provider";
import { aggregateRecommendation, suggestNextStep } from "@/lib/akte/service";
import type { ChatMessage, InspectionData } from "@/lib/akte/schemas";
import { detectContradictions, detectSignals, mergeChatMessages, parsePastedChat, updateRecommendation } from "@/lib/chat/engine";
import { redactPersonalData } from "@/lib/chat/redact";
import { analyzeChat, findSupportingMessage, validateAiAnalysis } from "@/lib/chat/service";
import { compareTotalCosts, computeCosts } from "@/lib/costs/analyze";
import { DEMO_COST_TABLE, validCostEntries, type CostTableEntry } from "@/lib/costs/table";
import { getDemoReport } from "@/lib/demo";
import type { AnalysisReport } from "@/lib/domain/schemas";
import { classifyMatch, fingerprint, hamming } from "@/lib/images/hash";
import { buildInspectionChecklist, mergeInspectionItems, newInspection, summarizeInspection } from "@/lib/inspection/checklist";
import { backoffSeconds, enqueueJob, executeJob, NonRetryableError, registerJobHandler, requestCancel } from "@/lib/jobs/queue";
import { assertSafeUrl, isPrivateAddress, makeSafeFetch } from "@/lib/share/safe-fetch";
import { normalizeListingUrl } from "@/lib/share/normalize";
import { processShare } from "@/lib/share/import";
import { LocalStore } from "@/lib/store/local";
import type { AnalysisRecord } from "@/lib/store/types";
import { diffSnapshots, priceHistory, snapshotFromListing } from "@/lib/watch/diff";

let store: LocalStore;
beforeEach(() => {
  store = new LocalStore(path.join(mkdtempSync(path.join(tmpdir(), "kk4-")), "db.json"));
  (globalThis as unknown as { __kkStore: LocalStore }).__kkStore = store;
  process.env.JOB_WORKER = "off"; // Jobs in Tests gezielt ausführen
});

const audi = () => structuredClone(getDemoReport("audi-a4")!) as AnalysisReport;
const iphone = () => structuredClone(getDemoReport("iphone-15-pro")!) as AnalysisReport;

function record(report: AnalysisReport, over: Partial<AnalysisRecord> = {}): AnalysisRecord {
  return {
    id: "an_test1",
    userId: "u1",
    status: "completed",
    tier: "full",
    category: report.listing.category,
    platform: report.listing.platform,
    title: report.listing.title ?? "Test",
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    report: { ...report, isDemo: false },
    aiCostUsd: 0,
    aiInputTokens: 0,
    aiOutputTokens: 0,
    mode: "rules_only",
    ...over,
  };
}

const msg = (id: string, sender: ChatMessage["sender"], text: string): ChatMessage => ({ id, sender, text, source: "pasted_text", redacted: false });

// ───────────────────────────── Teilen-Menü ─────────────────────────────
describe("Funktion 1: Teilen-Menü / Share-Import", () => {
  it("normalisiert Links aus App, Mobilseite und Desktop auf dieselbe Form", () => {
    expect(normalizeListingUrl("https://www.ebay.de/itm/Schoene-Uhr/123456789012?_trkparms=x&mkevt=1")!.url).toBe("https://www.ebay.de/itm/123456789012");
    expect(normalizeListingUrl("http://m.ebay.de/itm/123456789012")!.url).toBe("https://www.ebay.de/itm/123456789012");
    const a = normalizeListingUrl("https://m.kleinanzeigen.de/s-anzeige/bmw-320d/2871234567-216-1234?utm_source=sharesheet")!;
    const b = normalizeListingUrl("https://www.kleinanzeigen.de/s-anzeige/bmw-320d/2871234567-216-1234")!;
    expect(a.url).toBe(b.url);
    expect(a.adapter?.id).toBe("kleinanzeigen");
    expect(normalizeListingUrl("https://www.vinted.de/items/4711-jacke?referrer=catalog")!.url).toBe("https://www.vinted.de/items/4711");
  });

  it("übernimmt eine unterstützte URL aus einem Teilen-Text und verlangt ohne Schnittstelle Screenshots", async () => {
    const r = await processShare({ text: "Schau mal, was ich auf Kleinanzeigen gefunden habe: BMW 320d Touring https://www.kleinanzeigen.de/s-anzeige/bmw-320d/2871234567-216-1234?utm_source=sharesheet" }, "u1");
    expect(r.ok).toBe(true);
    expect(r.kind).toBe("listing_link");
    expect(r.platform).toBe("kleinanzeigen");
    expect(r.titleHint).toContain("BMW 320d");
    expect(r.autoImport).toBe(false);
    expect(r.needsScreenshots).toBe(true);
    expect(r.missing).toContain("Preis");
  });

  it("liefert für nicht unterstützte Plattformen eine verständliche Meldung mit Screenshot-Fallback", async () => {
    const r = await processShare({ url: "https://www.willhaben.at/iad/kaufen-und-verkaufen/d/fahrrad-123" }, "u1");
    expect(r.kind).toBe("unsupported_link");
    expect(r.message).toMatch(/nicht automatisch unterstützt/);
    expect(r.needsScreenshots).toBe(true);
  });

  it("ohne Link: mit Bildern → Screenshot-Weg, ohne alles → klare Meldung", async () => {
    expect((await processShare({ uploadIds: ["up_abcdef12"] }, "u1")).kind).toBe("files_only");
    const none = await processShare({ text: "Hallo" }, "u1");
    expect(none.ok).toBe(false);
    expect(none.message).toMatch(/Screenshots/);
  });

  it("erkennt bereits geprüfte Inserate – doppeltes Teilen erzeugt keine neue Analyse", async () => {
    await store.createAnalysis(record(audi(), { listingKey: "ebay:123456789012" }));
    const r = await processShare({ url: "https://www.ebay.de/itm/Audi/123456789012?mkevt=1" }, "u1");
    expect(r.existing?.id).toBe("an_test1");
    expect((await processShare({ url: "https://www.ebay.de/itm/123456789012" }, "someone-else")).existing).toBeUndefined();
  });

  it("Teilen-Eingang ist einmalig: fremde Nutzer können ihn nicht abholen", async () => {
    await store.putShareInbox({ id: "sh_abc123", createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 6e4).toISOString(), uploadIds: [] });
    expect(await store.takeShareInbox("sh_abc123", "u1", new Date().toISOString())).not.toBeNull();
    expect(await store.takeShareInbox("sh_abc123", "u1", new Date().toISOString())).not.toBeNull(); // Doppelaufruf desselben Nutzers
    expect(await store.takeShareInbox("sh_abc123", "u2", new Date().toISOString())).toBeNull();
  });
});

describe("Sicherheit: SSRF-Schutz", () => {
  it("erkennt private, Loopback-, Link-Local- und Metadaten-Adressen", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ["93.184.216.34", "2606:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it("blockiert http, IPs, localhost, fremde Hosts und interne DNS-Ziele", async () => {
    const allowHosts = /^(ebay\.us|r\.kleinanzeigen\.de)$/;
    const pub = async () => ["93.184.216.34"];
    await expect(assertSafeUrl("http://ebay.us/x", { allowHosts, resolver: pub })).rejects.toThrow(/https/);
    await expect(assertSafeUrl("https://127.0.0.1/x", { allowHosts, resolver: pub })).rejects.toThrow(/IP/);
    await expect(assertSafeUrl("https://localhost/x", { allowHosts, resolver: pub })).rejects.toThrow();
    await expect(assertSafeUrl("https://evil.example/x", { allowHosts, resolver: pub })).rejects.toThrow(/freigegeben/);
    await expect(assertSafeUrl("https://ebay.us:8080/x", { allowHosts, resolver: pub })).rejects.toThrow(/Port/);
    await expect(assertSafeUrl("https://ebay.us/x", { allowHosts, resolver: async () => ["10.0.0.5"] })).rejects.toThrow(/gesperrt/);
    await expect(assertSafeUrl("https://ebay.us/x", { allowHosts, resolver: pub })).resolves.toBeInstanceOf(URL);
  });

  it("prüft jede Weiterleitung erneut", async () => {
    const calls: string[] = [];
    const fake = (async (u: string) => {
      calls.push(u);
      return new Response(null, { status: 302, headers: { location: "https://169.254.169.254/latest/meta-data" } });
    }) as unknown as typeof fetch;
    const f = makeSafeFetch({ allowHosts: /^ebay\.us$/, resolver: async () => ["93.184.216.34"], fetchImpl: fake, maxRedirects: 2 });
    await expect(f("https://ebay.us/abc")).rejects.toThrow();
    expect(calls).toEqual(["https://ebay.us/abc"]);
  });
});

// ───────────────────────────── Verkäuferchat ─────────────────────────────
describe("Funktion 2: Verkäuferchat", () => {
  it("schwärzt Telefonnummern, E-Mails, IBAN und Adressen – Preise und km bleiben", () => {
    const r = redactPersonalData("Ruf mich an 0151 23456789 oder max@example.com. IBAN DE89 3704 0044 0532 0130 00, Musterstraße 12, 50667 Köln. Preis 18.500 €, 125.000 km");
    expect(r.text).not.toMatch(/0151|example\.com|DE89|Musterstraße|50667/);
    expect(r.text).toContain("18.500 €");
    expect(r.text).toContain("125.000 km");
    expect(r.counts.phone).toBe(1);
    expect(r.counts.iban).toBe(1);
  });

  it("führt mehrere Screenshots zusammen und erkennt doppelte Nachrichten", () => {
    const raw = [
      { sender: "buyer" as const, text: "Ist das Auto unfallfrei?", imageIndex: 0, source: "screenshot" as const },
      { sender: "seller" as const, text: "Der Kotflügel wurde nach einem kleinen Unfall ausgetauscht.", imageIndex: 0, source: "screenshot" as const },
      { sender: "seller" as const, text: "Der Kotflügel wurde nach einem kleinen Unfall ausgetauscht.", imageIndex: 1, source: "screenshot" as const },
      { sender: "seller" as const, text: "Besichtigung ist am Samstag möglich.", imageIndex: 1, source: "screenshot" as const },
    ];
    const m = mergeChatMessages(raw);
    expect(m.messages).toHaveLength(3);
    expect(m.duplicatesRemoved).toBe(1);
  });

  it("zerlegt eingefügten Chattext mit Absendern", () => {
    const p = parsePastedChat("Ich: Ist der Preis verhandelbar?\nVerkäufer: Nein, aber ich verschicke per Spedition.\nweitere Zeile");
    expect(p).toHaveLength(2);
    expect(p[0].sender).toBe("buyer");
    expect(p[1].sender).toBe("seller");
    expect(p[1].text).toContain("weitere Zeile");
  });

  it("erkennt den Widerspruch Inserat „unfallfrei“ ↔ Chat „Kotflügel nach Unfall getauscht“ als belegt", () => {
    const r = audi();
    const c = detectContradictions([msg("m1", "seller", "Der Kotflügel wurde nach einem kleinen Unfall ausgetauscht.")], r.listing);
    expect(c).toHaveLength(1);
    expect(c[0].field).toBe("accidentFree");
    expect(c[0].kind).toBe("documented");
    expect(c[0].chatStatement).toMatch(/Unfall/);
  });

  it("verneinte Aussagen und Käufernachrichten erzeugen keinen Widerspruch", () => {
    const r = audi();
    expect(detectContradictions([msg("m1", "seller", "Das Auto hatte nie einen Unfall.")], r.listing)).toHaveLength(0);
    expect(detectContradictions([msg("m1", "buyer", "Hatte das Auto einen Unfall?")], r.listing)).toHaveLength(0);
  });

  it("unklare Aussagen (nachlackiert) gelten nur als möglicher Widerspruch", () => {
    const c = detectContradictions([msg("m1", "seller", "Die Tür wurde mal nachlackiert.")], audi().listing);
    expect(c[0]?.kind).toBe("possible");
  });

  it("erkennt Zahlungs-, Versand-, Phishing- und Datenrisiken (nur beim Verkäufer)", () => {
    const s = detectSignals(
      [
        msg("m1", "seller", "Bitte per PayPal Freunde und Familie zahlen, ich bin beruflich im Ausland."),
        msg("m2", "seller", "Die Spedition liefert das Fahrzeug, Treuhand über https://kleinanzeigen-sicher-bezahlen.com/pay"),
        msg("m3", "seller", "Schicken Sie mir bitte noch den SMS-Code zur Bestätigung."),
        msg("m4", "buyer", "Kann ich auch per Western Union zahlen?"),
      ],
      { category: "vehicle", platform: "kleinanzeigen" },
    );
    const ids = s.map((x) => x.id);
    expect(ids).toContain("pay_friends");
    expect(ids).toContain("ship_agent");
    expect(s.find((x) => x.id === "ship_agent")!.level).toBe("high"); // Fahrzeug
    expect(ids).toContain("phish_lookalike");
    expect(ids).toContain("pd_credentials");
    expect(ids).toContain("comm_story");
    expect(ids).not.toContain("pay_untraceable"); // nur der Käufer hat Western Union erwähnt
  });

  it("übernimmt KI-Ergebnisse nur mit echten Zitaten und stuft sie höchstens als „möglich“ ein", () => {
    const messages = [msg("m1", "seller", "Der Motor wurde letztes Jahr komplett überholt.")];
    const v = validateAiAnalysis(
      {
        contradictions: [
          { field: "description", listingStatement: "Scheckheftgepflegt", chatStatement: "Der Motor wurde letztes Jahr komplett überholt", explanation: "x" },
          { field: "x", listingStatement: "Scheckheftgepflegt", chatStatement: "Das Getriebe ist kaputt", explanation: "erfunden" },
        ],
        signals: [{ category: "payment", level: "high", title: "Erfunden", explanation: "x", quote: "Nur Bitcoin" }],
        injectionAttemptDetected: false,
      },
      messages,
      audi().listing,
      { signals: [], contradictions: [] },
    );
    expect(v.contradictions).toHaveLength(1);
    expect(v.contradictions[0].kind).toBe("possible");
    expect(v.signals).toHaveLength(0);
    expect(findSupportingMessage("Das Getriebe ist kaputt", messages)).toBeUndefined();
  });

  it("aktualisiert die Kaufempfehlung nur bei belegten Risiken", () => {
    expect(updateRecommendation("interesting", [], []).current).toBe("interesting");
    const c = detectContradictions([msg("m1", "seller", "Nach dem Unfall wurde der Kotflügel ersetzt.")], audi().listing);
    expect(updateRecommendation("interesting", [], c).current).toBe("elevated_risk");
  });

  it("liest mehrere Screenshots per KI, entfernt Duplikate und schwärzt vor der Speicherung", async () => {
    const fakeAi: AIProvider = {
      id: "fake",
      model: "fake",
      async generate<T>(r: StructuredRequest<T>) {
        const data =
          r.schemaName === "chat_ocr"
            ? { messages: [
                { imageIndex: 0, sender: "seller", text: "Melde dich unter 0171 9876543 auf WhatsApp", time: "10:01" },
                { imageIndex: 1, sender: "seller", text: "Melde dich unter 0171 9876543 auf WhatsApp", time: "10:01" },
                { imageIndex: 1, sender: "seller", text: "Der Kotflügel wurde nach einem kleinen Unfall ausgetauscht.", time: "10:05" },
              ], unreadableCount: 0, injectionAttemptDetected: false }
            : { contradictions: [], signals: [], injectionAttemptDetected: false };
        return { data: r.schema.parse(data), usage: { inputTokens: 10, outputTokens: 10, costUsd: 0.001 } };
      },
    };
    const meter = new UsageMeter();
    const res = await analyzeChat({ imageRefs: ["a", "b"], method: "screenshots", redact: true }, audi(), { ai: fakeAi, loadImage: async () => "data:image/png;base64,AA==", meter });
    expect(res.messages).toHaveLength(2);
    expect(res.duplicatesRemoved).toBe(1);
    expect(res.messages[0].text).not.toContain("0171");
    expect(res.messages[0].redacted).toBe(true);
    expect(res.contradictions[0].kind).toBe("documented");
    expect(res.categories.communication.level).toBe("warning");
    expect(res.updatedRecommendation.current).toBe("elevated_risk");
    expect(res.recommendations.replyDraft).toContain("Hallo");
    expect(meter.total.costUsd).toBeGreaterThan(0);
  });

  it("ohne KI können Screenshots nicht gelesen werden – eingefügter Text funktioniert", async () => {
    await expect(analyzeChat({ imageRefs: ["a"], method: "screenshots", redact: true }, audi(), { ai: null, loadImage: async () => "", meter: new UsageMeter() })).rejects.toThrow(/KI/);
    const r = await analyzeChat({ imageRefs: [], method: "pasted_text", pastedText: "Verkäufer: Nur Vorkasse, sonst ist es heute noch weg.", redact: true }, audi(), { ai: null, loadImage: async () => "", meter: new UsageMeter() });
    expect(r.signals.map((s) => s.id)).toEqual(expect.arrayContaining(["pay_prepay", "comm_pressure"]));
    expect(r.aiUsed).toBe(false);
  });
});

// ───────────────────────────── Besichtigung ─────────────────────────────
describe("Funktion 3: Besichtigungsassistent", () => {
  it("erstellt kategorieabhängige, fahrzeugspezifische Checklisten", () => {
    const v = buildInspectionChecklist(audi());
    const groups = [...new Set(v.map((i) => i.group))];
    expect(groups).toEqual(expect.arrayContaining(["Identität & Papiere", "Karosserie", "Reifen & Felgen", "Kaltstart", "Probefahrt", "Modellspezifisch", "Offene Fragen"]));
    expect(v.some((i) => i.origin === "finding" && /Kotflügel|Stoßfänger/.test(i.title))).toBe(true);
    expect(v.some((i) => i.origin === "listing" && /Kilometerstand/.test(i.title))).toBe(true);
    expect(new Set(v.map((i) => i.id)).size).toBe(v.length);
    const e = buildInspectionChecklist(iphone());
    expect(e.some((i) => /Aktivierungssperre/.test(i.title))).toBe(true);
    expect(e.some((i) => i.group === "Kaltstart")).toBe(false);
  });

  it("übernimmt Widersprüche aus der Chatprüfung als Prüfpunkt", () => {
    const c = detectContradictions([msg("m1", "seller", "Der Kotflügel wurde nach einem kleinen Unfall ausgetauscht.")], audi().listing);
    const items = buildInspectionChecklist(audi(), [{ contradictions: c } as never]);
    expect(items.some((i) => i.origin === "chat" && i.priority === "high")).toBe(true);
  });

  it("Status, Notizen und Offline-Synchronisierung: jüngere Änderung gewinnt", () => {
    const base = buildInspectionChecklist(audi());
    const id = base[0].id;
    const a = mergeInspectionItems(base, [{ id, status: "conspicuous", note: "Rost", updatedAt: "2026-11-24T10:00:00Z" }]);
    const b = mergeInspectionItems(a, [{ id, status: "ok", updatedAt: "2026-11-24T09:00:00Z" }]); // ältere Offline-Änderung
    expect(b[0].status).toBe("conspicuous");
    expect(b[0].note).toBe("Rost");
  });

  it("Besichtigungsbericht aktualisiert die Risikoeinschätzung", () => {
    const d: InspectionData = newInspection(audi(), [], new Date().toISOString());
    expect(summarizeInspection(d, "interesting").risk).toBe("incomplete");
    const allOk = { ...d, items: d.items.map((i) => ({ ...i, status: "ok" as const })) };
    expect(summarizeInspection(allOk, "interesting")).toMatchObject({ risk: "low", updatedRecommendation: "interesting" });
    const bad = { ...allOk, items: allOk.items.map((i, k) => (k === 0 ? { ...i, status: "conspicuous" as const } : i)) };
    expect(summarizeInspection(bad, "interesting")).toMatchObject({ risk: "high", updatedRecommendation: "elevated_risk" }); // erster Punkt hat hohe Priorität
  });

  it("speichert Besichtigungen versioniert, ohne die Analyse zu verändern", async () => {
    const rec = record(audi());
    await store.createAnalysis(rec);
    const { startInspection, syncInspection, finishInspection } = await import("@/lib/inspection/service");
    const m = await startInspection("u1", rec.id);
    expect(m.version).toBe(1);
    expect((await startInspection("u1", rec.id)).id).toBe(m.id); // laufende wird fortgesetzt
    await syncInspection("u1", rec.id, { moduleId: m.id, items: [{ id: m.data.items[0].id, status: "ok", note: "passt" }] });
    const f = await finishInspection("u1", rec.id, m.id);
    expect(f.data.state).toBe("finished");
    expect(f.data.items[0].note).toBe("passt");
    expect((await startInspection("u1", rec.id)).version).toBe(2);
    expect((await store.getAnalysis(rec.id, "u1"))!.report).toEqual(rec.report);
  });
});

// ───────────────────────────── Preisverlauf ─────────────────────────────
describe("Funktion 4: Inseratsverlauf und Preisalarm", () => {
  const l = audi().listing;
  const t0 = snapshotFromListing(l, "initial_analysis", "2026-11-01T10:00:00Z");

  it("erkennt Preisänderung und entfernte Aussage „unfallfrei“ mit Beleg", () => {
    const next = snapshotFromListing({ ...l, priceEur: 18400, description: l.description!.replace("Nichtraucher.", "") + " Unfallfrei." }, "manual_text", "2026-11-08T10:00:00Z");
    const prev = { ...t0, description: `${t0.description} Fahrzeug ist unfallfrei.` };
    const ch = diffSnapshots(prev, { ...next, description: l.description!.replace("Nichtraucher.", "") });
    expect(ch.find((c) => c.type === "price")!.summary).toMatch(/gesenkt um 500 €/);
    const removed = ch.find((c) => c.type === "statement_removed" && c.field === "unfallfrei");
    expect(removed!.summary).toBe("Die Angabe „unfallfrei“ wurde seit der vorherigen Erfassung entfernt.");
    expect(removed!.before).toMatch(/unfallfrei/);
  });

  it("unveränderte Angebote erzeugen keine Änderungen; fehlende Daten sind keine Änderung", () => {
    expect(diffSnapshots(t0, { ...t0, capturedAt: "2026-11-02T00:00:00Z" })).toHaveLength(0);
    const partial = { capturedAt: "2026-11-03T00:00:00Z", source: "manual_price" as const, priceEur: l.priceEur, attributes: {}, available: "unknown" as const, changes: [] };
    expect(diffSnapshots(t0, partial)).toHaveLength(0);
  });

  it("Preisverlauf enthält nur tatsächlich erfasste Werte", () => {
    const h = priceHistory([t0, { ...t0, priceEur: undefined, capturedAt: "x" }, { ...t0, priceEur: 18400, capturedAt: "2026-11-08" }]);
    expect(h.map((x) => x.priceEur)).toEqual([18900, 18400]);
  });

  it("speichert Änderungen, benachrichtigt nur bei wichtigen Änderungen und respektiert das Tageslimit", async () => {
    const rec = record(audi());
    await store.createAnalysis(rec);
    const { manualWatchUpdate, startWatch } = await import("@/lib/watch/service");
    await store.creditTokens("u1", 2, "test_credit", "t-watch");
    const w = await startWatch("u1", rec.id, {});
    expect(w.mode).toBe("manual"); // keine erlaubte automatische Abfrage für mobile.de
    expect(w.nextCheckAt).toBeUndefined();
    const same = await manualWatchUpdate("u1", rec.id, { priceEur: rec.report!.listing.priceEur });
    expect(same.changes).toHaveLength(0);
    expect(await store.listNotifications("u1")).toHaveLength(0);
    const cheaper = await manualWatchUpdate("u1", rec.id, { priceEur: 17900 });
    expect(cheaper.changes[0].type).toBe("price");
    const n = await store.listNotifications("u1");
    expect(n).toHaveLength(1);
    expect(n[0].kind).toBe("price_change");
    const snaps = await store.listModules(rec.id, "u1", "snapshot");
    expect(snaps.map((s) => s.version)).toEqual([1, 2, 3]);
  });

  it("automatische Beobachtung wird nur eingeplant, wenn eine offizielle Schnittstelle verfügbar ist", async () => {
    const { scheduleDueWatches } = await import("@/lib/watch/service");
    await store.upsertWatch({ id: "wat_1", analysisId: "an_x", userId: "u1", platform: "kleinanzeigen", mode: "manual", intervalHours: 24, active: true, notify: { inApp: true, email: false, push: false }, createdAt: "2026-01-01", nextCheckAt: "2026-01-01" });
    expect(await scheduleDueWatches()).toBe(0);
  });
});

// ───────────────────────────── Gesamtkosten ─────────────────────────────
describe("Funktion 5: Gesamtkosten", () => {
  it("trennt belegte, geschätzte und Risiko-Kosten und erfindet ohne Quelle keine Beträge", () => {
    const r = audi();
    r.listing.description += " Inspektion ist fällig, Reifen sind abgefahren.";
    const c = computeCosts(r, { table: [], now: "2026-11-24" });
    const tires = c.lines.find((x) => x.item === "tires")!;
    expect(tires.kind).toBe("estimated");
    expect(tires.amountUnknown).toBe(true);
    expect(tires.lowEur).toBeUndefined();
    expect(c.totals.estimatedHigh).toBe(0);
    expect(c.totals.unknownCount).toBeGreaterThan(0);
    expect(c.totals.expectedLow).toBe(r.listing.priceEur);
    expect(c.dataQuality.label).not.toBe("gut");
  });

  it("nutzt nur belegte Tabelleneinträge mit Quelle und Nutzerangaben haben Vorrang", () => {
    const r = audi();
    r.listing.description += " Reifen sind abgefahren.";
    const table: CostTableEntry[] = [
      { id: "t1", category: "vehicle", item: "tires", lowEur: 500, highEur: 900, source: "3 Angebote Reifenhändler Köln", reviewedAt: "2026-11-01" },
      { id: "bad", category: "vehicle", item: "registration", lowEur: 50, highEur: 60, source: "", reviewedAt: "2026-11-01" },
    ];
    const valid = validCostEntries(table);
    expect(valid).toHaveLength(1);
    const c = computeCosts(r, { table: valid, now: "x", userInputs: [{ id: "u1", item: "inspection_service", label: "Inspektion laut KVA", lowEur: 480, highEur: 480, kind: "documented" }] });
    expect(c.lines.find((x) => x.item === "tires")).toMatchObject({ lowEur: 500, highEur: 900, source: "3 Angebote Reifenhändler Köln" });
    expect(c.lines.find((x) => x.item === "registration")!.amountUnknown).toBe(true);
    expect(c.totals.documentedLow).toBe(480);
    expect(c.totals.expectedHigh).toBe(r.listing.priceEur! + 480 + 900);
  });

  it("Risiken aus Schwachstellen bleiben ohne Betrag und fließen nicht in die erwarteten Kosten", () => {
    const r = audi();
    r.product.weaknesses[0].severity = "high";
    const c = computeCosts(r, { table: DEMO_COST_TABLE, now: "x", usesDemoTable: true });
    const risk = c.lines.find((x) => x.kind === "risk")!;
    expect(risk.amountUnknown).toBe(true);
    expect(c.totals.riskHigh).toBe(0);
    expect(c.usesDemoTable).toBe(true);
  });

  it("vergleicht zwei Angebote nach Gesamtkosten statt nur nach Kaufpreis", () => {
    const table: CostTableEntry[] = [
      { id: "i", category: "vehicle", item: "inspection_service", lowEur: 900, highEur: 1200, source: "Werkstatt-KVA", reviewedAt: "2026-11-01" },
      { id: "t", category: "vehicle", item: "tires", lowEur: 700, highEur: 900, source: "Reifenhändler", reviewedAt: "2026-11-01" },
      { id: "r", category: "vehicle", item: "registration", lowEur: 50, highEur: 80, source: "Zulassungsstelle", reviewedAt: "2026-11-01" },
    ];
    const A = audi();
    A.listing.priceEur = 18000;
    A.listing.description += " Inspektion ist fällig, Reifen sind abgefahren.";
    const B = audi();
    B.listing.priceEur = 18500;
    const cmp = compareTotalCosts({ title: "Fahrzeug A", costs: computeCosts(A, { table, now: "x" }) }, { title: "Fahrzeug B", costs: computeCosts(B, { table, now: "x" }) });
    expect(cmp.verdict).toBe("b");
    expect(cmp.text).toMatch(/Fahrzeug A ist im Kaufpreis günstiger, aber Fahrzeug B/);
  });
});

// ───────────────────────────── Bildabgleich ─────────────────────────────
async function testImage(seed: number, w = 640, h = 480): Promise<Buffer> {
  const rects = Array.from({ length: 14 }, (_, i) => {
    const r = (seed * 9301 + i * 49297) % 233280;
    return `<rect x="${r % (w - 100)}" y="${(r >> 3) % (h - 100)}" width="${60 + (r % 180)}" height="${40 + ((r >> 2) % 160)}" fill="hsl(${(r >> 4) % 360},70%,${30 + (r % 40)}%)"/>`;
  }).join("");
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#ddd"/>${rects}</svg>`)).jpeg({ quality: 90 }).toBuffer();
}

describe("Funktion 6: Bildabgleich", () => {
  it("erkennt identische und neu kodierte/verkleinerte Bilder, unterscheidet verschiedene", async () => {
    const a = await testImage(1);
    const fa = await fingerprint(a);
    expect(classifyMatch(fa, await fingerprint(a)).class).toBe("identical");
    const resized = await sharp(a).resize(400).jpeg({ quality: 60 }).toBuffer();
    expect(["identical", "strong"]).toContain(classifyMatch(fa, await fingerprint(resized)).class);
    const brighter = await sharp(a).modulate({ brightness: 1.15 }).jpeg({ quality: 80 }).toBuffer();
    expect(classifyMatch(fa, await fingerprint(brighter)).class).not.toBe("none");
    const other = await fingerprint(await testImage(77));
    expect(classifyMatch(fa, other).class).toBe("none");
    expect(hamming("ff", "00")).toBe(8);
  });

  it("findet dasselbe Foto in einem anderen Angebot, ignoriert frühere Prüfungen desselben Inserats und ist transparent", async () => {
    const { persist } = await import("@/lib/uploads/service");
    const img = await testImage(5);
    const mk = async (id: string, userId: string, listingKey: string, platform: AnalysisRecord["platform"]) => {
      const up = await persist(userId, img, "image/jpeg", "image", "jpg");
      const r = audi();
      r.listing.images = [{ ref: up.id, kind: "product_photo" }];
      r.listing.platform = platform;
      r.listing.url = `https://example.org/${id}`;
      await store.createAnalysis(record(r, { id, userId, listingKey, platform }));
    };
    await mk("an_a1", "u1", "kleinanzeigen:111", "kleinanzeigen");
    await mk("an_a2", "u1", "kleinanzeigen:111", "kleinanzeigen"); // gleiches Inserat, neue Version
    await mk("an_b1", "u2", "ebay:222", "ebay");
    const { runImageMatch } = await import("@/lib/images/match");
    await runImageMatch("u1", "an_a1");
    await runImageMatch("u1", "an_a2");
    const res = await runImageMatch("u2", "an_b1");
    const d = res.data;
    expect(d.matches.length).toBe(1); // a1/a2 = dasselbe Inserat → zusammengefasst
    expect(d.matches[0].class).toBe("identical");
    expect(d.matches[0].ownAnalysisId).toBeUndefined(); // fremde Kaufakte wird nicht verlinkt
    expect(d.transparency).toMatch(/Eine umfassende Internetsuche fand nicht statt/);
    expect(d.caveat).toMatch(/kein Betrugsnachweis/);
    const own = await runImageMatch("u1", "an_a2", { force: true });
    expect(own.data.matches.find((m) => m.class === "identical")).toBeDefined();
    expect(own.data.matches.some((m) => m.source.includes("eBay"))).toBe(true);
  });

  it("kein Treffer wird nicht als Echtheitsnachweis formuliert", async () => {
    const { transparencyText } = await import("@/lib/images/match");
    expect(transparencyText({ withinListing: true, ownDatabase: true, externalSearch: false })).not.toMatch(/gesamten Internet nicht gefunden/);
  });
});

// ───────────────────────────── Kaufakte & Jobs ─────────────────────────────
describe("Kaufakte und Hintergrundjobs", () => {
  it("Module werden je Art fortlaufend versioniert und mit der Analyse gelöscht", async () => {
    await store.createAnalysis(record(audi()));
    const a = await store.addModule({ id: "mod_1", analysisId: "an_test1", userId: "u1", kind: "costs", createdAt: "1", data: {} });
    const b = await store.addModule({ id: "mod_2", analysisId: "an_test1", userId: "u1", kind: "costs", createdAt: "2", data: {} });
    const c = await store.addModule({ id: "mod_3", analysisId: "an_test1", userId: "u1", kind: "chat_check", createdAt: "3", data: {} });
    expect([a.version, b.version, c.version]).toEqual([1, 2, 1]);
    expect(await store.listModules("an_test1", "u2")).toHaveLength(0); // fremde Nutzer sehen nichts
    await store.deleteAnalysis("an_test1", "u1");
    expect(await store.listModules("an_test1", "u1")).toHaveLength(0);
  });

  it("abgelaufene Chatprüfungen werden automatisch gelöscht", async () => {
    await store.addModule({ id: "mod_old", analysisId: "an_x", userId: "u1", kind: "chat_check", createdAt: "1", expiresAt: "2020-01-01T00:00:00Z", data: {} });
    expect(await store.listModules("an_x", "u1")).toHaveLength(0);
    expect(await store.deleteExpiredModules(new Date().toISOString())).toBe(1);
  });

  it("Jobs sind idempotent, wiederholen mit Backoff, brechen bei dauerhaften Fehlern ab und lassen sich abbrechen", async () => {
    let calls = 0;
    registerJobHandler("image_match", async () => {
      calls++;
      if (calls === 1) throw new Error("vorübergehend");
      return { ok: true };
    });
    const { job, created } = await enqueueJob({ type: "image_match", userId: "u1", idempotencyKey: "k1", input: {} });
    expect(created).toBe(true);
    expect((await enqueueJob({ type: "image_match", userId: "u1", idempotencyKey: "k1", input: {} })).created).toBe(false);
    let claimed = await store.claimJob(new Date().toISOString(), 60);
    expect(await executeJob(claimed!)).toBe("queued");
    const retry = (await store.getJob(job.id))!;
    expect(retry.runAfter > new Date().toISOString()).toBe(true);
    claimed = await store.claimJob(new Date(Date.now() + 3600_000).toISOString(), 60);
    expect(await executeJob(claimed!)).toBe("done");
    expect((await store.getJob(job.id))!.result).toEqual({ ok: true });
    expect(backoffSeconds(3)).toBe(120);

    registerJobHandler("watch_check", async () => {
      throw new NonRetryableError("dauerhaft");
    });
    const j2 = (await enqueueJob({ type: "watch_check", userId: "u1", idempotencyKey: "k2", input: {} })).job;
    expect(await executeJob((await store.claimJob(new Date().toISOString(), 60, ["watch_check"]))!)).toBe("failed");
    expect((await store.getJob(j2.id))!.error).toBe("dauerhaft");

    const j3 = (await enqueueJob({ type: "watch_check", userId: "u1", idempotencyKey: "k3", input: {} })).job;
    expect(await requestCancel(j3.id, "someone-else")).toBe(false);
    expect(await requestCancel(j3.id, "u1")).toBe(true);
    expect((await store.getJob(j3.id))!.status).toBe("cancelled");
  });

  it("ein abgestürzter Job wird nach Ablauf der Lease erneut aufgenommen", async () => {
    await enqueueJob({ type: "image_match", userId: "u1", idempotencyKey: "lease", input: {} });
    const first = await store.claimJob(new Date().toISOString(), 1);
    expect(await store.claimJob(new Date().toISOString(), 1)).toBeNull();
    const again = await store.claimJob(new Date(Date.now() + 5000).toISOString(), 1);
    expect(again?.id).toBe(first?.id);
    expect(again?.attempts).toBe(2);
  });

  it("schlägt den nächsten sinnvollen Schritt vor und hält erhöhtes Risiko fest", () => {
    const base = { hasSeller: false, chats: 0, inspection: null, costs: false, watch: false, imageMatch: false, recommendation: "interesting" as const, hasPhotos: true };
    expect(suggestNextStep(base).text).toBe("Dein Angebot wurde analysiert. Möchtest du jetzt die Verkäuferbewertungen überprüfen?");
    expect(suggestNextStep({ ...base, hasSeller: true }).id).toBe("chat");
    expect(suggestNextStep({ ...base, hasSeller: true, chats: 1 }).id).toBe("inspection");
    expect(suggestNextStep({ ...base, hasSeller: true, chats: 1, recommendation: "elevated_risk" }).id).toBe("costs");
    const agg = aggregateRecommendation({ value: "interesting", at: "1" }, [{ at: "2", value: "elevated_risk" }], { at: "3", value: "interesting" });
    expect(agg.current).toBe("elevated_risk");
    expect(agg.source).toBe("Verkäuferchat");
  });
});
