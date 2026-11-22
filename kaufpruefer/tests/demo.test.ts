import { describe, expect, it } from "vitest";
import { listDemos } from "@/lib/demo";

describe("demo reports", () => {
  const demos = listDemos();
  it("has the six required demos", () => {
    expect(demos.map((d) => d.slug)).toEqual(["audi-a4", "bmw-320d", "iphone-15-pro", "rolex-submariner", "moncler-jacke", "seltenes-videospiel"]);
  });
  it("marks every demo as demo and labels all data sources", () => {
    for (const { report } of demos) {
      expect(report.isDemo).toBe(true);
      expect(report.mode).toBe("demo");
      expect(report.disclaimer).toMatch(/^DEMO/);
      expect(Object.values(report.listing.provenance).every((p) => p === "demo")).toBe(true);
      for (const f of report.product.imageFindings) expect(f.claim.source.type).toBe("demo");
    }
  });
  it("shows expected outcomes", () => {
    const by = Object.fromEntries(demos.map((d) => [d.slug, d.report]));
    console.table(demos.map((d) => ({ slug: d.slug, rating: d.report.market.rating, dev: d.report.market.deviationPct, score: d.report.score.overall, rec: d.report.score.recommendation, dq: d.report.dataQuality.score })));
    expect(by["audi-a4"].market.rating).toBe("rather_expensive");
    expect(by["bmw-320d"].score.recommendation).toBe("elevated_risk");
    expect(by["iphone-15-pro"].market.rating).toBe("fair");
    expect(by["seltenes-videospiel"].market.status).toBe("insufficient_data");
  });
});
