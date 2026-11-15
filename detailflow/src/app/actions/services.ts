"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/auth";
import { fieldErrors, packageSchema, serviceSchema, uuid, type ActionState } from "@/lib/validation";
import { VEHICLE_CLASSES } from "@/lib/domain";

async function requirePriceRights() {
  const ctx = await getContext();
  if (!ctx.canEditPrices) throw new Error("Keine Berechtigung, Leistungen und Preise zu bearbeiten.");
  return ctx;
}

function parseService(form: FormData) {
  const surcharges: Record<string, number> = {};
  for (const c of VEHICLE_CLASSES) {
    const raw = String(form.get(`surcharge_${c}`) ?? "").trim();
    if (raw !== "") {
      const n = Number(raw.replace(",", "."));
      if (Number.isFinite(n) && n >= 0) surcharges[c] = n;
    }
  }
  const parsed = serviceSchema.safeParse({
    ...Object.fromEntries(form),
    applies_vehicle_class: form.get("applies_vehicle_class") === "on",
    applies_soiling: form.get("applies_soiling") === "on",
    active: form.get("active") === "on",
  });
  return { parsed, surcharges };
}

export async function saveService(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requirePriceRights();
  const id = form.get("id") ? uuid.parse(form.get("id")) : null;
  const { parsed, surcharges } = parseService(form);
  if (!parsed.success) return { message: "Bitte prüfe die Eingaben.", errors: fieldErrors(parsed.error) };
  const row = { ...parsed.data, size_surcharges: surcharges };
  if (id) {
    const { error } = await ctx.supabase.from("services").update(row).eq("id", id);
    if (error) return { message: error.message };
    revalidatePath("/app/leistungen");
    return { ok: true, message: "Gespeichert." };
  }
  const { error } = await ctx.supabase.from("services").insert({ ...row, company_id: ctx.companyId, sort: 999 });
  if (error) return { message: error.message };
  revalidatePath("/app/leistungen");
  redirect("/app/leistungen");
}

export async function quickUpdatePrice(form: FormData) {
  const ctx = await requirePriceRights();
  const id = uuid.parse(form.get("id"));
  const price = Number(String(form.get("base_price") ?? "").replace(",", "."));
  if (!Number.isFinite(price) || price < 0) return;
  await ctx.supabase.from("services").update({ base_price: price }).eq("id", id);
  revalidatePath("/app/leistungen");
}

export async function toggleService(form: FormData) {
  const ctx = await requirePriceRights();
  const id = uuid.parse(form.get("id"));
  await ctx.supabase.from("services").update({ active: form.get("active") === "true" }).eq("id", id);
  revalidatePath("/app/leistungen");
}

export async function savePackage(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requirePriceRights();
  const id = form.get("id") ? uuid.parse(form.get("id")) : null;
  const parsed = packageSchema.safeParse({
    ...Object.fromEntries(form),
    active: form.get("active") === "on",
    service_ids: form.getAll("service_ids").map(String),
  });
  if (!parsed.success) return { message: "Bitte prüfe die Eingaben.", errors: fieldErrors(parsed.error) };
  if (parsed.data.price_mode === "fixed" && parsed.data.fixed_price == null) return { message: "Bitte einen Festpreis angeben.", errors: { fixed_price: "Pflichtfeld bei Festpreis" } };
  const { service_ids, ...pkg } = parsed.data;
  let pid = id;
  if (pid) {
    const { error } = await ctx.supabase.from("packages").update(pkg).eq("id", pid);
    if (error) return { message: error.message };
    await ctx.supabase.from("package_items").delete().eq("package_id", pid);
  } else {
    const { data, error } = await ctx.supabase.from("packages").insert({ ...pkg, company_id: ctx.companyId }).select("id").single();
    if (error) return { message: error.message };
    pid = data.id;
  }
  if (service_ids.length) {
    const { error } = await ctx.supabase.from("package_items").insert(service_ids.map((sid) => ({ package_id: pid, service_id: sid, company_id: ctx.companyId })));
    if (error) return { message: error.message };
  }
  revalidatePath("/app/leistungen/pakete");
  return { ok: true, message: "Paket gespeichert." };
}

export async function deletePackage(form: FormData) {
  const ctx = await requirePriceRights();
  await ctx.supabase.from("packages").delete().eq("id", uuid.parse(form.get("id")));
  revalidatePath("/app/leistungen/pakete");
}
