"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert, Spinner } from "@/components/ui/misc";
import type { FormState } from "@/lib/auth/actions";

type Action = (s: FormState, fd: FormData) => Promise<FormState>;

export function AuthForm({
  action,
  kind,
  next,
  token,
}: {
  action: Action;
  kind: "login" | "register" | "reset" | "update";
  next?: string;
  token?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const label = { login: "Anmelden", register: "Konto erstellen", reset: "Link anfordern", update: "Passwort speichern" }[kind];
  return (
    <form action={formAction} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      {token && <input type="hidden" name="token" value={token} />}
      {kind !== "update" && (
        <div className="grid gap-1.5">
          <Label htmlFor="email">E-Mail-Adresse</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
      )}
      {kind !== "reset" && (
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{kind === "update" ? "Neues Passwort" : "Passwort"}</Label>
            {kind === "login" && (
              <Link href="/reset-password" className="text-xs text-muted hover:text-foreground">
                Passwort vergessen?
              </Link>
            )}
          </div>
          <Input id="password" name="password" type="password" autoComplete={kind === "login" ? "current-password" : "new-password"} required minLength={kind === "login" ? 1 : 10} />
          {kind !== "login" && <p className="text-xs text-muted">Mindestens 10 Zeichen, mit Buchstaben und Ziffern.</p>}
        </div>
      )}
      {kind === "register" && (
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" name="terms" required className="mt-0.5 size-4 accent-[var(--accent)]" />
          <span className="text-muted">
            Ich akzeptiere die <Link href="/rechtliches/agb" className="underline">AGB</Link> und habe die{" "}
            <Link href="/rechtliches/datenschutz" className="underline">Datenschutzhinweise</Link> gelesen.
          </span>
        </label>
      )}
      {state.error && <Alert tone="bad">{state.error}</Alert>}
      {state.message && (
        <Alert tone="good">
          {state.message}
          {state.devLink && (
            <a href={state.devLink} className="mt-1 block break-all font-medium underline">
              {state.devLink}
            </a>
          )}
        </Alert>
      )}
      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending && <Spinner />} {label}
      </Button>
    </form>
  );
}

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[75dvh] max-w-sm flex-col justify-center px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
      <div className="mt-6 rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">{children}</div>
      {footer && <div className="mt-5 text-center text-sm text-muted">{footer}</div>}
    </div>
  );
}
