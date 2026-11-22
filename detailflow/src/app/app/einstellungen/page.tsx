import { Badge, Card, CardHeader, Notice, PageHeader, buttonClass } from "@/components/ui";
import { CompanyForm, InviteForm } from "@/components/settings-forms";
import { OpeningHoursForm } from "@/components/onboarding-forms";
import { ConfirmSubmit } from "@/components/confirm-button";
import { getContext } from "@/lib/auth";
import { DEFAULT_OPENING_HOURS, ROLE_LABELS, type Role } from "@/lib/domain";
import { formatDate, formatEUR } from "@/lib/utils";
import { isStripeConfigured } from "@/lib/env";
import { removeMember, updateMemberRole } from "@/app/actions/company";
import { toggleWorkstation } from "@/app/actions/operations";
import { connectStripe, openBillingPortal, refreshStripeStatus, startSubscription } from "@/app/actions/billing";
import { toggleCarePlan } from "@/app/actions/care";
import { CarePlanForm } from "@/components/care-forms";
import { CopyButton } from "@/components/print-button";
import { env } from "@/lib/env";
import { formatShare } from "@/lib/revenue-share";
import { currentFeeMonth } from "@/lib/stripe";
import { ChecklistTemplateForm, WorkstationForm } from "@/components/operations-settings";

export const metadata = { title: "Einstellungen" };

export default async function Settings({ searchParams }: { searchParams: Promise<{ stripe?: string; zahlung?: string; abo?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  if (sp.stripe === "zurueck" && ctx.isAdmin) await refreshStripeStatus();
  const [{ data: members }, { data: invites }, { data: plans }, { data: boxes }, { data: templates }] = await Promise.all([
    ctx.supabase.from("memberships").select("id, user_id, role, can_edit_prices, created_at").eq("company_id", ctx.companyId).order("created_at"),
    ctx.isAdmin ? ctx.supabase.from("invitations").select("id, email, role, expires_at, accepted_at").eq("company_id", ctx.companyId).is("accepted_at", null).order("created_at", { ascending: false }) : Promise.resolve({ data: [] as { id: string; email: string; role: string; expires_at: string }[] }),
    ctx.supabase.from("plans").select("*").order("price_monthly_cents"),
    ctx.supabase.from("workstations").select("id, name, active").eq("company_id", ctx.companyId).order("sort"),
    ctx.supabase.from("checklist_templates").select("id, name, items").eq("company_id", ctx.companyId).order("sort"),
  ]);
  const canManage = ctx.role !== "staff";
  const co = ctx.company as unknown as { stripe_account_id: string | null; stripe_charges_enabled: boolean; subscription_status: string | null; stripe_customer_id: string | null };
  const { data: fees } = ctx.isAdmin ? await ctx.supabase.from("platform_fees").select("gross_cents, fee_cents").eq("month", currentFeeMonth()) : { data: [] as { gross_cents: number; fee_cents: number }[] };
  const feeSum = (fees ?? []).reduce((a, f) => a + f.fee_cents, 0) / 100;
  const [{ data: carePlans }, { data: careSubs }, { data: refs }] = await Promise.all([
    ctx.supabase.from("care_plans").select("id, name, price_cents, active").eq("company_id", ctx.companyId).order("created_at"),
    ctx.supabase.from("care_subscriptions").select("plan_id, status").eq("company_id", ctx.companyId),
    ctx.isAdmin ? ctx.supabase.from("referrals").select("rewarded_at").eq("referrer_company_id", ctx.companyId) : Promise.resolve({ data: [] as { rewarded_at: string | null }[] }),
  ]);
  const refCode = (ctx.company as unknown as { referral_code: string }).referral_code;
  const refLink = `${env.appUrl}/registrieren?ref=${refCode}`;
  const onlineSum = (fees ?? []).reduce((a, f) => a + f.gross_cents, 0) / 100;
  const ids = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length ? await ctx.supabase.from("profiles").select("user_id, full_name").in("user_id", ids) : { data: [] };
  const plan = plans?.find((p) => p.id === ctx.company.plan);

  return (
    <>
      <PageHeader title="Einstellungen" description={ctx.isAdmin ? "Firmendaten, Team und Tarif." : "Nur Inhaber und Administratoren können Einstellungen ändern."} />
      <div className="space-y-6">
        <Card><CardHeader title="Firmendaten" description="Erscheinen auf Angeboten und später auf Rechnungen." /><div className="p-5"><CompanyForm company={ctx.company as unknown as Record<string, unknown>} readOnly={!ctx.isAdmin} /></div></Card>
        <Card><CardHeader title="Öffnungszeiten" /><div className="p-5"><OpeningHoursForm fromSettings hours={Object.keys(ctx.company.opening_hours ?? {}).length ? ctx.company.opening_hours : DEFAULT_OPENING_HOURS} /></div></Card>
        <Card>
          <CardHeader title="Arbeitsplätze / Boxen" description="Werden im Kalender als Spalten angezeigt. Eine Box kann nicht doppelt belegt werden." />
          <ul className="divide-y divide-border">
            {(boxes ?? []).map((b) => (
              <li key={b.id} className={`flex items-center justify-between px-5 py-2.5 text-sm ${b.active ? "" : "opacity-50"}`}>
                <span>{b.name}</span>
                {canManage && <form action={toggleWorkstation}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="active" value={String(!b.active)} /><button className={buttonClass("ghost", "sm")}>{b.active ? "Deaktivieren" : "Aktivieren"}</button></form>}
              </li>
            ))}
          </ul>
          {canManage && <div className="border-t border-border p-5"><WorkstationForm /></div>}
        </Card>
        <Card>
          <CardHeader title="Checklisten-Vorlagen" description="Werden im Auftrag mit einem Klick hinzugefügt." />
          <div className="divide-y divide-border">
            {(templates ?? []).map((t) => (
              <details key={t.id} className="px-5 py-3">
                <summary className="flex cursor-pointer list-none justify-between text-sm"><span className="font-medium">{t.name}</span><span className="text-muted-foreground">{t.items.length} Schritte</span></summary>
                <div className="pt-3">{canManage ? <ChecklistTemplateForm template={t} /> : <ol className="list-decimal pl-5 text-sm text-muted-foreground">{t.items.map((i: string) => <li key={i}>{i}</li>)}</ol>}</div>
              </details>
            ))}
          </div>
          {canManage && <details className="border-t border-border px-5 py-3"><summary className="cursor-pointer text-sm font-medium text-accent">+ Neue Vorlage</summary><div className="pt-3"><ChecklistTemplateForm /></div></details>}
        </Card>
        <Card>
          <CardHeader title="Team" description={`${members?.length ?? 0} von ${plan?.max_users ?? "∞"} Benutzern (Tarif ${plan?.name ?? ctx.company.plan})`} />
          <ul className="divide-y divide-border">
            {(members ?? []).map((m) => {
              const name = profiles?.find((p) => p.user_id === m.user_id)?.full_name || (m.user_id === ctx.user.id ? ctx.user.email : "Mitarbeiter");
              return (
                <li key={m.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div><p className="text-sm font-medium">{name}</p><p className="text-xs text-muted-foreground">seit {formatDate(m.created_at)}</p></div>
                  {ctx.role === "owner" && m.role !== "owner" ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <form action={updateMemberRole} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={m.id} />
                        <select name="role" defaultValue={m.role} className="h-8 rounded-md border border-border bg-card px-2 text-sm">{(["admin", "office", "staff"] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>
                        <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="can_edit_prices" defaultChecked={m.can_edit_prices} />Preisrecht</label>
                        <button className={buttonClass("secondary", "sm")}>Speichern</button>
                      </form>
                      <form action={removeMember}><input type="hidden" name="id" value={m.id} /><ConfirmSubmit variant="ghost" message="Mitarbeiter aus der Firma entfernen?">Entfernen</ConfirmSubmit></form>
                    </div>
                  ) : <Badge tone={m.role === "owner" ? "teal" : "gray"}>{ROLE_LABELS[m.role as Role]}</Badge>}
                </li>
              );
            })}
          </ul>
          {ctx.isAdmin && (
            <div className="space-y-3 border-t border-border p-5">
              <p className="text-sm font-medium">Mitarbeiter einladen</p>
              <InviteForm />
              {invites?.length ? <ul className="text-xs text-muted-foreground">{invites.map((i) => <li key={i.id}>Offen: {i.email} ({ROLE_LABELS[i.role as Role]}) – gültig bis {formatDate(i.expires_at)}</li>)}</ul> : null}
            </div>
          )}
        </Card>
        <Card id="zahlungen">
          <CardHeader title="Online-Zahlungen & Gebühren" description="Kunden bezahlen Rechnungen direkt im Kundenportal – das Geld geht auf dein Konto." />
          <div className="space-y-4 p-5 text-sm">
            {sp.zahlung && <Notice tone="amber">{sp.zahlung}</Notice>}
            {sp.abo === "ok" && <Notice tone="green">Danke! Dein Abo ist aktiv, sobald Stripe die Zahlung bestätigt.</Notice>}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">Stripe-Konto</p>
                <p className="text-muted-foreground">{co.stripe_charges_enabled ? "Verbunden – Online-Zahlung im Kundenportal ist aktiv." : co.stripe_account_id ? "Einrichtung begonnen, aber noch nicht abgeschlossen." : "Noch nicht verbunden."}</p>
              </div>
              {ctx.isAdmin && !co.stripe_charges_enabled && <form action={connectStripe}><button className={buttonClass("primary")}>{co.stripe_account_id ? "Einrichtung fortsetzen" : "Stripe verbinden"}</button></form>}
              {co.stripe_charges_enabled && <Badge tone="green">Aktiv</Badge>}
            </div>
            <div className="rounded-xl bg-muted/60 p-4">
              <p className="font-medium">So rechnen wir ab</p>
              <p className="mt-1 text-muted-foreground">
                Grundgebühr {formatEUR((plan?.price_monthly_cents ?? 0) / 100)} / Monat + {formatShare(plan?.revenue_share_bps ?? 0)} der online bezahlten Rechnungsbeträge
                {plan?.revenue_share_cap_cents != null ? `, höchstens ${formatEUR(plan.revenue_share_cap_cents / 100)} pro Monat` : ""}. Die Gebühr wird bei der Zahlung automatisch einbehalten. Bar- und Überweisungszahlungen sind gebührenfrei.
              </p>
              {ctx.isAdmin && <p className="mt-2 tabular-nums">Diesen Monat: {formatEUR(onlineSum)} online bezahlt · Gebühren {formatEUR(feeSum)}</p>}
            </div>
            {ctx.isAdmin && (
              <div className="flex flex-wrap gap-2">
                {co.subscription_status === "active" || co.subscription_status === "trialing"
                  ? <form action={openBillingPortal}><button className={buttonClass("secondary")}>Abo & Zahlungsmethode verwalten</button></form>
                  : <form action={startSubscription}><input type="hidden" name="plan" value={ctx.company.plan} /><button className={buttonClass("secondary")}>Grundgebühr abonnieren ({plan?.name})</button></form>}
              </div>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Pflege-Abos für deine Kunden" description="Monatliche Abos verkaufen – sichere, wiederkehrende Einnahmen. Kunden schließen sie auf deiner Buchungsseite ab." />
          <ul className="divide-y divide-border">
            {(carePlans ?? []).map((p) => (
              <li key={p.id} className={`flex items-center justify-between gap-3 px-5 py-2.5 text-sm ${p.active ? "" : "opacity-50"}`}>
                <span>{p.name} · {formatEUR(p.price_cents / 100)}/Monat · {(careSubs ?? []).filter((s) => s.plan_id === p.id && s.status === "active").length} aktive Abos</span>
                {ctx.isAdmin && <form action={toggleCarePlan}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="active" value={String(!p.active)} /><button className={buttonClass("ghost", "sm")}>{p.active ? "Beenden" : "Anbieten"}</button></form>}
              </li>
            ))}
          </ul>
          {ctx.isAdmin && <div className="border-t border-border p-5">{co.stripe_charges_enabled ? <CarePlanForm /> : <p className="text-sm text-muted-foreground">Verbinde zuerst Stripe, um Abos zu verkaufen.</p>}</div>}
        </Card>
        {ctx.isAdmin && (
          <Card>
            <CardHeader title="Empfehlen & sparen" description="Für jeden Betrieb, der sich über deinen Link anmeldet und ein Abo abschließt, bekommst du einen Monat gratis. Der neue Betrieb testet 30 Tage kostenlos." />
            <div className="space-y-2 p-5 text-sm">
              <div className="flex flex-wrap items-center gap-2"><code className="break-all rounded bg-muted px-2 py-1 text-xs">{refLink}</code><CopyButton text={refLink} /></div>
              <p className="text-muted-foreground">Bisher geworben: {refs?.length ?? 0} · davon belohnt: {(refs ?? []).filter((r) => r.rewarded_at).length}</p>
            </div>
          </Card>
        )}
        <Card>
          <CardHeader title="Tarif" description={`Aktuell: ${plan?.name ?? ctx.company.plan}`} />
          <div className="grid gap-3 p-5 sm:grid-cols-3">
            {(plans ?? []).map((p) => (
              <div key={p.id} className={`rounded-xl border p-4 ${p.id === ctx.company.plan ? "border-accent ring-1 ring-accent" : "border-border"}`}>
                <p className="font-medium">{p.name}</p>
                <p className="text-2xl font-semibold">{formatEUR(p.price_monthly_cents / 100)}<span className="text-sm font-normal text-muted-foreground"> / Monat</span></p>
                <p className="text-xs text-muted-foreground">+ {formatShare(p.revenue_share_bps)} der Online-Zahlungen{p.revenue_share_cap_cents != null ? `, max. ${formatEUR(p.revenue_share_cap_cents / 100)}` : ""}</p>
                <p className="mt-1 text-xs text-muted-foreground">{p.max_users ? `bis ${p.max_users} Benutzer` : "unbegrenzte Benutzer"}</p>
              </div>
            ))}
          </div>
          <div className="px-5 pb-5">
            {isStripeConfigured() ? <Notice>Stripe ist konfiguriert. Der Checkout-Ablauf ist vorbereitet (siehe README, Abschnitt Abonnements).</Notice>
              : <Notice tone="amber">Zahlungsanbieter nicht konfiguriert – es werden keine Zahlungen ausgeführt. Tarifwechsel erfolgen derzeit nur durch den Betreiber.</Notice>}
          </div>
        </Card>
      </div>
    </>
  );
}
