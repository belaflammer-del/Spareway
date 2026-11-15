"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/auth";
import { fieldErrors, uuid, vehicleSchema, type ActionState } from "@/lib/validation";

export async function createVehicle(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getContext();
  const parsed = vehicleSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: "Bitte prüfe die markierten Felder.", errors: fieldErrors(parsed.error) };
  const { data, error } = await ctx.supabase.from("vehicles").insert({ ...parsed.data, company_id: ctx.companyId }).select("id").single();
  if (error) return { message: "Speichern fehlgeschlagen: " + error.message };
  revalidatePath("/app/fahrzeuge");
  if (form.get("einrichtung")) redirect(`/app/angebote/neu?kunde=${parsed.data.customer_id ?? ""}&fahrzeug=${data.id}&ziel=order&einrichtung=1`);
  redirect(parsed.data.customer_id ? `/app/kunden/${parsed.data.customer_id}` : `/app/fahrzeuge/${data.id}`);
}

export async function updateVehicle(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getContext();
  const id = uuid.parse(form.get("id"));
  const parsed = vehicleSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: "Bitte prüfe die markierten Felder.", errors: fieldErrors(parsed.error) };
  const { error } = await ctx.supabase.from("vehicles").update(parsed.data).eq("id", id);
  if (error) return { message: "Speichern fehlgeschlagen: " + error.message };
  revalidatePath(`/app/fahrzeuge/${id}`);
  return { ok: true, message: "Änderungen gespeichert." };
}

export async function deleteVehicle(form: FormData) {
  const ctx = await getContext();
  const id = uuid.parse(form.get("id"));
  const { count } = await ctx.supabase.from("vehicles").delete({ count: "exact" }).eq("id", id);
  if (!count) redirect(`/app/fahrzeuge/${id}?fehler=${encodeURIComponent("Löschen nicht möglich (fehlende Berechtigung).")}`);
  revalidatePath("/app/fahrzeuge");
  redirect("/app/fahrzeuge");
}
