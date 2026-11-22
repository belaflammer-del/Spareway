/**
 * Upload-Validierung anhand von Magic Bytes (nicht anhand von Dateiendung
 * oder vom Client gemeldetem MIME-Type).
 */
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGES_PER_REQUEST = 12;

export type DetectedType =
  | { kind: "image"; mime: "image/jpeg" | "image/png" | "image/webp" | "image/heic" }
  | { kind: "video"; mime: "video/mp4" | "video/quicktime" | "video/webm" }
  | null;

export function detectFileType(buf: Uint8Array): DetectedType {
  if (buf.length < 12) return null;
  const b = buf;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { kind: "image", mime: "image/jpeg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a)
    return { kind: "image", mime: "image/png" };
  const ascii = (s: number, e: number) => String.fromCharCode(...b.slice(s, e));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { kind: "image", mime: "image/webp" };
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { kind: "video", mime: "video/webm" };
  if (ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    if (/^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(brand)) return { kind: "image", mime: "image/heic" };
    if (brand === "qt  ") return { kind: "video", mime: "video/quicktime" };
    if (/^(isom|iso2|iso4|iso5|iso6|mp41|mp42|avc1|M4V |M4VP|dash|3gp4|3gp5|3gp6|MSNV)$/.test(brand)) return { kind: "video", mime: "video/mp4" };
  }
  return null;
}
