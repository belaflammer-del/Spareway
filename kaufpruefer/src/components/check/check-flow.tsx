"use client";

import { AlertTriangle, ArrowLeft, ArrowRight, ChevronDown, FileText, ImagePlus, Link2, Lock, Plus, Sparkles, Trash2, Users, Video, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Alert, Spinner } from "@/components/ui/misc";
import { CATEGORY_PROFILES } from "@/lib/domain/category-profiles";
import { CATEGORY_LABELS, CATEGORY_SUPPORT, FIELD_LABELS, FIELD_SOURCE_LABELS, formatEur, NUMERIC_FIELDS, PLATFORM_LABELS } from "@/lib/domain/labels";
import type { Category, FieldSource, Listing, ListingFieldKey, MissingInfo } from "@/lib/domain/schemas";
import type { QuickCheckResult } from "@/lib/pipeline/quick";
import { cn } from "@/lib/utils";
import { uploadVideoWithProgress } from "@/lib/client/video";
import { haptic } from "@/lib/client/haptics";
import { AnalysisProgress } from "./analysis-progress";

type Mode = "link" | "screenshots" | "text";
interface Draft {
  listing: Listing;
  missingInfo: MissingInfo[];
  notes: string[];
  lowConfidence: string[];
  conflicts?: { field: string; values: string[]; images: string[] }[];
}
interface Comp {
  priceEur: string;
  priceType: "listing" | "sold";
  year: string;
  mileageKm: string;
  url: string;
}

export interface CheckFlowProps {
  initialUrl?: string;
  initialMode?: Mode;
  loggedIn: boolean;
  balance: number;
  aiAvailable: boolean;
  fullCheckCost: number;
  videoMaxSeconds: number;
  videoMaxMb: number;
  categoryStatus: Record<string, "live" | "beta" | "off">;
  /** Vergleichsmodus: nach der Analyse mit dieser Analyse vergleichen */
  compareWith?: string;
  /** Vergleichsmodus: danach dieses zweite Inserat prüfen */
  compareNext?: string;
  /** Über das Teilen-Menü bereits übernommene Bilder */
  sharedUploadIds?: string[];
  /** Vorausgefüllter Entwurf aus dem „→ DEAL-NIVO“-Button (Sitzungsspeicher) */
  prefill?: boolean;
}

/** Deutsche Zahlenschreibweise tolerant parsen („18.900 €“, „1,5“). */
export function parseNum(s: string): number | undefined {
  const t = s.replace(/[^\d.,-]/g, "");
  if (!t) return undefined;
  const normalized = /,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/[.,](?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
}

/** Upload per XHR, damit ein Fortschrittsbalken angezeigt werden kann. */
function uploadImages(files: File[], onProgress?: (pct: number) => void): Promise<string[]> {
  if (files.length === 0) return Promise.resolve([]);
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onerror = () => reject(new Error("Upload fehlgeschlagen – bitte Verbindung prüfen"));
    xhr.onload = () => {
      let data: { uploads?: { id: string }[]; errors?: { name: string; message: string }[]; error?: { message: string } } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* leer */
      }
      if (xhr.status >= 400) return reject(new Error(data.error?.message ?? "Upload fehlgeschlagen"));
      for (const e of data.errors ?? []) toast.error(`${e.name}: ${e.message}`);
      resolve((data.uploads ?? []).map((u) => u.id));
    };
    xhr.send(fd);
  });
}

const EXTRA_FIELDS: ListingFieldKey[] = ["title", "variant", "location", "sellerType", "paymentMethods"];

export function CheckFlow(props: CheckFlowProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(props.initialMode ?? "link");
  const [url, setUrl] = useState(props.initialUrl ?? "");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [step, setStep] = useState<"input" | "review" | "quick">("input");
  const [busy, setBusy] = useState<null | "draft" | "quick" | "full" | "upload">(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [conflicts, setConflicts] = useState<NonNullable<Draft["conflicts"]>>([]);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [acceptBeta, setAcceptBeta] = useState(false);
  const [videoStatus, setVideoStatus] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  function confirm() {
    setConfirmed(true);
    setEditing(false);
    setTimeout(() => document.getElementById("check-actions")?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  }
  const [comps, setComps] = useState<Comp[]>([]);
  const [sellerOn, setSellerOn] = useState(false);
  const [sellerMethod, setSellerMethod] = useState<"screenshots" | "screen_recording" | "pasted_text">("screenshots");
  const [sellerFiles, setSellerFiles] = useState<File[]>([]);
  const [sellerVideo, setSellerVideo] = useState<File | null>(null);
  const [sellerText, setSellerText] = useState("");
  const [sellerTotal, setSellerTotal] = useState("");
  const [quick, setQuick] = useState<QuickCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const extraPhotos = useRef<HTMLInputElement>(null);

  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);

  // Übernahme aus der Inseratsseite: direkt zum Prüfschritt
  useEffect(() => {
    if (!props.prefill) return;
    try {
      const raw = sessionStorage.getItem("dn-prefill");
      if (!raw) return;
      sessionStorage.removeItem("dn-prefill");
      const d = JSON.parse(raw) as Draft;
      setDraft(d);
      setListing(d.listing);
      setConflicts(d.conflicts ?? []);
      if (d.listing.url) setUrl(d.listing.url);
      setStep("review");
    } catch {
      /* ungültige Daten ignorieren */
    }
  }, [props.prefill]);

  async function createDraft() {
    setError(null);
    if (mode === "link" && !url.trim()) return setError("Bitte füge einen Inseratslink ein.");
    const shared = mode === "screenshots" ? (props.sharedUploadIds ?? []) : [];
    if (mode === "screenshots" && files.length === 0 && shared.length === 0 && !url.trim()) return setError("Bitte lade mindestens einen Screenshot hoch.");
    if (mode === "text" && text.trim().length < 20) return setError("Bitte füge den Inseratstext ein (mindestens 20 Zeichen).");
    if (files.length > 0 && !props.loggedIn) return setError("Für den Screenshot-Upload brauchst du ein kostenloses Konto.");
    setBusy("draft");
    try {
      const imageIds = mode === "screenshots" ? [...shared, ...(await uploadImages(files, setUploadPct))] : [];
      setUploadPct(null);
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() || undefined, imageIds, pastedText: mode === "text" ? text : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? "Fehler beim Auslesen");
      setDraft(data.draft);
      setListing(data.draft.listing);
      setConflicts(data.draft.conflicts ?? []);
      setConfirmed(false);
      setEditing(false);
      setStep("review");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function setField(key: ListingFieldKey | "category", raw: string) {
    setListing((l) => {
      if (!l) return l;
      const next: Listing = { ...l, provenance: { ...l.provenance } };
      if (key === "category") {
        next.category = raw as Category;
        next.provenance.category = "user";
        return next;
      }
      const value = NUMERIC_FIELDS.includes(key) ? parseNum(raw) : raw.trim() === "" ? undefined : raw;
      (next as Record<string, unknown>)[key] = value;
      if (value == null) delete next.provenance[key];
      else next.provenance[key] = "user";
      return next;
    });
  }

  const missingNow = useMemo(() => {
    if (!listing) return [];
    return CATEGORY_PROFILES[listing.category].fields.filter((f) => {
      const v = (listing as Record<string, unknown>)[f.field];
      return v == null || v === "";
    });
  }, [listing]);

  async function addPhotos(list: FileList | null) {
    if (!list || !listing) return;
    setBusy("upload");
    try {
      const ids = await uploadImages(Array.from(list).slice(0, 10), setUploadPct);
      setUploadPct(null);
      setListing({ ...listing, images: [...listing.images, ...ids.map((ref) => ({ ref, kind: "product_photo" as const }))] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function cleanListing(l: Listing): Listing {
    return { ...l, images: l.images.slice(0, 12) };
  }

  async function runQuick() {
    if (!listing) return;
    setBusy("quick");
    setError(null);
    try {
      const res = await fetch("/api/quickcheck", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listing: cleanListing(listing) }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? "Schnellcheck fehlgeschlagen");
      setQuick(data.result);
      setStep("quick");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runFull() {
    if (!listing) return;
    setError(null);
    if (sellerOn && sellerMethod === "screen_recording" && sellerVideo && sellerVideo.size > props.videoMaxMb * 1024 * 1024)
      return setError(`Das Video ist größer als ${props.videoMaxMb} MB.`);
    setBusy("full");
    try {
      let seller: Record<string, unknown> | undefined;
      if (sellerOn) {
        let imageIds: string[] = [];
        if (sellerMethod === "screenshots") imageIds = await uploadImages(sellerFiles, setUploadPct);
        if (sellerMethod === "screen_recording" && sellerVideo) {
          const d = await uploadVideoWithProgress(sellerVideo, (pct, msg) => setVideoStatus(`${msg} (${pct} %)`));
          setVideoStatus(null);
          imageIds = d.frameIds;
          if (d.stats) toast.success(`${d.stats.keptFrames} relevante Bilder aus ${d.stats.durationSeconds} s Video extrahiert. Das Video wurde gelöscht.`);
          if (d.hint) toast.message(d.hint);
        }
        seller = {
          method: sellerMethod,
          imageIds,
          pastedText: sellerMethod === "pasted_text" ? sellerText : undefined,
          platformTotalClaimed: sellerTotal ? parseNum(sellerTotal) : undefined,
        };
      }
      const comparables = comps
        .map((c) => ({ priceEur: parseNum(c.priceEur), priceType: c.priceType, year: parseNum(c.year), mileageKm: parseNum(c.mileageKm), url: c.url || undefined }))
        .filter((c) => c.priceEur != null && c.priceEur > 0);
      const res = await fetch("/api/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: crypto.randomUUID(), listing: cleanListing(listing), comparables, seller, acceptBeta }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 402) {
          toast.error(data.error.message, { action: { label: "Tokens kaufen", onClick: () => router.push("/dashboard/wallet") } });
        }
        throw new Error(data.error?.message ?? "Analyse fehlgeschlagen");
      }
      haptic(data.report?.score?.recommendation === "elevated_risk" ? "warning" : "success");
      if (data.reused) toast.success("Dieses Angebot hast du bereits geprüft – kein weiterer Token verbraucht.");
      if (props.compareNext) router.push(`/check?url=${encodeURIComponent(props.compareNext)}&compareWith=${encodeURIComponent(data.id)}`);
      else if (props.compareWith) router.push(`/vergleich?a=${encodeURIComponent(props.compareWith)}&b=${encodeURIComponent(data.id)}`);
      else router.push(`/analysis/${data.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  /* ───────────────────────── Render ───────────────────────── */

  if (busy === "full") return <AnalysisProgress ai={props.aiAvailable} seller={sellerOn} status={videoStatus} />;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      {(props.compareWith || props.compareNext) && (
        <div className="mb-5 rounded-xl border border-accent/40 bg-accent-soft/40 px-3 py-2 text-sm">
          <span className="font-semibold">Angebotsvergleich · </span>
          {props.compareNext ? "Angebot 1 von 2 – danach prüfen wir das zweite Inserat." : "Zweites Angebot – danach siehst du den Vergleich."}
        </div>
      )}
      <Stepper step={step} />
      <AnimatePresence mode="wait">
        {step === "input" && (
          <motion.div key="input" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }}>
            <h1 className="text-3xl font-semibold tracking-tight">Welches Angebot möchtest du prüfen?</h1>
            <p className="mt-2 text-muted">Füge einen Link ein, lade Screenshots hoch oder kopiere den Inseratstext.</p>
            <Card className="mt-6 p-2">
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1" role="tablist">
                {(
                  [
                    ["link", "Link", Link2],
                    ["screenshots", "Screenshots", ImagePlus],
                    ["text", "Text", FileText],
                  ] as const
                ).map(([m, l, Icon]) => (
                  <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={cn("flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm transition", mode === m ? "bg-surface font-medium shadow-sm" : "text-muted")}>
                    <Icon className="size-4" /> {l}
                  </button>
                ))}
              </div>
              <div className="space-y-4 p-4">
                {(mode === "link" || mode === "screenshots") && (
                  <div className="space-y-1.5">
                    <Label htmlFor="url">{mode === "link" ? "Inseratslink" : "Inseratslink (optional)"}</Label>
                    <Input id="url" inputMode="url" placeholder="https://www.kleinanzeigen.de/s-anzeige/…" value={url} onChange={(e) => setUrl(e.target.value)} />
                    {mode === "link" && (
                      <p className="text-xs text-muted">
                        Schneller geht es mit dem{" "}
                        <Link href="/button" className="font-medium text-accent underline">
                          „→ DEAL-NIVO“-Button
                        </Link>
                        : Inserat öffnen, antippen – Titel, Preis, Details und Bilder werden übernommen. Mit Link allein ergänzt du die Angaben im nächsten Schritt oder lädst Screenshots hoch.
                      </p>
                    )}
                  </div>
                )}
                {mode === "screenshots" && (
                  <div>
                  {(props.sharedUploadIds?.length ?? 0) > 0 && (
                    <div className="mb-3 rounded-xl border border-accent/40 bg-accent-soft/30 p-3">
                      <p className="text-sm font-medium">{props.sharedUploadIds!.length} geteilte{props.sharedUploadIds!.length > 1 ? " Bilder" : "s Bild"} übernommen</p>
                      <div className="mt-2 flex gap-2 overflow-x-auto">
                        {props.sharedUploadIds!.map((id) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={id} src={`/api/uploads/${id}`} alt="Geteiltes Bild" className="size-14 shrink-0 rounded-lg border border-border object-cover" />
                        ))}
                      </div>
                    </div>
                  )}
                  <Dropzone files={files} previews={previews} onChange={setFiles} disabled={!props.loggedIn} hint={props.aiAvailable ? "Die KI liest Preis, Angaben und Beschreibung aus." : "Ohne KI-Schlüssel (Demo-Modus) trägst du die Angaben im nächsten Schritt selbst ein."} />
                  </div>
                )}
                {mode === "text" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="text">Inseratstext</Label>
                    <Textarea id="text" rows={8} placeholder="Titel, Preis, Beschreibung … einfach kopieren und einfügen" value={text} onChange={(e) => setText(e.target.value)} />
                  </div>
                )}
                {!props.loggedIn && mode === "screenshots" && (
                  <Alert tone="info">
                    Für Uploads brauchst du ein <Link className="font-medium underline" href="/register?next=/check?mode=screenshots">kostenloses Konto</Link>. Ein Link oder Text funktioniert auch ohne Anmeldung.
                  </Alert>
                )}
                {error && <Alert tone="bad">{error}</Alert>}
                <Button className="w-full" size="lg" onClick={createDraft} disabled={!!busy}>
                  {busy ? <Spinner /> : <ArrowRight />} {busy ? (uploadPct != null && uploadPct < 100 ? `Hochladen … ${uploadPct} %` : "Angebot wird erkannt …") : "Angebot erkennen"}
                </Button>
              </div>
            </Card>
            <p className="mt-6 text-center text-sm text-muted">
              Erst einmal ansehen? <Link href="/demo" className="font-medium text-foreground underline-offset-4 hover:underline">Beispielanalysen öffnen</Link>
            </p>
          </motion.div>
        )}

        {step === "review" && listing && draft && (
          <motion.div key="review" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }} className="space-y-5">
            <div>
              <button onClick={() => setStep("input")} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
                <ArrowLeft className="size-4" /> Zurück
              </button>
              <h1 className="text-3xl font-bold tracking-tight">Angebot erkannt</h1>
              <p className="mt-1.5 text-muted">Kurz prüfen, fehlende Punkte ergänzen – fertig.</p>
            </div>

            <RecognizedCard listing={listing} aiAvailable={props.aiAvailable} notes={draft.notes} beta={props.categoryStatus[listing.category] === "beta"} />

            {conflicts.map((c) => (
              <Card key={c.field} className="border-warn/50 p-4">
                <p className="text-sm font-semibold">
                  Unterschiedliche Angaben: {FIELD_LABELS[c.field as ListingFieldKey] ?? c.field}
                </p>
                <p className="mt-0.5 text-sm text-muted">Auf deinen Screenshots stehen verschiedene Werte. Welcher stimmt?</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {c.values.map((v) => (
                    <Button
                      key={v}
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setField(c.field as ListingFieldKey, v);
                        setConflicts((cs) => cs.filter((x) => x.field !== c.field));
                      }}
                    >
                      {v}
                    </Button>
                  ))}
                </div>
              </Card>
            ))}

            {missingNow.filter((m) => m.importance === "critical").length > 0 && (
              <Card className="p-5">
                <h2 className="font-semibold">Damit wir bewerten können</h2>
                <p className="mt-0.5 text-sm text-muted">Fehlt eine Angabe, wird die betroffene Teilbewertung als „nicht verfügbar“ markiert – wir erfinden nichts.</p>
                <div className="mt-4 grid gap-4">
                  {missingNow
                    .filter((m) => m.importance === "critical")
                    .slice(0, 4)
                    .map((m) => (
                      <div key={m.field}>
                        <p className="mb-1.5 text-sm">{m.question}</p>
                        <FieldInput field={m.field} listing={listing} low={false} missing={m.importance} onChange={(v) => setField(m.field, v)} />
                      </div>
                    ))}
                </div>
              </Card>
            )}

            {!confirmed && (
              <Card className="p-4">
                <p className="font-semibold">Sind diese Angaben korrekt?</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button onClick={confirm} disabled={conflicts.length > 0}>
                    Alles korrekt
                  </Button>
                  <Button variant="outline" onClick={() => setEditing((e) => !e)}>
                    Angaben bearbeiten
                  </Button>
                </div>
                {conflicts.length > 0 && <p className="mt-2 text-xs text-warn">Bitte zuerst die unterschiedlichen Angaben oben auswählen.</p>}
              </Card>
            )}

            {editing && (
            <Card className="p-4">
              <div className="grid gap-1.5">
                <Label htmlFor="cat">Kategorie</Label>
                <Select id="cat" value={listing.category} onChange={(e) => setField("category", e.target.value)}>
                  {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {[...new Set([...CATEGORY_PROFILES[listing.category].fields.map((f) => f.field), ...EXTRA_FIELDS])].map((f) => (
                  <FieldInput
                    key={`${f}-${String((listing as Record<string, unknown>)[f] ?? "")}`}
                    field={f}
                    listing={listing}
                    low={draft.lowConfidence.includes(f)}
                    missing={missingNow.find((m) => m.field === f)?.importance}
                    onChange={(v) => setField(f, v)}
                  />
                ))}
              </div>
              <Button className="mt-4 w-full" onClick={confirm} disabled={conflicts.length > 0}>
                Fertig – weiter
              </Button>
            </Card>
            )}

            {confirmed && (
              <>
            <Optional title="Mehr Genauigkeit (optional)" subtitle="Fotos, eigene Vergleichsangebote, Verkäufer prüfen">

            <Card className="p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Produktbilder</h2>
                <Button size="sm" variant="outline" disabled={!props.loggedIn || busy === "upload"} onClick={() => extraPhotos.current?.click()}>
                  {busy === "upload" ? <Spinner /> : <Plus />} Fotos hinzufügen
                </Button>
                <input ref={extraPhotos} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => addPhotos(e.target.files)} />
              </div>
              <p className="mt-1 text-sm text-muted">
                Empfohlen: {CATEGORY_PROFILES[listing.category].recommendedViews.join(", ")}.
              </p>
              {listing.images.length > 0 ? (
                <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {listing.images.map((im) => (
                    <li key={im.ref} className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-surface-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/uploads/${im.ref}`} alt="" className="size-full object-cover" />
                      <button
                        className="absolute right-1 top-1 rounded-full bg-background/90 p-1 opacity-0 transition group-hover:opacity-100 focus:opacity-100"
                        onClick={() => setListing({ ...listing, images: listing.images.filter((x) => x.ref !== im.ref) })}
                        aria-label="Bild entfernen"
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted">{props.loggedIn ? "Noch keine Bilder." : "Melde dich an, um Bilder hochzuladen."}</p>
              )}
            </Card>

            <Optional title="Eigene Vergleichsangebote" subtitle="Optional – verbessert die Preisbewertung">
              <p className="text-sm text-muted">
                Ohne angebundenen Marktdatenanbieter berechnen wir den Marktwert nur aus echten Vergleichsangeboten. Trage mindestens 5 ähnliche Angebote ein, die du gefunden hast – idealerweise auch tatsächlich erzielte Verkaufspreise.
              </p>
              <ul className="mt-4 space-y-2">
                {comps.map((c, i) => (
                  <li key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-border p-2 sm:grid-cols-[1fr_1fr_0.7fr_0.9fr_auto]">
                    <Input aria-label="Preis" placeholder="Preis €" value={c.priceEur} onChange={(e) => setComps(comps.map((x, j) => (j === i ? { ...x, priceEur: e.target.value } : x)))} />
                    <Select aria-label="Preisart" value={c.priceType} onChange={(e) => setComps(comps.map((x, j) => (j === i ? { ...x, priceType: e.target.value as Comp["priceType"] } : x)))}>
                      <option value="listing">Inseratspreis</option>
                      <option value="sold">Verkauft für</option>
                    </Select>
                    <Input aria-label="Jahr" placeholder="Jahr" value={c.year} onChange={(e) => setComps(comps.map((x, j) => (j === i ? { ...x, year: e.target.value } : x)))} />
                    <Input aria-label="Kilometer" placeholder={listing.category === "vehicle" ? "km" : "–"} disabled={listing.category !== "vehicle"} value={c.mileageKm} onChange={(e) => setComps(comps.map((x, j) => (j === i ? { ...x, mileageKm: e.target.value } : x)))} />
                    <Button variant="ghost" size="icon" aria-label="Entfernen" onClick={() => setComps(comps.filter((_, j) => j !== i))}>
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setComps([...comps, { priceEur: "", priceType: "listing", year: "", mileageKm: "", url: "" }])}>
                <Plus /> Vergleichsangebot hinzufügen
              </Button>
            </Optional>

            <Card className="p-5">
              <label className="flex cursor-pointer items-start justify-between gap-4">
                <span>
                  <span className="flex items-center gap-2 font-semibold">
                    <Users className="size-4" /> Verkäufer zusätzlich überprüfen
                  </span>
                  <span className="mt-1 block text-sm text-muted">Im Komplettcheck enthalten. Bewertungen per Screenshots, Bildschirmaufnahme oder eingefügtem Text.</span>
                </span>
                <input type="checkbox" className="mt-1 size-5 accent-[var(--accent)]" checked={sellerOn} onChange={(e) => setSellerOn(e.target.checked)} />
              </label>
              {sellerOn && (
                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
                    {(
                      [
                        ["screenshots", "Screenshots", ImagePlus],
                        ["screen_recording", "Aufnahme", Video],
                        ["pasted_text", "Text", FileText],
                      ] as const
                    ).map(([m, l, Icon]) => (
                      <button key={m} onClick={() => setSellerMethod(m)} className={cn("flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm", sellerMethod === m ? "bg-surface font-medium shadow-sm" : "text-muted")}>
                        <Icon className="size-4" /> {l}
                      </button>
                    ))}
                  </div>
                  {sellerMethod !== "pasted_text" && !props.aiAvailable && (
                    <Alert tone="warn">Die Texterkennung aus Bildern benötigt einen KI-Schlüssel. Im Demo-/Regelmodus nutze bitte „Text“.</Alert>
                  )}
                  {sellerMethod === "screenshots" && <Dropzone files={sellerFiles} previews={sellerFiles.map((f) => URL.createObjectURL(f))} onChange={setSellerFiles} disabled={!props.loggedIn} hint="Screenshots der Bewertungsseite – gut lesbar. Überlappungen sind kein Problem, Duplikate werden entfernt." />}
                  {sellerMethod === "screen_recording" && (
                    <div className="rounded-xl border border-dashed border-border p-4 text-sm">
                      <p className="font-medium">So geht&apos;s</p>
                      <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-muted">
                        <li>Bewertungsprofil öffnen und Bildschirmaufnahme starten.</li>
                        <li>Langsam und gleichmäßig durch die Bewertungen scrollen.</li>
                        <li>Aufnahme beenden und hier hochladen (max. {props.videoMaxSeconds} s, {props.videoMaxMb} MB).</li>
                      </ol>
                      <input type="file" accept="video/mp4,video/quicktime,video/webm" className="mt-3 block w-full text-sm" disabled={!props.loggedIn} onChange={(e) => setSellerVideo(e.target.files?.[0] ?? null)} />
                      <p className="mt-2 text-xs text-muted">Das Video wird nach der Frame-Extraktion sofort gelöscht, die Einzelbilder nach der Analyse.</p>
                    </div>
                  )}
                  {sellerMethod === "pasted_text" && (
                    <Textarea rows={6} placeholder={"Bewertungen einfügen – eine pro Absatz.\nOptional mit „Positiv:“, „Neutral:“ oder „Negativ:“ am Anfang."} value={sellerText} onChange={(e) => setSellerText(e.target.value)} />
                  )}
                  <div className="grid gap-1.5 sm:max-w-xs">
                    <Label htmlFor="total">Gesamtzahl laut Profil (optional)</Label>
                    <Input id="total" inputMode="numeric" placeholder="z. B. 48" value={sellerTotal} onChange={(e) => setSellerTotal(e.target.value)} />
                  </div>
                </div>
              )}
            </Card>

            </Optional>

            {error && <Alert tone="bad">{error}</Alert>}

            <div id="check-actions" className="grid gap-3 sm:grid-cols-2">
              <Card className="flex flex-col p-5">
                <p className="font-semibold">Kostenloser Schnellcheck</p>
                <p className="mt-1 flex-1 text-sm text-muted">Grundinformationen, fehlende Angaben und bis zu drei Risikohinweise.</p>
                <Button variant="outline" className="mt-4" onClick={runQuick} disabled={!!busy}>
                  {busy === "quick" ? <Spinner /> : null} Schnellcheck starten
                </Button>
              </Card>
              <Card className="flex flex-col border-foreground/20 p-5 ring-1 ring-foreground/5">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">Vollständiger Kaufcheck</p>
                  <Badge tone="accent">{props.fullCheckCost} Token</Badge>
                </div>
                <p className="mt-1 flex-1 text-sm text-muted">
                  Marktwert, {props.aiAvailable ? "KI-Bildanalyse, " : ""}Schwachstellen, Verkäuferanalyse, Deal-Score, Checkliste & PDF.
                </p>
                {props.categoryStatus[listing.category] === "beta" && (
                  <label className="mt-3 flex items-start gap-2 rounded-xl bg-warn-soft/60 p-3 text-xs">
                    <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={acceptBeta} onChange={(e) => setAcceptBeta(e.target.checked)} />
                    <span>
                      <span className="font-semibold">Beta: </span>Diese Produktkategorie befindet sich noch in der Entwicklung. Einzelne Prüfungen können eingeschränkt sein. Ich habe das verstanden.
                    </span>
                  </label>
                )}
                {props.categoryStatus[listing.category] === "off" ? (
                  <p className="mt-4 rounded-xl bg-surface-2 px-3 py-2.5 text-center text-sm text-muted">Diese Kategorie ist derzeit nicht verfügbar.</p>
                ) : props.loggedIn ? (
                  props.balance >= props.fullCheckCost ? (
                    <Button className="mt-4" onClick={runFull} disabled={!!busy || (props.categoryStatus[listing.category] === "beta" && !acceptBeta)}>
                      <Sparkles /> Jetzt vollständig prüfen
                    </Button>
                  ) : (
                    <Button asChild className="mt-4">
                      <Link href="/dashboard/wallet">Tokens holen</Link>
                    </Button>
                  )
                ) : (
                  <Button asChild className="mt-4">
                    <Link href="/register?next=/check">Konto erstellen</Link>
                  </Button>
                )}
                {props.loggedIn && <p className="mt-2 text-center text-xs text-muted">Guthaben: {props.balance} Token · Bei Fehlern wird nichts abgebucht.</p>}
              </Card>
            </div>
              </>
            )}
          </motion.div>
        )}

        {step === "quick" && quick && (
          <motion.div key="quick" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <button onClick={() => setStep("review")} className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
              <ArrowLeft className="size-4" /> Angaben bearbeiten
            </button>
            <h1 className="text-3xl font-semibold tracking-tight">Schnellcheck</h1>
            <Card className="p-5">
              <div className="flex flex-wrap gap-2">
                <Badge>{PLATFORM_LABELS[quick.platform]}</Badge>
                <Badge>{CATEGORY_LABELS[quick.category]}</Badge>
              </div>
              <p className="mt-3 text-xl font-semibold">{quick.title ?? "Angebot"}</p>
              <p className="tabular text-muted">{formatEur(quick.priceEur)}</p>
              <h2 className="mt-5 text-sm font-semibold">Erste Risikohinweise</h2>
              {quick.risks.length === 0 ? (
                <p className="mt-1 text-sm text-muted">Die Basisprüfung fand keine Auffälligkeiten. Das ist keine Garantie.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {quick.risks.map((r) => (
                    <li key={r.id} className="rounded-xl border border-border p-3">
                      <p className="text-sm font-medium">{r.title}</p>
                      <p className="mt-0.5 text-sm text-muted">{r.explanation}</p>
                      {r.caveat && <p className="mt-1 text-xs text-info">{r.caveat}</p>}
                    </li>
                  ))}
                </ul>
              )}
              {quick.hiddenRiskCount > 0 && <p className="mt-2 text-sm text-muted">+ {quick.hiddenRiskCount} weitere Hinweise im vollständigen Kaufcheck</p>}
              {quick.missingInfo.length > 0 && (
                <>
                  <h2 className="mt-5 text-sm font-semibold">Fehlende Angaben</h2>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted">
                    {quick.missingInfo.map((m) => (
                      <li key={m.field}>{m.question}</li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
            <Card className="p-5">
              <p className="font-semibold">Im vollständigen Kaufcheck</p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {quick.lockedSections.map((s) => (
                  <li key={s} className="flex items-center gap-2 text-sm text-muted">
                    <Lock className="size-3.5" /> {s}
                  </li>
                ))}
              </ul>
              <Button className="mt-5 w-full" onClick={() => setStep("review")}>
                Zum vollständigen Kaufcheck
              </Button>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Stepper({ step }: { step: "input" | "review" | "quick" }) {
  const idx = step === "input" ? 0 : 1;
  return (
    <ol className="mb-8 flex items-center gap-2 text-xs" aria-label="Fortschritt">
      {["Angebot", "Angaben prüfen", "Ergebnis"].map((l, i) => (
        <li key={l} className="flex items-center gap-2">
          <span className={cn("flex size-6 items-center justify-center rounded-full border text-[11px] font-semibold", i <= idx ? "border-foreground bg-foreground text-background" : "border-border text-muted")}>{i + 1}</span>
          <span className={cn(i <= idx ? "font-medium" : "text-muted")}>{l}</span>
          {i < 2 && <span className="h-px w-6 bg-border" />}
        </li>
      ))}
    </ol>
  );
}

function Dropzone({ files, previews, onChange, disabled, hint }: { files: File[]; previews: string[]; onChange: (f: File[]) => void; disabled?: boolean; hint: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  function add(list: FileList | null) {
    if (!list) return;
    const ok = Array.from(list).filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type) && f.size <= 10 * 1024 * 1024);
    if (ok.length < list.length) toast.error("Nur JPEG, PNG oder WebP bis 10 MB.");
    onChange([...files, ...ok].slice(0, 12));
  }
  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => ref.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          add(e.dataTransfer.files);
        }}
        className={cn("flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition disabled:opacity-50", over ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2")}
      >
        <ImagePlus className="size-6 text-muted" />
        <span className="text-sm font-medium">Bilder auswählen oder hierher ziehen</span>
        <span className="text-xs text-muted">{hint}</span>
      </button>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => add(e.target.files)} />
      {files.length > 0 && (
        <ul className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="relative aspect-square overflow-hidden rounded-lg border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previews[i]} alt="" className="size-full object-cover" />
              <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5" aria-label="Entfernen">
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FieldInput({ field, listing, low, missing, onChange }: { field: ListingFieldKey; listing: Listing; low: boolean; missing?: "critical" | "important" | "helpful"; onChange: (v: string) => void }) {
  const v = (listing as Record<string, unknown>)[field];
  const src = listing.provenance[field] as FieldSource | undefined;
  const id = `f-${field}`;
  const isLong = field === "description";
  const [local, setLocal] = useState(v == null ? "" : String(v));
  return (
    <div className={cn("grid gap-1.5", isLong && "sm:col-span-2")}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>
          {FIELD_LABELS[field]}
          {missing === "critical" && <span className="ml-1 text-bad">*</span>}
        </Label>
        <span className="flex gap-1">
          {low && src === "ai_extraction" && <Badge tone="warn">Bitte prüfen</Badge>}
          {src && <Badge tone={src === "user" ? "accent" : src === "ai_extraction" ? "warn" : src === "page" ? "good" : "neutral"}>{FIELD_SOURCE_LABELS[src]}</Badge>}
        </span>
      </div>
      {isLong ? (
        <Textarea id={id} rows={5} value={local} onChange={(e) => setLocal(e.target.value)} onBlur={() => onChange(local)} />
      ) : (
        <Input
          id={id}
          inputMode={NUMERIC_FIELDS.includes(field) ? "decimal" : undefined}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => onChange(local)}
          className={cn(missing === "critical" && !local && "border-warn/60")}
        />
      )}
    </div>
  );
}

function Optional({ title, subtitle, children, defaultOpen = false }: { title: string; subtitle?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <span>
          <span className="block font-semibold">{title}</span>
          {subtitle && <span className="block text-sm text-muted">{subtitle}</span>}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="border-t border-border p-4">{children}</div>}
    </Card>
  );
}

/** Kompakte Zusammenfassung des erkannten Angebots mit Herkunftsmarkierung. */
function RecognizedCard({ listing, aiAvailable, notes, beta }: { listing: Listing; aiAvailable: boolean; notes: string[]; beta: boolean }) {
  const KEY_FACTS: Record<string, ListingFieldKey[]> = {
    vehicle: ["year", "mileageKm", "fuel", "transmission", "powerKw", "condition"],
    electronics: ["storageGb", "batteryHealthPct", "condition", "activationLockFree", "accessories"],
    fashion: ["size", "condition", "material", "purchaseReceipt"],
    watches_jewelry: ["year", "condition", "boxAndPapers", "serialNumber"],
    gaming_collectibles: ["variant", "condition", "accessories"],
    other: ["condition", "year"],
  };
  const facts = (KEY_FACTS[listing.category] ?? ["condition"])
    .map((f) => ({ f, v: (listing as Record<string, unknown>)[f] }))
    .filter((x) => x.v != null && x.v !== "")
    .slice(0, 6);
  const fmt = (f: ListingFieldKey, v: unknown) =>
    typeof v === "number" ? (f === "mileageKm" ? `${v.toLocaleString("de-DE")} km` : f === "storageGb" ? `${v} GB` : f === "batteryHealthPct" ? `Akku ${v} %` : f === "powerKw" ? `${v} kW` : String(v)) : String(v);
  const img = listing.images[0]?.ref;
  const title = listing.title ?? ([listing.brand, listing.model].filter(Boolean).join(" ") || "Unbekanntes Angebot");
  return (
    <Card className="p-4">
      <div className="flex gap-3.5">
        <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {img ? <img src={`/api/uploads/${img}`} alt="" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center text-2xl">🔎</div>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted">
            {PLATFORM_LABELS[listing.platform]} · {CATEGORY_LABELS[listing.category]}
            {beta && " · Beta"}
          </p>
          <p className="mt-0.5 line-clamp-2 font-semibold leading-snug">{title}</p>
          <p className="tabular mt-1 text-xl font-bold">{listing.priceEur != null ? formatEur(listing.priceEur) : <span className="text-base font-medium text-warn">Preis fehlt</span>}</p>
        </div>
      </div>
      {facts.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {facts.map(({ f, v }) => (
            <li key={f} className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1 text-xs">
              <span className={cn("size-1.5 rounded-full", listing.provenance[f] === "user" ? "bg-accent" : listing.provenance[f] === "ai_extraction" ? "bg-warn" : listing.provenance[f] === "page" ? "bg-good" : "bg-muted")} />
              {fmt(f as ListingFieldKey, v)}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-muted">
        <span className="mr-2"><span className="mr-1 inline-block size-1.5 rounded-full bg-muted" />aus Link/Plattform</span>
        {Object.values(listing.provenance).includes("page") && <span className="mr-2"><span className="mr-1 inline-block size-1.5 rounded-full bg-good" />von der Inseratsseite</span>}
        <span className="mr-2"><span className="mr-1 inline-block size-1.5 rounded-full bg-warn" />KI aus Screenshot</span>
        <span><span className="mr-1 inline-block size-1.5 rounded-full bg-accent" />von dir</span>
        {!aiAvailable && " · Ohne KI-Schlüssel werden Screenshots nicht ausgelesen."}
      </p>
      {notes.length > 0 && (
        <ul className="mt-2 space-y-1">
          {notes.slice(0, 2).map((n) => (
            <li key={n} className="flex gap-1.5 text-xs text-muted">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {n}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
