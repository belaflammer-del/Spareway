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
import { ChecklistTemplateForm, WorkstationForm } from "@/components/operations-settings";

export const metadata = { title: "Einstellungen" };

export default async function Settings() {
  const ctx = await getContext();
  const [{ data: members }, { data: invites }, { data: plans }, { data: boxes }, { data: templates }] = await Promise.all([
    ctx.supabase.from("memberships").select("id, user_id, role, can_edit_prices, created_at").eq("company_id", ctx.companyId).order("created_at"),
    ctx.isAdmin ? ctx.supabase.from("invitations").select("id, email, role, expires_at, accepted_at").eq("company_id", ctx.companyId).is("accepted_at", null).order("created_at", { ascending: false }) : Promise.resolve({ data: [] as { id: string; email: string; role: string; expires_at: string }[] }),
    ctx.supabase.from("plans").select("*").order("price_monthly_cents"),
    ctx.supabase.from("workstations").select("id, name, active").eq("company_id", ctx.companyId).order("sort"),
    ctx.supabase.from("checklist_templates").select("id, name, items").eq("company_id", ctx.companyId).order("sort"),
  ]);
  const canManage = ctx.role !== "staff";
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
        <Card>
          <CardHeader title="Tarif" description={`Aktuell: ${plan?.name ?? ctx.company.plan}`} />
          <div className="grid gap-3 p-5 sm:grid-cols-3">
            {(plans ?? []).map((p) => (
              <div key={p.id} className={`rounded-xl border p-4 ${p.id === ctx.company.plan ? "border-accent ring-1 ring-accent" : "border-border"}`}>
                <p className="font-medium">{p.name}</p>
                <p className="text-2xl font-semibold">{formatEUR(p.price_monthly_cents / 100)}<span className="text-sm font-normal text-muted-foreground"> / Monat</span></p>
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
