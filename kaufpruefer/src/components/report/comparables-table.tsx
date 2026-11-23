import { ExternalLink, Package } from "lucide-react";
import { formatEur } from "@/lib/domain/labels";
import type { Comparable, MarketValuation } from "@/lib/domain/schemas";
import { cn } from "@/lib/utils";

const NO_DATA = "Für dieses Produkt konnten aktuell keine ausreichend belastbaren Vergleichsangebote abgerufen werden.";

function props(c: Comparable): string[] {
  const out: string[] = [];
  if (c.year) out.push(String(c.year));
  if (c.mileageKm != null) out.push(`${c.mileageKm.toLocaleString("de-DE")} km`);
  for (const [k, v] of Object.entries(c.attributes ?? {})) out.push(k === "Speicher" ? v : `${k}: ${v}`);
  if (c.conditionText) out.push(c.conditionText);
  return out;
}

/**
 * „Vergleichbare Angebote am Markt“ – zeigt ausschließlich tatsächlich
 * ermittelte (oder als Demo gekennzeichnete) Vergleichsangebote.
 */
export function ComparablesTable({ market, title = "Vergleichbare Angebote am Markt" }: { market: MarketValuation; title?: string }) {
  if (market.samples.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm">
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-muted">{NO_DATA}</p>
      </div>
    );
  }
  const sold = market.samples.filter((c) => c.priceType === "sold").length;
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">
          {title} ({market.samples.length})
        </p>
        <p className="text-[11px] text-muted">{sold ? `${sold} verkauft · ${market.samples.length - sold} Angebote` : "nur Angebotspreise"}</p>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border text-sm">
        {market.samples.map((c) => {
          const p = props(c);
          return (
            <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                {c.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted">
                    <Package className="size-4" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{c.title ?? (c.source.includes("Nutzer") ? "Dein Vergleichsangebot" : "Vergleichsangebot")}</p>
                {p.length > 0 && <p className="truncate text-xs text-muted">{p.join(" · ")}</p>}
                <p className="truncate text-[11px] text-muted">
                  {c.platform ?? c.source} · erfasst {new Date(c.collectedAt).toLocaleDateString("de-DE")}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="tabular font-semibold">{formatEur(c.priceEur, { compact: true })}</p>
                <p className={cn("text-[11px]", c.priceType === "sold" ? "text-good" : "text-muted")}>{c.priceType === "sold" ? "verkauft" : "Angebot"}</p>
              </div>
              {c.url && /^https:\/\//.test(c.url) && (
                <a href={c.url} target="_blank" rel="noopener noreferrer nofollow" aria-label="Originalangebot öffnen" className="shrink-0 text-muted hover:text-foreground">
                  <ExternalLink className="size-4" />
                </a>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-xs text-muted">
        „Angebot“ = aktueller Inseratspreis, „verkauft“ = tatsächlich erzielter Preis. Vergleiche werden nach Ähnlichkeit gewichtet, Ausreißer und Daten älter als 90 Tage nicht verwendet.
      </p>
    </div>
  );
}
