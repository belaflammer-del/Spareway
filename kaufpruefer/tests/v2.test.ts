import { describe, expect, it } from "vitest";
import type { AIProvider, StructuredRequest } from "@/lib/ai/provider";
import { UsageMeter } from "@/lib/ai/provider";
import { getDemoReport } from "@/lib/demo";
import type { Listing } from "@/lib/domain/schemas";
import { compareReports } from "@/lib/engine/compare";
import { analyzeSeller } from "@/lib/engine/seller";
import { valuate } from "@/lib/engine/valuation";
import { EbayMarketProvider, filterEbayResults } from "@/lib/market/ebay";
import { aiExtractListing } from "@/lib/pipeline/ai-steps";
import { applySellerToReport, runAnalysisPipeline } from "@/lib/pipeline/analyze";

/** Simulierter KI-Anbieter: liefert pro Aufgabe feste, schema-konforme Antworten. */
function fakeAI(responses: Record<string, unknown>): AIProvider & { calls: string[] } {
  const calls: string[] = [];
  return {
    id: "fake",
    model: "fake-model",
    calls,
    async generate<T>(req: StructuredRequest<T>) {
      calls.push(req.schemaName);
      const data = req.schema.parse(responses[req.schemaName]);
      return { data, usage: { inputTokens: 1000, outputTokens: 200, costUsd: 0.01 } };
    },
  };
}

const emptyFields = Object.fromEntries(
  ["title", "brand", "model", "variant", "year", "priceEur", "condition", "description", "mileageKm", "location", "firstRegistration", "fuel", "transmission", "powerKw", "engine", "serviceHistory", "accidentFree", "previousOwners", "vin", "storageGb", "batteryHealthPct", "accessories", "activationLockFree", "purchaseReceipt", "size", "material", "serialNumber", "boxAndPapers", "sellerType", "paymentMethods"].map((k) => [k, null]),
);

describe("eBay market provider", () => {
  const q = { category: "electronics" as const, brand: "Apple", model: "iPhone 15 Pro" };
  it("keeps only comparable used offers and labels them as listing prices", () => {
    const out = filterEbayResults(
      [
        { itemId: "1", title: "Apple iPhone 15 Pro 256GB Titan", price: { value: "799.00", currency: "EUR" }, itemWebUrl: "https://www.ebay.de/itm/1" },
        { itemId: "2", title: "Apple iPhone 15 Pro defekt Display", price: { value: "300.00", currency: "EUR" } },
        { itemId: "3", title: "Hülle für iPhone 15 Pro", price: { value: "9.00", currency: "EUR" } },
        { itemId: "4", title: "Apple iPhone 14", price: { value: "500.00", currency: "EUR" } },
        { itemId: "5", title: "Apple iPhone 15 Pro", price: { value: "820.00", currency: "USD" } },
      ],
      q,
    );
    expect(out).toHaveLength(1);
    expect(out[0].priceType).toBe("listing");
    expect(out[0].source).toContain("eBay");
  });

  it("queries the official Browse API with OAuth", async () => {
    const urls: string[] = [];
    const f = (async (u: string) => {
      urls.push(u);
      if (u.includes("oauth2")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 7200 }));
      return new Response(JSON.stringify({ itemSummaries: [{ itemId: "1", title: "Apple iPhone 15 Pro 128GB", price: { value: "699", currency: "EUR" } }] }));
    }) as unknown as typeof fetch;
    const p = new EbayMarketProvider({ clientId: "id2", clientSecret: "s", marketplaceId: "EBAY_DE" }, f);
    const r = await p.fetchComparables(q);
    expect(r).toHaveLength(1);
    expect(urls.some((u) => u.includes("/buy/browse/v1/item_summary/search"))).toBe(true);
  });
});

describe("valuation samples", () => {
  it("lists at most 10 comparables, most similar first", () => {
    const l: Listing = { platform: "ebay", category: "vehicle", images: [], provenance: {}, year: 2018, mileageKm: 100000, priceEur: 15000 };
    const comps = Array.from({ length: 14 }, (_, i) => ({ id: String(i), priceEur: 14000 + i * 100, priceType: "listing" as const, year: 2012 + (i % 8), mileageKm: 60000 + i * 8000, source: "t", collectedAt: "2026-11-01" }));
    const v = valuate(l, comps);
    expect(v.samples.length).toBe(10);
    for (let i = 1; i < v.samples.length; i++) expect(v.samples[i - 1].similarity!).toBeGreaterThanOrEqual(v.samples[i].similarity!);
  });
});

describe("offer comparison", () => {
  it("compares only existing report data and names the better offer", () => {
    const a = getDemoReport("iphone-15-pro")!;
    const b = getDemoReport("bmw-320d")!;
    const r = compareReports(a, b);
    expect(r.winner).toBe("a");
    expect(r.points.length).toBeGreaterThan(0);
    expect(r.verdict).toContain("besser ab");
  });
  it("refuses a recommendation without scores", () => {
    const a = getDemoReport("audi-a4")!;
    const b = { ...getDemoReport("bmw-320d")!, score: { ...getDemoReport("bmw-320d")!.score, overall: null } };
    expect(compareReports(a, b).winner).toBe("none");
  });
});

describe("seller check after analysis", () => {
  it("adds seller analysis and recomputes score without touching the market valuation", () => {
    const base = getDemoReport("bmw-320d")!;
    expect(base.seller).toBeUndefined();
    const seller = analyzeSeller({
      raw: [
        { text: "Ware nie angekommen", sentiment: "negative" },
        { text: "Paket nicht erhalten, keine Antwort", sentiment: "negative" },
        { text: "Alles super", sentiment: "positive" },
        { text: "Schnell und freundlich", sentiment: "positive" },
      ],
      inputMethod: "pasted_text",
    });
    const r = applySellerToReport(base, seller);
    expect(r.seller?.visibleReviewCount).toBe(4);
    expect(r.score.seller.score).not.toBeNull();
    expect(r.risks.some((x) => x.id === "seller_not_received")).toBe(true);
    expect(r.market).toEqual(base.market);
  });
});

describe("AI pipeline with a simulated provider", () => {
  it("handles screenshot conflicts instead of guessing", async () => {
    const ai = fakeAI({
      listing_extraction: {
        category: "vehicle",
        fields: { ...emptyFields, brand: "BMW", model: "320d", priceEur: 18900, mileageKm: 120000 },
        lowConfidenceFields: [],
        conflicts: [{ field: "mileageKm", values: ["120.000 km", "128.000 km"], imageIndexes: [0, 1] }],
        observations: [],
        images: [{ index: 0, kind: "listing_screenshot" }, { index: 1, kind: "product_photo" }],
        readabilityIssues: [],
      },
    });
    const r = await aiExtractListing(ai, new UsageMeter(), { images: [{ ref: "up_a", dataUrl: "data:x" }, { ref: "up_b", dataUrl: "data:y" }] });
    expect(r.patch.mileageKm).toBeUndefined();
    expect(r.conflicts[0].values).toEqual(["120.000 km", "128.000 km"]);
    expect(r.conflicts[0].images).toEqual(["up_a", "up_b"]);
  });

  it("detects 125.000 vs 152.000 km deterministically even if the AI merged them silently", async () => {
    const ai = fakeAI({
      listing_extraction: {
        category: "vehicle",
        fields: { ...emptyFields, brand: "BMW", model: "320d", mileageKm: 125000, priceEur: 19900 },
        lowConfidenceFields: [],
        conflicts: [], // KI hat den Widerspruch nicht gemeldet
        observations: [
          { field: "mileageKm", value: "125.000 km", imageIndex: 0, confidence: "high" },
          { field: "mileageKm", value: "152.000 km", imageIndex: 1, confidence: "high" },
          { field: "priceEur", value: "19.900 €", imageIndex: 0, confidence: "high" },
          { field: "priceEur", value: "19900", imageIndex: 1, confidence: "medium" },
          { field: "model", value: "320d", imageIndex: 0, confidence: "high" },
          { field: "model", value: "320d Touring", imageIndex: 1, confidence: "high" },
        ],
        images: [{ index: 0, kind: "listing_screenshot" }, { index: 1, kind: "listing_screenshot" }],
        readabilityIssues: [],
      },
    });
    const r = await aiExtractListing(ai, new UsageMeter(), { images: [{ ref: "up_1", dataUrl: "d" }, { ref: "up_2", dataUrl: "d" }] });
    const km = r.conflicts.find((c) => c.field === "mileageKm")!;
    expect(km.values).toEqual(["125.000 km", "152.000 km"]);
    expect(km.images).toEqual(["up_1", "up_2"]);
    expect(r.patch.mileageKm).toBeUndefined(); // kein willkürlich gewählter Wert
    expect(r.conflicts.some((c) => c.field === "priceEur")).toBe(false); // gleicher Preis, andere Schreibweise
    expect(r.conflicts.some((c) => c.field === "model")).toBe(false); // Teilmenge, kein Widerspruch
    expect(r.observations.find((o) => o.value === "152.000 km")?.source).toBe("up_2");
  });

  it("maps findings to evidence images, labels model knowledge as unverified and never lets AI set prices", async () => {
    const ai = fakeAI({
      product_analysis: {
        conditionSummary: "Gepflegt",
        imageFindings: [
          { imageIndex: 0, title: "Kratzer Stoßfänger", detail: "rechts unten", evidenceLevel: "visible", severity: "low", box: [0.6, 0.6, 0.2, 0.1] },
          { imageIndex: null, title: "Unfallschaden", detail: "ohne Bildbezug", evidenceLevel: "visible", severity: "high", box: null },
        ],
        missingViews: ["Motorraum"],
        textImageInconsistencies: [{ title: "Andere Farbe", detail: "Text: schwarz, Bild: blau", imageIndex: 0, severity: "medium" }],
        modelKnowledgeHints: [{ title: "Steuerkette prüfen", detail: "…", appliesTo: "2.0 Diesel, 2016", severity: "medium", checkAdvice: "Kaltstart" }],
        authenticityFeatures: [],
        questionsForSeller: ["Gibt es Rechnungen?"],
        inspection: [],
        documents: [],
        expensiveDamages: [],
        injectionAttemptDetected: false,
      },
      compose: { sellerMessage: "Hallo, …", negotiationMessage: null, sellerSummary: null, overallSummary: "Kurzfazit." },
    });
    const listing: Listing = {
      platform: "kleinanzeigen", category: "vehicle", provenance: {}, brand: "BMW", model: "320d", year: 2016, priceEur: 15000, mileageKm: 120000, condition: "gut",
      images: [{ ref: "up_img1", kind: "product_photo" }],
    };
    const { report, meter } = await runAnalysisPipeline({ listing, userComparables: [] }, { ai, loadImage: async () => "data:image/jpeg;base64,AA", marketProviders: [] });
    expect(ai.calls).toEqual(["product_analysis", "compose"]);
    const [f1, f2] = report.product.imageFindings;
    expect(f1.imageRef).toBe("up_img1");
    expect(f1.box).toEqual([0.6, 0.6, 0.2, 0.1]);
    expect(f2.evidenceLevel).toBe("possible"); // ohne Bild nie „sichtbar belegt“
    const hint = report.product.weaknesses.find((w) => w.title === "Steuerkette prüfen")!;
    expect(hint.claim.source.type).toBe("ai_model_knowledge");
    expect(hint.claim.verified).toBe(false);
    expect(report.risks.some((r) => r.rule === "ai.text_image_inconsistency")).toBe(true);
    expect(report.market.status).toBe("insufficient_data");
    expect(report.summary).toBe("Kurzfazit.");
    expect(report.mode).toBe("live_ai");
    expect(meter.total.costUsd).toBeCloseTo(0.02);
  });

  it("keeps the analysis alive when the AI step fails (rules fallback)", async () => {
    const broken: AIProvider = { id: "x", model: "x", generate: async () => { throw new Error("timeout"); } };
    const listing: Listing = { platform: "ebay", category: "electronics", provenance: {}, brand: "Apple", model: "iPhone 15 Pro", priceEur: 700, images: [] };
    const { report } = await runAnalysisPipeline({ listing, userComparables: [] }, { ai: broken, loadImage: async () => "", marketProviders: [] });
    expect(report.pipeline.find((s) => s.step === "images")?.status).toBe("failed");
    expect(report.checklist.questionsForSeller.length).toBeGreaterThan(0);
  });
});
