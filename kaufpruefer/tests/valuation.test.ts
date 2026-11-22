import { describe, expect, it } from "vitest";
import { removeOutliers, valuate, weightedQuantile, fitVehicleRegression, rateDeviation } from "@/lib/engine/valuation";
import type { Comparable, Listing } from "@/lib/domain/schemas";

const L = (p: Partial<Listing> = {}): Listing => ({ platform: "mobile_de", category: "vehicle", images: [], provenance: {}, ...p });
const C = (priceEur: number, p: Partial<Comparable> = {}): Comparable => ({
  id: String(Math.random()), priceEur, priceType: "listing", source: "test", collectedAt: "2026-01-01", ...p,
});

describe("valuation engine", () => {
  it("returns insufficient_data without comparables – never invents a value", () => {
    const v = valuate(L({ priceEur: 18900 }), []);
    expect(v.status).toBe("insufficient_data");
    expect(v.rating).toBe("insufficient_data");
    expect(v.range).toBeUndefined();
    expect(v.explanation).toContain("nicht verlässlich bestimmbar");
  });

  it("requires a minimum number of comparables", () => {
    const v = valuate(L({ priceEur: 100 }), [C(100), C(110), C(90), C(105)]);
    expect(v.status).toBe("insufficient_data");
  });

  it("rates an expensive offer as rather_expensive", () => {
    const comps = [17000, 17500, 17800, 18000, 17200, 17600, 17400].map((p) => C(p));
    const v = valuate(L({ priceEur: 19500 }), comps);
    expect(v.status).toBe("ok");
    expect(v.range!.low).toBeLessThanOrEqual(v.range!.median);
    expect(v.range!.median).toBeLessThanOrEqual(v.range!.high);
    expect(["rather_expensive", "well_above"]).toContain(v.rating);
    expect(v.deviationPct).toBeGreaterThan(5);
  });

  it("rates a cheap offer as very_good", () => {
    const comps = [1000, 1020, 980, 1010, 990, 1005].map((p) => C(p));
    expect(valuate(L({ category: "electronics", priceEur: 800 }), comps).rating).toBe("very_good");
  });

  it("removes outliers using IQR", () => {
    const { kept, excluded } = removeOutliers([100, 102, 98, 101, 99, 500].map((p) => C(p)));
    expect(excluded).toHaveLength(1);
    expect(kept).toHaveLength(5);
  });

  it("distinguishes listing and sold prices", () => {
    const comps = [...[1000, 1010, 990].map((p) => C(p)), ...[950, 960, 940].map((p) => C(p, { priceType: "sold" }))];
    const v = valuate(L({ category: "electronics", priceEur: 1000 }), comps);
    expect(v.comparables.soldPrices).toBe(3);
    expect(v.comparables.listingPrices).toBe(3);
    expect(v.adjustments.join(" ")).toContain("Verkaufspreise");
  });

  it("weighted quantile works with equal weights", () => {
    const q = weightedQuantile([1, 2, 3, 4, 5].map((v) => ({ v, w: 1 })), 0.5);
    expect(q).toBeCloseTo(3);
  });

  it("fits a plausible vehicle regression and rejects implausible data", () => {
    const comps: Comparable[] = [];
    for (let y = 2015; y <= 2020; y++)
      for (const km of [40000, 90000]) comps.push(C(Math.round(20000 * Math.exp(0.08 * (y - 2015)) * Math.exp(-0.03 * (km / 10000))), { year: y, mileageKm: km }));
    const r = fitVehicleRegression(comps)!;
    expect(r.perYear).toBeCloseTo(0.08, 2);
    expect(r.per10kKm).toBeCloseTo(-0.03, 2);
    const inverted = comps.map((c) => ({ ...c, year: 2035 - (c.year as number) }));
    expect(fitVehicleRegression(inverted)).toBeNull();
  });

  it("maps deviations to the six price categories", () => {
    expect(rateDeviation(-0.2)).toBe("very_good");
    expect(rateDeviation(-0.1)).toBe("good");
    expect(rateDeviation(0)).toBe("fair");
    expect(rateDeviation(0.1)).toBe("rather_expensive");
    expect(rateDeviation(0.3)).toBe("well_above");
  });
});
