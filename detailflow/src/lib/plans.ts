import "server-only";
import type { AppContext } from "./auth";

/** Prüft, ob der Tarif der Firma eine Funktion enthält (Funktionsliste kommt aus der Tabelle `plans`). */
export async function hasFeature(ctx: AppContext, feature: string) {
  const { data } = await ctx.supabase.from("plans").select("features").eq("id", ctx.company.plan).maybeSingle();
  return Array.isArray(data?.features) && (data!.features as string[]).includes(feature);
}
