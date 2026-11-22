"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "../auth/session";
import { PROVIDER_INFO, type ProviderKey } from "../config/providers";
import { DEMO_DEFINITIONS } from "../demo/definitions";
import { getStore } from "../store";
import type { FormState } from "../auth/actions";

const PricingForm = z.object({
  fullCheckCost: z.coerce.number().int().min(1).max(10),
  vehicleHistoryPriceCents: z.coerce.number().int().min(0).max(100000),
  packages: z
    .array(z.object({ id: z.string().regex(/^[a-z0-9_-]{1,20}$/), label: z.string().min(1).max(40), tokens: z.coerce.number().int().min(1).max(500), priceCents: z.coerce.number().int().min(50).max(1_000_000) }))
    .min(1)
    .max(6),
});

export async function savePricingAction(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const packages = [0, 1, 2, 3, 4, 5]
    .map((i) => ({ id: fd.get(`p${i}_id`), label: fd.get(`p${i}_label`), tokens: fd.get(`p${i}_tokens`), priceCents: Math.round(Number(String(fd.get(`p${i}_price`) ?? "").replace(",", ".")) * 100) }))
    .filter((p) => p.id);
  const parsed = PricingForm.safeParse({ fullCheckCost: fd.get("fullCheckCost"), vehicleHistoryPriceCents: Math.round(Number(String(fd.get("vehicleHistoryPrice") ?? "0").replace(",", ".")) * 100), packages });
  if (!parsed.success) return { error: `Ungültige Eingabe: ${parsed.error.issues[0].path.join(".")} – ${parsed.error.issues[0].message}` };
  await getStore().setConfig({ pricing: parsed.data });
  revalidatePath("/", "layout");
  return { ok: true, message: "Preise gespeichert. Neue Käufe verwenden die neuen Preise." };
}

export async function toggleDemoAction(fd: FormData) {
  await requireAdmin();
  const slug = String(fd.get("slug"));
  if (!DEMO_DEFINITIONS.some((d) => d.slug === slug)) return;
  const cfg = await getStore().getConfig();
  const vis = { ...(cfg.demoVisibility ?? {}) };
  vis[slug] = vis[slug] === false;
  await getStore().setConfig({ demoVisibility: vis });
  revalidatePath("/admin");
}

export async function toggleProviderAction(fd: FormData) {
  await requireAdmin();
  const key = String(fd.get("key")) as ProviderKey;
  if (!(key in PROVIDER_INFO)) return;
  const cfg = await getStore().getConfig();
  const p = { ...(cfg.providers ?? {}) };
  p[key] = p[key] === false;
  await getStore().setConfig({ providers: p });
  revalidatePath("/admin");
}
