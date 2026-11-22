"use client";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "./ui";
import type { ActionState } from "@/lib/validation";

export function SubmitButton({ children, variant, pendingText = "Speichern …", className }: { children: React.ReactNode; variant?: "primary" | "secondary" | "danger"; pendingText?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} className={className}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      {pending ? pendingText : children}
    </Button>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state?.message) return null;
  return (
    <p role="status" className={state.ok ? "text-sm text-emerald-600 dark:text-emerald-400" : "text-sm text-danger"}>
      {state.message}
    </p>
  );
}
