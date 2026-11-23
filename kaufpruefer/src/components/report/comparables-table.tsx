import { ExternalLink } from "lucide-react";
import { formatEur } from "@/lib/domain/labels";
import type { MarketValuation } from "@/lib/domain/schemas";

/** Liste der verwendeten Vergleichsangebote – nur echte bzw. als Demo gekennzeichnete Daten. */
export function ComparablesTable({ market }: { market: MarketValuation }) {
  if (market.samples.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="mb-2 text-sm font-semibold">Vergleichsangebote ({market.samples.length})</p>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border text-sm">
        {market.samples.map((c) => {
          const props = [c.year, c.mileageKm != null ? `${c.mileageKm.toLocaleString("de-DE")} km` : null].filter(Boolean).join(" · ");
          const safeUrl = c.url && /^https:\/\//.test(c.url) ? c.url : undefined;
          return (
            <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate font-medium">{c.title ?? (props || (c.source.includes("Nutzer") ? "Dein Vergleichsangebot" : "Vergleichsangebot"))}</p>
                <p className="truncate text-xs text-muted">
                  {c.title && props ? `${props} · ` : ""}
                  {c.source} · {new Date(c.collectedAt).toLocaleDateString("de-DE")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-right">
                <div>
                  <p className="tabular font-semibold">{formatEur(c.priceEur, { compact: true })}</p>
                  <p className="text-[11px] text-muted">{c.priceType === "sold" ? "verkauft" : "Angebot"}</p>
                </div>
                {safeUrl && (
                  <a href={safeUrl} target="_blank" rel="noopener noreferrer nofollow" aria-label="Angebot öffnen" className="text-muted hover:text-foreground">
                    <ExternalLink className="size-4" />
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-xs text-muted">„Angebot“ = Inseratspreis, „verkauft“ = tatsächlich erzielter Preis.</p>
    </div>
  );
}
