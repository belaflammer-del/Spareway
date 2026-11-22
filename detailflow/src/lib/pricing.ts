/**
 * Preiskalkulation für Aufbereitungsleistungen.
 * Reine Funktion ohne Seiteneffekte: wird im Browser (Live-Vorschau) UND serverseitig
 * (verbindliche Neuberechnung beim Speichern) verwendet. Rechnet intern in Cent.
 */
import type { PricingConfig, SoilingLevel, VehicleClass } from "./domain";

export type PricedService = {
  id: string;
  name: string;
  customer_description?: string | null;
  pricing_type: "fixed" | "hourly";
  base_price: number;
  hourly_rate?: number | null;
  duration_minutes: number;
  material_cost: number;
  min_price?: number | null;
  size_surcharges?: Partial<Record<VehicleClass, number>> | null;
  applies_vehicle_class: boolean;
  applies_soiling: boolean;
  tax_rate?: number | null;
};

export type PricedPackage = {
  id: string;
  name: string;
  description?: string | null;
  price_mode: "discount" | "fixed";
  fixed_price?: number | null;
  discount_percent: number;
  service_ids: string[];
};

export type ExtraItem = { title: string; priceNet: number; minutes?: number; materialCost?: number };

export type CalculationInput = {
  vehicleClass: VehicleClass;
  soiling: SoilingLevel;
  serviceIds: string[];
  packageIds: string[];
  extras?: ExtraItem[];
  /** Sonderaufwand in Minuten, abgerechnet mit dem Firmenstundensatz */
  specialEffortMinutes?: number;
  discountPercent?: number;
  /** Manuell festgelegter Netto-Endpreis (nur mit Preisrecht) */
  overrideNet?: number | null;
  /** Anfahrt in km (einfache Strecke) beim mobilen Service */
  travelKm?: number;
};

export type CompanyTax = { default_tax_rate: number; small_business: boolean };

export type LineBreakdown = { base: number; classSurcharge: number; soilingSurcharge: number; minimumApplied: boolean };

export type CalculatedLine = {
  kind: "service" | "package" | "extra" | "effort" | "travel";
  serviceId?: string;
  packageId?: string;
  title: string;
  description?: string;
  quantity: number;
  unitPriceNet: number;
  totalNet: number;
  taxRate: number;
  minutes: number;
  materialCost: number;
  breakdown?: LineBreakdown;
  includes?: string[];
};

export type CalculationResult = {
  lines: CalculatedLine[];
  subtotalNet: number;
  discountPercent: number;
  discountAmount: number;
  netTotal: number;
  taxes: { rate: number; net: number; tax: number }[];
  taxTotal: number;
  grossTotal: number;
  minutes: number;
  materialCost: number;
  laborCost: number;
  estimatedProfit: number;
  marginPercent: number;
  manualOverride: boolean;
  warnings: string[];
};

const c = (eur: number) => Math.round(eur * 100);
const e = (cents: number) => Math.round(cents) / 100;

type ServicePrice = { cents: number; minutes: number; materialCents: number; breakdown: LineBreakdown };

export function priceService(s: PricedService, input: Pick<CalculationInput, "vehicleClass" | "soiling">, cfg: PricingConfig): ServicePrice {
  const baseCents =
    s.pricing_type === "hourly"
      ? c(((s.hourly_rate ?? cfg.hourlyRate) * s.duration_minutes) / 60)
      : c(s.base_price);

  let classCents = 0;
  let classFactor = 1;
  if (s.applies_vehicle_class) {
    const absolute = s.size_surcharges?.[input.vehicleClass];
    if (absolute !== undefined && absolute !== null && Number.isFinite(Number(absolute))) {
      classCents = c(Number(absolute));
    } else {
      classFactor = cfg.vehicleClassFactors[input.vehicleClass] ?? 1;
      classCents = Math.round(baseCents * (classFactor - 1));
    }
  }

  let soilCents = 0;
  let soilFactor = 1;
  if (s.applies_soiling) {
    soilFactor = cfg.soilingFactors[input.soiling] ?? 1;
    soilCents = Math.round((baseCents + classCents) * (soilFactor - 1));
  }

  let cents = baseCents + classCents + soilCents;
  let minimumApplied = false;
  if (s.min_price != null && cents < c(s.min_price)) {
    cents = c(s.min_price);
    minimumApplied = true;
  }
  return {
    cents: Math.max(0, cents),
    minutes: Math.round(s.duration_minutes * classFactor * soilFactor),
    materialCents: c(s.material_cost),
    breakdown: { base: e(baseCents), classSurcharge: e(classCents), soilingSurcharge: e(soilCents), minimumApplied },
  };
}

export function calculate(
  input: CalculationInput,
  catalog: { services: PricedService[]; packages: PricedPackage[] },
  cfg: PricingConfig,
  tax: CompanyTax,
): CalculationResult {
  const warnings: string[] = [];
  const serviceMap = new Map(catalog.services.map((s) => [s.id, s]));
  const packageMap = new Map(catalog.packages.map((p) => [p.id, p]));
  const covered = new Set<string>();
  const lines: CalculatedLine[] = [];
  const taxRateFor = (s?: PricedService) => (tax.small_business ? 0 : Number(s?.tax_rate ?? tax.default_tax_rate));
  const defaultRate = tax.small_business ? 0 : Number(tax.default_tax_rate);

  // 1) Pakete – Leistungen, die bereits in einem vorherigen Paket stecken, werden nicht doppelt berechnet
  for (const pid of unique(input.packageIds)) {
    const p = packageMap.get(pid);
    if (!p) continue;
    const members = p.service_ids.map((id) => serviceMap.get(id)).filter((s): s is PricedService => !!s);
    const fresh = members.filter((s) => !covered.has(s.id));
    const dupes = members.length - fresh.length;
    if (dupes > 0) warnings.push(`„${p.name}“: ${dupes} Leistung(en) sind bereits in einem anderen Paket enthalten und werden nicht doppelt berechnet.`);
    let sumCents = 0, minutes = 0, material = 0;
    for (const s of fresh) {
      const sp = priceService(s, input, cfg);
      sumCents += sp.cents; minutes += sp.minutes; material += sp.materialCents;
      covered.add(s.id);
    }
    let cents: number;
    if (p.price_mode === "fixed" && p.fixed_price != null) {
      const factor = cfg.vehicleClassFactors[input.vehicleClass] ?? 1;
      cents = Math.round(c(p.fixed_price) * factor);
      if (dupes > 0) warnings.push(`„${p.name}“ hat einen Festpreis – bitte Überschneidungen manuell prüfen.`);
    } else {
      cents = Math.round(sumCents * (1 - Number(p.discount_percent || 0) / 100));
    }
    if (cents === 0) warnings.push(`„${p.name}“ ergibt 0 € – sind die Preise der enthaltenen Leistungen gepflegt?`);
    lines.push({
      kind: "package", packageId: p.id, title: `Paket: ${p.name}`, description: p.description ?? undefined, quantity: 1,
      unitPriceNet: e(cents), totalNet: e(cents), taxRate: defaultRate, minutes, materialCost: e(material),
      includes: fresh.map((s) => s.name),
    });
  }

  // 2) Einzelleistungen
  for (const sid of unique(input.serviceIds)) {
    const s = serviceMap.get(sid);
    if (!s) continue;
    if (covered.has(sid)) {
      warnings.push(`„${s.name}“ ist bereits in einem gewählten Paket enthalten und wird nicht doppelt berechnet.`);
      continue;
    }
    covered.add(sid);
    const sp = priceService(s, input, cfg);
    if (sp.cents === 0) warnings.push(`Für „${s.name}“ ist noch kein Preis hinterlegt.`);
    lines.push({
      kind: "service", serviceId: s.id, title: s.name, description: s.customer_description ?? undefined, quantity: 1,
      unitPriceNet: e(sp.cents), totalNet: e(sp.cents), taxRate: taxRateFor(s), minutes: sp.minutes,
      materialCost: e(sp.materialCents), breakdown: sp.breakdown,
    });
  }

  // 3) Sonderaufwand
  const effort = Math.max(0, Math.round(input.specialEffortMinutes ?? 0));
  if (effort > 0) {
    const cents = c((cfg.hourlyRate * effort) / 60);
    lines.push({ kind: "effort", title: `Sonderaufwand (${formatMinutes(effort)})`, quantity: 1, unitPriceNet: e(cents), totalNet: e(cents), taxRate: defaultRate, minutes: effort, materialCost: 0 });
  }

  // 3b) Anfahrt (mobiler Service): Hin- und Rückweg
  const km = Math.max(0, Math.round(input.travelKm ?? 0));
  if (km > 0 && (cfg.travelCostPerKm ?? 0) > 0) {
    const cents = c(km * 2 * (cfg.travelCostPerKm ?? 0));
    lines.push({ kind: "travel", title: `Anfahrt (${km} km, Hin- und Rückweg)`, quantity: 1, unitPriceNet: e(cents), totalNet: e(cents), taxRate: defaultRate, minutes: 0, materialCost: 0 });
  }

  // 4) Freie Zusatzpositionen
  for (const x of input.extras ?? []) {
    if (!x.title?.trim()) continue;
    const cents = Math.max(0, c(x.priceNet));
    lines.push({ kind: "extra", title: x.title.trim(), quantity: 1, unitPriceNet: e(cents), totalNet: e(cents), taxRate: defaultRate, minutes: Math.max(0, x.minutes ?? 0), materialCost: Math.max(0, x.materialCost ?? 0) });
  }

  const subtotalCents = lines.reduce((a, l) => a + c(l.totalNet), 0);
  let discountPercent = clamp(Number(input.discountPercent ?? 0), 0, 100);
  let netCents = Math.round(subtotalCents * (1 - discountPercent / 100));
  let manualOverride = false;
  if (input.overrideNet != null && Number.isFinite(input.overrideNet) && input.overrideNet >= 0) {
    netCents = c(input.overrideNet);
    manualOverride = true;
    discountPercent = subtotalCents > 0 ? Math.round((1 - netCents / subtotalCents) * 10000) / 100 : 0;
  }
  const discountCents = subtotalCents - netCents;

  // Steuer je Steuersatz; Rabatt anteilig verteilt
  const ratio = subtotalCents > 0 ? netCents / subtotalCents : 0;
  const byRate = new Map<number, number>();
  for (const l of lines) byRate.set(l.taxRate, (byRate.get(l.taxRate) ?? 0) + c(l.totalNet));
  if (lines.length === 0 && netCents > 0) byRate.set(defaultRate, netCents);
  const taxes = [...byRate.entries()].map(([rate, cents]) => {
    const net = lines.length ? Math.round(cents * ratio) : cents;
    return { rate, net, tax: Math.round((net * rate) / 100) };
  });
  // Rundungsdifferenz auf größte Gruppe
  const diff = netCents - taxes.reduce((a, t) => a + t.net, 0);
  if (diff !== 0 && taxes.length) {
    const t = taxes.reduce((a, b) => (b.net > a.net ? b : a));
    t.net += diff;
    t.tax = Math.round((t.net * t.rate) / 100);
  }
  const taxCents = taxes.reduce((a, t) => a + t.tax, 0);

  const minutes = lines.reduce((a, l) => a + l.minutes, 0);
  const materialCents = lines.reduce((a, l) => a + c(l.materialCost), 0);
  const laborCents = c((cfg.internalHourlyCost * minutes) / 60);
  const profitCents = netCents - materialCents - laborCents;

  return {
    lines,
    subtotalNet: e(subtotalCents),
    discountPercent,
    discountAmount: e(discountCents),
    netTotal: e(netCents),
    taxes: taxes.filter((t) => t.net !== 0 || t.tax !== 0).map((t) => ({ rate: t.rate, net: e(t.net), tax: e(t.tax) })),
    taxTotal: e(taxCents),
    grossTotal: e(netCents + taxCents),
    minutes,
    materialCost: e(materialCents),
    laborCost: e(laborCents),
    estimatedProfit: e(profitCents),
    marginPercent: netCents > 0 ? Math.round((profitCents / netCents) * 1000) / 10 : 0,
    manualOverride,
    warnings,
  };
}

export function formatMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} Min.`;
  return m === 0 ? `${h} Std.` : `${h} Std. ${m} Min.`;
}

function unique<T>(a: T[]) {
  return [...new Set(a)];
}
function clamp(n: number, min: number, max: number) {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}
