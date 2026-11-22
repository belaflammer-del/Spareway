import { promises as fs } from "node:fs";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth/session";
import { env } from "@/lib/config/env";
import { errorJson, rateLimit } from "@/lib/http";
import { localTmpDir } from "@/lib/storage/files";
import { storeImage } from "@/lib/uploads/service";
import { detectFileType } from "@/lib/uploads/validate";
import { newId } from "@/lib/utils";
import { extractKeyFrames, ffmpegAvailable, probeDuration } from "@/lib/video/frames";

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

  const maxBytes = env.videoMaxMb * 1024 * 1024;
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes + 1024 * 64) return errorJson(413, "too_large", `Das Video ist größer als ${env.videoMaxMb} MB.`);

  const form = await req.formData().catch(() => null);
  const file = form?.get("video");
  if (!(file instanceof File)) return errorJson(400, "no_file", "Kein Video erhalten");
  if (file.size > maxBytes) return errorJson(413, "too_large", `Das Video ist größer als ${env.videoMaxMb} MB.`);

  const buf = Buffer.from(await file.arrayBuffer());
  const t = detectFileType(buf);
  if (!t || t.kind !== "video") return errorJson(415, "unsupported_type", "Nur MP4-, MOV- oder WebM-Videos sind erlaubt.");

  const work = path.join(localTmpDir(), newId("vid"));
  const videoPath = path.join(work, "input");
  try {
    await fs.mkdir(work, { recursive: true });
    await fs.writeFile(videoPath, buf);
    const duration = await probeDuration(videoPath);
    if (duration > env.videoMaxSeconds + 1)
      return errorJson(413, "too_long", `Das Video ist ${Math.round(duration)} s lang. Erlaubt sind maximal ${env.videoMaxSeconds} s.`);
    const { frames, sampled } = await extractKeyFrames(videoPath, path.join(work, "frames"), undefined, env.videoMaxSeconds);
    if (frames.length === 0) return errorJson(422, "no_frames", "Aus dem Video konnten keine Bilder gelesen werden. Bitte nimm es erneut auf.");
    const ids: string[] = [];
    for (const f of frames) ids.push((await storeImage(user.id, await fs.readFile(f), "frame")).id);
    return Response.json({
      frameIds: ids,
      stats: { durationSeconds: Math.round(duration), sampledFrames: sampled, keptFrames: ids.length },
      note: "Das Video wurde nach der Frame-Extraktion gelöscht.",
    });
  } catch (e) {
    console.error("[video] failed", (e as Error).message);
    return errorJson(500, "processing_failed", "Das Video konnte nicht verarbeitet werden. Bitte versuche eine kürzere Aufnahme oder Screenshots.");
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}
