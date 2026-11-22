import "server-only";
import type { AppContext } from "./auth";
import type { PricedPackage, PricedService } from "./pricing";

export type CatalogService = PricedService & { category_id: string | null; category: string; category_sort: number; active: boolean; sort: number; description: string | null; internal_notes: string | null };

export async function loadCatalog(ctx: AppContext, { onlyActive = true } = {}) {
  let sq = ctx.supabase.from("services").select("*, service_categories(name, sort)").eq("company_id", ctx.companyId);
  if (onlyActive) sq = sq.eq("active", true);
  let pq = ctx.supabase.from("packages").select("*, package_items(service_id)").eq("company_id", ctx.companyId).order("created_at");
  if (onlyActive) pq = pq.eq("active", true);
  const [{ data: s }, { data: p }, { data: cats }] = await Promise.all([
    sq, pq, ctx.supabase.from("service_categories").select("id, name, sort").eq("company_id", ctx.companyId).order("sort"),
  ]);
  const services: CatalogService[] = (s ?? []).map((x) => {
    const cat = x.service_categories as unknown as { name: string; sort: number } | null;
    return {
      ...x,
      base_price: Number(x.base_price),
      hourly_rate: x.hourly_rate == null ? null : Number(x.hourly_rate),
      material_cost: Number(x.material_cost),
      min_price: x.min_price == null ? null : Number(x.min_price),
      tax_rate: x.tax_rate == null ? null : Number(x.tax_rate),
      category: cat?.name ?? "Sonstiges",
      category_sort: cat?.sort ?? 99,
    };
  }).sort((a, b) => a.category_sort - b.category_sort || a.sort - b.sort || a.name.localeCompare(b.name));
  const packages: (PricedPackage & { active: boolean })[] = (p ?? []).map((x) => ({
    id: x.id, name: x.name, description: x.description, price_mode: x.price_mode, active: x.active,
    fixed_price: x.fixed_price == null ? null : Number(x.fixed_price),
    discount_percent: Number(x.discount_percent),
    service_ids: (x.package_items as { service_id: string }[]).map((i) => i.service_id),
  }));
  return { services, packages, categories: cats ?? [] };
}
