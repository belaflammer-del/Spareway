"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContext } from "@/lib/auth";
import { orderStatusSchema, uuid, type ActionState } from "@/lib/validation";
import { berlinLocalToISO, berlinParts, berlinToDate } from "@/lib/time";

export async function setOrderStatus(form: FormData) {
  const ctx = await getContext();
  const id = uuid.parse(form.get("id"));
  const status = orderStatusSchema.parse(form.get("status"));
  await ctx.supabase.from("orders").update({ status }).eq("id", id);
  revalidatePath(`/app/auftraege/${id}`);
  revalidatePath("/app/auftraege");
  revalidatePath("/app");
}

const updateSchema = z.object({
  assigned_to: z.string().optional().transform((v) => (v ? v : null)),
  workstation_id: z.string().optional().transform((v) => (v ? v : null)),
  scheduled_start: z.string().optional().transform((v) => berlinLocalToISO(v)),
  scheduled_end: z.string().optional().transform((v) => berlinLocalToISO(v)),
  actual_minutes: z.union([z.literal(""), z.coerce.number().int().min(0).max(100_000)]).optional().transform((v) => (v === "" || v == null ? null : v)),
  internal_notes: z.string().max(8000).optional().transform((v) => (v ? v : null)),
});

export async function updateOrder(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getContext();
  const id = uuid.parse(form.get("id"));
  const parsed = updateSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: "Bitte prüfe die Eingaben." };
  const d = parsed.data;
  if (d.scheduled_start && d.scheduled_end && d.scheduled_end < d.scheduled_start) return { message: "Das Ende muss nach dem Beginn liegen." };
  if (d.assigned_to) {
    const { data: m } = await ctx.supabase.from("memberships").select("user_id").eq("company_id", ctx.companyId).eq("user_id", d.assigned_to).maybeSingle();
    if (!m) return { message: "Dieser Mitarbeiter gehört nicht zu deiner Firma." };
  }
  const { data: cur } = await ctx.supabase.from("orders").select("status").eq("id", id).single();
  const patch: Record<string, unknown> = { ...d };
  if (d.scheduled_start && cur && ["anfrage", "angebot_erstellt", "bestaetigt"].includes(cur.status)) patch.status = "geplant";
  const { error } = await ctx.supabase.from("orders").update(patch).eq("id", id);
  if (error) {
    if (error.code === "23P01") return { message: "Diese Box ist im gewählten Zeitraum schon belegt. Bitte andere Zeit oder Box wählen." };
    return { message: error.message };
  }

  // Überschneidungen erkennen (gleicher Mitarbeiter, überlappender Zeitraum).
  // Doppelbelegung einer Box verhindert bereits die Datenbank (Exclusion Constraint).
  let warning = "";
  if (d.scheduled_start && d.scheduled_end && d.assigned_to) {
    let q = ctx.supabase.from("orders").select("number").neq("id", id).not("status", "in", "(storniert,abgeschlossen)")
      .lt("scheduled_start", d.scheduled_end).gt("scheduled_end", d.scheduled_start);
    q = q.eq("assigned_to", d.assigned_to);
    const { data: clashes } = await q.limit(5);
    if (clashes?.length) warning = ` Achtung: Der Mitarbeiter ist zur gleichen Zeit bei ${clashes.map((c) => c.number).join(", ")} eingeplant.`;
  }
  revalidatePath(`/app/auftraege/${id}`);
  revalidatePath("/app/kalender");
  return { ok: !warning, message: "Gespeichert." + warning };
}

export async function toggleOrderItem(form: FormData) {
  const ctx = await getContext();
  const id = uuid.parse(form.get("item_id"));
  const orderId = uuid.parse(form.get("order_id"));
  await ctx.supabase.from("order_items").update({ done: form.get("done") === "true" }).eq("id", id);
  revalidatePath(`/app/auftraege/${orderId}`);
}

/** Termin per Drag & Drop verschieben (Dauer bleibt erhalten). workstation: undefined = unverändert, null = ohne Box */
export async function moveOrder(input: { id: string; day: string; minutes?: number; workstation?: string | null }): Promise<{ ok: boolean; message?: string }> {
  const ctx = await getContext();
  const p = z.object({
    id: uuid, day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), minutes: z.number().int().min(0).max(24 * 60 - 1).optional(),
    workstation: uuid.nullable().optional(),
  }).safeParse(input);
  if (!p.success) return { ok: false, message: "Ungültige Eingabe." };
  const { data: o } = await ctx.supabase.from("orders").select("scheduled_start, scheduled_end, status").eq("id", p.data.id).maybeSingle();
  if (!o?.scheduled_start) return { ok: false, message: "Auftrag nicht gefunden." };
  const oldStart = new Date(o.scheduled_start);
  const duration = o.scheduled_end ? new Date(o.scheduled_end).getTime() - oldStart.getTime() : 60 * 60_000;
  const keep = berlinParts(oldStart);
  const mins = p.data.minutes ?? keep.hour * 60 + keep.minute;
  const [y, m, d] = p.data.day.split("-").map(Number);
  const start = berlinToDate(y, m, d, Math.floor(mins / 60), mins % 60);
  const patch: Record<string, unknown> = { scheduled_start: start.toISOString(), scheduled_end: new Date(start.getTime() + duration).toISOString() };
  if (p.data.workstation !== undefined) patch.workstation_id = p.data.workstation;
  const { error } = await ctx.supabase.from("orders").update(patch).eq("id", p.data.id);
  if (error) return { ok: false, message: error.code === "23P01" ? "Die Box ist zu dieser Zeit schon belegt." : error.message };
  revalidatePath("/app/kalender");
  revalidatePath(`/app/auftraege/${p.data.id}`);
  return { ok: true };
}
