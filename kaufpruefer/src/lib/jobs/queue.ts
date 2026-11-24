import "server-only";
import { getStore } from "../store";
import type { JobRecord, JobType } from "../store/akte-types";
import { newId, nowIso } from "../utils";

/**
 * Persistente Job-Queue (Datenbank statt Arbeitsspeicher).
 *
 * - Jobstatus, Fortschritt und Ergebnis liegen in der Tabelle `jobs`.
 * - Idempotenz über `idempotencyKey`: Doppelte Aufträge laufen nur einmal.
 * - Lease: Stürzt die Instanz ab (z. B. Render-Neustart), wird der Job nach
 *   Ablauf der Lease von einem anderen Worker erneut aufgenommen.
 * - Wiederholungen mit exponentiellem Backoff, nicht wiederholbare Fehler
 *   (Kostenlimit, fehlende Eingaben) brechen sofort ab.
 * - Abbruch: `cancelRequested` wird vom Handler regelmäßig geprüft.
 *
 * Ausgeführt wird (a) direkt nach dem Einreihen in derselben Instanz,
 * (b) durch einen Intervall-Worker (instrumentation.ts) und
 * (c) über den Cron-Endpunkt /api/cron/jobs.
 */

export class NonRetryableError extends Error {
  nonRetryable = true as const;
}
export class JobCancelledError extends Error {
  constructor() {
    super("Abgebrochen");
  }
}

export interface JobContext {
  job: JobRecord;
  progress(pct: number, message?: string): Promise<void>;
  /** Wirft JobCancelledError, wenn der Nutzer abgebrochen hat */
  checkCancelled(): Promise<void>;
}
export type JobHandler = (ctx: JobContext) => Promise<Record<string, unknown> | void>;

const LEASE_SECONDS = 300;
const handlers = new Map<JobType, JobHandler>();

export function registerJobHandler(type: JobType, h: JobHandler) {
  handlers.set(type, h);
}

export async function enqueueJob(opts: {
  type: JobType;
  idempotencyKey: string;
  input: Record<string, unknown>;
  userId?: string;
  analysisId?: string;
  maxAttempts?: number;
  runAfter?: string;
  message?: string;
}): Promise<{ job: JobRecord; created: boolean }> {
  const now = nowIso();
  const res = await getStore().enqueueJob({
    id: newId("job"),
    type: opts.type,
    userId: opts.userId,
    analysisId: opts.analysisId,
    idempotencyKey: opts.idempotencyKey,
    status: "queued",
    attempts: 0,
    maxAttempts: opts.maxAttempts ?? 3,
    runAfter: opts.runAfter ?? now,
    progress: 0,
    message: opts.message ?? "In Warteschlange",
    input: opts.input,
    createdAt: now,
    updatedAt: now,
  });
  if (res.created) kickWorker();
  return res;
}

export async function requestCancel(jobId: string, userId: string): Promise<boolean> {
  const store = getStore();
  const j = await store.getJob(jobId);
  if (!j || j.userId !== userId) return false;
  if (j.status === "queued") await store.updateJob(jobId, { status: "cancelled", message: "Abgebrochen", cancelRequested: true });
  else if (j.status === "running") await store.updateJob(jobId, { cancelRequested: true, message: "Wird abgebrochen …" });
  return true;
}

export function backoffSeconds(attempt: number): number {
  return Math.min(3600, 30 * 2 ** Math.max(0, attempt - 1));
}

async function ensureHandlers() {
  if (handlers.size === 0) await import("./handlers");
}

/** Führt einen beanspruchten Job aus und schreibt das Ergebnis zurück. */
export async function executeJob(job: JobRecord): Promise<JobRecord["status"]> {
  await ensureHandlers();
  const store = getStore();
  const h = handlers.get(job.type);
  if (!h) {
    await store.updateJob(job.id, { status: "failed", error: `Kein Handler für ${job.type}`, leaseUntil: undefined });
    return "failed";
  }
  if (job.cancelRequested) {
    await store.updateJob(job.id, { status: "cancelled", message: "Abgebrochen" });
    return "cancelled";
  }
  const ctx: JobContext = {
    job,
    async progress(pct, message) {
      await store.updateJob(job.id, {
        progress: Math.max(0, Math.min(100, Math.round(pct))),
        ...(message ? { message } : {}),
        leaseUntil: new Date(Date.now() + LEASE_SECONDS * 1000).toISOString(),
      });
    },
    async checkCancelled() {
      const cur = await store.getJob(job.id);
      if (cur?.cancelRequested) throw new JobCancelledError();
    },
  };
  try {
    const result = await h(ctx);
    await store.updateJob(job.id, { status: "done", progress: 100, result: result ?? {}, error: undefined, leaseUntil: undefined, message: "Fertig" });
    return "done";
  } catch (e) {
    const err = e as Error & { nonRetryable?: boolean; code?: string };
    if (err instanceof JobCancelledError) {
      await store.updateJob(job.id, { status: "cancelled", message: "Abgebrochen", leaseUntil: undefined });
      return "cancelled";
    }
    const permanent = err.nonRetryable || err.code === "ai_budget" || job.attempts >= job.maxAttempts;
    console.warn(`[jobs] ${job.type} ${job.id} Versuch ${job.attempts} fehlgeschlagen: ${err.message}`);
    if (permanent) {
      await store.updateJob(job.id, { status: "failed", error: err.message.slice(0, 500), message: "Fehlgeschlagen", leaseUntil: undefined });
      return "failed";
    }
    await store.updateJob(job.id, {
      status: "queued",
      error: err.message.slice(0, 500),
      message: `Neuer Versuch in Kürze (${job.attempts}/${job.maxAttempts})`,
      runAfter: new Date(Date.now() + backoffSeconds(job.attempts) * 1000).toISOString(),
      leaseUntil: undefined,
    });
    return "queued";
  }
}

/** Arbeitet bis zu `maxJobs` fällige Jobs ab. */
export async function runJobsOnce(opts: { maxJobs?: number; types?: JobType[] } = {}): Promise<{ processed: number }> {
  const store = getStore();
  let processed = 0;
  for (let i = 0; i < (opts.maxJobs ?? 5); i++) {
    const job = await store.claimJob(nowIso(), LEASE_SECONDS, opts.types);
    if (!job) break;
    await executeJob(job);
    processed++;
  }
  return { processed };
}

const g = globalThis as unknown as { __dnWorker?: { running: boolean; again: boolean; timer?: NodeJS.Timeout } };
const state = (g.__dnWorker ??= { running: false, again: false });

/** Stößt die Verarbeitung in dieser Instanz an (ohne den Request zu blockieren). */
export function kickWorker() {
  if (process.env.JOB_WORKER === "off") return;
  if (state.running) {
    state.again = true;
    return;
  }
  state.running = true;
  setImmediate(async () => {
    try {
      do {
        state.again = false;
        await runJobsOnce({ maxJobs: 10 });
      } while (state.again);
    } catch (e) {
      console.error("[jobs] Worker-Fehler", (e as Error).message);
    } finally {
      state.running = false;
    }
  });
}

/** Intervall-Worker für Wiederholungen und nach Neustarts liegengebliebene Jobs. */
export function startIntervalWorker(seconds = 20) {
  if (state.timer || process.env.JOB_WORKER === "off") return;
  state.timer = setInterval(() => kickWorker(), seconds * 1000);
  state.timer.unref?.();
  kickWorker();
}

/** Öffentliche Sicht auf einen Job (ohne interne Eingaben). */
export function publicJob(j: JobRecord) {
  return {
    id: j.id,
    type: j.type,
    status: j.status,
    progress: j.progress,
    message: j.message,
    error: j.status === "failed" ? j.error : undefined,
    result: j.status === "done" ? j.result : undefined,
    attempts: j.attempts,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt,
  };
}
