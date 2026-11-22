import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { estimateShift, extractKeyFrames, ffmpegAvailable } from "@/lib/video/frames";

describe("video frame selection", () => {
  it("estimates vertical scroll shift", () => {
    const w = 48, h = 256;
    const a = new Uint8Array(w * h).map((_, i) => (Math.floor(i / w) * 37) % 251);
    const b = new Uint8Array(w * h).map((_, i) => a[i + 20 * w] ?? 0);
    expect(estimateShift(a, b)).toBe(20);
  });

  it("extracts overlapping key frames from a simulated scroll recording", async () => {
    if (!(await ffmpegAvailable())) return;
    const dir = mkdtempSync(path.join(tmpdir(), "kkv-"));
    // Hohe „Bewertungsseite“ mit Textzeilen erzeugen und per FFmpeg langsam scrollen
    const rows = Array.from({ length: 60 }, (_, i) => `<rect x="20" y="${i * 80 + 20}" width="${300 + ((i * 53) % 300)}" height="40" fill="#${((i * 2654435761) % 0xffffff).toString(16).padStart(6, "0")}"/>`).join("");
    const tall = path.join(dir, "page.png");
    await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="4800"><rect width="720" height="4800" fill="#fff"/>${rows}</svg>`)).png().toFile(tall);
    const video = path.join(dir, "rec.mp4");
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-loop", "1", "-i", tall, "-vf", "crop=720:1280:0:'min(t*300,3520)',format=yuv420p", "-t", "14", "-r", "30", video]);
    const { frames, sampled } = await extractKeyFrames(video, path.join(dir, "frames"));
    expect(sampled).toBeGreaterThan(20);
    // 3520 px Scroll / (0.55 × 1280 px) ≈ 5 Bildschirme → deutlich weniger Frames als abgetastet
    expect(frames.length).toBeGreaterThanOrEqual(5);
    expect(frames.length).toBeLessThan(sampled / 2);
  }, 60_000);
});
