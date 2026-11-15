import { describe, expect, it } from "vitest";
import { DEFAULT_PRICING_CONFIG } from "@/lib/domain";
import { calculate, priceService, type PricedPackage, type PricedService } from "@/lib/pricing";

const cfg = DEFAULT_PRICING_CONFIG;
const tax = { default_tax_rate: 19, small_business: false };

const svc = (over: Partial<PricedService> & { id: string }): PricedService => ({
  name: over.id, pricing_type: "fixed", base_price: 100, duration_minutes: 60, material_cost: 5, min_price: null,
  size_surcharges: {}, applies_vehicle_class: true, applies_soiling: true, tax_rate: null, ...over,
});

const wash = svc({ id: "wash", name: "Handwäsche", base_price: 40, duration_minutes: 45, material_cost: 3 });
const rims = svc({ id: "rims", name: "Felgenreinigung", base_price: 20, duration_minutes: 30, material_cost: 2 });
const polish = svc({ id: "polish", name: "Einstufige Politur", pricing_type: "hourly", base_price: 0, hourly_rate: 70, duration_minutes: 240, material_cost: 15 });
const analysis = svc({ id: "analysis", name: "Lackdickenmessung", base_price: 25, applies_soiling: false, applies_vehicle_class: false, duration_minutes: 20, material_cost: 0 });
const pkg: PricedPackage = { id: "basic", name: "Basic Außen", price_mode: "discount", discount_percent: 10, service_ids: ["wash", "rims"] };
const catalog = { services: [wash, rims, polish, analysis], packages: [pkg] };

describe("priceService", () => {
  it("berechnet Festpreis ohne Zuschläge für Kompaktwagen/normal", () => {
    const r = priceService(wash, { vehicleClass: "kompaktwagen", soiling: "normal" }, cfg);
    expect(r.cents).toBe(4000);
    expect(r.minutes).toBe(45);
  });

  it("wendet Fahrzeugklassen- und Verschmutzungsfaktor an", () => {
    const r = priceService(wash, { vehicleClass: "suv", soiling: "stark" }, cfg);
    // 40 € * 1,25 = 50 €, * 1,3 = 65 €
    expect(r.breakdown).toEqual({ base: 40, classSurcharge: 10, soilingSurcharge: 15, minimumApplied: false });
    expect(r.cents).toBe(6500);
  });

  it("nutzt absoluten Größenzuschlag statt Faktor, wenn hinterlegt", () => {
    const s = { ...wash, size_surcharges: { suv: 12.5 } };
    const r = priceService(s, { vehicleClass: "suv", soiling: "normal" }, cfg);
    expect(r.cents).toBe(5250);
  });

  it("berechnet Stundenpreise aus Dauer und Stundensatz", () => {
    const r = priceService(polish, { vehicleClass: "kompaktwagen", soiling: "normal" }, cfg);
    expect(r.cents).toBe(28000);
  });

  it("respektiert Mindestpreise", () => {
    const s = { ...wash, min_price: 45 };
    const r = priceService(s, { vehicleClass: "kleinwagen", soiling: "leicht" }, cfg);
    expect(r.cents).toBe(4500);
    expect(r.breakdown.minimumApplied).toBe(true);
  });

  it("ignoriert Zuschläge bei Leistungen ohne Größen-/Verschmutzungsbezug", () => {
    const r = priceService(analysis, { vehicleClass: "wohnmobil", soiling: "extrem" }, cfg);
    expect(r.cents).toBe(2500);
  });
});

describe("calculate", () => {
  it("summiert Positionen und berechnet 19 % MwSt.", () => {
    const r = calculate({ vehicleClass: "kompaktwagen", soiling: "normal", serviceIds: ["wash", "rims"], packageIds: [] }, catalog, cfg, tax);
    expect(r.subtotalNet).toBe(60);
    expect(r.taxTotal).toBe(11.4);
    expect(r.grossTotal).toBe(71.4);
    expect(r.minutes).toBe(75);
    expect(r.materialCost).toBe(5);
  });

  it("vermeidet Doppelberechnung von Leistungen, die im Paket enthalten sind", () => {
    const r = calculate({ vehicleClass: "kompaktwagen", soiling: "normal", serviceIds: ["wash", "analysis"], packageIds: ["basic"] }, catalog, cfg, tax);
    expect(r.lines.map((l) => l.title)).toEqual(["Paket: Basic Außen", "Lackdickenmessung"]);
    expect(r.lines[0].totalNet).toBe(54); // (40 + 20) * 0,9
    expect(r.subtotalNet).toBe(79);
    expect(r.warnings.some((w) => w.includes("Handwäsche"))).toBe(true);
  });

  it("vermeidet Doppelberechnung bei überlappenden Paketen", () => {
    const pkg2: PricedPackage = { id: "p2", name: "Wäsche+Politur", price_mode: "discount", discount_percent: 0, service_ids: ["wash", "polish"] };
    const r = calculate({ vehicleClass: "kompaktwagen", soiling: "normal", serviceIds: [], packageIds: ["basic", "p2"] }, { ...catalog, packages: [pkg, pkg2] }, cfg, tax);
    expect(r.lines[1].totalNet).toBe(280); // nur Politur, Handwäsche bereits im 1. Paket
    expect(r.lines[1].includes).toEqual(["Einstufige Politur"]);
  });

  it("wendet Gesamtrabatt anteilig an", () => {
    const r = calculate({ vehicleClass: "kompaktwagen", soiling: "normal", serviceIds: ["wash", "rims"], packageIds: [], discountPercent: 10 }, catalog, cfg, tax);
    expect(r.discountAmount).toBe(6);
    expect(r.netTotal).toBe(54);
    expect(r.grossTotal).toBe(64.26);
  });

  it("unterstützt manuellen Endpreis und weist den impliziten Rabatt aus", () => {
    const r = calculate({ vehicleClass: "kompaktwagen", soiling: "normal", serviceIds: ["wash", "rims"], packageIds: [], overrideNet: 50 }, catalog, cfg, tax);
    expect(r.manualOverride).toBe(true);
    expect(r.netTotal).toBe(50);
    expect(r.discountAmount).toBe(10);
    expect(r.grossTotal).toBe(59.5);
  });

  it("berechnet für Kleinunternehmer keine Umsatzsteuer", () => {
    const r = calculate({ vehicleClass: "kompaktwagen", soiling: "normal", serviceIds: ["wash"], packageIds: [] }, catalog, cfg, { default_tax_rate: 19, small_business: true });
    expect(r.taxTotal).toBe(0);
    expect(r.grossTotal).toBe(40);
  });

  it("berechnet Sonderaufwand, Zusatzpositionen und geschätzte Marge", () => {
    const r = calculate(
      { vehicleClass: "kompaktwagen", soiling: "normal", serviceIds: ["wash"], packageIds: [], specialEffortMinutes: 30, extras: [{ title: "Anfahrt", priceNet: 15 }] },
      catalog, cfg, tax,
    );
    expect(r.subtotalNet).toBe(85); // 40 + 30 (0,5 h * 60) + 15
    expect(r.minutes).toBe(75);
    expect(r.laborCost).toBe(37.5);
    expect(r.estimatedProfit).toBe(44.5); // 85 - 3 Material - 37,5 Arbeit
  });

  it("warnt bei Leistungen ohne Preis", () => {
    const free = svc({ id: "free", name: "Neue Leistung", base_price: 0 });
    const r = calculate({ vehicleClass: "kompaktwagen", soiling: "normal", serviceIds: ["free"], packageIds: [] }, { services: [free], packages: [] }, cfg, tax);
    expect(r.warnings[0]).toContain("kein Preis");
  });

  it("rundet Steuer centgenau ohne Differenzen", () => {
    const odd = svc({ id: "odd", base_price: 33.33 });
    const r = calculate({ vehicleClass: "kompaktwagen", soiling: "normal", serviceIds: ["odd"], packageIds: [], discountPercent: 7 }, { services: [odd], packages: [] }, cfg, tax);
    expect(r.netTotal + r.taxTotal).toBeCloseTo(r.grossTotal, 10);
    expect(r.taxes.reduce((a, t) => a + t.net, 0)).toBeCloseTo(r.netTotal, 10);
  });
});
