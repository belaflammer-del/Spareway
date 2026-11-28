"use client";

import { Bell, CalendarClock, Eye, ImagePlus, MousePointerClick, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import type { AkteViewModel } from "@/lib/akte/view-model";
import { postJson, uploadFiles } from "@/lib/client/jobs";
import { formatEur } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";

const SOURCE = { initial_analysis: "Erstprüfung", platform_api: "Offizielle Schnittstelle", manual_screenshot: "Screenshot", manual_text: "Text", manual_price: "Manuell", page_capture: "→ DEAL-NIVO-Button" } as const;
const TONE = { positive: "border-good/50 bg-good-soft/30", neutral: "border-border bg-surface-2/60", caution: "border-warn/50 bg-warn-soft/30" } as const;

/** Preisverlauf: ausschließlich tatsächlich erfasste Punkte, keine Interpolation zwischen Lücken. */
function PriceChart({ points }: { points: { at: string; price: number }[] }) {
  if (points.length < 2) return null;
  const W = 320;
  const H = 120;
  const P = 26;
  const xs = points.map((p) => Date.parse(p.at));
  const min = Math.min(...points.map((p) => p.price));
  const max = Math.max(...points.map((p) => p.price));
  const span = max - min || max * 0.05 || 1;
  const x = (t: number) => P + ((t - xs[0]) / Math.max(1, xs.at(-1)! - xs[0])) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - (min - span * 0.15)) / (span * 1.3)) * (H - 2 * P);
  // Treppenlinie: Preis gilt bis zur nächsten Erfassung
  const d = points.map((p, i) => (i === 0 ? `M${x(xs[0]).toFixed(1)},${y(p.price).toFixed(1)}` : `H${x(xs[i]).toFixed(1)} V${y(p.price).toFixed(1)}`)).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Preisverlauf der erfassten Preise">
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(xs[i])} cy={y(p.price)} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
          <text x={x(xs[i])} y={y(p.price) - 9} textAnchor="middle" fontSize={10} fill="currentColor">{Math.round(p.price).toLocaleString("de-DE")}</text>
          <text x={x(xs[i])} y={H - 6} textAnchor="middle" fontSize={9} fill="var(--muted)">{new Date(p.at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}</text>
        </g>
      ))}
    </svg>
  );
}

function b64ToUint8(b64: string) {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export function WatchCard({ vm }: { vm: AkteViewModel }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [interval, setIntervalH] = useState(24);
  const [email, setEmail] = useState(false);
  const [push, setPush] = useState(false);
  const [price, setPrice] = useState("");
  const w = vm.watch;
  const snaps = vm.snapshots;
  const points = snaps.filter((s) => s.data.priceEur != null).map((s) => ({ at: s.data.capturedAt, price: s.data.priceEur as number }));
  const updates = snaps.filter((s) => s.data.changes.length).slice().reverse();
  const pr = vm.watchPricing;
  const now = Date.now();
  const paidMs = w?.paidUntil ? Date.parse(w.paidUntil) : undefined;
  const expired = !!w && (!w.active || (paidMs != null && paidMs <= now));
  const endsSoon = !!w && !expired && paidMs != null && paidMs - now < 7 * 864e5;
  const priceLabel = `${pr.tokenCost} Token / ${pr.periodDays} Tage`;

  async function act(key: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(key);
    try {
      await fn();
      if (ok) toast.success(ok);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function enablePush(): Promise<boolean> {
    if (!vm.channels.pushPublicKey || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast.error("Push-Benachrichtigungen werden von diesem Browser nicht unterstützt (iPhone: nur als installierte Web-App ab iOS 16.4).");
      return false;
    }
    if ((await Notification.requestPermission()) !== "granted") return false;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(vm.channels.pushPublicKey) });
    await postJson("/api/push/subscribe", sub.toJSON());
    return true;
  }

  const start = () =>
    act(
      "start",
      async () => {
        const pushOk = push ? await enablePush() : false;
        await postJson(`/api/analyses/${vm.analysisId}/watch`, { intervalHours: interval, notify: { email, push: pushOk } });
      },
      "Beobachtung gestartet",
    );

  const manualPrice = () => {
    const n = Number(price.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return toast.error("Bitte einen gültigen Preis eingeben.");
    void act("price", async () => {
      const r = await postJson<{ changes: { summary: string }[] }>(`/api/analyses/${vm.analysisId}/watch/update`, { priceEur: n });
      toast.message(r.changes.length ? r.changes.map((c) => c.summary).join(" ") : "Keine Änderung zum letzten Stand.");
      setPrice("");
    });
  };
  const manualShot = (files: FileList | null) => {
    if (!files?.length) return;
    void act("shot", async () => {
      const ids = await uploadFiles(Array.from(files).slice(0, 6));
      const r = await postJson<{ changes: { summary: string }[] }>(`/api/analyses/${vm.analysisId}/watch/update`, { imageIds: ids });
      toast.message(r.changes.length ? r.changes.map((c) => c.summary).join(" ") : "Keine Änderung zum letzten Stand.");
    });
  };

  return (
    <section id="s-watch" className="scroll-mt-20 rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2">
          <Eye className="size-4" />
        </span>
        <h3 className="flex-1 font-semibold">Preisverlauf & Beobachtung</h3>
        {w && <Badge tone={w.mode === "auto" ? "good" : "info"}>{w.mode === "auto" ? "Automatisch" : "Manuell"}</Badge>}
      </div>

      <div className="space-y-3 text-sm">
        {points.length >= 2 ? <PriceChart points={points} /> : points.length === 1 && <p className="text-muted">Erfasster Preis: {formatEur(points[0].price)} am {new Date(points[0].at).toLocaleDateString("de-DE")}. Ein Verlauf entsteht, sobald ein weiterer Stand erfasst wird.</p>}

        {updates.length > 0 && (
          <ul className="space-y-2">
            {updates.slice(0, 6).map((u) => (
              <li key={u.version} className={cn("rounded-xl border p-3", u.data.summary ? TONE[u.data.summary.tone] : "border-border")}>
                <p className="text-xs text-muted">
                  {new Date(u.data.capturedAt).toLocaleDateString("de-DE")} · {SOURCE[u.data.source]}
                </p>
                {u.data.summary ? (
                  <>
                    <p className="mt-1 font-medium">{u.data.summary.text}</p>
                    <p className="mt-1 flex gap-1.5">
                      <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent" />
                      <span>{u.data.summary.assessment}</span>
                    </p>
                  </>
                ) : (
                  <p className="mt-1">{u.data.changes.map((c) => c.summary).join(" ")}</p>
                )}
                {u.data.changes
                  .filter((c) => (c.before || c.after) && (c.type === "statement_removed" || c.type === "text_changed" || c.type === "statement_added"))
                  .filter((c, i, arr) => arr.findIndex((x) => x.before === c.before && x.after === c.after) === i)
                  .slice(0, 2)
                  .map((c, i) => (
                    <div key={i} className="mt-2 grid grid-cols-1 gap-1.5 text-xs">
                      {c.before && <p className="rounded bg-bad-soft/50 px-2 py-1 line-through decoration-bad/60">„{c.before}“</p>}
                      {c.after && <p className="rounded bg-good-soft/50 px-2 py-1">„{c.after}“</p>}
                    </div>
                  ))}
              </li>
            ))}
          </ul>
        )}

        {!w ? (
          <div className="space-y-2.5">
            <p className="text-muted">
              {vm.autoWatchPossible
                ? "Dieses Angebot kann über die offizielle eBay-Schnittstelle automatisch abgefragt werden. Du wirst bei Preis- oder Angabenänderungen benachrichtigt."
                : "Für diese Plattform gibt es keine erlaubte automatische Abfrage. Wir erinnern dich regelmäßig – du öffnest das Inserat und tippst auf „→ DEAL-NIVO“. Wir vergleichen, fassen die Änderungen zusammen und geben eine kurze Kaufeinschätzung."}
            </p>
            {vm.autoWatchPossible && (
              <Select value={interval} onChange={(e) => setIntervalH(Number(e.target.value))}>
                <option value={24}>Einmal täglich prüfen</option>
                <option value={48}>Alle 2 Tage</option>
                <option value={168}>Wöchentlich</option>
              </Select>
            )}
            {vm.channels.email && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /> Zusätzlich per E-Mail benachrichtigen
              </label>
            )}
            {vm.channels.push && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} /> Push-Benachrichtigung auf diesem Gerät
              </label>
            )}
            <Button size="sm" onClick={start} disabled={!!busy || pr.balance < pr.tokenCost}>
              {busy === "start" ? <Spinner /> : <><Bell /> Angebot beobachten · {priceLabel}</>}
            </Button>
            <p className="text-xs text-muted">
              Dein Guthaben: {pr.balance} Token.{" "}
              {pr.balance < pr.tokenCost && (
                <Link href="/dashboard/wallet" className="text-accent underline">
                  Tokens aufladen
                </Link>
              )}
              {pr.balance >= pr.tokenCost && "Jederzeit beendbar – keine automatische Verlängerung."}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className={cn("flex items-center gap-2 rounded-xl px-3 py-2", expired ? "bg-bad-soft/40" : endsSoon ? "bg-warn-soft/40" : "bg-surface-2")}>
              <CalendarClock className="size-4 shrink-0" />
              <span className="flex-1">
                {expired ? "Beobachtung abgelaufen" : w.paidUntil ? `Aktiv bis ${new Date(w.paidUntil).toLocaleDateString("de-DE")}` : "Aktiv"}
              </span>
              {(expired || endsSoon) && (
                <Button size="sm" onClick={() => act("extend", () => postJson(`/api/analyses/${vm.analysisId}/watch/extend`), "Beobachtung verlängert")} disabled={!!busy || pr.balance < pr.tokenCost}>
                  {busy === "extend" ? <Spinner /> : `Verlängern · ${priceLabel}`}
                </Button>
              )}
            </div>
            {!expired && w.mode === "manual" && (
              <div className="rounded-xl border border-accent/40 bg-accent-soft/30 p-3">
                <p className="flex items-center gap-1.5 font-medium">
                  <MousePointerClick className="size-4 text-accent" /> Aktualisieren mit einem Tipp
                </p>
                <p className="mt-1 text-muted">
                  Inserat öffnen und auf „→ DEAL-NIVO“ tippen – wir erkennen die Beobachtung automatisch.{" "}
                  <Link href="/button" className="text-accent underline">
                    Button einrichten
                  </Link>
                </p>
              </div>
            )}
            <p className="text-xs text-muted">
              {w.mode === "auto"
                ? `Automatische Abfrage alle ${w.intervalHours} h über die offizielle Schnittstelle.${w.lastCheckedAt ? ` Zuletzt: ${new Date(w.lastCheckedAt).toLocaleString("de-DE")}.` : ""}`
                : "Keine automatische Abfrage für diese Plattform – wir erinnern dich alle paar Tage."}
              {w.lastError && <span className="block text-warn">{w.lastError}</span>}
            </p>
            <div className="flex gap-2">
              <Input inputMode="decimal" placeholder="Neuer Preis in €" value={price} onChange={(e) => setPrice(e.target.value)} />
              <Button size="sm" className="h-11 shrink-0" onClick={manualPrice} disabled={!!busy}>
                {busy === "price" ? <Spinner /> : "Erfassen"}
              </Button>
            </div>
            <label className={cn("flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 py-2.5", !vm.aiAvailable && "pointer-events-none opacity-50")}>
              {busy === "shot" ? <Spinner /> : <ImagePlus className="size-4" />} Aktuellen Inserats-Screenshot hochladen
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => manualShot(e.target.files)} />
            </label>
            <Button variant="ghost" size="sm" className="text-bad" onClick={() => act("stop", () => postJson(`/api/analyses/${vm.analysisId}/watch`, undefined, "DELETE"), "Beobachtung beendet")} disabled={!!busy}>
              Beobachtung beenden
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
