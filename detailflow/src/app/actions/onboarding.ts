"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_COMPANY_COOKIE, getContext } from "@/lib/auth";
import { companySchema, openingHoursSchema, type ActionState } from "@/lib/validation";
import { emptyToNull } from "@/lib/utils";
import { DAYS } from "@/lib/domain";

export async function createCompany(_: ActionState, form: FormData): Promise<ActionState> {
  const name = z.string().trim().min(2, "Bitte den Namen deines Betriebs angeben.").max(120).safeParse(form.get("name"));
  if (!name.success) return { message: name.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_company", { company_name: name.data });
  if (error) return { message: "Die Firma konnte nicht angelegt werden: " + error.message };
  (await cookies()).set(ACTIVE_COMPANY_COOKIE, data as string, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  // Empfehlungscode aus der Registrierung übernehmen
  const { data: { user } } = await supabase.auth.getUser();
  const ref = user?.user_metadata?.ref;
  if (typeof ref === "string" && /^[A-Z0-9]{8}$/.test(ref)) await supabase.rpc("apply_referral", { p_company: data, p_code: ref });
  redirect("/onboarding?schritt=2");
}

export async function saveContact(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getContext();
  const raw = emptyToNull(Object.fromEntries(form)) as Record<string, unknown>;
  const parsed = companySchema.pick({ street: true, zip: true, city: true, phone: true, email: true, website: true, legal_form: true, tax_id: true, vat_id: true, small_business: true })
    .safeParse({ ...raw, small_business: form.get("small_business") === "on" });
  if (!parsed.success) return { message: parsed.error.issues[0].message };

  const logo = form.get("logo");
  let logo_path: string | undefined;
  if (logo instanceof File && logo.size > 0) {
    if (logo.size > 1_000_000) return { message: "Das Logo darf maximal 1 MB groß sein." };
    if (!["image/png", "image/jpeg", "image/webp"].includes(logo.type)) return { message: "Bitte ein PNG-, JPG- oder WebP-Bild hochladen." };
    const ext = logo.type.split("/")[1];
    logo_path = `${ctx.companyId}/logo/logo-${Date.now()}.${ext}`;
    const { error } = await ctx.supabase.storage.from("company-files").upload(logo_path, logo, { contentType: logo.type, upsert: true });
    if (error) return { message: "Logo-Upload fehlgeschlagen: " + error.message };
  }
  const { error } = await ctx.supabase.from("companies").update({ ...parsed.data, ...(logo_path ? { logo_path } : {}) }).eq("id", ctx.companyId);
  if (error) return { message: error.message };
  redirect("/onboarding?schritt=3");
}

export async function saveServiceSelection(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getContext();
  const active = new Set(form.getAll("service").map(String));
  const { data: all } = await ctx.supabase.from("services").select("id, active").eq("company_id", ctx.companyId);
  const toEnable = (all ?? []).filter((s) => active.has(s.id) && !s.active).map((s) => s.id);
  const toDisable = (all ?? []).filter((s) => !active.has(s.id) && s.active).map((s) => s.id);
  if (toEnable.length) await ctx.supabase.from("services").update({ active: true }).in("id", toEnable);
  if (toDisable.length) await ctx.supabase.from("services").update({ active: false }).in("id", toDisable);
  redirect("/onboarding?schritt=4");
}

export async function savePrices(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getContext();
  const updates: { id: string; base_price: number; duration_minutes: number }[] = [];
  for (const [key, value] of form.entries()) {
    const m = key.match(/^price:(.+)$/);
    if (!m) continue;
    const price = Number(String(value).replace(",", ".") || 0);
    const duration = Number(form.get(`duration:${m[1]}`) ?? 0);
    if (!Number.isFinite(price) || price < 0) return { message: "Bitte nur gültige Preise eingeben." };
    updates.push({ id: m[1], base_price: price, duration_minutes: Math.max(0, Math.round(duration || 0)) });
  }
  const hourly = Number(String(form.get("hourlyRate") ?? "").replace(",", "."));
  for (const u of updates) {
    const { error } = await ctx.supabase.from("services").update({ base_price: u.base_price, duration_minutes: u.duration_minutes }).eq("id", u.id);
    if (error) return { message: error.message };
  }
  if (Number.isFinite(hourly) && hourly > 0) {
    const cfg = { ...(ctx.company.pricing_config as object), hourlyRate: hourly };
    await ctx.supabase.from("companies").update({ pricing_config: cfg }).eq("id", ctx.companyId);
  }
  redirect("/onboarding?schritt=5");
}

export async function saveOpeningHours(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getContext();
  const parsed = parseOpeningHours(form);
  if (!parsed.success) return { message: "Bitte gültige Uhrzeiten (HH:MM) eingeben." };
  const { error } = await ctx.supabase.from("companies").update({ opening_hours: parsed.data }).eq("id", ctx.companyId);
  if (error) return { message: error.message };
  if (form.get("from_settings")) {
    revalidatePath("/app/einstellungen");
    return { ok: true, message: "Öffnungszeiten gespeichert." };
  }
  redirect("/onboarding?schritt=6");
}

export async function finishOnboarding() {
  const ctx = await getContext();
  await ctx.supabase.from("companies").update({ onboarding_completed: true }).eq("id", ctx.companyId);
  redirect("/app");
}


function parseOpeningHours(form: FormData) {
  const hours: Record<string, { open: boolean; from: string; to: string }> = {};
  for (const [key] of DAYS) {
    hours[key] = { open: form.get(`${key}_open`) === "on", from: String(form.get(`${key}_from`) || "08:00"), to: String(form.get(`${key}_to`) || "18:00") };
  }
  return openingHoursSchema.safeParse(hours);
}
