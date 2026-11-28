import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OutcomeInputSchema, type OutcomeData } from "@/lib/akte/schemas";
import { savedFor, summarizeSavings } from "@/lib/akte/savings";
import { LocalStore } from "@/lib/store/local";

const o = (x: Partial<OutcomeData>): OutcomeData => ({ status: "bought", recommendation: "interesting", decidedAt: "2026-11-01T00:00:00Z", ...x });

describe("Gespart-Zähler", () => {
  it("rechnet Ersparnis ab Angebotspreis, nie negativ", () => {
    expect(savedFor(o({ askingEur: 9450, paidEur: 8900 }))).toBe(550);
    expect(savedFor(o({ askingEur: 500, paidEur: 520 }))).toBe(0);
    expect(savedFor(o({ paidEur: 100 }))).toBe(0); // kein Angebotspreis → nichts behaupten
    expect(savedFor(o({ status: "not_bought", askingEur: 100 }))).toBe(0);
  });

  it("zählt je Analyse nur die neueste Entscheidung", () => {
    const s = summarizeSavings([
      { analysisId: "a1", data: o({ askingEur: 1000, paidEur: 900 }) }, // neueste
      { analysisId: "a1", data: o({ askingEur: 1000, paidEur: 500 }) }, // ältere Version
      { analysisId: "a2", data: o({ status: "not_bought", recommendation: "elevated_risk" }) },
      { analysisId: "a3", data: o({ status: "not_bought", recommendation: "interesting" }) },
    ]);
    expect(s).toEqual({ bought: 1, savedEur: 100, avoidedRisky: 1, decided: 3 });
  });

  it("verlangt bei „gekauft“ einen Preis", () => {
    expect(OutcomeInputSchema.safeParse({ status: "bought" }).success).toBe(false);
    expect(OutcomeInputSchema.safeParse({ status: "bought", paidEur: 0 }).success).toBe(false);
    expect(OutcomeInputSchema.safeParse({ status: "bought", paidEur: 120 }).success).toBe(true);
    expect(OutcomeInputSchema.safeParse({ status: "not_bought" }).success).toBe(true);
  });

  it("listUserModules liefert nur eigene Module der Art, neueste zuerst", async () => {
    const store = new LocalStore(path.join(mkdtempSync(path.join(tmpdir(), "kks-")), "db.json"));
    const add = (id: string, userId: string, kind: "outcome" | "costs", createdAt: string) =>
      store.addModule({ id, analysisId: "an_" + id, userId, kind, createdAt, data: {} });
    await add("m1", "u1", "outcome", "2026-11-01T00:00:00Z");
    await add("m2", "u1", "outcome", "2026-11-02T00:00:00Z");
    await add("m3", "u2", "outcome", "2026-11-03T00:00:00Z");
    await add("m4", "u1", "costs", "2026-11-04T00:00:00Z");
    const list = await store.listUserModules("u1", "outcome", 10);
    expect(list.map((m) => m.id)).toEqual(["m2", "m1"]);
  });
});
