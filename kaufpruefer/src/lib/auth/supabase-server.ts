import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "../config/env";

/** Supabase-Client mit Nutzersitzung (Anon-Key, RLS greift). */
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(env.supabase.url as string, env.supabase.anonKey as string, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // In Server Components nicht setzbar – der Proxy aktualisiert die Sitzung
        }
      },
    },
  });
}
