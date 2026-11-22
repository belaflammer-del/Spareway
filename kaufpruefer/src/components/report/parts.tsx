"use client";

import { AlertTriangle, Check, CircleHelp, Copy, Eye, Info, ShieldAlert } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { CLAIM_SOURCE_LABELS, EVIDENCE_LABELS, formatEur, PRICE_RATING_LABELS } from "@/lib/domain/labels";
import type { Claim, EvidenceLevel, MarketValuation, RiskFinding, SubScore } from "@/lib/domain/schemas";
import { cn } from "@/lib/utils";
import { scoreTone } from "./score-ring";

export function SeverityBadge({ severity }: { severity: RiskFinding["severity"] }) {
  const map = {
    high: { tone: "bad" as const, label: "Hoch", icon: ShieldAlert },
    medium: { tone: "warn" as const, label: "Mittel", icon: AlertTriangle },
    low: { tone: "info" as const, label: "Gering", icon: Info },
    info: { tone: "neutral" as const, label: "Hinweis", icon: Info },
  }[severity];
  return (
    <Badge tone={map.tone}>
      <map.icon /> {map.label}
    </Badge>
  );
}

export function EvidenceBadge({ level }: { level: EvidenceLevel }) {
  const map = {
    visible: { tone: "bad" as const, icon: Eye },
    possible: { tone: "warn" as const, icon: AlertTriangle },
    unverifiable: { tone: "neutral" as const, icon: CircleHelp },
  }[level];
  return (
    <Badge tone={map.tone}>
      <map.icon /> {EVIDENCE_LABELS[level]}
    </Badge>
  );
}

export function SourceBadge({ claim }: { claim: Claim }) {
  const t = claim.source.type;
  const tone = t === "knowledge_base" ? "good" : t === "ai_model_knowledge" ? "warn" : t === "demo" ? "demo" : "neutral";
  return (
    <Badge tone={tone} title={claim.evidence}>
      {claim.verified && <Check />}
      {t === "knowledge_base" ? claim.source.label : CLAIM_SOURCE_LABELS[t]}
    </Badge>
  );
}

export function SubScoreCard({ title, sub, delay = 0 }: { title: string; sub: SubScore; delay?: number }) {
  const tone = scoreTone(sub.score);
  const bar = { good: "bg-good", warn: "bg-warn", bad: "bg-bad", neutral: "bg-border" }[tone];
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm text-muted">{title}</p>
        <p className="tabular text-xl font-semibold">{sub.score ?? "–"}</p>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
        {sub.score != null && (
          <motion.div className={cn("h-full rounded-full", bar)} initial={{ width: 0 }} animate={{ width: `${sub.score}%` }} transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }} />
        )}
      </div>
      <p className="mt-2.5 text-sm font-medium">{sub.label}</p>
      <ul className="mt-1 space-y-0.5 text-xs text-muted">
        {sub.reasons.slice(0, 3).map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </div>
  );
}

const RATING_TONE: Record<MarketValuation["rating"], "good" | "warn" | "bad" | "neutral" | "accent"> = {
  very_good: "good",
  good: "good",
  fair: "accent",
  rather_expensive: "warn",
  well_above: "bad",
  insufficient_data: "neutral",
};

export function PriceRatingBadge({ rating }: { rating: MarketValuation["rating"] }) {
  return <Badge tone={RATING_TONE[rating]} className="px-3 py-1 text-sm">{PRICE_RATING_LABELS[rating]}</Badge>;
}

/** Visualisiert Marktspanne und Angebotspreis. */
export function PriceGauge({ market }: { market: MarketValuation }) {
  if (!market.range || market.offerPriceEur == null) return null;
  const { low, median, high } = market.range;
  const offer = market.offerPriceEur;
  const span = high - low || high * 0.1;
  const min = Math.min(low - span * 0.8, offer - span * 0.2);
  const max = Math.max(high + span * 0.8, offer + span * 0.2);
  const pos = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  return (
    <div className="pt-8 pb-10" aria-label={`Marktspanne ${formatEur(low)} bis ${formatEur(high)}, Angebot ${formatEur(offer)}`}>
      <div className="relative h-3 rounded-full bg-gradient-to-r from-good-soft via-surface-2 to-bad-soft">
        <div className="absolute inset-y-0 rounded-full bg-accent/25 ring-1 ring-accent/40" style={{ left: pos(low), width: `calc(${pos(high)} - ${pos(low)})` }} />
        <div className="absolute top-1/2 h-5 w-px -translate-y-1/2 bg-accent" style={{ left: pos(median) }} />
        <motion.div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
          initial={{ left: pos(median), opacity: 0 }}
          animate={{ left: pos(offer), opacity: 1 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="size-5 rounded-full border-[3px] border-surface bg-foreground shadow-md" />
          <div className="absolute bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-xs font-medium text-background tabular">
            Angebot {formatEur(offer)}
          </div>
        </motion.div>
      </div>
      <div className="relative mt-3 text-xs text-muted tabular">
        <span className="absolute -translate-x-1/2" style={{ left: pos(low) }}>{formatEur(low)}</span>
        <span className="absolute -translate-x-1/2 font-medium text-foreground" style={{ left: pos(median) }}>Ø {formatEur(median)}</span>
        <span className="absolute -translate-x-1/2" style={{ left: pos(high) }}>{formatEur(high)}</span>
      </div>
    </div>
  );
}

export function CopyBlock({ text, label = "Kopieren" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative rounded-xl border border-border bg-surface-2/60 p-4">
      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{text}</pre>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            toast.success("In die Zwischenablage kopiert");
            setTimeout(() => setCopied(false), 1800);
          } catch {
            toast.error("Kopieren nicht möglich");
          }
        }}
        className="absolute right-2 top-2 inline-flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1.5 text-xs font-medium shadow-sm ring-1 ring-border hover:bg-surface-2"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Kopiert" : label}
      </button>
    </div>
  );
}

export function EvidenceImage({ src, box, alt }: { src: string; box?: [number, number, number, number]; alt: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-surface-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="block h-auto w-full" loading="lazy" />
      {box && (
        <motion.div
          initial={{ opacity: 0, scale: 1.15 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="pointer-events-none absolute rounded-md border-2 border-bad shadow-[0_0_0_9999px_rgba(0,0,0,0.18)]"
          style={{ left: `${box[0] * 100}%`, top: `${box[1] * 100}%`, width: `${box[2] * 100}%`, height: `${box[3] * 100}%` }}
        />
      )}
    </div>
  );
}
