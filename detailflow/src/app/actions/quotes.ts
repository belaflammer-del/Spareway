"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/auth";
import { loadCatalog } from "@/lib/catalog";
import { calculate } from "@/lib/pricing";
import { normalizePricingConfig } from "@/lib/domain";
import { berlinLocalToISO } from "@/lib/time";
import { quoteCreateSchema, quoteStatusSchema, uuid, type ActionState } from "@/lib/validation";

/**
 * Speichert eine Kalkulation als Angebot oder direkt als Auftrag.
 * Der Preis wird serverseitig mit dem aktuellen Firmenkatalog neu berechnet –
 * vom Browser übermittelte Beträge werden nicht übernommen.
 */
export async function saveCalculation(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getContext();
  let payload: unknown;
  try { payload = JSON.parse(String(form.get("payload") ?? "")); } catch { return { message: "Ungültige Eingabe." }; }
  const parsed = quoteCreateSchema.safeParse(payload);
  if (!parsed.success) return { message: parsed.error.issues[0]?.path.includes("customer_id") ? "Bitte zuerst einen Kunden auswählen." : "Ungültige Eingabe: " + parsed.error.issues[0]?.message };
  const d = parsed.data;

  if (!ctx.canEditPrices && (d.calc.overrideNet != null || d.calc.discountPercent > 0)) {
    return { message: "Du hast keine Berechtigung, Rabatte zu geben oder den Preis manuell zu ändern." };
  }

  const catalog = await loadCatalog(ctx);
  const cfg = { ...normalizePricingConfig(ctx.company.pricing_config), travelCostPerKm: Number((ctx.company as unknown as { travel_cost_per_km?: number }).travel_cost_per_km ?? 0) };
  const result = calculate(d.calc, catalog, cfg, { default_tax_rate: Number(ctx.company.default_tax_rate), small_business: ctx.company.small_business });
  if (result.lines.length === 0) return { message: "Bitte mindestens eine Leistung oder ein Paket auswählen." };

  const items = result.lines.map((l) => ({
    service_id: l.serviceId ?? null, package_id: l.packageId ?? null, title: l.title,
    description: l.includes?.length ? `Enthält: ${l.includes.join(", ")}` : (l.description ?? null),
    quantity: l.quantity, unit_price_net: l.unitPriceNet, tax_rate: l.taxRate, total_net: l.totalNet,
  }));

  if (d.target === "order") {
    const startIso = berlinLocalToISO(d.scheduled_start);
    const start = startIso ? new Date(startIso) : null;
    const end = start ? new Date(start.getTime() + result.minutes * 60_000) : null;
    // Rabatt/Override als eigene Position abbilden, damit Positionen = Summe
    if (result.discountAmount !== 0) {
      items.push({ service_id: null, package_id: null, title: result.manualOverride ? "Preisanpassung" : `Rabatt ${result.discountPercent} %`, description: null, quantity: 1, unit_price_net: -result.discountAmount, tax_rate: result.taxes[0]?.rate ?? 0, total_net: -result.discountAmount });
    }
    const { data, error } = await ctx.supabase.rpc("create_order_with_items", {
      o: {
        company_id: ctx.companyId, customer_id: d.customer_id, vehicle_id: d.vehicle_id, status: start ? "geplant" : "bestaetigt",
        title: result.lines.slice(0, 3).map((l) => l.title.replace(/^Paket: /, "")).join(", "),
        scheduled_start: start?.toISOString() ?? null, scheduled_end: end?.toISOString() ?? null,
        estimated_minutes: result.minutes, total_net: result.netTotal, total_gross: result.grossTotal, material_cost: result.materialCost,
        internal_notes: d.notes,
      },
      items,
    });
    if (error) return { message: "Auftrag konnte nicht angelegt werden: " + error.message };
    revalidatePath("/app/auftraege");
    redirect(`/app/auftraege/${data}`);
  }

  if (d.quote_id) {
    const { error } = await ctx.supabase.rpc("update_quote_with_items", {
      p_id: d.quote_id,
      q: {
        customer_id: d.customer_id, vehicle_id: d.vehicle_id, vehicle_class: d.calc.vehicleClass, soiling_level: d.calc.soiling,
        discount_percent: result.discountPercent, calculation: { input: d.calc, result }, subtotal_net: result.netTotal, tax_total: result.taxTotal,
        total_gross: result.grossTotal, estimated_minutes: result.minutes, material_cost: result.materialCost, manual_override: result.manualOverride,
        intro_text: d.intro_text, notes: d.notes,
      },
      items,
    });
    if (error) return { message: "Angebot konnte nicht gespeichert werden: " + error.message };
    revalidatePath(`/app/angebote/${d.quote_id}`);
    redirect(`/app/angebote/${d.quote_id}`);
  }

  const validUntil = new Date(Date.now() + ctx.company.quote_validity_days * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await ctx.supabase.rpc("create_quote_with_items", {
    q: {
      company_id: ctx.companyId, customer_id: d.customer_id, vehicle_id: d.vehicle_id, vehicle_class: d.calc.vehicleClass,
      soiling_level: d.calc.soiling, discount_percent: result.discountPercent, calculation: { input: d.calc, result },
      subtotal_net: result.netTotal, tax_total: result.taxTotal, total_gross: result.grossTotal,
      estimated_minutes: result.minutes, material_cost: result.materialCost, manual_override: result.manualOverride,
      intro_text: d.intro_text, terms: ctx.company.quote_terms, notes: d.notes, valid_until: validUntil,
    },
    items,
  });
  if (error) return { message: "Angebot konnte nicht angelegt werden: " + error.message };
  revalidatePath("/app/angebote");
  redirect(`/app/angebote/${data}`);
}

const transitions: Record<string, string[]> = {
  draft: ["sent"],
  sent: ["accepted", "rejected", "expired", "draft"],
  expired: ["sent"],
  rejected: ["draft"],
  accepted: [],
};

export async function setQuoteStatus(form: FormData) {
  const ctx = await getContext();
  const id = uuid.parse(form.get("id"));
  const status = quoteStatusSchema.parse(form.get("status"));
  const { data: q } = await ctx.supabase.from("quotes").select("status").eq("id", id).single();
  if (!q || !transitions[q.status]?.includes(status)) redirect(`/app/angebote/${id}?fehler=${encodeURIComponent("Dieser Statuswechsel ist nicht möglich.")}`);
  const extra: Record<string, string | null> = {};
  if (status === "sent") extra.sent_at = new Date().toISOString();
  if (status === "accepted") extra.accepted_at = new Date().toISOString();
  if (status === "rejected") extra.rejected_at = new Date().toISOString();
  await ctx.supabase.from("quotes").update({ status, ...extra }).eq("id", id);
  revalidatePath(`/app/angebote/${id}`);
  revalidatePath("/app/angebote");
}

export async function convertQuote(form: FormData) {
  const ctx = await getContext();
  const id = uuid.parse(form.get("id"));
  const { data, error } = await ctx.supabase.rpc("convert_quote_to_order", { qid: id });
  if (error) redirect(`/app/angebote/${id}?fehler=${encodeURIComponent(error.message)}`);
  revalidatePath("/app/auftraege");
  redirect(`/app/auftraege/${data}`);
}

export async function deleteQuote(form: FormData) {
  const ctx = await getContext();
  const id = uuid.parse(form.get("id"));
  const { data: q } = await ctx.supabase.from("quotes").select("status").eq("id", id).single();
  if (q?.status !== "draft") redirect(`/app/angebote/${id}?fehler=${encodeURIComponent("Nur Entwürfe können gelöscht werden.")}`);
  const { count } = await ctx.supabase.from("quotes").delete({ count: "exact" }).eq("id", id);
  if (!count) redirect(`/app/angebote/${id}?fehler=${encodeURIComponent("Keine Berechtigung zum Löschen.")}`);
  revalidatePath("/app/angebote");
  redirect("/app/angebote");
}
