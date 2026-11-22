"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContext } from "@/lib/auth";
import type { ActionState } from "@/lib/validation";

/** Gutschein vor Ort verkaufen (z. B. bar bezahlt) – Code wird zum Ausdrucken/Weitergeben angezeigt */
export async function sellVoucherOnSite(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getContext();
  const p = z.object({
    amount: z.string().transform((v) => Number(v.replace(",", "."))).refine((n) => n >= 5 && n <= 5000, "Betrag zwischen 5 und 5.000 €"),
    recipient: z.string().max(100).optional().default(""),
  }).safeParse(Object.fromEntries(form));
  if (!p.success) return { message: p.error.issues[0].message };
  const { data, error } = await ctx.supabase.rpc("create_voucher", { p_company: ctx.companyId, p_amount: p.data.amount, p_recipient: p.data.recipient });
  if (error) return { message: error.message };
  revalidatePath("/app/gutscheine");
  return { ok: true, message: `Gutschein angelegt – Code: ${data}` };
}
