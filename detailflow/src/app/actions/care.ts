"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { uuid, type ActionState } from "@/lib/validation";

export async function saveCarePlan(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireAdmin();
  const p = z.object({
    name: z.string().trim().min(2, "Bitte einen Namen angeben.").max(80),
    description: z.string().trim().max(1000).optional().default(""),
    price: z.string().transform((v) => Math.round(Number(v.replace(",", ".")) * 100)).refine((n) => n >= 100 && n <= 100000, "Preis zwischen 1 und 1.000 € pro Monat"),
  }).safeParse(Object.fromEntries(form));
  if (!p.success) return { message: p.error.issues[0].message };
  const { error } = await ctx.supabase.from("care_plans").insert({ company_id: ctx.companyId, name: p.data.name, description: p.data.description || null, price_cents: p.data.price });
  if (error) return { message: error.message };
  revalidatePath("/app/einstellungen");
  return { ok: true, message: "Abo-Angebot angelegt." };
}

export async function toggleCarePlan(form: FormData) {
  const ctx = await requireAdmin();
  await ctx.supabase.from("care_plans").update({ active: form.get("active") === "true" }).eq("id", uuid.parse(form.get("id")));
  revalidatePath("/app/einstellungen");
}
