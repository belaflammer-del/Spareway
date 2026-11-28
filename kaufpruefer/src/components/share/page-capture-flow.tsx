"use client";

import { ArrowRight, CheckCircle2, Eye, FileSearch, ImageIcon, LogIn, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, Spinner } from "@/components/ui/misc";
import { formatEur, PLATFORM_LABELS } from "@/lib/domain/labels";
import type { Listing, MissingInfo } from "@/lib/domain/schemas";

export const PAGE_KEY = "dn-page-capture";
export const PREFILL_KEY = "dn-prefill";

interface Result {
  draft: { listing: Listing; missingInfo: MissingInfo[]; notes: string[]; lowConfidence: string[]; conflicts: [] };
  existing?: { id: string; createdAt: string; title: string; watchActive?: boolean };
}

/** Übernahme einer Inseratsseite, die per „→ DEAL-NIVO“-Button übergeben wurde. */
export function PageCaptureFlow({ capture, loggedIn }: { capture: unknown; loggedIn: boolean }) {
  const router = useRouter();
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const once = useRef(false);
  const [update, setUpdate] = useState<{ busy: boolean; text?: string; assessment?: string; none?: boolean }>({ busy: false });

  async function updateWatch(analysisId: string) {
    setUpdate({ busy: true });
    try {
      const r = await fetch(`/api/analyses/${analysisId}/watch/update`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page: capture }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message ?? "Aktualisierung fehlgeschlagen");
      setUpdate({ busy: false, text: d.summary?.text, assessment: d.summary?.assessment, none: !d.changes?.length });
    } catch (e) {
      setErr((e as Error).message);
      setUpdate({ busy: false });
    }
  }

  useEffect(() => {
    if (!loggedIn || once.current) return;
    once.current = true;
    fetch("/api/share/page", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ capture }) })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error?.message ?? "Übernahme fehlgeschlagen");
        try {
          sessionStorage.removeItem(PAGE_KEY);
        } catch {
          /* egal */
        }
        setRes(d);
      })
      .catch((e) => setErr((e as Error).message));
  }, [capture, loggedIn]);

  function proceed() {
    if (!res) return;
    try {
      sessionStorage.setItem(PREFILL_KEY, JSON.stringify(res.draft));
    } catch {
      /* privater Modus */
    }
    router.push("/check?prefill=1");
  }

  if (!loggedIn)
    return (
      <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
        <p className="font-semibold">Inserat empfangen</p>
        <p className="mt-1 text-sm text-muted">Melde dich an – danach geht es mit diesem Inserat direkt weiter.</p>
        <Button asChild className="mt-4 w-full">
          <Link href={`/login?next=${encodeURIComponent("/teilen")}`}>
            <LogIn /> Anmelden und fortfahren
          </Link>
        </Button>
      </div>
    );
  if (err) return <Alert tone="bad" className="mt-6">{err}</Alert>;
  if (!res)
    return (
      <div className="mt-10 flex items-center justify-center gap-2 text-muted">
        <Spinner /> Inserat wird übernommen …
      </div>
    );

  const l = res.draft.listing;
  const facts = [
    l.year && `${l.year}`,
    l.mileageKm != null && `${l.mileageKm.toLocaleString("de-DE")} km`,
    l.powerKw && `${l.powerKw} kW`,
    l.fuel,
    l.storageGb && `${l.storageGb} GB`,
    l.size && `Größe ${l.size}`,
    l.location,
  ].filter(Boolean) as string[];
  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="good">
            <CheckCircle2 /> {PLATFORM_LABELS[l.platform] ?? "Inserat"}
          </Badge>
          {l.images.length > 0 && (
            <Badge tone="neutral">
              <ImageIcon /> {l.images.length} Bilder
            </Badge>
          )}
        </div>
        <div className="mt-3 flex gap-3">
          {l.images[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/uploads/${l.images[0].ref}`} alt="" className="size-20 shrink-0 rounded-xl border border-border object-cover" />
          )}
          <div className="min-w-0">
            <p className="text-lg font-semibold leading-snug">{l.title ?? "Unbenanntes Inserat"}</p>
            <p className="mt-1 text-xl font-bold">{l.priceEur != null ? formatEur(l.priceEur) : <span className="text-warn">Preis nicht erkannt</span>}</p>
          </div>
        </div>
        {facts.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {facts.map((f) => (
              <span key={f} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs">{f}</span>
            ))}
          </div>
        )}
        <ul className="mt-3 space-y-1 text-xs text-muted">
          {res.draft.notes.map((n) => (
            <li key={n}>• {n}</li>
          ))}
        </ul>
      </div>

      {res.existing?.watchActive && (
        <div className="rounded-2xl border border-accent/50 bg-accent-soft/40 p-4">
          <p className="flex items-center gap-2 font-semibold">
            <Eye className="size-4 text-accent" /> Du beobachtest dieses Angebot
          </p>
          {update.text || update.none ? (
            <div className="mt-2 text-sm">
              {update.none ? <p>Keine Änderungen seit der letzten Erfassung.</p> : <p className="font-medium">{update.text}</p>}
              {update.assessment && (
                <p className="mt-1 flex gap-1.5">
                  <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent" /> {update.assessment}
                </p>
              )}
              <Button asChild size="sm" className="mt-3">
                <Link href={`/analysis/${res.existing.id}#s-watch`}>Zur Kaufakte</Link>
              </Button>
            </div>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted">Speichere den aktuellen Stand – wir vergleichen mit der letzten Erfassung und fassen die Änderungen zusammen.</p>
              <Button size="sm" className="mt-3" onClick={() => updateWatch(res.existing!.id)} disabled={update.busy}>
                {update.busy ? <Spinner /> : "Beobachtung aktualisieren"}
              </Button>
            </>
          )}
        </div>
      )}

      {res.existing && (
        <div className="rounded-2xl border border-accent/40 bg-accent-soft/40 p-4">
          <p className="text-sm font-semibold">Bereits geprüft am {new Date(res.existing.createdAt).toLocaleDateString("de-DE")}</p>
          <div className="mt-3 flex gap-2">
            <Button asChild size="sm">
              <Link href={`/analysis/${res.existing.id}`}>
                <FileSearch /> Kaufakte öffnen
              </Link>
            </Button>
            <Button size="sm" variant="outline" onClick={proceed}>
              <RefreshCw /> Erneut prüfen
            </Button>
          </div>
        </div>
      )}
      {!res.existing && (
        <Button size="lg" className="w-full" onClick={proceed}>
          Angaben prüfen & Analyse starten <ArrowRight />
        </Button>
      )}
    </div>
  );
}
