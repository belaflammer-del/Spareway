import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm, AuthShell } from "@/components/auth/auth-form";
import { requestResetAction } from "@/lib/auth/actions";

export const metadata: Metadata = { title: "Passwort zurücksetzen" };

export default function ResetPage() {
  return (
    <AuthShell title="Passwort zurücksetzen" subtitle="Wir schicken dir einen Link zum Festlegen eines neuen Passworts." footer={<Link href="/login" className="underline-offset-4 hover:underline">Zurück zur Anmeldung</Link>}>
      <AuthForm action={requestResetAction} kind="reset" />
    </AuthShell>
  );
}
