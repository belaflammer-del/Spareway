import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

export const badgeVariants = cva("inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium [&_svg]:size-3", {
  variants: {
    tone: {
      neutral: "bg-surface-2 text-muted border border-border",
      good: "bg-good-soft text-good",
      warn: "bg-warn-soft text-[color-mix(in_oklch,var(--warn)_70%,var(--foreground))]",
      bad: "bg-bad-soft text-bad",
      info: "bg-info-soft text-info",
      accent: "bg-accent-soft text-accent",
      demo: "bg-demo-soft text-demo",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...p} />;
}
