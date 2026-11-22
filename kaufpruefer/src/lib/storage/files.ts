import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env, features } from "../config/env";
import { getStore } from "../store";

/**
 * Dateiablage für Uploads: Supabase Storage (privater Bucket) oder lokal
 * unter ./.data/uploads. Dateien werden nie öffentlich ausgeliefert, sondern
 * nur über berechtigungsgeprüfte Routen.
 */
const LOCAL_DIR = path.join(process.cwd(), ".data", "uploads");

function safeName(p: string) {
  if (!/^[a-zA-Z0-9_\-/.]+$/.test(p) || p.includes("..")) throw new Error("Ungültiger Pfad");
  return p;
}

export async function putFile(storagePath: string, data: Buffer, mime: string) {
  safeName(storagePath);
  if (features.supabase) {
    const store = getStore() as unknown as { db: import("@supabase/supabase-js").SupabaseClient };
    const { error } = await store.db.storage.from(env.supabase.bucket).upload(storagePath, data, { contentType: mime, upsert: false });
    if (error) throw new Error(`Upload fehlgeschlagen: ${error.message}`);
    return;
  }
  const full = path.join(LOCAL_DIR, storagePath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
}

export async function getFile(storagePath: string): Promise<Buffer> {
  safeName(storagePath);
  if (features.supabase) {
    const store = getStore() as unknown as { db: import("@supabase/supabase-js").SupabaseClient };
    const { data, error } = await store.db.storage.from(env.supabase.bucket).download(storagePath);
    if (error || !data) throw new Error("Datei nicht gefunden");
    return Buffer.from(await data.arrayBuffer());
  }
  return fs.readFile(path.join(LOCAL_DIR, storagePath));
}

export async function removeFile(storagePath: string) {
  safeName(storagePath);
  if (features.supabase) {
    const store = getStore() as unknown as { db: import("@supabase/supabase-js").SupabaseClient };
    await store.db.storage.from(env.supabase.bucket).remove([storagePath]);
    return;
  }
  await fs.rm(path.join(LOCAL_DIR, storagePath), { force: true });
}

export function localTmpDir() {
  return path.join(process.cwd(), ".data", "tmp");
}
