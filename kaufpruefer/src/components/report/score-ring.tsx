"use client";

import { animate, motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { useEffect } from "react";
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

/** Farbverläufe der Score-Karte je Bewertung */
const CARD_STYLE = {
  good: { bg: "linear-gradient(150deg, oklch(0.86 0.16 150) 0%, oklch(0.62 0.17 152) 100%)", glow: "oklch(0.7 0.17 150 / 0.45)", ink: "#0d1a12" },
  warn: { bg: "linear-gradient(150deg, oklch(0.9 0.15 85) 0%, oklch(0.7 0.18 55) 100%)", glow: "oklch(0.75 0.17 65 / 0.45)", ink: "#1f1406" },
  bad: { bg: "linear-gradient(150deg, oklch(0.75 0.17 30) 0%, oklch(0.52 0.2 25) 100%)", glow: "oklch(0.6 0.2 27 / 0.45)", ink: "#ffffff" },
  neutral: { bg: "linear-gradient(150deg, oklch(0.32 0.005 60) 0%, oklch(0.22 0.005 60) 100%)", glow: "transparent", ink: "oklch(0.8 0.01 60)" },
} as const;

export function verdictWord(score: number | null): string {
  if (score == null) return "Zu wenig Daten";
  if (score >= 75) return "Stark";
  if (score >= 60) return "Solide";
  if (score >= 45) return "Prüfen";
  return "Riskant";
}

function CountUp({ value }: { value: number }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => (Math.round(v) / 10).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  useEffect(() => {
    const c = animate(mv, value, { duration: 1.1, ease: [0.22, 1, 0.36, 1] });
    return () => c.stop();
  }, [mv, value]);
  return <motion.span>{text}</motion.span>;
}

/**
 * Deal-Score-Karte: Farbverlauf nach Bewertung, hochzählende Zahl,
 * 10-Segment-Leiste und Urteilswort. Leichter 3D-Kippeffekt bei Berührung.
 */
export function ScoreBox({ score, size = "lg", className }: { score: number | null; size?: "sm" | "lg"; className?: string }) {
  const tone = scoreTone(score);
  const st = CARD_STYLE[tone];
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const rotateX = useSpring(rx, { stiffness: 200, damping: 18 });
  const rotateY = useSpring(ry, { stiffness: 200, damping: 18 });

  if (size === "sm") {
    return (
      <div
        className={cn("flex size-14 shrink-0 flex-col items-center justify-center rounded-xl font-bold shadow-sm", className)}
        style={{ background: st.bg, color: st.ink }}
        aria-label={`Deal-Score ${toTen(score)} von 10`}
      >
        <span className="tabular text-xl leading-none tracking-tight">{toTen(score)}</span>
        <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide opacity-75">{score == null ? "–" : verdictWord(score)}</span>
      </div>
    );
  }

  const filled = score == null ? 0 : Math.round(score / 10);
  return (
    <motion.div
      initial={{ scale: 0.85, opacity: 0, rotate: -4 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 16 }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        ry.set(((e.clientX - r.left) / r.width - 0.5) * 16);
        rx.set(-((e.clientY - r.top) / r.height - 0.5) * 16);
      }}
      onPointerLeave={() => {
        rx.set(0);
        ry.set(0);
      }}
      style={{ background: st.bg, color: st.ink, rotateX, rotateY, transformPerspective: 600, boxShadow: `0 18px 40px -14px ${st.glow}, inset 0 1px 0 rgb(255 255 255 / 0.35)` }}
      className={cn("relative flex w-32 shrink-0 flex-col overflow-hidden rounded-[1.6rem] px-3.5 pb-3 pt-3 sm:w-36", className)}
      aria-label={`Deal-Score ${toTen(score)} von 10 – ${verdictWord(score)}`}
    >
      {/* Glanz */}
      <div className="pointer-events-none absolute -left-8 -top-10 h-24 w-40 rotate-[-18deg] rounded-full bg-white/25 blur-xl" />
      <span className="relative text-[10px] font-bold uppercase tracking-[0.16em] opacity-70">Deal-Score</span>
      <div className="relative mt-1 flex items-baseline gap-0.5">
        <span className="tabular text-[2.9rem] font-black leading-none tracking-tighter sm:text-5xl">{score == null ? "–" : <CountUp value={score} />}</span>
        {score != null && <span className="text-sm font-bold opacity-60">/10</span>}
      </div>
      <span className="relative mt-1 text-sm font-extrabold">{verdictWord(score)}</span>
      <div className="relative mt-2.5 flex gap-[3px]" aria-hidden>
        {Array.from({ length: 10 }, (_, i) => (
          <motion.span
            key={i}
            className="h-1.5 flex-1 rounded-full"
            style={{ background: i < filled ? "currentColor" : "rgb(0 0 0 / 0.15)", opacity: i < filled ? 0.85 : 1 }}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: 0.25 + i * 0.05, duration: 0.25 }}
          />
        ))}
      </div>
    </motion.div>
  );
}
