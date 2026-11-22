import { formatEUR } from "@/lib/utils";

/**
 * Schlanke, serverseitig gerenderte SVG-Diagramme (eine Datenreihe, Akzentfarbe).
 * Hover: Wert wird über dem Balken eingeblendet + native Tooltips (<title>).
 */
export function MonthBars({ data, height = 220 }: { data: { label: string; value: number; hint?: string }[]; height?: number }) {
  const W = 720, H = height, padL = 52, padB = 26, padT = 18;
  const max = niceMax(Math.max(1, ...data.map((d) => d.value)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const bw = (W - padL) / data.length;
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const last = data.length - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Umsatz pro Monat">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
          <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">{compact(t)}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = padL + i * bw + bw * 0.18, w = bw * 0.64, top = y(d.value), h = Math.max(0, y(0) - top);
        return (
          <g key={d.label} className="group">
            <title>{`${d.label}: ${formatEUR(d.value)}${d.hint ? ` · ${d.hint}` : ""}`}</title>
            <rect x={padL + i * bw} y={padT} width={bw} height={H - padT - padB} className="fill-transparent group-hover:fill-muted" />
            {h > 0 && <path d={roundedTop(x, top, w, h, Math.min(4, h))} className={i === last ? "fill-accent" : "fill-accent/55 group-hover:fill-accent"} />}
            <text x={x + w / 2} y={top - 6} textAnchor="middle" className={`fill-foreground text-[11px] font-medium tabular-nums ${i === last ? "" : "opacity-0 group-hover:opacity-100"}`}>{d.value ? compact(d.value) : ""}</text>
            <text x={x + w / 2} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[11px]">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function RankBars({ data }: { data: { label: string; value: number; sub?: string }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-2.5">
      {data.map((d) => (
        <li key={d.label} className="group" title={`${d.label}: ${formatEUR(d.value)}${d.sub ? ` · ${d.sub}` : ""}`}>
          <div className="mb-1 flex justify-between gap-3 text-sm"><span className="truncate">{d.label}</span><span className="shrink-0 tabular-nums">{formatEUR(d.value)}</span></div>
          <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-accent/70 transition group-hover:bg-accent" style={{ width: `${(d.value / max) * 100}%` }} /></div>
          {d.sub && <p className="mt-0.5 text-xs text-muted-foreground">{d.sub}</p>}
        </li>
      ))}
    </ul>
  );
}

function niceMax(v: number) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
function compact(v: number) {
  return v >= 1000 ? `${(v / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} T€` : `${Math.round(v)} €`;
}
function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}
