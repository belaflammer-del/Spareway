"use client";

import { ArrowLeft, Camera, Check, ChevronLeft, ChevronRight, CircleHelp, CloudOff, Minus, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Alert, Progress, Spinner } from "@/components/ui/misc";
import { INSPECTION_STATUS_LABELS } from "@/lib/akte/labels";
import type { InspectionData, InspectionItem, InspectionStatus } from "@/lib/akte/schemas";
import { postJson, uploadFiles } from "@/lib/client/jobs";
import { RECOMMENDATION_LABELS } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";

const STATUS: { s: InspectionStatus; icon: typeof Check; cls: string }[] = [
  { s: "ok", icon: Check, cls: "data-[on=true]:bg-good data-[on=true]:text-white" },
  { s: "conspicuous", icon: X, cls: "data-[on=true]:bg-bad data-[on=true]:text-white" },
  { s: "unchecked", icon: CircleHelp, cls: "data-[on=true]:bg-surface-2 data-[on=true]:text-foreground" },
  { s: "na", icon: Minus, cls: "data-[on=true]:bg-border data-[on=true]:text-foreground" },
];

type Pending = Record<string, { status: InspectionStatus; note?: string; updatedAt: string }>;
const storageKey = (moduleId: string) => `dn-inspection:${moduleId}`;

function loadPending(moduleId: string): Pending {
  try {
    return JSON.parse(localStorage.getItem(storageKey(moduleId)) ?? "{}") as Pending;
  } catch {
    return {};
  }
}
function savePending(moduleId: string, p: Pending) {
  try {
    if (Object.keys(p).length) localStorage.setItem(storageKey(moduleId), JSON.stringify(p));
    else localStorage.removeItem(storageKey(moduleId));
  } catch {
    /* privater Modus – Änderungen bleiben im Speicher */
  }
}

/**
 * Besichtigungsmodus: Schritt für Schritt durch die Prüfliste.
 * Offline: Status und Notizen werden lokal gespeichert und automatisch
 * synchronisiert, sobald wieder Verbindung besteht. Fotos/KI brauchen Netz.
 */
export function InspectionMode(props: { analysisId: string; title: string; moduleId: string; version: number; initial: InspectionData; aiAvailable: boolean; photoAiLimit: number }) {
  const router = useRouter();
  const [data, setData] = useState<InspectionData>(props.initial);
  const [pending, setPending] = useState<Pending>({});
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [groupIdx, setGroupIdx] = useState(0);
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);
  const [analyze, setAnalyze] = useState(props.aiAvailable);
  const [finishing, setFinishing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finished = data.state === "finished";

  // Lokale, noch nicht synchronisierte Änderungen übernehmen
  useEffect(() => {
    const p = loadPending(props.moduleId);
    setOnline(navigator.onLine);
    if (Object.keys(p).length) {
      setPending(p);
      setData((d) => ({ ...d, items: d.items.map((i) => (p[i.id] && (!i.updatedAt || p[i.id].updatedAt > i.updatedAt) ? { ...i, ...p[i.id] } : i)) }));
    }
  }, [props.moduleId]);

  const sync = useCallback(async () => {
    const p = loadPending(props.moduleId);
    if (!Object.keys(p).length || !navigator.onLine) return;
    setSyncing(true);
    try {
      await postJson(
        `/api/analyses/${props.analysisId}/inspection`,
        { moduleId: props.moduleId, items: Object.entries(p).map(([id, v]) => ({ id, ...v })) },
        "PUT",
      );
      // Nur bestätigte Änderungen entfernen (währenddessen neu erfasste bleiben)
      const now = loadPending(props.moduleId);
      for (const [id, v] of Object.entries(p)) if (now[id]?.updatedAt === v.updatedAt) delete now[id];
      savePending(props.moduleId, now);
      setPending(now);
    } catch {
      /* bleibt lokal gespeichert, nächster Versuch beim nächsten Ereignis */
    } finally {
      setSyncing(false);
    }
  }, [props.analysisId, props.moduleId]);

  useEffect(() => {
    const on = () => {
      setOnline(true);
      void sync();
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const iv = setInterval(() => void sync(), 30_000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      clearInterval(iv);
    };
  }, [sync]);

  function update(id: string, patch: { status?: InspectionStatus; note?: string }) {
    const updatedAt = new Date().toISOString();
    setData((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch, updatedAt } : i)) }));
    const cur = data.items.find((i) => i.id === id)!;
    const next = { ...loadPending(props.moduleId), [id]: { status: patch.status ?? cur.status, note: patch.note ?? cur.note, updatedAt } };
    savePending(props.moduleId, next);
    setPending(next);
    if ("vibrate" in navigator && patch.status) navigator.vibrate?.(8);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void sync(), patch.note !== undefined ? 1200 : 400);
  }

  const groups = useMemo(() => [...new Set(data.items.map((i) => i.group))], [data.items]);
  const group = groups[Math.min(groupIdx, groups.length - 1)];
  const items = data.items.filter((i) => i.group === group);
  const done = data.items.filter((i) => i.status !== "unchecked").length;
  const aiUsed = data.items.flatMap((i) => i.photos).filter((p) => p.analysis).length;

  async function addPhoto(item: InspectionItem, file: File | undefined) {
    if (!file) return;
    if (!navigator.onLine) return toast.error("Fotos können nur mit Internetverbindung gespeichert werden.");
    setPhotoBusy(item.id);
    try {
      const [uploadId] = await uploadFiles([file]);
      const wantAi = analyze && aiUsed < props.photoAiLimit;
      const r = await postJson<{ analysis?: InspectionItem["photos"][number]["analysis"] }>(`/api/analyses/${props.analysisId}/inspection/photo`, { moduleId: props.moduleId, itemId: item.id, uploadId, analyze: wantAi });
      setData((d) => ({ ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, photos: [...i.photos, { uploadId, takenAt: new Date().toISOString(), analysis: r.analysis }] } : i)) }));
      toast.success(r.analysis ? "Foto gespeichert und geprüft" : "Foto gespeichert");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPhotoBusy(null);
    }
  }

  async function finish() {
    setFinishing(true);
    try {
      await sync();
      if (Object.keys(loadPending(props.moduleId)).length) throw new Error("Bitte stelle eine Internetverbindung her, damit alle Änderungen gespeichert werden.");
      const r = await postJson<{ inspection: { data: InspectionData } }>(`/api/analyses/${props.analysisId}/inspection/finish`, { moduleId: props.moduleId });
      setData(r.inspection.data);
      window.scrollTo({ top: 0, behavior: "smooth" });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setFinishing(false);
    }
  }

  async function restart() {
    try {
      await postJson(`/api/analyses/${props.analysisId}/inspection`, { restart: true });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const rep = data.report;
  return (
    <div className="mx-auto max-w-2xl px-4 pb-32 pt-6">
      <Link href={`/analysis/${props.analysisId}#s-inspection`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="size-4" /> Zur Kaufakte
      </Link>
      <h1 className="text-xl font-bold">{finished ? "Besichtigungsbericht" : "Besichtigung"}</h1>
      <p className="truncate text-sm text-muted">{props.title}{props.version > 1 ? ` · Besichtigung ${props.version}` : ""}</p>

      {!online && (
        <Alert tone="warn" className="mt-4">
          <span className="flex items-center gap-2">
            <CloudOff className="size-4" /> Offline – deine Eingaben werden auf dem Gerät gespeichert und später übertragen.
          </span>
        </Alert>
      )}

      {finished && rep ? (
        <div className="mt-5 space-y-4">
          <div className={cn("rounded-2xl border p-4", rep.risk === "high" ? "border-bad/40 bg-bad-soft/40" : rep.risk === "medium" ? "border-warn/40 bg-warn-soft/40" : rep.risk === "low" ? "border-good/40 bg-good-soft/30" : "border-border bg-surface")}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Aktualisierte Risikoeinschätzung</p>
            <p className="mt-1 text-lg font-bold">{RECOMMENDATION_LABELS[rep.updatedRecommendation]}</p>
            <p className="text-sm">{rep.riskText}</p>
            <p className="mt-2 text-sm text-muted">
              {rep.ok} in Ordnung · {rep.conspicuous} auffällig · {rep.unchecked} nicht geprüft · {rep.na} nicht anwendbar
            </p>
          </div>
          {data.items.filter((i) => i.status === "conspicuous").length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-4">
              <h2 className="mb-2 font-semibold">Auffälligkeiten</h2>
              <ul className="space-y-2.5 text-sm">
                {data.items.filter((i) => i.status === "conspicuous").map((i) => (
                  <li key={i.id}>
                    <p className="font-medium">{i.title}</p>
                    {i.note && <p className="text-muted">Notiz: {i.note}</p>}
                    {i.photos.map((p) => (
                      <div key={p.uploadId} className="mt-1.5 flex gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/uploads/${p.uploadId}`} alt="" className="size-14 rounded-lg border border-border object-cover" />
                        {p.analysis && <p className="text-xs text-muted">{p.analysis.findings.map((f) => f.title).join(", ") || p.analysis.note}</p>}
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.items.filter((i) => i.status === "unchecked" && i.priority === "high").length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
              <h2 className="mb-2 font-semibold">Offene wichtige Punkte</h2>
              <ul className="list-disc space-y-1 pl-5">
                {data.items.filter((i) => i.status === "unchecked" && i.priority === "high").map((i) => (
                  <li key={i.id}>{i.title}</li>
                ))}
              </ul>
            </div>
          )}
          {data.openQuestions.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
              <h2 className="mb-2 font-semibold">Offene Fragen</h2>
              <ul className="list-disc space-y-1 pl-5">
                {data.openQuestions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-muted">{data.safetyNote}</p>
          <div className="flex gap-2">
            <Button asChild className="flex-1">
              <Link href={`/analysis/${props.analysisId}`}>Zur Kaufakte</Link>
            </Button>
            <Button variant="outline" onClick={restart}>
              Neue Besichtigung
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-xs text-muted">
              <span>
                {done} von {data.items.length} Punkten
              </span>
              <span>{syncing ? "Speichert …" : Object.keys(pending).length ? `${Object.keys(pending).length} nicht übertragen` : "Gespeichert"}</span>
            </div>
            <Progress value={(done / Math.max(1, data.items.length)) * 100} />
          </div>

          {/* Schrittauswahl ohne seitliches Wischen: Raster der Bereiche */}
          <div className="mt-4 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {groups.map((g, i) => {
              const gi = data.items.filter((x) => x.group === g);
              const gd = gi.filter((x) => x.status !== "unchecked").length;
              const bad = gi.some((x) => x.status === "conspicuous");
              return (
                <button
                  key={g}
                  onClick={() => setGroupIdx(i)}
                  className={cn("flex items-center justify-between gap-1 rounded-lg border px-2.5 py-2 text-left text-xs", i === groupIdx ? "border-accent bg-accent-soft/50 font-semibold" : "border-border bg-surface")}
                >
                  <span className="min-w-0 truncate">{g}</span>
                  <span className={cn("tabular shrink-0", bad ? "text-bad" : gd === gi.length ? "text-good" : "text-muted")}>
                    {gd}/{gi.length}
                  </span>
                </button>
              );
            })}
          </div>

          {props.aiAvailable && (
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={analyze} onChange={(e) => setAnalyze(e.target.checked)} />
              <Sparkles className="size-4 text-accent" /> Fotos per KI prüfen ({Math.max(0, props.photoAiLimit - aiUsed)} übrig)
            </label>
          )}

          <h2 className="mb-2.5 mt-5 text-lg font-semibold">{group}</h2>
          <div className="space-y-3">
            {items.map((it) => (
              <div key={it.id} className={cn("rounded-2xl border bg-surface p-4", it.status === "conspicuous" ? "border-bad/50" : it.status === "ok" ? "border-good/40" : "border-border")}>
                <div className="flex items-start gap-2">
                  <p className="flex-1 font-medium leading-snug">{it.title}</p>
                  {it.priority === "high" && <Badge tone="warn">Wichtig</Badge>}
                </div>
                {it.how && <p className="mt-1 text-sm text-muted">{it.how}</p>}
                {it.reason && <p className="mt-1 text-xs text-muted">Grund: {it.reason}</p>}
                <div className="mt-3 grid grid-cols-4 gap-1.5">
                  {STATUS.map(({ s, icon: Icon, cls }) => (
                    <button
                      key={s}
                      data-on={it.status === s}
                      onClick={() => update(it.id, { status: s })}
                      className={cn("flex flex-col items-center gap-0.5 rounded-xl border border-border px-1 py-2 text-[11px] leading-tight transition active:scale-95", cls)}
                    >
                      <Icon className="size-4" />
                      {INSPECTION_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
                <Textarea
                  rows={2}
                  className="mt-2.5 text-sm"
                  placeholder="Notiz (optional)"
                  defaultValue={it.note ?? ""}
                  onBlur={(e) => e.target.value !== (it.note ?? "") && update(it.id, { note: e.target.value })}
                />
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {it.photos.map((p) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={p.uploadId} src={`/api/uploads/${p.uploadId}`} alt="Besichtigungsfoto" className="size-14 rounded-lg border border-border object-cover" />
                  ))}
                  <label className={cn("flex h-14 cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-border px-3 text-sm", !online && "opacity-50")}>
                    {photoBusy === it.id ? <Spinner /> : <Camera className="size-4" />} Foto
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => addPhoto(it, e.target.files?.[0])} />
                  </label>
                </div>
                {it.photos.filter((p) => p.analysis).map((p) => (
                  <div key={p.uploadId} className="mt-2 rounded-xl bg-surface-2 p-3 text-sm">
                    <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
                      <Sparkles className="size-3.5" /> KI-Fotoprüfung (keine Ferndiagnose)
                    </p>
                    {p.analysis!.findings.length ? (
                      <ul className="list-disc space-y-0.5 pl-5">
                        {p.analysis!.findings.map((f, k) => (
                          <li key={k}>
                            <span className="font-medium">{f.title}</span> – {f.detail}
                            {f.evidenceLevel !== "visible" && <span className="text-muted"> ({f.evidenceLevel === "possible" ? "möglich" : "nicht prüfbar"})</span>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>Keine sichtbaren Auffälligkeiten erkannt.</p>
                    )}
                    {p.analysis!.listingComparison && <p className="mt-1 text-muted">Vergleich mit Inseratsfotos: {p.analysis!.listingComparison}</p>}
                    <p className="mt-1 text-muted">{p.analysis!.note}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="mt-5 flex gap-2">
            <Button variant="outline" disabled={groupIdx === 0} onClick={() => { setGroupIdx((i) => i - 1); window.scrollTo({ top: 0 }); }}>
              <ChevronLeft /> Zurück
            </Button>
            {groupIdx < groups.length - 1 ? (
              <Button className="flex-1" onClick={() => { setGroupIdx((i) => i + 1); window.scrollTo({ top: 0 }); }}>
                Weiter: {groups[groupIdx + 1]} <ChevronRight />
              </Button>
            ) : (
              <Button className="flex-1" onClick={finish} disabled={finishing}>
                {finishing ? <Spinner /> : "Besichtigung abschließen"}
              </Button>
            )}
          </div>
          <p className="mt-4 text-xs text-muted">{data.safetyNote}</p>
        </>
      )}
    </div>
  );
}
