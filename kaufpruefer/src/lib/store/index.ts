import "server-only";
import { env, features } from "../config/env";
import { LocalStore } from "./local";
import { SupabaseStore } from "./supabase";
import type { DataStore } from "./types";

const g = globalThis as unknown as { __kkStore?: DataStore };

/** Liefert die aktive Datenhaltung (Supabase, sonst lokale Datei-DB). */
export function getStore(): DataStore {
  if (!g.__kkStore) {
    g.__kkStore = features.supabase
      ? new SupabaseStore(env.supabase.url as string, env.supabase.serviceRoleKey as string)
      : new LocalStore();
  }
  return g.__kkStore;
}

export function getLocalStore(): LocalStore {
  const s = getStore();
  // Kein instanceof: Die Klasse kann in mehreren Server-Chunks gebündelt sein
  if (s.kind !== "local") throw new Error("Lokaler Speicher nicht aktiv");
  return s as LocalStore;
}
