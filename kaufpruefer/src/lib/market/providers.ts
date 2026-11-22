/**
 * Marktdaten-Provider – Schnittstelle für Vergleichsdaten.
 *
 * Implementiert:
 *  - UserComparablesProvider: vom Nutzer selbst recherchierte Vergleichsangebote
 *  - LicensedHttpMarketProvider: generische Anbindung an einen lizenzierten
 *    Marktdatenanbieter (Vertragsformat siehe docs/INTEGRATIONEN.md)
 *
 * Es gibt bewusst KEINEN Provider, der Preise schätzt oder erfindet.
 */
import { z } from "zod";
import { ComparableSchema, type Category, type Comparable, type Listing } from "../domain/schemas";
import { nowIso, newId } from "../utils";

export interface MarketQuery {
  category: Category;
  brand?: string;
  model?: string;
  variant?: string;
  year?: number;
  mileageKm?: number;
  region?: string;
}

export interface MarketDataProvider {
  id: string;
  name: string;
  isConfigured(): boolean;
  supports(category: Category): boolean;
  fetchComparables(q: MarketQuery): Promise<Comparable[]>;
}

export function queryFromListing(l: Listing): MarketQuery {
  return { category: l.category, brand: l.brand, model: l.model, variant: l.variant, year: l.year, mileageKm: l.mileageKm, region: l.location };
}

export const UserComparableInputSchema = z.object({
  priceEur: z.coerce.number().positive().max(10_000_000),
  priceType: z.enum(["listing", "sold"]).default("listing"),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  mileageKm: z.coerce.number().nonnegative().max(2_000_000).optional(),
  title: z.string().max(200).optional(),
  url: z.string().max(500).optional(),
});
export type UserComparableInput = z.infer<typeof UserComparableInputSchema>;

export function userComparables(items: UserComparableInput[]): Comparable[] {
  const at = nowIso();
  return items.map((i) => ({
    id: newId("cmp"),
    title: i.title,
    priceEur: i.priceEur,
    priceType: i.priceType,
    year: i.year,
    mileageKm: i.mileageKm,
    url: i.url,
    source: "Vom Nutzer hinterlegt",
    collectedAt: at,
  }));
}

const LicensedResponseSchema = z.object({
  comparables: z.array(ComparableSchema.omit({ id: true, collectedAt: true, source: true }).extend({ collectedAt: z.string().optional() })),
  provider: z.string(),
});

export class LicensedHttpMarketProvider implements MarketDataProvider {
  id = "licensed_http";
  name: string;
  constructor(
    private readonly cfg: { url?: string; apiKey?: string; name?: string },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.name = cfg.name ?? "Lizenzierter Marktdatenanbieter";
  }
  isConfigured() {
    return !!(this.cfg.url && this.cfg.apiKey);
  }
  supports() {
    return true;
  }
  async fetchComparables(q: MarketQuery): Promise<Comparable[]> {
    if (!this.isConfigured()) return [];
    const res = await this.fetchImpl(this.cfg.url as string, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.cfg.apiKey}` },
      body: JSON.stringify(q),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Marktdaten-Anbieter antwortet mit ${res.status}`);
    const parsed = LicensedResponseSchema.parse(await res.json());
    const at = nowIso();
    return parsed.comparables.map((c) => ({ ...c, id: newId("cmp"), source: parsed.provider, collectedAt: c.collectedAt ?? at }));
  }
}
