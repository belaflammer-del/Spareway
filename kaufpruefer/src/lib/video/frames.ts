/**
 * Videoverarbeitung für Bildschirmaufnahmen (z. B. Scrollen durch ein
 * Bewertungsprofil).
 *
 * Ablauf:
 *  1. Dauer/Format mit ffprobe prüfen (Längen- und Größenbegrenzung).
 *  2. Frames mit FFmpeg in fester Rate abtasten (2 fps).
 *  3. Scrollbewegung zwischen aufeinanderfolgenden Frames schätzen
 *     (vertikale Verschiebung per Zeilenabgleich). Ein Frame wird erst
 *     behalten, wenn sich der Inhalt um ca. 55 % der Bildhöhe verschoben hat –
 *     so überlappen behaltene Frames, es geht nichts verloren, und bei
 *     langsamem Scrollen entstehen keine unnötigen Duplikate.
 *  4. Bei Szenenwechseln (keine plausible Verschiebung) wird der Frame behalten.
 */
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

export interface FrameSelectionOptions {
  sampleFps: number;
  maxFrames: number;
  keepShiftRatio: number;
}
export const DEFAULT_FRAME_OPTIONS: FrameSelectionOptions = { sampleFps: 2, maxFrames: 30, keepShiftRatio: 0.55 };

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const t = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error(`${cmd} Zeitüberschreitung`));
    }, timeoutMs);
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d.toString().slice(-2000)));
    p.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
    p.on("close", (code) => {
      clearTimeout(t);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} beendet mit Code ${code}: ${stderr.slice(-300)}`));
    });
  });
}

export async function probeDuration(file: string): Promise<number> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], 20_000);
  const d = Number(stdout.trim());
  if (!Number.isFinite(d)) throw new Error("Videodauer nicht bestimmbar");
  return d;
}

export async function ffmpegAvailable(): Promise<boolean> {
  try {
    await run("ffmpeg", ["-version"], 5_000);
    return true;
  } catch {
    return false;
  }
}

const W = 48;
const H = 256;

async function signature(file: string): Promise<Uint8Array> {
  return new Uint8Array(await sharp(file).greyscale().resize(W, H, { fit: "fill" }).raw().toBuffer());
}

/**
 * Schätzt die vertikale Verschiebung (in Signaturzeilen) von a nach b.
 * Liefert null, wenn keine plausible Verschiebung passt (Szenenwechsel).
 */
export function estimateShift(a: Uint8Array, b: Uint8Array, w = W, h = H): number | null {
  let best = Infinity;
  let bestS = 0;
  const maxS = Math.floor(h * 0.9);
  for (let s = 0; s <= maxS; s++) {
    const rows = h - s;
    let diff = 0;
    for (let y = 0; y < rows; y++) {
      const ra = (y + s) * w;
      const rb = y * w;
      for (let x = 0; x < w; x++) diff += Math.abs(a[ra + x] - b[rb + x]);
    }
    const norm = diff / (rows * w);
    // leichte Bevorzugung kleiner Verschiebungen bei Gleichstand
    const score = norm + s * 0.0005;
    if (score < best) {
      best = score;
      bestS = s;
    }
  }
  return best < 18 ? bestS : null;
}

export async function extractKeyFrames(
  videoFile: string,
  workDir: string,
  opts: FrameSelectionOptions = DEFAULT_FRAME_OPTIONS,
  maxSeconds = 90,
  onProgress?: (done: number, total: number) => void,
): Promise<{ frames: string[]; sampled: number; sceneChanges: number; hint?: string }> {
  await fs.mkdir(workDir, { recursive: true });
  await run(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-y",
      "-t", String(maxSeconds),
      "-i", videoFile,
      "-vf", `fps=${opts.sampleFps},scale='min(1080,iw)':-2`,
      "-frames:v", String(Math.ceil(maxSeconds * opts.sampleFps)),
      "-q:v", "4",
      path.join(workDir, "f_%04d.jpg"),
    ],
    120_000,
  );
  const files = (await fs.readdir(workDir)).filter((f) => f.startsWith("f_")).sort().map((f) => path.join(workDir, f));
  if (files.length === 0) return { frames: [], sampled: 0, sceneChanges: 0, hint: "Aus dem Video konnten keine Bilder gelesen werden." };

  const kept: string[] = [files[0]];
  let prev = await signature(files[0]);
  let accumulated = 0;
  let sceneChanges = 0;
  let stillFrames = 0;
  for (let i = 1; i < files.length; i++) {
    if (onProgress && i % 5 === 0) onProgress(i, files.length);
    const sig = await signature(files[i]);
    const s = estimateShift(prev, sig);
    if (s === 0) stillFrames++;
    if (s === null) {
      sceneChanges++;
      kept.push(files[i]); // Szenenwechsel → behalten
      accumulated = 0;
    } else {
      accumulated += s;
      if (accumulated >= H * opts.keepShiftRatio) {
        kept.push(files[i]);
        accumulated = 0;
      }
    }
    prev = sig;
  }
  // letzten Frame immer behalten (Ende der Liste)
  if (kept[kept.length - 1] !== files[files.length - 1]) kept.push(files[files.length - 1]);

  // Begrenzen: gleichmäßig ausdünnen
  let frames = kept;
  if (frames.length > opts.maxFrames) {
    const step = frames.length / opts.maxFrames;
    frames = Array.from({ length: opts.maxFrames }, (_, i) => kept[Math.floor(i * step)]);
  }
  // Hinweise zur Aufnahmequalität: zu schnelles Scrollen erzeugt viele „Sprünge“
  const jumpRatio = sceneChanges / Math.max(1, files.length - 1);
  const hint =
    jumpRatio > 0.3
      ? "Bitte scrolle etwas langsamer und gleichmäßiger, damit alle Bewertungen vollständig erkannt werden."
      : stillFrames / Math.max(1, files.length - 1) > 0.85
        ? "In der Aufnahme wurde kaum gescrollt. Bitte langsam durch alle Bewertungen scrollen."
        : undefined;
  return { frames, sampled: files.length, sceneChanges, hint };
}
