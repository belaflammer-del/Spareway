import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...p }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-[15px] outline-none transition placeholder:text-muted/70 focus:border-ring focus:ring-4 focus:ring-ring/15 disabled:opacity-60",
        className,
      )}
      {...p}
    />
  );
}

export function Textarea({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[15px] outline-none transition placeholder:text-muted/70 focus:border-ring focus:ring-4 focus:ring-ring/15",
        className,
      )}
      {...p}
    />
  );
}

export function Label({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-medium", className)} {...p} />;
}

export function Select({ className, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-xl border border-border bg-surface px-3 text-[15px] outline-none focus:border-ring focus:ring-4 focus:ring-ring/15",
        className,
      )}
      {...p}
    />
  );
}
