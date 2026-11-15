"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ACTIVE_COMPANY_COOKIE, getContext, requireAdmin } from "@/lib/auth";
import { companySchema, roleSchema, uuid, type ActionState } from "@/lib/validation";
import { emptyToNull } from "@/lib/utils";
import { normalizePricingConfig, SOILING_LEVELS, VEHICLE_CLASSES } from "@/lib/domain";
import { env } from "@/lib/env";

export async function switchCompany(form: FormData) {
  const id = uuid.safeParse(form.get("company_id"));
  if (!id.success) return;
  const ctx = await getContext();
  if (!ctx.memberships.some((m) => m.id === id.data)) return; // nur eigene Firmen
  (await cookies()).set(ACTIVE_COMPANY_COOKIE, id.data, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  redirect("/app");
}

export async function updateCompany(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireAdmin();
  const raw = emptyToNull(Object.fromEntries(form)) as Record<string, unknown>;
  const parsed = companySchema.safeParse({ ...raw, small_business: form.get("small_business") === "on", booking_enabled: form.get("booking_enabled") === "on" });
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  if (parsed.data.booking_enabled && !parsed.data.slug) return { message: "Für die Online-Anfrage bitte eine Adresse (z. B. „premium-detailing-koeln“) festlegen." };
  const { error } = await ctx.supabase.from("companies").update(parsed.data).eq("id", ctx.companyId);
  if (error) return { message: error.code === "23505" ? "Diese Adresse für die Buchungsseite ist schon vergeben." : error.message };
  revalidatePath("/app", "layout");
  return { ok: true, message: "Gespeichert." };
}

export async function updatePricingConfig(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getContext();
  if (!ctx.canEditPrices) return { message: "Du hast keine Berechtigung, Preise zu ändern." };
  const n = (k: string) => Number(String(form.get(k) ?? "").replace(",", "."));
  const cfg = normalizePricingConfig(ctx.company.pricing_config);
  const next = {
    hourlyRate: n("hourlyRate"),
    internalHourlyCost: n("internalHourlyCost"),
    vehicleClassFactors: Object.fromEntries(VEHICLE_CLASSES.map((c) => [c, n(`class_${c}`) / 100])),
    soilingFactors: Object.fromEntries(SOILING_LEVELS.map((s) => [s, n(`soil_${s}`) / 100])),
  };
  const all = [next.hourlyRate, next.internalHourlyCost, ...Object.values(next.vehicleClassFactors), ...Object.values(next.soilingFactors)];
  if (all.some((v) => !Number.isFinite(v) || v < 0 || v > 10_000)) return { message: "Bitte nur gültige Zahlen eingeben." };
  const { error } = await ctx.supabase.from("companies").update({ pricing_config: { ...cfg, ...next } }).eq("id", ctx.companyId);
  if (error) return { message: error.message };
  revalidatePath("/app/leistungen");
  return { ok: true, message: "Preisregeln gespeichert." };
}

export async function inviteMember(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireAdmin();
  const parsed = z.object({ email: z.string().trim().toLowerCase().email("Bitte eine gültige E-Mail-Adresse eingeben."), role: roleSchema.exclude(["owner"]) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  const { data, error } = await ctx.supabase.from("invitations")
    .insert({ company_id: ctx.companyId, email: parsed.data.email, role: parsed.data.role, invited_by: ctx.user.id })
    .select("token").single();
  if (error) return { message: error.message };
  revalidatePath("/app/einstellungen");
  // E-Mail-Versand ist noch nicht angebunden: Link wird angezeigt und kann manuell weitergegeben werden.
  return { ok: true, message: `Einladungslink: ${env.appUrl}/einladung/${data.token}` };
}

export async function removeMember(form: FormData) {
  const ctx = await requireAdmin();
  const id = uuid.parse(form.get("id"));
  await ctx.supabase.from("memberships").delete().eq("id", id);
  revalidatePath("/app/einstellungen");
}

export async function updateMemberRole(form: FormData) {
  const ctx = await requireAdmin();
  const id = uuid.parse(form.get("id"));
  const role = roleSchema.exclude(["owner"]).parse(form.get("role"));
  await ctx.supabase.from("memberships").update({ role, can_edit_prices: form.get("can_edit_prices") === "on" }).eq("id", id);
  revalidatePath("/app/einstellungen");
}

export async function acceptInvitation(form: FormData) {
  const token = z.string().min(32).max(100).parse(form.get("token"));
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { invite_token: token });
  if (error) redirect(`/einladung/${token}?fehler=${encodeURIComponent(error.message)}`);
  (await cookies()).set(ACTIVE_COMPANY_COOKIE, data as string, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  redirect("/app");
}
