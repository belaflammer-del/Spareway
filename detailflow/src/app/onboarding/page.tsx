import Link from "next/link";
import { redirect } from "next/navigation";
import { Check } from "lucide-react";
import { Logo } from "@/components/logo";
import { Card, buttonClass } from "@/components/ui";
import { CompanyStep, ContactStep, OpeningHoursForm, PricesStep, ServicesStep } from "@/components/onboarding-forms";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/auth";
import { DEFAULT_OPENING_HOURS, normalizePricingConfig } from "@/lib/domain";
import { finishOnboarding } from "@/app/actions/onboarding";

export const metadata = { title: "Einrichtung" };

const STEPS = ["Firma", "Kontakt & Logo", "Leistungen", "Preise", "Öffnungszeiten", "Erster Kunde", "Erster Auftrag"];

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ schritt?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { count } = await supabase.from("memberships").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  const hasCompany = (count ?? 0) > 0;
  let step = Math.min(7, Math.max(1, Number((await searchParams).schritt ?? 1) || 1));
  if (!hasCompany) step = 1;
  if (hasCompany && step === 1) step = 2;

  const titles: Record<number, [string, string]> = {
    1: ["Willkommen bei DetailFlow", "Lass uns deinen Betrieb in wenigen Minuten einrichten."],
    2: ["Kontaktdaten", "Diese Angaben erscheinen auf deinen Angeboten."],
    3: ["Welche Leistungen bietest du an?", "Ausgewählte Leistungen erscheinen im Kalkulator."],
    4: ["Deine Preise", "Du bestimmst die Preise – DetailFlow gibt keine Marktpreise vor."],
    5: ["Öffnungszeiten", "Hilft bei der Terminplanung."],
    6: ["Lege deinen ersten Kunden an", "Danach kannst du direkt ein Angebot oder einen Auftrag erstellen."],
    7: ["Fertig eingerichtet!", "Du kannst jetzt deinen ersten Auftrag erstellen."],
  };

  let body: React.ReactNode = null;
  if (step === 1) body = <CompanyStep />;
  else {
    const ctx = await getContext();
    if (step === 2) body = <ContactStep company={ctx.company as unknown as Record<string, string | boolean | null>} />;
    if (step === 3 || step === 4) {
      const { data } = await ctx.supabase.from("services")
        .select("id, name, active, base_price, duration_minutes, sort, service_categories(name, sort)")
        .eq("company_id", ctx.companyId).order("sort");
      const services = (data ?? [])
        .map((s) => ({ ...s, base_price: Number(s.base_price), category: (s.service_categories as unknown as { name: string; sort: number })?.name ?? "Sonstiges", csort: (s.service_categories as unknown as { sort: number })?.sort ?? 99 }))
        .sort((a, b) => a.csort - b.csort || a.sort - b.sort);
      body = step === 3 ? <ServicesStep services={services} /> : <PricesStep services={services.filter((s) => s.active)} hourlyRate={normalizePricingConfig(ctx.company.pricing_config).hourlyRate} />;
    }
    if (step === 5) body = <OpeningHoursForm hours={Object.keys(ctx.company.opening_hours ?? {}).length ? ctx.company.opening_hours : DEFAULT_OPENING_HOURS} />;
    if (step === 6) body = (
      <div className="flex flex-wrap gap-2">
        <Link href="/app/kunden/neu?einrichtung=1" className={buttonClass("primary")}>Ersten Kunden anlegen</Link>
        <Link href="/onboarding?schritt=7" className={buttonClass("ghost")}>Überspringen</Link>
      </div>
    );
    if (step === 7) body = (
      <form action={finishOnboarding} className="flex flex-wrap gap-2">
        <button formAction={finishOnboarding} className={buttonClass("primary")}>Zum Dashboard</button>
        <Link href="/app/angebote/neu?ziel=order" className={buttonClass("secondary")}>Ersten Auftrag erstellen</Link>
      </form>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Logo className="mb-8" />
      <ol className="mb-6 flex flex-wrap gap-x-4 gap-y-2 text-xs">
        {STEPS.map((s, i) => (
          <li key={s} className={`flex items-center gap-1.5 ${i + 1 === step ? "font-medium text-foreground" : "text-muted-foreground"}`}>
            <span className={`flex size-5 items-center justify-center rounded-full text-[10px] ${i + 1 < step ? "bg-accent text-accent-foreground" : i + 1 === step ? "bg-foreground text-background" : "bg-muted"}`}>
              {i + 1 < step ? <Check className="size-3" /> : i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>
      <Card className="p-6 animate-in">
        <h1 className="text-xl font-semibold">{titles[step][0]}</h1>
        <p className="mb-6 mt-1 text-sm text-muted-foreground">{titles[step][1]}</p>
        {body}
      </Card>
      {step > 2 && step < 7 && (
        <p className="mt-4 text-center text-sm"><Link href={`/onboarding?schritt=${step + 1}`} className="text-muted-foreground hover:text-foreground">Schritt überspringen</Link></p>
      )}
    </div>
  );
}
