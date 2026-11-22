import { describe, expect, it } from "vitest";
import { computeApplicationFee, formatShare } from "@/lib/revenue-share";

describe("Umsatzbeteiligung", () => {
  it("berechnet 0,5 % kaufmännisch gerundet", () => {
    expect(computeApplicationFee(64_826, 50, null, 0)).toBe(324); // 648,26 € -> 3,24 €
    expect(computeApplicationFee(100, 50, null, 0)).toBe(1);
  });
  it("respektiert die Monats-Obergrenze", () => {
    expect(computeApplicationFee(1_000_000, 50, 15_000, 0)).toBe(5_000);
    expect(computeApplicationFee(1_000_000, 50, 15_000, 12_000)).toBe(3_000);
    expect(computeApplicationFee(1_000_000, 50, 15_000, 15_000)).toBe(0);
    expect(computeApplicationFee(1_000_000, 50, 15_000, 20_000)).toBe(0);
  });
  it("berechnet nichts bei 0 %, ungültigen oder negativen Beträgen", () => {
    expect(computeApplicationFee(10_000, 0, null, 0)).toBe(0);
    expect(computeApplicationFee(-5_000, 50, null, 0)).toBe(0);
    expect(computeApplicationFee(NaN, 50, null, 0)).toBe(0);
  });
  it("formatiert den Satz", () => {
    expect(formatShare(50)).toBe("0,5 %");
    expect(formatShare(125)).toBe("1,25 %");
  });
});
