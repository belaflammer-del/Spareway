"use client";

import { ArrowRight, CheckCircle2, FileSearch, ImagePlus, Link2, LogIn, RefreshCw, Share2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, Spinner } from "@/components/ui/misc";
import type { ShareImportResult } from "@/lib/share/import";

const ERRORS: Record<string, string> = {
  rate: "Zu viele geteilte Inhalte in kurzer Zeit. Bitte versuche es später erneut.",
  too_large: "Die geteilten Dateien sind zu groß (max. 40 MB).",
  invalid: "Die geteilten Inhalte konnten nicht gelesen werden.",
};

/**
 * Landeseite für alles, was über „Teilen“ zu DEAL-NIVO kommt (PWA Share Target,
 * native Share Extension, Android-Sharesheet). Zeigt eine kurze Bestätigung –
 * die Analyse startet erst nach Klick des Nutzers.
 */
export function ShareLanding(props: { loggedIn: boolean; inboxId?: string; url?: string; text?: string; title?: string; error?: string; skipped: number }) {
  const [res, setRes] = useState<ShareImportResult | null>(null);
  const [err, setErr] = useState<string | null>(props.error ? (ERRORS[props.error] ?? "Fehler beim Teilen") : null);
  const [loading, setLoading] = useState(false);
  const once = useRef(false);
  const needsLogin = !!props.inboxId && !props.loggedIn;
  const hasInput = !!(props.inboxId || props.url || props.text || props.title);

  useEffect(() => {
    if (once.current || !hasInput || needsLogin) return;
    once.current = true; // React-StrictMode/Doppelaufrufe: nur ein Import
    setLoading(true);
    fetch("/api/share/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inboxId: props.inboxId, url: props.url, text: props.text, title: props.title }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error?.message ?? "Fehler");
        setRes(d);
      })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [hasInput, needsLogin, props.inboxId, props.url, props.text, props.title]);

  const shared = res?.uploadIds.length ? `&shared=${res.uploadIds.join(",")}` : "";
  const checkHref = res?.url ? `/check?url=${encodeURIComponent(res.url)}${shared}${res.uploadIds.length ? "&mode=screenshots" : ""}` : `/check?mode=screenshots${shared}`;
  const screenshotHref = `/check?mode=screenshots${res?.url ? `&url=${encodeURIComponent(res.url)}` : ""}${shared}`;

  return (
    <div className="mx-auto max-w-lg px-4 pb-28 pt-8">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-accent text-accent-fg">
          <Share2 className="size-5" />
        </span>
        <div>
          <h1 className="text-xl font-bold">Geteiltes Angebot</h1>
          <p className="text-sm text-muted">Kurz prüfen, dann startet der Deal-Check.</p>
        </div>
      </div>

      {props.skipped > 0 && (
        <Alert tone="warn" className="mt-5">
          {props.skipped} Datei(en) wurden übersprungen (nur JPEG, PNG, WebP).
        </Alert>
      )}
      {err && (
        <Alert tone="bad" className="mt-5">
          {err}
        </Alert>
      )}

      {needsLogin && (
        <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
          <p className="font-semibold">Fast geschafft</p>
          <p className="mt-1 text-sm text-muted">Melde dich an, damit wir die geteilten Bilder deinem Konto zuordnen können. Die Inhalte bleiben 30 Minuten abrufbar.</p>
          <Button asChild className="mt-4 w-full">
            <Link href={`/login?next=${encodeURIComponent(`/teilen?inbox=${props.inboxId}`)}`}>
              <LogIn /> Anmelden und fortfahren
            </Link>
          </Button>
        </div>
      )}

      {!hasInput && !err && (
        <div className="mt-6 rounded-2xl border border-border bg-surface p-5 text-sm">
          <p className="font-semibold">So teilst du ein Inserat mit DEAL-NIVO</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
            <li>Inserat in der Marktplatz-App öffnen und auf „Teilen“ tippen.</li>
            <li>„DEAL-NIVO“ auswählen (Android: nach Installation der App über „Zum Startbildschirm hinzufügen“).</li>
            <li>Auf dem iPhone: „Link kopieren“ und in DEAL-NIVO einfügen – eine eigene iOS-App mit Teilen-Erweiterung ist in Vorbereitung.</li>
          </ol>
          <Button asChild className="mt-4 w-full">
            <Link href="/check">Link einfügen</Link>
          </Button>
        </div>
      )}

      {loading && (
        <div className="mt-10 flex items-center justify-center gap-2 text-muted">
          <Spinner /> Inserat wird erkannt …
        </div>
      )}

      {res && (
        <div className="mt-6 space-y-4">
          <div className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex flex-wrap items-center gap-2">
              {res.kind === "listing_link" && <Badge tone="good"><CheckCircle2 /> {res.platformName}</Badge>}
              {res.kind === "unsupported_link" && <Badge tone="warn">{res.platformName || "Unbekannte Plattform"}</Badge>}
              {res.kind === "files_only" && <Badge tone="info"><ImagePlus /> Bilder</Badge>}
              {res.autoImport && <Badge tone="accent">Offizielle Schnittstelle</Badge>}
            </div>
            {res.titleHint && <p className="mt-3 text-lg font-semibold leading-snug">{res.titleHint}</p>}
            {res.url && (
              <p className="mt-2 flex items-start gap-1.5 break-all text-xs text-muted">
                <Link2 className="mt-0.5 size-3.5 shrink-0" /> {res.url}
              </p>
            )}
            <p className="mt-3 text-sm">{res.message}</p>
            {res.uploadIds.length > 0 && (
              <div className="mt-3 flex gap-2 overflow-x-auto">
                {res.uploadIds.map((id) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={id} src={`/api/uploads/${id}`} alt="Geteiltes Bild" className="size-16 shrink-0 rounded-lg border border-border object-cover" />
                ))}
              </div>
            )}
            {res.missing.length > 0 && (
              <p className="mt-3 text-xs text-muted">
                Noch benötigt: <span className="font-medium text-foreground">{res.missing.join(", ")}</span>
              </p>
            )}
          </div>

          {res.existing && (
            <div className="rounded-2xl border border-accent/40 bg-accent-soft/40 p-4">
              <p className="text-sm font-semibold">Bereits geprüft am {new Date(res.existing.createdAt).toLocaleDateString("de-DE")}</p>
              <p className="text-sm text-muted">{res.existing.title}</p>
              <div className="mt-3 flex gap-2">
                <Button asChild size="sm">
                  <Link href={`/analysis/${res.existing.id}`}>
                    <FileSearch /> Kaufakte öffnen
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={checkHref}>
                    <RefreshCw /> Erneut prüfen
                  </Link>
                </Button>
              </div>
            </div>
          )}

          {res.ok && !res.existing && (
            <div className="space-y-2.5">
              {res.needsScreenshots ? (
                <>
                  <Button asChild size="lg" className="w-full">
                    <Link href={screenshotHref}>
                      <ImagePlus /> Screenshots hochladen
                    </Link>
                  </Button>
                  <p className="text-center text-xs text-muted">Tipp: Inserat mit Preis, Beschreibung und Details abfotografieren.</p>
                </>
              ) : (
                <Button asChild size="lg" className="w-full">
                  <Link href={checkHref}>
                    Analyse vorbereiten <ArrowRight />
                  </Link>
                </Button>
              )}
            </div>
          )}
          {!res.ok && (
            <Button asChild size="lg" className="w-full">
              <Link href="/check?mode=screenshots">
                <ImagePlus /> Screenshots hochladen
              </Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
