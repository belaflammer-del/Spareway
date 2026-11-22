import "server-only";
import sharp from "sharp";
import { env } from "../config/env";
import { getStore } from "../store";
import { getFile, putFile, removeFile } from "../storage/files";
import type { UploadRecord } from "../store/types";
import { newId, nowIso } from "../utils";
import { detectFileType, IMAGE_MAX_BYTES } from "./validate";

export class UploadError extends Error {
  constructor(public code: "unsupported_type" | "too_large" | "processing_failed" | "not_found", message: string) {
    super(message);
  }
}

/**
 * Speichert ein Bild datensparsam: Neukodierung als JPEG (entfernt EXIF- und
 * GPS-Metadaten), Verkleinerung auf max. 1600 px Kantenlänge.
 */
export async function storeImage(ownerKey: string, data: Buffer, kind: UploadRecord["kind"] = "image"): Promise<UploadRecord> {
  if (data.length > IMAGE_MAX_BYTES) throw new UploadError("too_large", "Bild ist größer als 10 MB");
  const t = detectFileType(data);
  if (!t || t.kind !== "image") throw new UploadError("unsupported_type", "Nur JPEG, PNG, WebP oder HEIC-Bilder sind erlaubt");
  let out: Buffer;
  try {
    out = await sharp(data, { failOn: "error", limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new UploadError(
      "processing_failed",
      t.mime === "image/heic" ? "HEIC-Bilder werden nicht unterstützt – bitte als JPEG speichern oder einen Screenshot verwenden" : "Bild konnte nicht verarbeitet werden",
    );
  }
  return persist(ownerKey, out, "image/jpeg", kind, "jpg");
}

export async function persist(ownerKey: string, data: Buffer, mime: string, kind: UploadRecord["kind"], ext: string): Promise<UploadRecord> {
  const id = newId("up");
  const storagePath = `${ownerKey.replace(/[^a-zA-Z0-9_-]/g, "")}/${id}.${ext}`;
  await putFile(storagePath, data, mime);
  const rec: UploadRecord = {
    id,
    ownerKey,
    kind,
    mime,
    size: data.length,
    storagePath,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + env.uploadRetentionHours * 3600_000).toISOString(),
  };
  await getStore().createUpload(rec);
  return rec;
}

/** Lädt einen Upload nur, wenn er dem anfragenden Besitzer gehört. */
export async function loadOwnedUpload(id: string, ownerKeys: string[]): Promise<{ rec: UploadRecord; data: Buffer }> {
  const rec = await getStore().getUpload(id);
  if (!rec || !ownerKeys.includes(rec.ownerKey) || rec.expiresAt <= nowIso()) throw new UploadError("not_found", "Datei nicht gefunden oder abgelaufen");
  return { rec, data: await getFile(rec.storagePath) };
}

export async function toDataUrl(id: string, ownerKeys: string[]): Promise<string> {
  const { rec, data } = await loadOwnedUpload(id, ownerKeys);
  return `data:${rec.mime};base64,${data.toString("base64")}`;
}

export async function deleteUpload(rec: UploadRecord) {
  await removeFile(rec.storagePath).catch(() => undefined);
  await getStore().deleteUpload(rec.id);
}

/** Löscht abgelaufene Uploads (Löschfrist). */
export async function cleanupExpiredUploads(): Promise<number> {
  const expired = await getStore().listExpiredUploads(nowIso());
  for (const u of expired) await deleteUpload(u);
  return expired.length;
}

let lastCleanup = 0;
/** Opportunistische Bereinigung höchstens alle 10 Minuten. */
export function maybeCleanup() {
  if (Date.now() - lastCleanup < 600_000) return;
  lastCleanup = Date.now();
  cleanupExpiredUploads().catch(() => undefined);
}
