import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { storeImage } from "../uploads/service";
import { newId } from "../utils";
import { extractKeyFrames, probeDuration } from "./frames";

/**
 * Asynchrone Videoverarbeitung mit Fortschritt.
 * Hinweis: Die Job-Liste liegt im Speicher des Server-Prozesses – passend für
 * eine einzelne Instanz (Render). Für mehrere Instanzen → Job-Tabelle/Queue.
 */
export interface VideoJob {
  id: string;
  ownerId: string;
  stage: "queued" | "checking" | "extracting" | "saving" | "done" | "failed";
  progress: number; // 0–100
  message: string;
  frameIds?: string[];
  stats?: { durationSeconds: number; sampledFrames: number; keptFrames: number };
  hint?: string;
  error?: string;
  createdAt: number;
}

const g = globalThis as unknown as { __kkVideoJobs?: Map<string, VideoJob> };
const jobs = (g.__kkVideoJobs ??= new Map());

function cleanupOld() {
  const cutoff = Date.now() - 30 * 60_000;
  for (const [id, j] of jobs) if (j.createdAt < cutoff) jobs.delete(id);
}

export function getVideoJob(id: string, ownerId: string): VideoJob | null {
  const j = jobs.get(id);
  return j && j.ownerId === ownerId ? j : null;
}

export function startVideoJob(opts: { ownerId: string; workDir: string; videoPath: string; maxSeconds: number }): VideoJob {
  cleanupOld();
  const job: VideoJob = { id: newId("vjob"), ownerId: opts.ownerId, stage: "queued", progress: 2, message: "Video empfangen", createdAt: Date.now() };
  jobs.set(job.id, job);
  const set = (p: Partial<VideoJob>) => Object.assign(job, p);

  void (async () => {
    try {
      set({ stage: "checking", progress: 5, message: "Video wird geprüft …" });
      const duration = await probeDuration(opts.videoPath);
      if (duration > opts.maxSeconds + 1) throw new Error(`Das Video ist ${Math.round(duration)} s lang. Erlaubt sind maximal ${opts.maxSeconds} s.`);
      set({ stage: "extracting", progress: 10, message: "Relevante Bilder werden ausgewählt …" });
      const r = await extractKeyFrames(opts.videoPath, path.join(opts.workDir, "frames"), undefined, opts.maxSeconds, (done, total) =>
        set({ progress: 10 + Math.round((done / Math.max(1, total)) * 70), message: `Bilder auswerten (${done}/${total}) …` }),
      );
      if (r.frames.length === 0) throw new Error(r.hint ?? "Aus dem Video konnten keine Bilder gelesen werden. Bitte nimm es erneut auf.");
      set({ stage: "saving", progress: 82, message: "Bilder werden gespeichert …" });
      const ids: string[] = [];
      for (const [i, f] of r.frames.entries()) {
        ids.push((await storeImage(opts.ownerId, await fs.readFile(f), "frame")).id);
        set({ progress: 82 + Math.round(((i + 1) / r.frames.length) * 17) });
      }
      set({
        stage: "done",
        progress: 100,
        message: "Fertig – das Video wurde gelöscht.",
        frameIds: ids,
        hint: r.hint,
        stats: { durationSeconds: Math.round(duration), sampledFrames: r.sampled, keptFrames: ids.length },
      });
    } catch (e) {
      set({ stage: "failed", progress: 100, error: (e as Error).message.slice(0, 300), message: "Verarbeitung fehlgeschlagen" });
    } finally {
      // Datenschutz: Rohvideo und Zwischenbilder sofort löschen
      await fs.rm(opts.workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  })();
  return job;
}
