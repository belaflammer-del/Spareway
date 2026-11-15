import Link from "next/link";
import { Logo } from "@/components/logo";
import { Card, Notice, buttonClass } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { acceptInvitation } from "@/app/actions/company";

export const metadata = { title: "Einladung", robots: { index: false } };

export default async function Invitation({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ fehler?: string }> }) {
  const { token } = await params;
  const { fehler } = await searchParams;
  const user = await getUser();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4">
      <Logo className="mb-8" />
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-xl font-semibold">Einladung annehmen</h1>
        <p className="mt-1 text-sm text-muted-foreground">Du wurdest in ein Team bei DetailFlow eingeladen.</p>
        {fehler && <div className="mt-4"><Notice tone="red">{fehler}</Notice></div>}
        {user ? (
          <form action={acceptInvitation} className="mt-6">
            <input type="hidden" name="token" value={token} />
            <p className="mb-3 text-sm">Angemeldet als <strong>{user.email}</strong></p>
            <button className={buttonClass("primary", "md", "w-full")}>Team beitreten</button>
          </form>
        ) : (
          <div className="mt-6 space-y-2">
            <Link href={`/registrieren`} className={buttonClass("primary", "md", "w-full")}>Konto erstellen</Link>
            <Link href={`/login?weiter=/einladung/${token}`} className={buttonClass("secondary", "md", "w-full")}>Ich habe bereits ein Konto</Link>
            <p className="pt-2 text-xs text-muted-foreground">Bitte verwende die E-Mail-Adresse, an die die Einladung ging. Nach der Registrierung öffne diesen Link erneut.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
