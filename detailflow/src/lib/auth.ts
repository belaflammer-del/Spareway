import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/domain";

export const ACTIVE_COMPANY_COOKIE = "df_company";

export type Company = {
  id: string;
  name: string;
  legal_form: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logo_path: string | null;
  tax_id: string | null;
  vat_id: string | null;
  small_business: boolean;
  default_tax_rate: number;
  currency: string;
  bank_name: string | null;
  iban: string | null;
  bic: string | null;
  opening_hours: Record<string, { open: boolean; from: string; to: string }>;
  pricing_config: unknown;
  quote_prefix: string;
  order_prefix: string;
  invoice_prefix: string;
  quote_validity_days: number;
  quote_terms: string;
  plan: "starter" | "professional" | "business";
  onboarding_completed: boolean;
};

export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
});

/**
 * Lädt den angemeldeten Benutzer und die aktive Firma.
 * Die Firmen-ID aus dem Cookie wird gegen die Mitgliedschaften geprüft – sie ist nur eine Auswahl,
 * keine Berechtigung. Die eigentliche Zugriffskontrolle erfolgt per RLS in der Datenbank.
 */
export const getContext = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("memberships")
    .select("company_id, role, can_edit_prices, companies(*)")
    .eq("user_id", user.id)
    .order("created_at");

  if (!memberships?.length) redirect("/onboarding");

  const wanted = (await cookies()).get(ACTIVE_COMPANY_COOKIE)?.value;
  const m = memberships.find((x) => x.company_id === wanted) ?? memberships[0];
  const company = m.companies as unknown as Company;
  const role = m.role as Role;

  return {
    supabase,
    user,
    company,
    companyId: m.company_id as string,
    role,
    canEditPrices: role === "owner" || role === "admin" || Boolean(m.can_edit_prices),
    isAdmin: role === "owner" || role === "admin",
    memberships: memberships.map((x) => ({ id: x.company_id as string, name: (x.companies as unknown as Company).name, role: x.role as Role })),
  };
});

export type AppContext = Awaited<ReturnType<typeof getContext>>;

export async function requireAdmin() {
  const ctx = await getContext();
  if (!ctx.isAdmin) throw new Error("Für diese Aktion sind Administratorrechte erforderlich.");
  return ctx;
}
