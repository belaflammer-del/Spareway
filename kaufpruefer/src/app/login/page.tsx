import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm, AuthShell } from "@/components/auth/auth-form";
import { Alert } from "@/components/ui/misc";
import { signInAction } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/session";
import { features } from "@/lib/config/env";

export const metadata: Metadata = { title: "Anmelden" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/dashboard";
  if (await getCurrentUser()) redirect(next);
  return (
    <AuthShell title="Willkommen zurück" subtitle="Melde dich an, um Analysen zu speichern und Tokens zu nutzen." footer={<>Noch kein Konto? <Link href={`/register?next=${encodeURIComponent(next)}`} className="font-medium text-foreground underline-offset-4 hover:underline">Kostenlos registrieren</Link></>}>
      {!features.supabase && (
        <Alert tone="demo" className="mb-4">Lokaler Modus: Konten werden nur auf diesem Server gespeichert (ohne Supabase).</Alert>
      )}
      <AuthForm action={signInAction} kind="login" next={next} />
    </AuthShell>
  );
}
