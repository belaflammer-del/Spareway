import * as React from "react";
import { cn } from "@/lib/utils";

export function Separator({ className }: { className?: string }) {
  return <div role="separator" className={cn("h-px w-full bg-border", className)} />;
}

export function Progress({ value, className, tone = "accent" }: { value: number; className?: string; tone?: "accent" | "good" | "warn" | "bad" }) {
  const color = { accent: "bg-accent", good: "bg-good", warn: "bg-warn", bad: "bg-bad" }[tone];
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-2", className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-[width] duration-700 ease-out", color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent", className)} aria-hidden />;
}

export function SectionTitle({ eyebrow, title, desc, className }: { eyebrow?: string; title: string; desc?: string; className?: string }) {
  return (
    <div className={cn("max-w-2xl", className)}>
      {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</p>}
      <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h2>
      {desc && <p className="mt-2 text-muted text-pretty">{desc}</p>}
    </div>
  );
}

export function Alert({ tone = "info", title, children, className }: { tone?: "info" | "warn" | "bad" | "good" | "demo"; title?: string; children?: React.ReactNode; className?: string }) {
  const map = { info: "bg-info-soft text-info", warn: "bg-warn-soft", bad: "bg-bad-soft text-bad", good: "bg-good-soft text-good", demo: "bg-demo-soft text-demo" };
  return (
    <div className={cn("rounded-xl px-4 py-3 text-sm", map[tone], className)} role="status">
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title && "mt-0.5", "text-foreground/80")}>{children}</div>}
    </div>
  );
}
