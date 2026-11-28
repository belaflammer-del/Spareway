import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { getDemoReport } from "@/lib/demo";
import type { AnalysisReport } from "@/lib/domain/schemas";
import { PageCaptureSchema } from "@/lib/share/page-capture";
import { LocalStore } from "@/lib/store/local";
import type { AnalysisRecord } from "@/lib/store/types";
import { ruleSummary } from "@/lib/watch/summary";
import { diffSnapshots, snapshotFromListing } from "@/lib/watch/diff";

let store: LocalStore;
beforeEach(() => {
  store = new LocalStore(path.join(mkdtempSync(path.join(tmpdir(), "kkw-")), "db.json"));
  (globalThis as unknown as { __kkStore: LocalStore }).__kkStore = store;
  process.env.JOB_WORKER = "off";
});

function rec(): AnalysisRecord {
  const report = structuredClone(getDemoReport("audi-a4")!) as AnalysisReport;
  report.isDemo = false;
  report.listing.platform = "kleinanzeigen";
  report.listing.url = "https://www.kleinanzeigen.de/s-anzeige/audi-a4/2879999999-216-1";
  report.listing.externalId = "2879999999";
  return { id: "an_w1", userId: "u1", status: "completed", tier: "full", category: "vehicle", platform: "kleinanzeigen", title: "Audi A4 Avant", createdAt: new Date().toISOString(), completedAt: new Date().toISOString(), report, aiCostUsd: 0, aiInputTokens: 0, aiOutputTokens: 0, mode: "rules_only", listingKey: "kleinanzeigen:2879999999" };
}

describe("Beobachtung: Abrechnung, Laufzeit, Erinnerungen", () => {
  it("kostet 1 Token je 60 Tage, bucht beim erneuten Speichern nicht doppelt ab", async () => {
    await store.createAnalysis(rec());
    await store.creditTokens("u1", 3, "test_credit", "t1");
    const { startWatch } = await import("@/lib/watch/service");
    const w = await startWatch("u1", "an_w1", {});
    expect(await store.getBalance("u1")).toBe(2);
    expect(Math.round((Date.parse(w.paidUntil!) - Date.now()) / 864e5)).toBe(60);
    expect(w.mode).toBe("manual");
    expect(w.reminderDays).toBe(3);
    await startWatch("u1", "an_w1", { notify: { email: true } }); // nur Einstellungen
    expect(await store.getBalance("u1")).toBe(2);
  });

  it("ohne Guthaben gibt es eine klare Meldung und keine Beobachtung", async () => {
    await store.createAnalysis(rec());
    const { startWatch } = await import("@/lib/watch/service");
    await expect(startWatch("u1", "an_w1", {})).rejects.toMatchObject({ code: "insufficient_balance" });
    expect(await store.getWatchByAnalysis("an_w1", "u1")).toBeNull();
  });

  it("verlängern hängt einen Zeitraum an und bucht ab", async () => {
    await store.createAnalysis(rec());
    await store.creditTokens("u1", 2, "test_credit", "t1");
    const { startWatch, extendWatch } = await import("@/lib/watch/service");
    const w = await startWatch("u1", "an_w1", {});
    const e = await extendWatch("u1", "an_w1");
    expect(await store.getBalance("u1")).toBe(0);
    expect(Math.round((Date.parse(e.paidUntil!) - Date.parse(w.paidUntil!)) / 864e5)).toBe(60);
    await expect(extendWatch("u1", "an_w1")).rejects.toMatchObject({ code: "insufficient_balance" });
  });

  it("erinnert bei manueller Beobachtung, warnt vor Ablauf und beendet abgelaufene", async () => {
    await store.createAnalysis(rec());
    await store.creditTokens("u1", 1, "test_credit", "t1");
    const { startWatch, processWatchLifecycle } = await import("@/lib/watch/service");
    const w = await startWatch("u1", "an_w1", {});
    expect((await processWatchLifecycle(new Date())).reminded).toBe(0);
    const in4 = new Date(Date.now() + 4 * 864e5);
    expect((await processWatchLifecycle(in4)).reminded).toBe(1);
    expect((await processWatchLifecycle(in4)).reminded).toBe(0); // nicht doppelt
    const soon = new Date(Date.parse(w.paidUntil!) - 2 * 864e5);
    expect((await processWatchLifecycle(soon)).warned).toBe(1);
    const after = new Date(Date.parse(w.paidUntil!) + 1000);
    expect((await processWatchLifecycle(after)).expired).toBe(1);
    expect((await store.getWatchByAnalysis("an_w1", "u1"))!.active).toBe(false);
    const titles = (await store.listNotifications("u1")).map((n) => n.title).join(" | ");
    expect(titles).toMatch(/Kurz nachsehen/);
    expect(titles).toMatch(/läuft bald ab/);
    expect(titles).toMatch(/Beobachtung beendet/);
  });

  it("Aktualisierung per „→ DEAL-NIVO“-Button: Vergleich, Zusammenfassung mit Einschätzung, Benachrichtigung", async () => {
    await store.createAnalysis(rec());
    await store.creditTokens("u1", 1, "test_credit", "t1");
    const { startWatch, manualWatchUpdate } = await import("@/lib/watch/service");
    await startWatch("u1", "an_w1", {});
    const page = PageCaptureSchema.parse({
      v: 1,
      url: "https://www.kleinanzeigen.de/s-anzeige/audi-a4/2879999999-216-1",
      title: "Audi A4 Avant 2.0 TDI",
      price: "17.400 € VB",
      description: "Verkaufe unseren Familienkombi. Kleine Gebrauchsspuren.",
      details: [["Kilometerstand", "142.000 km"]],
    });
    const r = await manualWatchUpdate("u1", "an_w1", { page });
    expect(r.changes.some((c) => c.type === "price")).toBe(true);
    const snap = r.module.data;
    expect(snap.source).toBe("page_capture");
    expect(snap.summary?.basis).toBe("rules");
    expect(snap.summary?.text).toMatch(/gesenkt um 1\.500 €/);
    expect(snap.summary?.assessment.length).toBeGreaterThan(10);
    const n = await store.listNotifications("u1");
    expect(n[0].body).toContain(snap.summary!.text.slice(0, 20));
  });

  it("Regelzusammenfassung: entfernte Angabe → Vorsicht, Preis unter Marktmittel → positiv", () => {
    const r = structuredClone(getDemoReport("audi-a4")!) as AnalysisReport;
    const a = snapshotFromListing({ ...r.listing, description: "Unfallfrei, scheckheftgepflegt." }, "initial_analysis", "2026-11-01");
    const b = snapshotFromListing({ ...r.listing, description: "Scheckheftgepflegt.", priceEur: 15000 }, "page_capture", "2026-11-10");
    const s = ruleSummary(diffSnapshots(a, b), r, b);
    expect(s.tone).toBe("caution");
    expect(s.text).toMatch(/unfallfrei/);
    expect(s.text).toMatch(/unter dem Marktmittel/);
    const c = snapshotFromListing({ ...r.listing, description: "Unfallfrei, scheckheftgepflegt.", priceEur: 15000 }, "page_capture", "2026-11-10");
    expect(ruleSummary(diffSnapshots(a, c), r, c).tone).toBe("positive");
  });
});
