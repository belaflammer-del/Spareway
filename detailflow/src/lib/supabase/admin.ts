import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Service-Role-Client: umgeht RLS. Ausschließlich für vertrauenswürdige Serverprozesse
 * (z. B. Stripe-Webhook) verwenden – niemals mit Benutzereingaben als company_id ohne Prüfung.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY ist nicht gesetzt");
  return createClient(env.supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
