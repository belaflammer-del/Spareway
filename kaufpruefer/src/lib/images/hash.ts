import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import type { MatchClass } from "../akte/schemas";

/**
 * Perceptual Hashing für den Bildabgleich.
 * - dHash (9×8 Gradienten): robust gegen Skalierung und Kompression
 * - pHash (DCT 32×32 → 8×8): robust gegen leichte Farb-/Helligkeitsänderungen
 * Es werden nur Hashes gespeichert, keine Bilddaten.
 */

export interface ImageFingerprint {
  dhash: string;
  phash: string;
  bands: string[];
  sha256: string;
  width: number;
  height: number;
}

function bitsToHex(bits: number[]): string {
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) hex += ((bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3]).toString(16);
  return hex;
}

const POP = Array.from({ length: 16 }, (_, i) => (i & 1) + ((i >> 1) & 1) + ((i >> 2) & 1) + ((i >> 3) & 1));
export function hamming(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) d += POP[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  return d + Math.abs(a.length - b.length) * 4;
}

async function gray(data: Buffer, w: number, h: number): Promise<Uint8Array> {
  return new Uint8Array(await sharp(data).rotate().greyscale().resize(w, h, { fit: "fill", kernel: "lanczos3" }).raw().toBuffer());
}

export async function dHash(data: Buffer): Promise<string> {
  const px = await gray(data, 9, 8);
  const bits: number[] = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits.push(px[y * 9 + x] < px[y * 9 + x + 1] ? 1 : 0);
  return bitsToHex(bits);
}

const N = 32;
const COS = Array.from({ length: N }, (_, k) => Array.from({ length: N }, (_, n) => Math.cos(((2 * n + 1) * k * Math.PI) / (2 * N))));
export async function pHash(data: Buffer): Promise<string> {
  const px = await gray(data, N, N);
  // 2D-DCT, nur die benötigten 8×8 niedrigen Frequenzen
  const rows: number[][] = Array.from({ length: N }, (_, y) => Array.from({ length: 8 }, (_, u) => COS[u].reduce((a, c, x) => a + c * px[y * N + x], 0)));
  const coeffs: number[] = [];
  for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) coeffs.push(COS[v].reduce((a, c, y) => a + c * rows[y][u], 0));
  const ac = coeffs.slice(1);
  const median = [...ac].sort((a, b) => a - b)[Math.floor(ac.length / 2)];
  return bitsToHex(coeffs.map((c, i) => (i === 0 ? 0 : c > median ? 1 : 0)));
}

export async function fingerprint(data: Buffer): Promise<ImageFingerprint> {
  const meta = await sharp(data).metadata();
  const [dh, ph] = await Promise.all([dHash(data), pHash(data)]);
  return {
    dhash: dh,
    phash: ph,
    bands: [ph.slice(0, 4), ph.slice(4, 8), ph.slice(8, 12), ph.slice(12, 16)],
    sha256: createHash("sha256").update(data).digest("hex"),
    width: meta.width ?? 0,
    height: meta.height ?? 0,
  };
}

/**
 * Einstufung zweier Fingerabdrücke. Schwellen konservativ gewählt –
 * im Zweifel „möglicherweise ähnlich“ statt „identisch“.
 */
export function classifyMatch(a: Pick<ImageFingerprint, "dhash" | "phash" | "sha256">, b: Pick<ImageFingerprint, "dhash" | "phash" | "sha256">): { class: MatchClass; distance: number; similarityPct: number } {
  const pd = hamming(a.phash, b.phash);
  const dd = hamming(a.dhash, b.dhash);
  const distance = Math.max(pd, dd);
  const similarityPct = Math.round((1 - (pd + dd) / 128) * 100);
  if (a.sha256 === b.sha256 || (pd <= 2 && dd <= 3)) return { class: "identical", distance, similarityPct: a.sha256 === b.sha256 ? 100 : similarityPct };
  if (pd <= 8 && dd <= 10) return { class: "strong", distance, similarityPct };
  if (pd <= 14 && dd <= 16) return { class: "possible", distance, similarityPct };
  return { class: "none", distance, similarityPct };
}
