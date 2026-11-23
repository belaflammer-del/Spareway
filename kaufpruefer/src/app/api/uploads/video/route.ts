import { promises as fs } from "node:fs";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth/session";
import { env } from "@/lib/config/env";
import { errorJson, rateLimit } from "@/lib/http";
import { localTmpDir } from "@/lib/storage/files";
import { getStore } from "@/lib/store";
import { detectFileType } from "@/lib/uploads/validate";
import { newId } from "@/lib/utils";
import { ffmpegAvailable } from "@/lib/video/frames";
import { startVideoJob } from "@/lib/video/jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Nimmt eine Bildschirmaufnahme entgegen, extrahiert relevante Frames und
 * löscht das Video anschließend sofort. Zurückgegeben werden nur die Frames
 * (als Uploads mit automatischer Löschfrist).
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return errorJson(401, "unauthorized", "Bitte melde dich an.");
  const rl = await rateLimit(`video:${user.id}`, 3600, 10);
  if (!rl.allowed) return errorJson(429, "rate_limited", "Zu viele Videos. Bitte versuche es später erneut.");
  if (!(await ffmpegAvailable())) return errorJson(503, "ffmpeg_missing", "Die Videoverarbeitung ist auf diesem Server nicht verfügbar. Bitte nutze Screenshots.");

  const lim = (await getStore().getConfig()).limits;
  const maxMb = lim?.videoMaxMb ?? env.videoMaxMb;
  const maxSeconds = lim?.videoMaxSeconds ?? env.videoMaxSeconds;
  const maxBytes = maxMb * 1024 * 1024;
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes + 1024 * 64) return errorJson(413, "too_large", `Das Video ist größer als ${maxMb} MB.`);

  const form = await req.formData().catch(() => null);
  const file = form?.get("video");
  if (!(file instanceof File)) return errorJson(400, "no_file", "Kein Video erhalten");
  if (file.size > maxBytes) return errorJson(413, "too_large", `Das Video ist größer als ${maxMb} MB.`);

  const buf = Buffer.from(await file.arrayBuffer());
  const t = detectFileType(buf);
  if (!t || t.kind !== "video") return errorJson(415, "unsupported_type", "Nur MP4-, MOV- oder WebM-Videos sind erlaubt.");

  const work = path.join(localTmpDir(), newId("vid"));
  const videoPath = path.join(work, "input");
  try {
    await fs.mkdir(work, { recursive: true });
    await fs.writeFile(videoPath, buf);
  } catch {
    await fs.rm(work, { recursive: true, force: true }).catch(() => undefined);
    return errorJson(500, "processing_failed", "Das Video konnte nicht gespeichert werden.");
  }
  // Verarbeitung im Hintergrund – Fortschritt über GET /api/uploads/video/{jobId}
  const job = startVideoJob({ ownerId: user.id, workDir: work, videoPath, maxSeconds });
  return Response.json({ jobId: job.id, status: job.stage }, { status: 202 });
}
