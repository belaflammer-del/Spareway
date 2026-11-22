"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { deleteAccountAction } from "@/lib/account/actions";

export function DeleteAccount() {
  const [state, action, pending] = useActionState(deleteAccountAction, {});
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-muted">
        Löscht dein Konto, alle Analysen und Uploads unwiderruflich. Nicht eingelöste Tokens verfallen. Buchungsbelege bleiben aufgrund gesetzlicher Aufbewahrungspflichten pseudonymisiert erhalten.
      </p>
      <Input name="confirm" placeholder="Zur Bestätigung LÖSCHEN eingeben" aria-label="Bestätigung" />
      {state.error && <Alert tone="bad">{state.error}</Alert>}
      <Button variant="danger" disabled={pending}>Konto endgültig löschen</Button>
    </form>
  );
}
