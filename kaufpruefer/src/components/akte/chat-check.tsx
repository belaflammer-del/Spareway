"use client";

import { AlertTriangle, ArrowLeft, FileText, ImagePlus, MessagesSquare, ShieldCheck, Trash2, Video } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CopyBlock } from "@/components/report/parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Alert, Progress, Spinner } from "@/components/ui/misc";
import { CHAT_CATEGORY_LABELS, LEVEL_LABELS, LEVEL_TONE } from "@/lib/akte/labels";
import { CHAT_CATEGORIES, type ChatCheckData } from "@/lib/akte/schemas";
import { pollJob, postJson, uploadFiles } from "@/lib/client/jobs";
import { uploadVideoWithProgress } from "@/lib/client/video";
import { RECOMMENDATION_LABELS } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";

type Method = "screenshots" | "screen_recording" | "pasted_text";
interface Check {
  id: string;
  version: number;
  createdAt: string;
  expiresAt?: string;
  data: ChatCheckData;
}

function Result({ c, analysisId, onDeleted }: { c: Check; analysisId: string; onDeleted: () => void }) {
  const d = c.data;
  const [showMsgs, setShowMsgs] = useState(false);
  const msgById = new Map(d.messages.map((m) => [m.id, m]));
  return (
    <div className="space-y-4">
      <div className={cn("rounded-2xl border p-4", d.updatedRecommendation.current === "elevated_risk" ? "border-bad/40 bg-bad-soft/40" : d.updatedRecommendation.current !== d.updatedRecommendation.previous ? "border-warn/40 bg-warn-soft/40" : "border-good/40 bg-good-soft/30")}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Aktualisierte Kaufempfehlung</p>
        <p className="mt-1 text-lg font-bold">{RECOMMENDATION_LABELS[d.updatedRecommendation.current]}</p>
        <p className="text-sm text-muted">{d.updatedRecommendation.reason}</p>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4">
        <h3 className="mb-2 font-semibold">Bewertung</h3>
        <div className="space-y-1.5 text-sm">
          {CHAT_CATEGORIES.map((k) => (
            <div key={k} className="flex items-center justify-between gap-2">
              <span>{CHAT_CATEGORY_LABELS[k]}</span>
              <Badge tone={LEVEL_TONE[d.categories[k].level]}>
                {LEVEL_LABELS[d.categories[k].level]}
                {d.categories[k].count > 1 ? ` · ${d.categories[k].count}` : ""}
              </Badge>
            </div>
          ))}
        </div>
      </div>

      {d.contradictions.length > 0 && (
        <div className="space-y-2.5">
          <h3 className="font-semibold">Widersprüche zum Inserat</h3>
          {d.contradictions.map((x) => (
            <div key={x.id} className="rounded-2xl border border-border bg-surface p-4 text-sm">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone={x.kind === "documented" ? "bad" : "warn"}>{x.kind === "documented" ? "Belegter Widerspruch" : "Möglicher Widerspruch"}</Badge>
                {x.basis === "ai" && <Badge tone="neutral">KI-Hinweis</Badge>}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-xl bg-surface-2 p-3">
                  <p className="text-[11px] font-semibold uppercase text-muted">Inserat</p>
                  <p className="mt-0.5">„{x.listingStatement}“</p>
                </div>
                <div className="rounded-xl bg-surface-2 p-3">
                  <p className="text-[11px] font-semibold uppercase text-muted">Verkäufer im Chat</p>
                  <p className="mt-0.5">„{x.chatStatement}“</p>
                </div>
              </div>
              <p className="mt-2 text-muted">{x.explanation}</p>
            </div>
          ))}
        </div>
      )}

      {d.signals.length > 0 && (
        <div className="space-y-2.5">
          <h3 className="font-semibold">Warnsignale</h3>
          {d.signals.map((s) => (
            <div key={s.id} className="rounded-2xl border border-border bg-surface p-4 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{s.title}</p>
                <Badge tone={LEVEL_TONE[s.level]}>{LEVEL_LABELS[s.level]}</Badge>
              </div>
              <p className="mt-1 text-muted">{s.explanation}</p>
              {s.evidence.map((e, i) => (
                <blockquote key={i} className="mt-2 border-l-2 border-warn pl-3 italic text-muted">
                  „{e.quote}“{e.messageId && msgById.get(e.messageId)?.sender === "seller" ? " – Verkäufer" : ""}
                </blockquote>
              ))}
            </div>
          ))}
        </div>
      )}

      {d.recommendations.warnings.length === 0 && d.contradictions.length === 0 && (
        <Alert tone="good">Im erfassten Verlauf wurden keine Warnsignale oder Widersprüche erkannt. Das ist keine Garantie – bleib bei den sicheren Zahlungswegen.</Alert>
      )}

      <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
        <h3 className="mb-2 flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-4 text-good" /> Sicher bezahlen
        </h3>
        <ul className="list-disc space-y-1 pl-5">
          {d.recommendations.safePayment.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>

      {d.recommendations.questions.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
          <h3 className="mb-2 font-semibold">Empfohlene Rückfragen</h3>
          <ul className="list-disc space-y-1 pl-5">
            {d.recommendations.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      {d.recommendations.replyDraft && (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <h3 className="mb-2 font-semibold">Antwortvorschlag</h3>
          <CopyBlock text={d.recommendations.replyDraft} label="Antwort kopieren" />
        </div>
      )}

      <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
        <button className="font-semibold underline-offset-4 hover:underline" onClick={() => setShowMsgs((v) => !v)}>
          {showMsgs ? "Nachrichten ausblenden" : `Erfasste Nachrichten anzeigen (${d.messages.length})`}
        </button>
        <p className="mt-1 text-xs text-muted">
          {d.duplicatesRemoved > 0 && `${d.duplicatesRemoved} doppelte Nachricht(en) aus überlappenden Screenshots entfernt. `}
          {d.unreadable > 0 && `${d.unreadable} Nachricht(en) unlesbar. `}
          {d.input.redaction ? "Telefonnummern, E-Mails, IBAN und Adressen wurden geschwärzt. " : ""}
          {c.expiresAt && `Wird am ${new Date(c.expiresAt).toLocaleDateString("de-DE")} automatisch gelöscht.`}
        </p>
        {showMsgs && (
          <div className="mt-3 space-y-1.5">
            {d.messages.map((m) => (
              <div key={m.id} className={cn("max-w-[85%] rounded-2xl px-3 py-2", m.sender === "buyer" ? "ml-auto bg-accent-soft" : "bg-surface-2")}>
                <p className="text-[10px] font-semibold uppercase text-muted">{m.sender === "buyer" ? "Du" : m.sender === "seller" ? "Verkäufer" : "Unbekannt"}{m.time ? ` · ${m.time}` : ""}</p>
                <p>{m.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      {d.injectionAttemptDetected && <Alert tone="warn">Im Chat standen Texte, die wie Anweisungen an eine KI aussehen. Sie wurden ignoriert.</Alert>}
      <p className="text-xs text-muted">{d.disclaimer}</p>
      <Button
        variant="ghost"
        size="sm"
        className="text-bad"
        onClick={async () => {
          try {
            await postJson(`/api/analyses/${analysisId}/seller-chat?moduleId=${c.id}`, undefined, "DELETE");
            toast.success("Chatprüfung gelöscht");
            onDeleted();
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      >
        <Trash2 /> Diese Chatprüfung löschen
      </Button>
    </div>
  );
}

export function ChatCheckFlow(props: { analysisId: string; title: string; checks: Check[]; limit: number; maxScreenshots: number; retentionDays: number; aiAvailable: boolean; videoMaxSeconds: number }) {
  const router = useRouter();
  const [method, setMethod] = useState<Method>(props.aiAvailable ? "screenshots" : "pasted_text");
  const [files, setFiles] = useState<File[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [redact, setRedact] = useState(true);
  const [busy, setBusy] = useState<{ pct: number; msg: string } | null>(null);
  const [showForm, setShowForm] = useState(props.checks.length === 0);
  const latest = props.checks.at(-1);
  const canAdd = props.checks.length < props.limit;

  async function run() {
    try {
      let imageIds: string[] = [];
      if (method === "screenshots") {
        if (!files.length) return toast.error("Bitte Screenshots auswählen.");
        setBusy({ pct: 3, msg: "Screenshots werden hochgeladen …" });
        imageIds = await uploadFiles(files.slice(0, props.maxScreenshots));
      } else if (method === "screen_recording") {
        if (!video) return toast.error("Bitte eine Bildschirmaufnahme auswählen.");
        const d = await uploadVideoWithProgress(video, (pct, msg) => setBusy({ pct: Math.round(pct * 0.4), msg }));
        imageIds = d.frameIds.slice(0, 20);
      } else if (text.trim().length < 10) return toast.error("Bitte den Chatverlauf einfügen.");
      setBusy({ pct: 10, msg: "Chatprüfung wird gestartet …" });
      const r = await postJson<{ jobId?: string; moduleId?: string; reused: boolean }>(`/api/analyses/${props.analysisId}/seller-chat`, {
        method,
        imageIds,
        pastedText: method === "pasted_text" ? text : undefined,
        redact,
      });
      if (r.jobId) {
        const j = await pollJob(r.jobId, (pct, msg) => setBusy({ pct: Math.max(10, pct), msg: msg || "Wird geprüft …" }));
        if (j.status !== "done") throw new Error(j.error ?? "Die Chatprüfung ist fehlgeschlagen.");
      } else toast.message("Diesen Chat hast du bereits geprüft – das vorhandene Ergebnis wird angezeigt.");
      toast.success("Chat geprüft");
      setShowForm(false);
      setFiles([]);
      setText("");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-28 pt-6">
      <Link href={`/analysis/${props.analysisId}#s-chat`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="size-4" /> Zur Kaufakte
      </Link>
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-fg">
          <MessagesSquare className="size-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold">Verkäuferchat überprüfen</h1>
          <p className="truncate text-sm text-muted">{props.title}</p>
        </div>
      </div>

      {latest && !showForm && (
        <div className="mt-6">
          {props.checks.length > 1 && <p className="mb-2 text-xs text-muted">Prüfung {latest.version} vom {new Date(latest.createdAt).toLocaleString("de-DE")} · {props.checks.length} Prüfungen insgesamt</p>}
          <Result c={latest} analysisId={props.analysisId} onDeleted={() => router.refresh()} />
          {canAdd ? (
            <Button className="mt-6 w-full" variant="outline" onClick={() => setShowForm(true)}>
              Weiteren Chatverlauf prüfen
            </Button>
          ) : (
            <p className="mt-6 text-center text-sm text-muted">Alle {props.limit} enthaltenen Chatprüfungen genutzt. Lösche eine ältere Prüfung, um eine neue zu starten.</p>
          )}
        </div>
      )}

      {showForm && (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-muted">
            Lade Screenshots, eine Bildschirmaufnahme oder den kopierten Text deines Chats hoch. Wir prüfen Widersprüche zum Inserat, Zahlungs- und Versandrisiken, Phishing-Links und Abfragen persönlicher Daten – ohne eine neue Produktprüfung.
          </p>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
            {(
              [
                ["screenshots", "Screenshots", ImagePlus],
                ["screen_recording", "Aufnahme", Video],
                ["pasted_text", "Text", FileText],
              ] as const
            ).map(([m, l, Icon]) => (
              <button
                key={m}
                disabled={m !== "pasted_text" && !props.aiAvailable}
                onClick={() => setMethod(m)}
                className={cn("flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm disabled:opacity-40", method === m ? "bg-surface font-medium shadow-sm" : "text-muted")}
              >
                <Icon className="size-4" /> {l}
              </button>
            ))}
          </div>
          {!props.aiAvailable && <Alert tone="info">Ohne aktivierte KI können nur eingefügte Chattexte geprüft werden.</Alert>}
          {method === "screenshots" && (
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border p-6 text-center text-sm">
              <ImagePlus className="size-6 text-accent" />
              {files.length ? `${files.length} Screenshot(s) ausgewählt` : `Screenshots auswählen (max. ${props.maxScreenshots})`}
              <span className="text-xs text-muted">Überlappungen sind kein Problem – doppelte Nachrichten werden erkannt.</span>
              <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, props.maxScreenshots))} />
            </label>
          )}
          {method === "screen_recording" && (
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border p-6 text-center text-sm">
              <Video className="size-6 text-accent" />
              {video ? video.name : `Bildschirmaufnahme auswählen (max. ${props.videoMaxSeconds} s)`}
              <span className="text-xs text-muted">Chat öffnen, Aufnahme starten und langsam durchscrollen. Das Video wird nach der Auswertung gelöscht.</span>
              <input type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" onChange={(e) => setVideo(e.target.files?.[0] ?? null)} />
            </label>
          )}
          {method === "pasted_text" && (
            <Textarea rows={8} placeholder={"Verkäufer: Hallo, …\nIch: Ist das Fahrzeug unfallfrei?\n…"} value={text} onChange={(e) => setText(e.target.value)} />
          )}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={redact} onChange={(e) => setRedact(e.target.checked)} />
            <span>
              Persönliche Daten automatisch schwärzen <span className="text-muted">(Telefonnummern, E-Mails, IBAN, Adressen – empfohlen)</span>
            </span>
          </label>
          <p className="flex items-start gap-2 text-xs text-muted">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            Lade nur Chats hoch, an denen du selbst beteiligt bist. Screenshots werden nach der Auswertung gelöscht, das Ergebnis nach {props.retentionDays} Tagen.
          </p>
          {busy ? (
            <div className="space-y-2">
              <Progress value={busy.pct} />
              <p className="flex items-center gap-2 text-sm text-muted">
                <Spinner /> {busy.msg}
              </p>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button className="flex-1" size="lg" onClick={run} disabled={!canAdd}>
                Chat prüfen
              </Button>
              {latest && (
                <Button variant="ghost" size="lg" onClick={() => setShowForm(false)}>
                  Abbrechen
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
