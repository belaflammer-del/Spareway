import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
const buttonStyles: Record<ButtonVariant, string> = {
  primary: "bg-foreground text-background hover:opacity-90 shadow-sm",
  secondary: "bg-card border border-border hover:bg-muted shadow-sm",
  ghost: "hover:bg-muted",
  danger: "bg-danger text-white hover:opacity-90",
};
export function buttonClass(variant: ButtonVariant = "primary", size: "sm" | "md" = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background whitespace-nowrap",
    size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-sm",
    buttonStyles[variant],
    className,
  );
}

export function Button({ variant, size, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({ variant, size, className, ...props }: React.ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

const fieldBase =
  "w-full rounded-lg border border-border bg-card px-3 text-sm shadow-xs transition placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring disabled:opacity-60";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(fieldBase, "h-10", className)} {...p} />;
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn(fieldBase, "min-h-24 py-2", className)} {...p} />;
});

export function Select({ className, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldBase, "h-10 pr-8", className)} {...p} />;
}

export function Field({ label, name, error, hint, children, className }: { label: string; name?: string; error?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={name} className="block text-sm font-medium">{label}</label>
      {children}
      {error ? <p className="text-sm text-danger">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]", className)} {...p} />;
}

export function CardHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

const tones = {
  gray: "bg-muted text-muted-foreground",
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  red: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  violet: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  teal: "bg-accent-soft text-accent",
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = "gray", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)}>{children}</span>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-14 text-center">
      {icon && <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">{icon}</div>}
      <h3 className="font-medium">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "blue", children }: { tone?: "blue" | "amber" | "red" | "green"; children: React.ReactNode }) {
  const map = {
    blue: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200",
    amber: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
    red: "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
  };
  return <div className={cn("rounded-xl border px-4 py-3 text-sm", map[tone])}>{children}</div>;
}

export function Stat({ label, value, hint, href }: { label: string; value: React.ReactNode; hint?: string; href?: string }) {
  const inner = (
    <Card className={cn("p-4 transition", href && "hover:border-foreground/20")}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
