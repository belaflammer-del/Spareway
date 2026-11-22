"use client";

import { AlertTriangle, ArrowLeft, ArrowRight, FileText, ImagePlus, Link2, Lock, Plus, Sparkles, Trash2, Users, Video, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
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
import { AnalysisProgress } from "./analysis-progress";

type Mode = "link" | "screenshots" | "text";
interface Draft {
  listing: Listing;
  missingInfo: MissingInfo[];
  notes: string[];
  lowConfidence: string[];
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
}

/** Deutsche Zahlenschreibweise tolerant parsen („18.900 €“, „1,5“). */
export function parseNum(s: string): number | undefined {
  const t = s.replace(/[^\d.,-]/g, "");
  if (!t) return undefined;
  const normalized = /,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/[.,](?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
}

async function uploadImages(files: File[]): Promise<string[]> {
  if (files.length === 0) return [];
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  const res = await fetch("/api/uploads", { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? "Upload fehlgeschlagen");
  for (const e of data.errors ?? []) toast.error(`${e.name}: ${e.message}`);
  return (data.uploads as { id: string }[]).map((u) => u.id);
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

  async function createDraft() {
    setError(null);
    if (mode === "link" && !url.trim()) return setError("Bitte füge einen Inseratslink ein.");
    if (mode === "screenshots" && files.length === 0 && !url.trim()) return setError("Bitte lade mindestens einen Screenshot hoch.");
    if (mode === "text" && text.trim().length < 20) return setError("Bitte füge den Inseratstext ein (mindestens 20 Zeichen).");
    if (files.length > 0 && !props.loggedIn) return setError("Für den Screenshot-Upload brauchst du ein kostenloses Konto.");
    setBusy("draft");
    try {
      const imageIds = mode === "screenshots" ? await uploadImages(files) : [];
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() || undefined, imageIds, pastedText: mode === "text" ? text : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? "Fehler beim Auslesen");
      setDraft(data.draft);
      setListing(data.draft.listing);
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
      const ids = await uploadImages(Array.from(list).slice(0, 10));
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
        if (sellerMethod === "screenshots") imageIds = await uploadImages(sellerFiles);
        if (sellerMethod === "screen_recording" && sellerVideo) {
          const fd = new FormData();
          fd.append("video", sellerVideo);
          const r = await fetch("/api/uploads/video", { method: "POST", body: fd });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error?.message ?? "Videoverarbeitung fehlgeschlagen");
          imageIds = d.frameIds;
          toast.success(`${d.stats.keptFrames} relevante Bilder aus ${d.stats.durationSeconds} s Video extrahiert. Das Video wurde gelöscht.`);
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
        body: JSON.stringify({ requestId: crypto.randomUUID(), listing: cleanListing(listing), comparables, seller }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 402) {
          toast.error(data.error.message, { action: { label: "Tokens kaufen", onClick: () => router.push("/dashboard/wallet") } });
        }
        throw new Error(data.error?.message ?? "Analyse fehlgeschlagen");
      }
      router.push(`/analysis/${data.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  /* ───────────────────────── Render ───────────────────────── */

  if (busy === "full") return <AnalysisProgress ai={props.aiAvailable} seller={sellerOn} />;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
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
                        Wir lesen Inserate nur über offizielle Schnittstellen aus. Wo keine verfügbar ist, ergänzt du die Angaben im nächsten Schritt oder lädst Screenshots hoch.
                      </p>
                    )}
                  </div>
                )}
                {mode === "screenshots" && (
                  <Dropzone files={files} previews={previews} onChange={setFiles} disabled={!props.loggedIn} hint={props.aiAvailable ? "Die KI liest Preis, Angaben und Beschreibung aus." : "Ohne KI-Schlüssel (Demo-Modus) trägst du die Angaben im nächsten Schritt selbst ein."} />
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
                  {busy ? <Spinner /> : <ArrowRight />} {busy ? "Angebot wird gelesen …" : "Weiter"}
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
              <h1 className="text-3xl font-semibold tracking-tight">Erkannte Angaben prüfen</h1>
              <p className="mt-2 text-muted">Bitte kontrolliere die Angaben und ergänze, was fehlt. Jede Angabe zeigt, woher sie stammt.</p>
            </div>

            <Card className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{PLATFORM_LABELS[listing.platform]}</Badge>
                <Badge tone={CATEGORY_SUPPORT[listing.category] === "full" ? "accent" : "neutral"}>
                  {CATEGORY_SUPPORT[listing.category] === "full" ? "Vollständige Prüfung" : "Basisprüfung"}
                </Badge>
                {!props.aiAvailable && <Badge tone="demo">Demo-/Regelmodus</Badge>}
              </div>
              <div className="mt-4 grid gap-1.5">
                <Label htmlFor="cat">Kategorie</Label>
                <Select id="cat" value={listing.category} onChange={(e) => setField("category", e.target.value)}>
                  {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </Select>
              </div>
              {draft.notes.length > 0 && (
                <ul className="mt-4 space-y-1.5">
                  {draft.notes.map((n) => (
                    <li key={n} className="flex gap-2 text-sm text-muted">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {n}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {missingNow.filter((m) => m.importance === "critical").length > 0 && (
              <Alert tone="warn" title="Diese Angaben fehlen noch">
                <ul className="mt-1 list-disc pl-5">
                  {missingNow
                    .filter((m) => m.importance !== "helpful")
                    .slice(0, 5)
                    .map((m) => (
                      <li key={m.field}>{m.question}</li>
                    ))}
                </ul>
              </Alert>
            )}

            <Card className="p-5">
              <h2 className="mb-4 font-semibold">Angaben zum Angebot</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {[...new Set([...CATEGORY_PROFILES[listing.category].fields.map((f) => f.field), ...EXTRA_FIELDS])].map((f) => (
                  <FieldInput
                    key={f}
                    field={f}
                    listing={listing}
                    low={draft.lowConfidence.includes(f)}
                    missing={missingNow.find((m) => m.field === f)?.importance}
                    onChange={(v) => setField(f, v)}
                  />
                ))}
              </div>
            </Card>

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

            <Card className="p-5">
              <h2 className="font-semibold">Vergleichsangebote (optional)</h2>
              <p className="mt-1 text-sm text-muted">
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
            </Card>

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
                  {sellerMethod === "screenshots" && <Dropzone files={sellerFiles} previews={sellerFiles.map((f) => URL.createObjectURL(f))} onChange={setSellerFiles} disabled={!props.loggedIn} hint="Screenshots der Bewertungsseite – gut lesbar, ohne Überlappung ist nicht nötig (Duplikate werden entfernt)." />}
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

            {error && <Alert tone="bad">{error}</Alert>}

            <div className="grid gap-3 sm:grid-cols-2">
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
                {props.loggedIn ? (
                  props.balance >= props.fullCheckCost ? (
                    <Button className="mt-4" onClick={runFull} disabled={!!busy}>
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
          {src && <Badge tone={src === "user" ? "accent" : src === "ai_extraction" ? "warn" : "neutral"}>{FIELD_SOURCE_LABELS[src]}</Badge>}
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
