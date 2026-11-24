import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { enqueueJob, NonRetryableError, type JobContext } from "../jobs/queue";
import { getStore } from "../store";
import { storeImage } from "../uploads/service";
import { newId } from "../utils";
import { extractKeyFrames, probeDuration } from "./frames";

/**
 * Videoverarbeitung als persistenter Hintergrundjob (Tabelle `jobs`).
 * Status und Fortschritt überstehen Instanzneustarts. Das Rohvideo liegt nur
 * im temporären Verzeichnis der Instanz – ist es nach einem Neustart nicht
 * mehr vorhanden, endet der Job mit einer klaren Meldung (kein stilles Hängen).
 */
export interface VideoJobView {
  id: string;
  stage: "queued" | "checking" | "extracting" | "saving" | "done" | "failed";
  progress: number;
  message: string;
  frameIds?: string[];
  stats?: { durationSeconds: number; sampledFrames: number; keptFrames: number };
  hint?: string;
  error?: string;
}

export async function startVideoJob(opts: { ownerId: string; workDir: string; videoPath: string; maxSeconds: number }) {
  const { job } = await enqueueJob({
    type: "video_frames",
    userId: opts.ownerId,
    idempotencyKey: `video:${newId("v")}`,
    input: { workDir: opts.workDir, videoPath: opts.videoPath, maxSeconds: opts.maxSeconds },
    maxAttempts: 1,
    message: "Video empfangen",
  });
  return job;
}

export async function getVideoJob(id: string, ownerId: string): Promise<VideoJobView | null> {
  const j = await getStore().getJob(id);
  if (!j || j.userId !== ownerId || j.type !== "video_frames") return null;
  const r = (j.result ?? {}) as { frameIds?: string[]; stats?: VideoJobView["stats"]; hint?: string };
  const stage: VideoJobView["stage"] =
    j.status === "done" ? "done" : j.status === "failed" || j.status === "cancelled" ? "failed" : j.status === "queued" ? "queued" : j.progress < 10 ? "checking" : j.progress < 82 ? "extracting" : "saving";
  return {
    id: j.id,
    stage,
    progress: j.status === "queued" ? 2 : j.progress,
    message: j.status === "done" ? "Fertig – das Video wurde gelöscht." : (j.message ?? ""),
    frameIds: r.frameIds,
    stats: r.stats,
    hint: r.hint,
    error: j.status === "failed" ? j.error : j.status === "cancelled" ? "Abgebrochen" : undefined,
  };
}

export async function videoJobHandler(ctx: JobContext) {
  const { workDir, videoPath, maxSeconds } = ctx.job.input as { workDir: string; videoPath: string; maxSeconds: number };
  const ownerId = ctx.job.userId as string;
  try {
    await fs.access(videoPath).catch(() => {
      throw new NonRetryableError("Das Video ist nach einem Serverneustart nicht mehr verfügbar. Bitte lade es erneut hoch.");
    });
    await ctx.progress(5, "Video wird geprüft …");
    const duration = await probeDuration(videoPath);
    if (duration > maxSeconds + 1) throw new NonRetryableError(`Das Video ist ${Math.round(duration)} s lang. Erlaubt sind maximal ${maxSeconds} s.`);
    await ctx.progress(10, "Relevante Bilder werden ausgewählt …");
    let last = 0;
    const r = await extractKeyFrames(videoPath, path.join(workDir, "frames"), undefined, maxSeconds, (done, total) => {
      const pct = 10 + Math.round((done / Math.max(1, total)) * 70);
      if (pct - last >= 5) {
        last = pct;
        void ctx.progress(pct, `Bilder auswerten (${done}/${total}) …`);
      }
    });
    if (r.frames.length === 0) throw new NonRetryableError(r.hint ?? "Aus dem Video konnten keine Bilder gelesen werden. Bitte nimm es erneut auf.");
    await ctx.checkCancelled();
    await ctx.progress(82, "Bilder werden gespeichert …");
    const ids: string[] = [];
    for (const [i, f] of r.frames.entries()) {
      ids.push((await storeImage(ownerId, await fs.readFile(f), "frame")).id);
      await ctx.progress(82 + Math.round(((i + 1) / r.frames.length) * 17));
    }
    return { frameIds: ids, hint: r.hint, stats: { durationSeconds: Math.round(duration), sampledFrames: r.sampled, keptFrames: ids.length } };
  } finally {
    // Datenschutz: Rohvideo und Zwischenbilder sofort löschen
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
