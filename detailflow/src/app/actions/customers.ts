"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/auth";
import { customerSchema, fieldErrors, uuid, type ActionState } from "@/lib/validation";

function parse(form: FormData) {
  return customerSchema.safeParse(Object.fromEntries(form));
}

export async function createCustomer(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getContext();
  const parsed = parse(form);
  if (!parsed.success) return { message: "Bitte prüfe die markierten Felder.", errors: fieldErrors(parsed.error) };
  const { data, error } = await ctx.supabase.from("customers").insert({ ...parsed.data, company_id: ctx.companyId }).select("id").single();
  if (error) return { message: "Speichern fehlgeschlagen: " + error.message };
  revalidatePath("/app/kunden");
  if (form.get("einrichtung")) redirect(`/app/fahrzeuge/neu?kunde=${data.id}&einrichtung=1`);
  redirect(`/app/kunden/${data.id}`);
}

export async function updateCustomer(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getContext();
  const id = uuid.parse(form.get("id"));
  const parsed = parse(form);
  if (!parsed.success) return { message: "Bitte prüfe die markierten Felder.", errors: fieldErrors(parsed.error) };
  const { error } = await ctx.supabase.from("customers").update(parsed.data).eq("id", id);
  if (error) return { message: "Speichern fehlgeschlagen: " + error.message };
  revalidatePath(`/app/kunden/${id}`);
  return { ok: true, message: "Änderungen gespeichert." };
}

export async function deleteCustomer(form: FormData) {
  const ctx = await getContext();
  const id = uuid.parse(form.get("id"));
  const { error, count } = await ctx.supabase.from("customers").delete({ count: "exact" }).eq("id", id);
  if (error) redirect(`/app/kunden/${id}?fehler=${encodeURIComponent(error.code === "23503" ? "Der Kunde hat noch Angebote oder Aufträge und kann nicht gelöscht werden." : error.message)}`);
  if (!count) redirect(`/app/kunden/${id}?fehler=${encodeURIComponent("Keine Berechtigung zum Löschen.")}`);
  revalidatePath("/app/kunden");
  redirect("/app/kunden");
}

export async function mergeCustomers(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getContext();
  const source = uuid.safeParse(form.get("source_id"));
  const target = uuid.safeParse(form.get("target_id"));
  if (!source.success || !target.success) return { message: "Bitte einen Kunden auswählen." };
  const { error } = await ctx.supabase.rpc("merge_customers", { source_id: source.data, target_id: target.data });
  if (error) return { message: error.message };
  revalidatePath("/app/kunden");
  redirect(`/app/kunden/${target.data}`);
}
