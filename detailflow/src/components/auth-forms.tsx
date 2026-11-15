"use client";
import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, signIn, signUp, updatePassword } from "@/app/actions/auth";
import { Card, Field, Input } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signIn, undefined);
  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Anmelden</h1>
      <p className="mt-1 text-sm text-muted-foreground">Willkommen zurück bei DetailFlow.</p>
      <form action={action} className="mt-6 space-y-4">
        <input type="hidden" name="weiter" value={next ?? ""} />
        <Field label="E-Mail" name="email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
        <Field label="Passwort" name="password"><Input id="password" name="password" type="password" autoComplete="current-password" required /></Field>
        <FormMessage state={state} />
        <SubmitButton className="w-full" pendingText="Anmelden …">Anmelden</SubmitButton>
      </form>
      <div className="mt-5 flex justify-between text-sm">
        <Link href="/passwort-vergessen" className="text-muted-foreground hover:text-foreground">Passwort vergessen?</Link>
        <Link href="/registrieren" className="font-medium">Konto erstellen</Link>
      </div>
    </Card>
  );
}

export function SignUpForm() {
  const [state, action] = useActionState(signUp, undefined);
  if (state?.ok) return <Card className="p-6"><h1 className="text-xl font-semibold">E-Mail bestätigen</h1><p className="mt-2 text-sm text-muted-foreground">{state.message}</p></Card>;
  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Konto erstellen</h1>
      <p className="mt-1 text-sm text-muted-foreground">In wenigen Minuten ist dein Betrieb eingerichtet.</p>
      <form action={action} className="mt-6 space-y-4">
        <Field label="Dein Name" name="full_name"><Input id="full_name" name="full_name" autoComplete="name" required /></Field>
        <Field label="E-Mail" name="email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
        <Field label="Passwort" name="password" hint="Mindestens 10 Zeichen"><Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required /></Field>
        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <input type="checkbox" name="terms" className="mt-0.5" required />
          <span>Ich akzeptiere die Nutzungsbedingungen und habe die Datenschutzerklärung gelesen.</span>
        </label>
        <FormMessage state={state} />
        <SubmitButton className="w-full" pendingText="Wird erstellt …">Kostenlos starten</SubmitButton>
      </form>
      <p className="mt-5 text-center text-sm text-muted-foreground">Schon registriert? <Link href="/login" className="font-medium text-foreground">Anmelden</Link></p>
    </Card>
  );
}

export function ResetForm() {
  const [state, action] = useActionState(requestPasswordReset, undefined);
  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Passwort zurücksetzen</h1>
      <p className="mt-1 text-sm text-muted-foreground">Wir senden dir einen Link per E-Mail.</p>
      <form action={action} className="mt-6 space-y-4">
        <Field label="E-Mail" name="email"><Input id="email" name="email" type="email" required /></Field>
        <FormMessage state={state} />
        <SubmitButton className="w-full" pendingText="Senden …">Link senden</SubmitButton>
      </form>
      <p className="mt-5 text-center text-sm"><Link href="/login" className="text-muted-foreground hover:text-foreground">Zurück zur Anmeldung</Link></p>
    </Card>
  );
}

export function NewPasswordForm() {
  const [state, action] = useActionState(updatePassword, undefined);
  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Neues Passwort festlegen</h1>
      <form action={action} className="mt-6 space-y-4">
        <Field label="Neues Passwort" name="password" hint="Mindestens 10 Zeichen"><Input id="password" name="password" type="password" autoComplete="new-password" required /></Field>
        <Field label="Passwort wiederholen" name="confirm"><Input id="confirm" name="confirm" type="password" autoComplete="new-password" required /></Field>
        <FormMessage state={state} />
        <SubmitButton className="w-full">Passwort speichern</SubmitButton>
      </form>
    </Card>
  );
}
