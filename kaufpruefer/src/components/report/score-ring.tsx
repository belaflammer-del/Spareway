"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export function scoreTone(score: number | null): "good" | "warn" | "bad" | "neutral" {
  if (score == null) return "neutral";
  return score >= 70 ? "good" : score >= 45 ? "warn" : "bad";
}

export function ScoreRing({ score, size = 132, stroke = 10, label = "Deal-Score", className }: { score: number | null; size?: number; stroke?: number; label?: string; className?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = scoreTone(score);
  const color = { good: "var(--good)", warn: "var(--warn)", bad: "var(--bad)", neutral: "var(--border)" }[tone];
  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        {score != null && (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c * (1 - score / 100) }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="tabular text-3xl font-semibold tracking-tight" aria-label={`${label}: ${score ?? "nicht berechenbar"}`}>
          {score ?? "–"}
        </span>
        <span className="text-[11px] text-muted">{score == null ? "kein Score" : "von 100"}</span>
      </div>
    </div>
  );
}

/** Score 0–100 → Anzeige 0–10 mit deutschem Komma. */
export function toTen(score: number | null): string {
  if (score == null) return "–";
  return (Math.round(score) / 10).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

const BOX_TONE = {
  good: "bg-good text-white",
  warn: "bg-accent text-accent-fg",
  bad: "bg-bad text-white",
  neutral: "bg-surface-2 text-muted",
} as const;

/** Vollflächiger, farbiger Score-Kasten (0–10). */
export function ScoreBox({ score, size = "lg", className }: { score: number | null; size?: "sm" | "lg"; className?: string }) {
  const tone = scoreTone(score);
  const big = size === "lg";
  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
      className={cn(
        "flex shrink-0 flex-col items-center justify-center rounded-2xl font-semibold",
        BOX_TONE[tone],
        big ? "size-28 sm:size-32" : "size-14 rounded-xl",
        className,
      )}
      aria-label={`Deal-Score ${toTen(score)} von 10`}
    >
      <span className={cn("tabular leading-none tracking-tight", big ? "text-5xl" : "text-xl")}>{toTen(score)}</span>
      <span className={cn("opacity-80", big ? "mt-1 text-xs" : "text-[10px]")}>{score == null ? "kein Score" : "von 10"}</span>
    </motion.div>
  );
}
