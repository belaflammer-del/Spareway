import "server-only";
import { assertAiBudget } from "../ai/budget";
import { guard } from "../ai/guard";
import { akteLimits, daysFromNow } from "../akte/limits";
import type { SnapshotData } from "../akte/schemas";
import { env } from "../config/env";
import { getActiveAI, providerEnabled } from "../config/providers";
import { ADAPTERS } from "../import/adapters";
import { enqueueJob, NonRetryableError, type JobContext } from "../jobs/queue";
import { notify } from "../notify/service";
import { buildDraft } from "../pipeline/extract";
import { AnalysisError, assertOwnedUploads } from "../pipeline/service";
import { shortLinkFetch } from "../share/import";
import { getStore } from "../store";
import type { ModuleRecord, WatchRecord } from "../store/akte-types";
import type { AnalysisRecord } from "../store/types";
import { deleteUpload, toDataUrl } from "../uploads/service";
import { newId, nowIso } from "../utils";
import { WalletError } from "../store/types";
import { parsePageCapture, type PageCapture } from "../share/page-capture";
import { UsageMeter } from "../ai/provider";
import { diffSnapshots, snapshotFromListing } from "./diff";
import { buildWatchSummary } from "./summary";

/**
 * Angebotsbeobachtung.
 *
 * Automatisch abgefragt wird NUR, wenn eine offizielle Schnittstelle das
 * erlaubt (derzeit: eBay Browse API mit konfigurierten Zugangsdaten).
 * Für alle anderen Plattformen gibt es keine automatische Überwachung –
 * die App sagt das klar und bietet manuelle Aktualisierung (Screenshot,
 * Text oder neuer Preis) an.
 */

async function ebayCtx() {
  return (await providerEnabled("ebay_api")) ? { clientId: env.ebay.clientId, clientSecret: env.ebay.clientSecret, marketplaceId: env.ebay.marketplaceId } : undefined;
}

export async function autoWatchPossible(a: Pick<AnalysisRecord, "platform"> & { report?: AnalysisRecord["report"] }): Promise<boolean> {
  if (a.platform !== "ebay" || !a.report?.listing.externalId) return false;
  const adapter = ADAPTERS.find((x) => x.id === "ebay")!;
  return adapter.canAutoImport({ ebay: await ebayCtx() });
}

export async function listSnapshots(userId: string, analysisId: string) {
  return (await getStore().listModules(analysisId, userId, "snapshot")) as ModuleRecord<SnapshotData>[];
}

/** Erster Stand = Daten der ursprünglichen Analyse (tatsächlich erfasst). */
async function ensureInitialSnapshot(a: AnalysisRecord) {
  const snaps = await listSnapshots(a.userId, a.id);
  if (snaps.length || !a.report) return snaps;
  const lim = akteLimits(await getStore().getConfig());
  const first = await getStore().addModule<SnapshotData>({
    id: newId("mod"),
    analysisId: a.id,
    userId: a.userId,
    kind: "snapshot",
    createdAt: a.completedAt ?? a.createdAt,
    expiresAt: daysFromNow(lim.retention.snapshotDays),
    data: snapshotFromListing(a.report.listing, "initial_analysis", a.completedAt ?? a.createdAt),
  });
  return [first];
}

/** Token für einen Beobachtungszeitraum abbuchen (idempotent je Zeitraum). */
async function chargePeriod(userId: string, watchId: string, analysisId: string, periodStart: string, cost: number) {
  if (cost <= 0) return;
  const store = getStore();
  try {
    const r = await store.reserveTokens(userId, `watch:${analysisId}`, cost, `watch:${watchId}:${periodStart}`);
    if (r.status === "reserved") await store.captureReservation(r.id);
  } catch (e) {
    if (e instanceof WalletError || (e as { code?: string }).code === "insufficient_balance")
      throw new AnalysisError("insufficient_balance", `Für die Beobachtung brauchst du ${cost} Token. Lade dein Guthaben auf.`);
    throw e;
  }
}

/**
 * Beobachtung starten: kostet `watchTokenCost` Token je `watchPeriodDays` Tage.
 * Eine noch bezahlte Beobachtung wird nur in den Einstellungen aktualisiert (keine erneute Abbuchung).
 */
export async function startWatch(userId: string, analysisId: string, opts: { intervalHours?: number; notify?: Partial<WatchRecord["notify"]> }) {
  const store = getStore();
  const a = await store.getAnalysis(analysisId, userId);
  if (!a?.report || a.status !== "completed") throw new AnalysisError("pipeline_failed", "Kaufakte nicht gefunden.");
  const lim = akteLimits(await store.getConfig());
  const existing = await store.getWatchByAnalysis(analysisId, userId);
  const all = await store.listWatches(userId);
  if (!existing?.active && all.filter((w) => w.active).length >= lim.watchesPerUser) throw new AnalysisError("pipeline_failed", `Du beobachtest bereits ${lim.watchesPerUser} Angebote. Beende eine Beobachtung, um eine neue zu starten.`);
  const auto = await autoWatchPossible(a);
  const interval = Math.max(lim.watchMinIntervalHours, Math.min(168, Math.round(opts.intervalHours ?? 24)));
  const now = nowIso();
  const id = existing?.id ?? newId("wat");
  const stillPaid = !!existing?.paidUntil && existing.paidUntil > now;
  if (!stillPaid) await chargePeriod(userId, id, analysisId, now.slice(0, 16), lim.watchTokenCost);
  const w: WatchRecord = {
    id,
    analysisId,
    userId,
    platform: a.platform,
    url: a.report.listing.url,
    externalId: a.report.listing.externalId,
    mode: auto ? "auto" : "manual",
    intervalHours: interval,
    active: true,
    notify: { inApp: true, email: !!opts.notify?.email, push: !!opts.notify?.push },
    createdAt: existing?.createdAt ?? now,
    lastCheckedAt: existing?.lastCheckedAt,
    nextCheckAt: auto ? new Date(Date.now() + interval * 3600_000).toISOString() : undefined,
    paidUntil: stillPaid ? existing!.paidUntil : daysFromNow(lim.watchPeriodDays),
    periodsPaid: (existing?.periodsPaid ?? 0) + (stillPaid ? 0 : 1),
    reminderDays: auto ? undefined : lim.watchReminderDays,
    lastReminderAt: existing?.lastReminderAt ?? now,
    expiryNotifiedAt: undefined,
  };
  await store.upsertWatch(w);
  await ensureInitialSnapshot(a);
  await store.countEvent("watch_started");
  return w;
}

/** Beobachtung um einen weiteren Zeitraum verlängern (bucht Token ab). */
export async function extendWatch(userId: string, analysisId: string) {
  const store = getStore();
  const w = await store.getWatchByAnalysis(analysisId, userId);
  if (!w) throw new AnalysisError("pipeline_failed", "Keine Beobachtung gefunden.");
  const lim = akteLimits(await store.getConfig());
  const now = nowIso();
  const base = w.paidUntil && w.paidUntil > now ? w.paidUntil : now;
  await chargePeriod(userId, w.id, analysisId, base.slice(0, 16), lim.watchTokenCost);
  const paidUntil = new Date(Date.parse(base) + lim.watchPeriodDays * 864e5).toISOString();
  const next: WatchRecord = { ...w, active: true, paidUntil, periodsPaid: (w.periodsPaid ?? 0) + 1, expiryNotifiedAt: undefined, nextCheckAt: w.mode === "auto" ? (w.nextCheckAt && w.nextCheckAt > now ? w.nextCheckAt : now) : undefined };
  await store.upsertWatch(next);
  return next;
}

export async function stopWatch(userId: string, analysisId: string) {
  const store = getStore();
  const w = await store.getWatchByAnalysis(analysisId, userId);
  if (w) await store.deleteWatch(w.id, userId);
}

/** Neuen Stand speichern, mit dem letzten vergleichen und ggf. benachrichtigen. */
export async function recordSnapshot(a: AnalysisRecord, snap: SnapshotData, opts: { notifyChannels?: WatchRecord["notify"] } = {}) {
  const store = getStore();
  const snaps = await ensureInitialSnapshot(a);
  const prev = snaps.at(-1)?.data;
  const changes = prev ? diffSnapshots(prev, snap) : [];
  const lim = akteLimits(await store.getConfig());
  // Zusammenfassung mit Kaufeinschätzung (KI nur bei wichtigen Änderungen, sonst Regeln)
  let summary: SnapshotData["summary"];
  if (changes.length && a.report) {
    const meter = new UsageMeter();
    const raw = changes.some((c) => c.important) ? await getActiveAI("fast") : null;
    let ai = null;
    if (raw) {
      try {
        await assertAiBudget(raw, a.userId);
        ai = guard(raw, { userId: a.userId, scope: "watch" });
      } catch {
        ai = null;
      }
    }
    summary = await buildWatchSummary(changes, a.report, snap, { ai, meter });
    const cost = meter.total.costUsd;
    if (cost > 0) await store.updateAnalysis(a.id, { aiCostUsd: a.aiCostUsd + cost });
  }
  const mod = await store.addModule<SnapshotData>({
    id: newId("mod"),
    analysisId: a.id,
    userId: a.userId,
    kind: "snapshot",
    createdAt: snap.capturedAt,
    expiresAt: daysFromNow(lim.retention.snapshotDays),
    data: { ...snap, changes, summary },
  });
  const important = changes.filter((c) => c.important);
  if (important.length) {
    const price = important.find((c) => c.type === "price");
    const gone = important.find((c) => c.type === "availability");
    await notify(
      a.userId,
      {
        kind: gone ? "listing_unavailable" : price ? "price_change" : "listing_change",
        title: gone ? `Nicht mehr verfügbar: ${a.title.slice(0, 60)}` : price ? `${price.summary.split(" (")[0]}: ${a.title.slice(0, 50)}` : `Inserat geändert: ${a.title.slice(0, 60)}`,
        body: summary ? `${summary.text} ${summary.assessment}`.slice(0, 400) : important.map((c) => c.summary).join(" "),
        link: `/analysis/${a.id}#s-watch`,
      },
      opts.notifyChannels,
    );
  }
  return { module: mod, changes };
}

/** Manuelle Aktualisierung: neuer Preis, Screenshot oder Text des Inserats. */
export async function manualWatchUpdate(
  userId: string,
  analysisId: string,
  input: { priceEur?: number; imageIds?: string[]; pastedText?: string; available?: "yes" | "no"; page?: PageCapture },
) {
  const store = getStore();
  const a = await store.getAnalysis(analysisId, userId);
  if (!a?.report) throw new AnalysisError("pipeline_failed", "Kaufakte nicht gefunden.");
  const lim = akteLimits(await store.getConfig());
  const rl = await store.hitRateLimit(`watch-manual:${userId}:${analysisId}`, 86_400, lim.watchManualUpdatesPerDay);
  if (!rl.allowed) throw new AnalysisError("pipeline_failed", "Tageslimit für manuelle Aktualisierungen erreicht.");
  const imageIds = (input.imageIds ?? []).slice(0, 6);
  await assertOwnedUploads(imageIds, userId);
  const w = await store.getWatchByAnalysis(analysisId, userId);
  const now = nowIso();
  let snap: SnapshotData;

  if (input.page) {
    // Aktualisierung per „→ DEAL-NIVO“-Button: regelbasiert, keine KI, keine Bilder nötig
    const parsed = parsePageCapture(input.page);
    snap = snapshotFromListing(parsed.listing, "page_capture", now, "yes");
  } else if (imageIds.length || input.pastedText) {
    const rawAi = await getActiveAI("fast");
    if (imageIds.length && !rawAi) throw new AnalysisError("pipeline_failed", "Screenshots können nur mit aktivierter KI ausgelesen werden. Trage den neuen Preis alternativ direkt ein.");
    if (rawAi) await assertAiBudget(rawAi, userId);
    const draft = await buildDraft(
      { imageRefs: imageIds, pastedText: input.pastedText },
      { ai: guard(rawAi, { userId, scope: "watch" }), importCtx: { shortLinkFetch: shortLinkFetch() }, loadImage: (ref) => toDataUrl(ref, [userId]) },
    );
    for (const ref of imageIds) {
      const u = await store.getUpload(ref);
      if (u) await deleteUpload(u);
    }
    snap = snapshotFromListing({ ...draft.listing, priceEur: input.priceEur ?? draft.listing.priceEur }, imageIds.length ? "manual_screenshot" : "manual_text", now, input.available ?? "unknown");
    if (draft.aiCostUsd > 0) await store.updateAnalysis(analysisId, { aiCostUsd: a.aiCostUsd + draft.aiCostUsd });
  } else if (input.priceEur != null || input.available) {
    snap = { capturedAt: now, source: "manual_price", priceEur: input.priceEur, attributes: {}, available: input.available ?? "unknown", changes: [] };
  } else throw new AnalysisError("pipeline_failed", "Bitte neuen Preis, Screenshot oder Inseratstext angeben.");

  const res = await recordSnapshot(a, snap, { notifyChannels: w?.notify ?? { inApp: true, email: false, push: false } });
  if (w) await store.upsertWatch({ ...w, lastCheckedAt: now, lastError: undefined });
  return res;
}

/** Fällige automatische Beobachtungen einreihen (Cron / Intervall-Worker). */
export async function scheduleDueWatches(limit = 50): Promise<number> {
  const store = getStore();
  const due = await store.listDueWatches(nowIso(), limit);
  for (const w of due) await enqueueJob({ type: "watch_check", userId: w.userId, analysisId: w.analysisId, idempotencyKey: `watch:${w.id}:${w.nextCheckAt}`, input: { watchId: w.id }, maxAttempts: 3 });
  return due.length;
}

/** Hintergrundjob: Abfrage über die offizielle Schnittstelle – rein regelbasierter Vergleich, keine KI. */
export async function watchCheckJobHandler(ctx: JobContext) {
  const store = getStore();
  const w = await store.getWatch((ctx.job.input as { watchId: string }).watchId);
  if (!w || !w.active || w.mode !== "auto") return { skipped: true };
  const a = await store.getAnalysis(w.analysisId, w.userId);
  if (!a?.report) {
    await store.deleteWatch(w.id, w.userId);
    throw new NonRetryableError("Kaufakte gelöscht");
  }
  const adapter = ADAPTERS.find((x) => x.id === w.platform);
  const ctxEbay = await ebayCtx();
  const now = nowIso();
  const next = new Date(Date.now() + w.intervalHours * 3600_000).toISOString();
  if (!adapter?.autoImport || !w.externalId || !adapter.canAutoImport({ ebay: ctxEbay })) {
    // Zugang entfallen → ehrlich auf manuell umstellen
    await store.upsertWatch({ ...w, mode: "manual", nextCheckAt: undefined, lastError: "Automatische Abfrage nicht mehr verfügbar – bitte manuell aktualisieren." });
    return { switchedToManual: true };
  }
  let snap: SnapshotData;
  try {
    const listing = await adapter.autoImport(new URL(w.url ?? "https://www.ebay.de"), w.externalId, { ebay: ctxEbay });
    snap = snapshotFromListing(listing, "platform_api", now, "yes");
  } catch (e) {
    const msg = (e as Error).message;
    if (/\((404|410)\)/.test(msg)) snap = { capturedAt: now, source: "platform_api", attributes: {}, available: "no", changes: [] };
    else {
      await store.upsertWatch({ ...w, lastError: msg.slice(0, 200), nextCheckAt: next });
      throw e;
    }
  }
  const res = await recordSnapshot(a, snap, { notifyChannels: w.notify });
  await store.upsertWatch({ ...w, lastCheckedAt: now, nextCheckAt: snap.available === "no" ? undefined : next, active: snap.available !== "no", lastError: undefined });
  return { changes: res.changes.length };
}

/**
 * Laufzeit und Erinnerungen (Hintergrund, alle 10 Minuten):
 * - Hinweis 3 Tage vor Ablauf, bei Ablauf deaktivieren + Hinweis zum Verlängern
 * - Plattformen ohne erlaubte automatische Abfrage: Erinnerung zum Aktualisieren
 */
export async function processWatchLifecycle(now = new Date()): Promise<{ expired: number; reminded: number; warned: number }> {
  const store = getStore();
  const lim = akteLimits(await store.getConfig());
  const iso = now.toISOString();
  let expired = 0;
  let reminded = 0;
  let warned = 0;
  for (const w of await store.listActiveWatches(500)) {
    const a = await store.getAnalysis(w.analysisId, w.userId);
    if (!a) {
      await store.deleteWatch(w.id, w.userId);
      continue;
    }
    const title = a.title.slice(0, 60);
    if (w.paidUntil && w.paidUntil <= iso) {
      await store.upsertWatch({ ...w, active: false, nextCheckAt: undefined, expiryNotifiedAt: iso });
      await notify(w.userId, { kind: "info", title: `Beobachtung beendet: ${title}`, body: `Der Beobachtungszeitraum ist abgelaufen. Für ${lim.watchTokenCost} Token kannst du ${lim.watchPeriodDays} weitere Tage beobachten.`, link: `/analysis/${w.analysisId}#s-watch` }, w.notify);
      expired++;
      continue;
    }
    if (w.paidUntil && !w.expiryNotifiedAt && Date.parse(w.paidUntil) - now.getTime() < 3 * 864e5) {
      await store.upsertWatch({ ...w, expiryNotifiedAt: iso });
      await notify(w.userId, { kind: "info", title: `Beobachtung läuft bald ab: ${title}`, body: `Die Beobachtung endet am ${new Date(w.paidUntil).toLocaleDateString("de-DE")}. Du kannst sie in der Kaufakte verlängern.`, link: `/analysis/${w.analysisId}#s-watch` }, w.notify);
      warned++;
      continue;
    }
    if (w.mode === "manual" && w.reminderDays) {
      const last = Date.parse(w.lastReminderAt ?? w.lastCheckedAt ?? w.createdAt);
      if (now.getTime() - last >= w.reminderDays * 864e5) {
        await store.upsertWatch({ ...w, lastReminderAt: iso });
        await notify(w.userId, { kind: "info", title: `Kurz nachsehen: ${title}`, body: "Hat sich am Inserat etwas geändert? Inserat öffnen und auf „→ DEAL-NIVO“ tippen – wir vergleichen automatisch und fassen die Änderungen zusammen.", link: `/analysis/${w.analysisId}#s-watch` }, w.notify);
        reminded++;
      }
    }
  }
  return { expired, reminded, warned };
}
