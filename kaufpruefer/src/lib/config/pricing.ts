/**
 * Zentrale Preis- und Verbrauchskonfiguration.
 * Werte können im Admin-Bereich überschrieben werden (app_config.pricing).
 */
import type { AppConfig } from "../store/types";

export interface TokenPackage {
  id: string;
  tokens: number;
  priceCents: number;
  label: string;
}

export interface PricingConfig {
  packages: TokenPackage[];
  /** Tokens pro vollständigem Kaufcheck (inkl. Verkäuferanalyse) */
  fullCheckCost: number;
  /** Externe Fahrzeughistorie – separate Zusatzleistung (Preis in Cent) */
  vehicleHistoryPriceCents: number;
}

export const DEFAULT_PRICING: PricingConfig = {
  packages: [
    { id: "single", tokens: 1, priceCents: 799, label: "1 Kaufcheck" },
    { id: "triple", tokens: 3, priceCents: 1799, label: "3 Kaufchecks" },
    { id: "ten", tokens: 10, priceCents: 3999, label: "10 Kaufchecks" },
  ],
  fullCheckCost: 1,
  vehicleHistoryPriceCents: 1499,
};

export function resolvePricing(cfg: AppConfig): PricingConfig {
  const p = cfg.pricing;
  if (!p || !Array.isArray(p.packages) || p.packages.length === 0) return DEFAULT_PRICING;
  return {
    packages: p.packages.filter((x) => x.tokens > 0 && x.priceCents >= 50),
    fullCheckCost: Math.max(1, Math.round(p.fullCheckCost || 1)),
    vehicleHistoryPriceCents: p.vehicleHistoryPriceCents ?? DEFAULT_PRICING.vehicleHistoryPriceCents,
  };
}

export function pricePerToken(p: TokenPackage): number {
  return p.priceCents / p.tokens;
}
