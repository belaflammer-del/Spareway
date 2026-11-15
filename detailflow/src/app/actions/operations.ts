"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContext } from "@/lib/auth";
import { uuid, type ActionState } from "@/lib/validation";


const ALLOWED = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
const MAX_BYTES = 8 * 1024 * 1024;
const categorySchema = z.enum(["vorher", "waehrend", "nachher", "schaden", "verschmutzung", "endkontrolle"]);

/** Fotos hochladen: Pfad = <company_id>/orders/<order_id>/<zufall>.<ext>; Storage-RLS und DB-Check erzwingen den Ordner. */
export async function uploadPhotos(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getContext();
  const orderId = uuid.parse(form.get("order_id"));
  const category = categorySchema.safeParse(form.get("category"));
  if (!category.success) return { message: "Bitte eine Kategorie wählen." };
  const caption = String(form.get("caption") ?? "").trim().slice(0, 300) || null;
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { message: "Bitte mindestens ein Foto auswählen." };
  if (files.length > 10) return { message: "Bitte höchstens 10 Fotos auf einmal hochladen." };

  const { data: order } = await ctx.supabase.from("orders").select("id, vehicle_id").eq("id", orderId).maybeSingle();
  if (!order) return { message: "Auftrag nicht gefunden." };

  let ok = 0;
  for (const file of files) {
    const ext = ALLOWED[file.type as keyof typeof ALLOWED];
    if (!ext) return { message: `„${file.name}“: Bitte JPG, PNG oder WebP verwenden. (iPhone: Einstellungen › Kamera › Formate › „Maximale Kompatibilität“)` };
    if (file.size > MAX_BYTES) return { message: `„${file.name}“ ist größer als 8 MB.` };
    const path = `${ctx.companyId}/orders/${orderId}/${randomUUID()}.${ext}`;
    const up = await ctx.supabase.storage.from("company-files").upload(path, file, { contentType: file.type });
    if (up.error) return { message: `Upload fehlgeschlagen: ${up.error.message}` };
    const { error } = await ctx.supabase.from("order_photos").insert({
      company_id: ctx.companyId, order_id: orderId, vehicle_id: order.vehicle_id, category: category.data, storage_path: path, caption, uploaded_by: ctx.user.id,
    });
    if (error) {
      await ctx.supabase.storage.from("company-files").remove([path]);
      return { message: `Foto konnte nicht gespeichert werden: ${error.message}` };
    }
    ok++;
  }
  revalidatePath(`/app/auftraege/${orderId}`);
  return { ok: true, message: `${ok} Foto${ok === 1 ? "" : "s"} gespeichert.` };
}

export async function deletePhoto(form: FormData) {
  const ctx = await getContext();
  const id = uuid.parse(form.get("id"));
  const { data } = await ctx.supabase.from("order_photos").delete().eq("id", id).select("storage_path, order_id").maybeSingle();
  if (data) {
    await ctx.supabase.storage.from("company-files").remove([data.storage_path]);
    revalidatePath(`/app/auftraege/${data.order_id}`);
  }
}

export async function addChecklist(form: FormData) {
  const ctx = await getContext();
  const orderId = uuid.parse(form.get("order_id"));
  const templateId = uuid.parse(form.get("template_id"));
  await ctx.supabase.rpc("add_checklist_to_order", { p_order: orderId, p_template: templateId });
  revalidatePath(`/app/auftraege/${orderId}`);
}

export async function toggleChecklistItem(form: FormData) {
  const ctx = await getContext();
  const id = uuid.parse(form.get("id"));
  await ctx.supabase.from("order_checklist_items").update({ done: form.get("done") === "true" }).eq("id", id);
  revalidatePath(`/app/auftraege/${uuid.parse(form.get("order_id"))}`);
}

export async function reportProblem(form: FormData) {
  const ctx = await getContext();
  const id = uuid.parse(form.get("id"));
  const problem = String(form.get("problem") ?? "").trim().slice(0, 1000) || null;
  await ctx.supabase.from("order_checklist_items").update({ problem }).eq("id", id);
  revalidatePath(`/app/auftraege/${uuid.parse(form.get("order_id"))}`);
}

export async function deleteChecklist(form: FormData) {
  const ctx = await getContext();
  await ctx.supabase.from("order_checklists").delete().eq("id", uuid.parse(form.get("id")));
  revalidatePath(`/app/auftraege/${uuid.parse(form.get("order_id"))}`);
}

// ---- Stammdaten: Boxen & Vorlagen (Inhaber/Admin/Büro; RLS erzwingt das) ----

export async function saveWorkstation(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getContext();
  const name = z.string().trim().min(1, "Bitte einen Namen angeben.").max(60).safeParse(form.get("name"));
  if (!name.success) return { message: name.error.issues[0].message };
  const { error } = await ctx.supabase.from("workstations").insert({ company_id: ctx.companyId, name: name.data, sort: 99 });
  if (error) return { message: error.code === "23505" ? "Diesen Namen gibt es schon." : error.code === "42501" ? "Keine Berechtigung." : error.message };
  revalidatePath("/app/einstellungen");
  return { ok: true, message: "Box angelegt." };
}

export async function toggleWorkstation(form: FormData) {
  const ctx = await getContext();
  await ctx.supabase.from("workstations").update({ active: form.get("active") === "true" }).eq("id", uuid.parse(form.get("id")));
  revalidatePath("/app/einstellungen");
}

export async function saveChecklistTemplate(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getContext();
  const id = form.get("id") ? uuid.parse(form.get("id")) : null;
  const parsed = z.object({
    name: z.string().trim().min(2, "Bitte einen Namen angeben.").max(80),
    items: z.string().transform((s) => s.split("\n").map((x) => x.trim()).filter(Boolean)).pipe(z.array(z.string().max(200)).min(1, "Bitte mindestens einen Schritt eintragen.").max(100)),
  }).safeParse({ name: form.get("name"), items: form.get("items") ?? "" });
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  const { error } = id
    ? await ctx.supabase.from("checklist_templates").update(parsed.data).eq("id", id)
    : await ctx.supabase.from("checklist_templates").insert({ ...parsed.data, company_id: ctx.companyId, sort: 99 });
  if (error) return { message: error.code === "23505" ? "Diesen Namen gibt es schon." : error.message };
  revalidatePath("/app/einstellungen");
  return { ok: true, message: "Vorlage gespeichert." };
}
