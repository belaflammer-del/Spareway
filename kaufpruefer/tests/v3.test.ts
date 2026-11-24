import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { guard } from "@/lib/ai/guard";
import type { AIProvider, StructuredRequest } from "@/lib/ai/provider";
import { UsageMeter } from "@/lib/ai/provider";
import { getDemoReport } from "@/lib/demo";
import type { Comparable, Listing } from "@/lib/domain/schemas";
import { valuate } from "@/lib/engine/valuation";
import { EbaySoldPricesProvider } from "@/lib/market/ebay";
import { applySellerToReport, runSellerStep } from "@/lib/pipeline/analyze";
import { askReport, buildReportContext } from "@/lib/pipeline/assistant";
import { mergeObservations } from "@/lib/pipeline/observations";
import { listingKeyFor } from "@/lib/pipeline/service";
import { LocalStore } from "@/lib/store/local";
import type { AnalysisRecord } from "@/lib/store/types";

let store: LocalStore;
beforeEach(() => {
  store = new LocalStore(path.join(mkdtempSync(path.join(tmpdir(), "kk3-")), "db.json"));
  (globalThis as unknown as { __kkStore: LocalStore }).__kkStore = store;
});

function counting(cost = 0.05): AIProvider & { calls: number } {
  const p = {
    id: "fake",
    model: "fake",
    calls: 0,
    async generate<T>(req: StructuredRequest<T>) {
      p.calls++;
      return { data: req.schema.parse({ answer: "ok", basedOn: ["Preis"], insufficientData: false }), usage: { inputTokens: 100, outputTokens: 10, costUsd: cost } };
    },
  };
  return p;
}
const req = { task: "chat", system: "", parts: [], schema: { parse: (x: unknown) => x } as never, schemaName: "x" };

describe("Lücke 7: KI-Kostenkontrolle", () => {
  it("stoppt nach der maximalen Anzahl Aufrufe ohne weiteren API-Aufruf", async () => {
    await store.setConfig({ limits: { maxCallsPerAnalysis: 2 } });
    const inner = counting();
    const g = guard(inner, { userId: "u1", scope: "analysis" })!;
    await g.generate(req);
    await g.generate(req);
    await expect(g.generate(req)).rejects.toMatchObject({ code: "ai_budget" });
    expect(inner.calls).toBe(2);
    expect(await store.getCounter("ai_limit_hit")).toBe(1);
  });

  it("verhindert Aufrufe bei ausgeschöpftem Tagesbudget und erfasst Kosten", async () => {
    await store.setConfig({ ai: { dailyBudgetUsd: 0.08 } });
    const inner = counting(0.05);
    const g1 = guard(inner, { userId: "u1", scope: "analysis" })!;
    await g1.generate(req);
    await g1.generate(req); // 0,10 $ ≥ 0,08 $
    const g2 = guard(inner, { userId: "u2", scope: "chat" })!;
    await expect(g2.generate(req)).rejects.toMatchObject({ code: "ai_budget" });
    expect(inner.calls).toBe(2);
  });

  it("begrenzt Kosten pro Nutzer und Tag", async () => {
    await store.setConfig({ limits: { perUserDayUsd: 0.05 } });
    const inner = counting(0.05);
    await guard(inner, { userId: "u1", scope: "chat" })!.generate(req);
    await expect(guard(inner, { userId: "u1", scope: "chat" })!.generate(req)).rejects.toMatchObject({ code: "ai_budget" });
    await guard(inner, { userId: "u2", scope: "chat" })!.generate(req); // anderer Nutzer nicht betroffen
    expect(inner.calls).toBe(2);
  });
});

describe("Lücke 2B: Konflikte zwischen Screenshots", () => {
  it("vereinheitlicht Schreibweisen und meldet echte Widersprüche", () => {
    const r = mergeObservations([
      { field: "priceEur", value: "19.900 €", source: "up_1", confidence: "high" },
      { field: "priceEur", value: "19900", source: "up_2", confidence: "high" },
      { field: "year", value: "2020", source: "up_1", confidence: "high" },
      { field: "year", value: "2019", source: "up_2", confidence: "medium" },
      { field: "storageGb", value: "256 GB", source: "up_1", confidence: "high" },
      { field: "condition", value: "Sehr gut", source: "up_1", confidence: "high" },
      { field: "condition", value: "Gebraucht, Kratzer am Display", source: "up_2", confidence: "high" },
    ]);
    expect(r.values.priceEur).toBe(19900);
    expect(r.values.storageGb).toBe(256);
    expect(r.conflicts.map((c) => c.field).sort()).toEqual(["condition", "year"]);
  });
});

describe("Lücke 1: Vergleichsangebote", () => {
  it("verwendet keine veralteten Daten und erfindet keinen Marktwert", () => {
    const l: Listing = { platform: "ebay", category: "electronics", images: [], provenance: {}, priceEur: 700 };
    const old = new Date(Date.now() - 200 * 864e5).toISOString();
    const comps: Comparable[] = [700, 710, 690, 720, 705].map((p, i) => ({ id: String(i), priceEur: p, priceType: "listing", source: "eBay", collectedAt: old }));
    const v = valuate(l, comps);
    expect(v.status).toBe("insufficient_data");
    expect(v.range).toBeUndefined();
    expect(v.explanation).toContain("keine ausreichend belastbaren Vergleichsangebote");
    expect(v.adjustments.join()).toContain("veraltete");
  });
});

describe("Lücke 2A: eBay-Verkaufspreise", () => {
  it("ist ohne Freischaltung nicht aktiv und ruft nichts auf", async () => {
    let called = false;
    const p = new EbaySoldPricesProvider({ clientId: "a", clientSecret: "b", marketplaceId: "EBAY_DE" }, (async () => {
      called = true;
      return new Response("{}");
    }) as unknown as typeof fetch);
    expect(p.isConfigured()).toBe(false);
    expect(await p.fetchComparables({ category: "electronics", brand: "Apple", model: "iPhone 15" })).toEqual([]);
    expect(called).toBe(false);
  });
  it("liefert mit Freischaltung als „verkauft“ gekennzeichnete Preise", async () => {
    const f = (async (u: string) =>
      u.includes("oauth2")
        ? new Response(JSON.stringify({ access_token: "t" }))
        : new Response(JSON.stringify({ itemSales: [{ title: "Apple iPhone 15 128GB", lastSoldPrice: { value: "610", currency: "EUR" }, lastSoldDate: new Date().toISOString() }] }))) as unknown as typeof fetch;
    const p = new EbaySoldPricesProvider({ clientId: "a3", clientSecret: "b", marketplaceId: "EBAY_DE", insightsEnabled: true }, f);
    const r = await p.fetchComparables({ category: "electronics", brand: "Apple", model: "iPhone 15" });
    expect(r[0].priceType).toBe("sold");
    expect(r[0].attributes?.Speicher).toBe("128 GB");
  });
});

describe("Lücke 5: Wiederverwendung & Versionierung", () => {
  it("erkennt dasselbe Inserat trotz Tracking-Parametern, aber nie verschiedene Inserate", () => {
    const a = listingKeyFor({ platform: "kleinanzeigen", url: "https://www.kleinanzeigen.de/s-anzeige/bmw/123-216?utm_source=sharesheet" });
    const b = listingKeyFor({ platform: "kleinanzeigen", url: "https://m.kleinanzeigen.de/s-anzeige/bmw/123-216" });
    const c = listingKeyFor({ platform: "kleinanzeigen", url: "https://www.kleinanzeigen.de/s-anzeige/bmw/999-216" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(listingKeyFor({ platform: "ebay", externalId: "42" })).toBe("ebay:42");
  });
});

describe("Lücke 6: Historie", () => {
  it("sucht, filtert, sortiert und paginiert serverseitig", async () => {
    const base: Omit<AnalysisRecord, "id" | "createdAt" | "title" | "priceEur" | "category"> = { userId: "u1", status: "completed", tier: "full", platform: "ebay", aiCostUsd: 0, aiInputTokens: 0, aiOutputTokens: 0, mode: "rules_only", recommendation: "interesting" };
    for (let i = 0; i < 25; i++)
      await store.createAnalysis({ ...base, id: `an_${i}`, createdAt: new Date(2026, 0, i + 1).toISOString(), title: i % 2 ? `BMW ${i}` : `iPhone ${i}`, priceEur: 1000 + i, category: i % 2 ? "vehicle" : "electronics" });
    await store.createAnalysis({ ...base, id: "an_other", userId: "u2", createdAt: new Date().toISOString(), title: "BMW fremd", priceEur: 1, category: "vehicle" });
    const r = await store.queryAnalyses("u1", { q: "bmw", sort: "price_asc", page: 2, pageSize: 5 });
    expect(r.total).toBe(12);
    expect(r.items[0].priceEur).toBe(1011);
    expect(r.items.every((x) => x.userId === "u1")).toBe(true);
    expect((await store.queryAnalyses("u1", { category: "electronics" })).total).toBe(13);
    expect((await store.queryAnalyses("u1", { status: "incomplete" })).total).toBe(0);
  });
});

describe("Lücke 4: Verkäuferdaten ergänzen", () => {
  it("führt neue Bewertungen mit vorhandenen zusammen und zählt Duplikate nicht doppelt", async () => {
    const report = getDemoReport("iphone-15-pro")!; // enthält bereits 12 Bewertungen
    const before = report.seller!.visibleReviewCount;
    const { seller, submitted } = await runSellerStep(
      { method: "pasted_text", pastedText: "Positiv: Super schneller Versand, alles wie beschrieben!\n\nNegativ: Paket nie angekommen, keine Antwort" },
      { ai: null, loadImage: async () => "" },
      new UsageMeter(),
      report.seller,
    );
    expect(submitted).toBe(2);
    expect(seller.visibleReviewCount).toBe(before + 1); // eine war schon vorhanden
    const updated = applySellerToReport(report, seller, new Date(), { method: "pasted_text", submitted });
    expect(updated.sellerRuns.at(-1)?.newReviews).toBe(1);
    expect(updated.market).toEqual(report.market);
  });
});

describe("Zusatz: KI-Rückfragen", () => {
  it("nutzt den Bericht als einzigen Kontext", async () => {
    const report = getDemoReport("audi-a4")!;
    const ctx = buildReportContext(report);
    expect(ctx).toContain("Eher teuer");
    expect(ctx).toContain("Demo-Bericht");
    let seen = "";
    const ai: AIProvider = {
      id: "f",
      model: "f",
      async generate<T>(r: StructuredRequest<T>) {
        seen = r.parts.map((p) => (p.type === "text" ? p.text : "")).join("\n");
        return { data: r.schema.parse({ answer: "Laut Bericht liegt der Preis über dem Markt.", basedOn: ["Preis"], insufficientData: false }), usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 } };
      },
    };
    const res = await askReport(ai, new UsageMeter(), report, "Ist der Preis fair?", []);
    expect(seen).toContain("BERICHT");
    expect(seen).toContain("Ist der Preis fair?");
    expect(res.basedOn).toEqual(["Preis"]);
  });
});

describe("Zusatz: Bildschirmaufnahme asynchron", () => {
  it("verarbeitet ein Video im Hintergrund mit Fortschritt und löscht es danach", async () => {
    const { ffmpegAvailable } = await import("@/lib/video/frames");
    if (!(await ffmpegAvailable())) return;
    const { startVideoJob, getVideoJob } = await import("@/lib/video/jobs");
    const { existsSync } = await import("node:fs");
    const dir = mkdtempSync(path.join(tmpdir(), "kkvid-"));
    const rows = Array.from({ length: 40 }, (_, i) => `<rect x="20" y="${i * 80 + 20}" width="${300 + ((i * 53) % 300)}" height="40" fill="#${((i * 2654435761) % 0xffffff).toString(16).padStart(6, "0")}"/>`).join("");
    await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="3200"><rect width="720" height="3200" fill="#fff"/>${rows}</svg>`)).png().toFile(path.join(dir, "p.png"));
    const video = path.join(dir, "input");
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-loop", "1", "-i", path.join(dir, "p.png"), "-vf", "crop=720:1280:0:'min(t*250,1920)',format=yuv420p", "-t", "8", "-r", "30", "-f", "mp4", video]);
    const job = await startVideoJob({ ownerId: "u1", workDir: dir, videoPath: video, maxSeconds: 90 });
    let j = (await getVideoJob(job.id, "u1"))!;
    for (let i = 0; i < 100 && j.stage !== "done" && j.stage !== "failed"; i++) {
      await new Promise((r) => setTimeout(r, 200));
      j = (await getVideoJob(job.id, "u1"))!;
    }
    expect(j.stage).toBe("done");
    expect(j.frameIds!.length).toBeGreaterThan(1);
    expect(await getVideoJob(job.id, "someone-else")).toBeNull();
    await new Promise((r) => setTimeout(r, 100));
    expect(existsSync(video)).toBe(false); // Rohvideo gelöscht
  }, 60_000);
});
