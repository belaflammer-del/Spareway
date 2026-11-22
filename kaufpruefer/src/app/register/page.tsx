import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm, AuthShell } from "@/components/auth/auth-form";
import { signUpAction } from "@/lib/auth/actions";

export const metadata: Metadata = { title: "Registrieren" };

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") ? sp.next : "/dashboard";
  return (
    <AuthShell title="Konto erstellen" subtitle="Kostenlos – für Schnellchecks, gespeicherte Analysen und Token-Wallet." footer={<>Schon registriert? <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-medium text-foreground underline-offset-4 hover:underline">Anmelden</Link></>}>
      <AuthForm action={signUpAction} kind="register" />
    </AuthShell>
  );
}
