import type { Metadata } from "next";
import Link from "next/link";
import { DeleteAccount } from "@/components/dashboard/delete-account";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { deleteMyUploadsAction } from "@/lib/account/actions";
import { requireUser } from "@/lib/auth/session";
import { env } from "@/lib/config/env";
import { getStore } from "@/lib/store";

export const metadata: Metadata = { title: "Konto & Datenschutz" };

export default async function SettingsPage({ searchParams }: PageProps<"/dashboard/settings">) {
  const user = await requireUser("/dashboard/settings");
  const sp = await searchParams;
  const uploads = await getStore().listUploadsByOwner(user.id);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Konto & Datenschutz</h1>
      {sp.uploads === "deleted" && <Alert tone="good">Alle Uploads wurden gelöscht.</Alert>}
      <Card className="p-5">
        <h2 className="font-semibold">Konto</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-muted">E-Mail</dt><dd>{user.email}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">E-Mail bestätigt</dt><dd>{user.emailVerified ? "Ja" : "Nein"}</dd></div>
        </dl>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href="/reset-password/update">Passwort ändern</Link>
        </Button>
      </Card>
      <Card className="p-5">
        <h2 className="font-semibold">Deine Daten</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Hochgeladene Bilder werden ohne Metadaten (EXIF/GPS) gespeichert und nach {env.uploadRetentionHours} Stunden automatisch gelöscht.</li>
          <li>Bildschirmaufnahmen werden direkt nach der Frame-Extraktion gelöscht, Bewertungs-Screenshots nach der Analyse.</li>
          <li>Prüfberichte bleiben gespeichert, bis du sie löschst.</li>
          <li>IP-Adressen werden nur gehasht für den Missbrauchsschutz verwendet.</li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild variant="outline" size="sm">
            <a href="/api/account/export">Daten exportieren (JSON)</a>
          </Button>
          <form action={deleteMyUploadsAction}>
            <Button variant="outline" size="sm" disabled={uploads.length === 0}>Alle Uploads jetzt löschen ({uploads.length})</Button>
          </form>
        </div>
      </Card>
      <Card className="border-bad/30 p-5">
        <h2 className="font-semibold text-bad">Konto löschen</h2>
        <div className="mt-3">
          <DeleteAccount />
        </div>
      </Card>
    </div>
  );
}
