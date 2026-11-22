"use client";
import { useActionState } from "react";
import { inviteMember, updateCompany } from "@/app/actions/company";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";

type C = Record<string, unknown>;
export function CompanyForm({ company, readOnly }: { company: C; readOnly: boolean }) {
  const [state, action] = useActionState(updateCompany, undefined);
  const v = (k: string) => (company[k] ?? "") as string;
  return (
    <form action={action} className="space-y-4">
      <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2">
        <Field label="Firmenname" name="name" className="sm:col-span-2"><Input name="name" defaultValue={v("name")} required /></Field>
        <Field label="Rechtsform" name="legal_form"><Input name="legal_form" defaultValue={v("legal_form")} placeholder="z. B. Einzelunternehmen, GmbH" /></Field>
        <Field label="Webseite" name="website"><Input name="website" defaultValue={v("website")} /></Field>
        <Field label="Straße" name="street" className="sm:col-span-2"><Input name="street" defaultValue={v("street")} /></Field>
        <Field label="PLZ" name="zip"><Input name="zip" defaultValue={v("zip")} /></Field>
        <Field label="Ort" name="city"><Input name="city" defaultValue={v("city")} /></Field>
        <Field label="Telefon" name="phone"><Input name="phone" defaultValue={v("phone")} /></Field>
        <Field label="E-Mail" name="email"><Input name="email" type="email" defaultValue={v("email")} /></Field>
        <Field label="Steuernummer" name="tax_id"><Input name="tax_id" defaultValue={v("tax_id")} /></Field>
        <Field label="USt-IdNr." name="vat_id"><Input name="vat_id" defaultValue={v("vat_id")} /></Field>
        <Field label="Standard-Steuersatz (%)" name="default_tax_rate"><Input name="default_tax_rate" inputMode="decimal" defaultValue={String(company.default_tax_rate ?? 19)} /></Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="small_business" defaultChecked={Boolean(company.small_business)} />Kleinunternehmer (§ 19 UStG)</label>
        <Field label="Bank" name="bank_name"><Input name="bank_name" defaultValue={v("bank_name")} /></Field>
        <Field label="IBAN" name="iban"><Input name="iban" defaultValue={v("iban")} /></Field>
        <Field label="BIC" name="bic"><Input name="bic" defaultValue={v("bic")} /></Field>
        <div className="grid grid-cols-3 gap-2 sm:col-span-2">
          <Field label="Präfix Angebote" name="quote_prefix"><Input name="quote_prefix" defaultValue={v("quote_prefix")} /></Field>
          <Field label="Präfix Aufträge" name="order_prefix"><Input name="order_prefix" defaultValue={v("order_prefix")} /></Field>
          <Field label="Präfix Rechnungen" name="invoice_prefix"><Input name="invoice_prefix" defaultValue={v("invoice_prefix")} /></Field>
        </div>
        <Field label="Ansprechpartner (für E-Rechnung)" name="contact_name"><Input name="contact_name" defaultValue={v("contact_name")} /></Field>
        <Field label="Zahlungsziel Rechnungen (Tage)" name="payment_terms_days"><Input name="payment_terms_days" inputMode="numeric" defaultValue={String(company.payment_terms_days ?? 14)} /></Field>
        <div className="space-y-2 rounded-xl border border-border p-4 sm:col-span-2">
          <p className="text-sm font-medium">Online-Anfrage / Buchungsseite</p>
          <p className="text-xs text-muted-foreground">Kunden können über deine eigene Seite Termine anfragen. Anfragen landen unter Nachrichten und Aufträge.</p>
          <div className="flex items-center gap-2"><span className="shrink-0 text-sm text-muted-foreground">…/buchen/</span><Input name="slug" defaultValue={v("slug")} placeholder="premium-detailing-koeln" /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="booking_enabled" defaultChecked={Boolean(company.booking_enabled)} />Buchungsseite aktiv</label>
        </div>
        <div className="grid gap-3 rounded-xl border border-border p-4 sm:col-span-2 sm:grid-cols-2">
          <p className="text-sm font-medium sm:col-span-2">Mehr Kunden & Umsatz</p>
          <Field label="Google-Bewertungslink" name="google_review_url" hint="Google Unternehmensprofil › „Rezensionen erhalten“" className="sm:col-span-2"><Input name="google_review_url" defaultValue={v("google_review_url")} placeholder="https://g.page/r/…/review" /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="reviews_enabled" defaultChecked={company.reviews_enabled !== false} />1–3 Tage nach Abschluss automatisch um eine Bewertung bitten</label>
          <Field label="Anzahlung bei Online-Anfrage (€)" name="deposit_cents" hint="0 = keine Anzahlung"><Input name="deposit_cents" inputMode="decimal" defaultValue={String(Number(company.deposit_cents ?? 0) / 100).replace(".", ",")} /></Field>
          <Field label="Anfahrtskosten mobiler Service (€/km)" name="travel_cost_per_km" hint="0 = kein mobiler Service"><Input name="travel_cost_per_km" inputMode="decimal" defaultValue={String(company.travel_cost_per_km ?? 0).replace(".", ",")} /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="vouchers_enabled" defaultChecked={Boolean(company.vouchers_enabled)} />Gutscheine online verkaufen (…/gutschein/&lt;deine-adresse&gt;)</label>
        </div>
        <div className="space-y-2 rounded-xl border border-border p-4 sm:col-span-2">
          <p className="text-sm font-medium">Automatische Erinnerungen</p>
          <p className="text-xs text-muted-foreground">Werden täglich per E-Mail versendet, sobald der E-Mail-Versand eingerichtet ist. Texte unter Nachrichten-Vorlagen.</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="reminders_enabled" defaultChecked={company.reminders_enabled !== false} />Terminerinnerung am Vortag</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="dunning_enabled" defaultChecked={company.dunning_enabled !== false} />Zahlungserinnerung & Mahnungen bei überfälligen Rechnungen</label>
          <div className="flex items-center gap-2 text-sm"><span className="shrink-0 text-muted-foreground">Tage nach Fälligkeit:</span><Input name="dunning_days" defaultValue={((company.dunning_days as number[] | undefined) ?? [3, 14, 28]).join(", ")} className="max-w-40" /></div>
        </div>
        <div className="grid gap-3 rounded-xl border border-border p-4 sm:col-span-2 sm:grid-cols-3">
          <p className="text-sm font-medium sm:col-span-3">Buchhaltung (DATEV-Export)</p>
          {([["consultant", "Beraternummer", ""], ["client", "Mandantennummer", ""], ["fiscalYearStart", "Wirtschaftsjahr ab (MM-TT)", "01-01"], ["revenue19", "Erlöse 19 %", "8400"], ["revenue7", "Erlöse 7 %", "8300"], ["revenue0", "Erlöse steuerfrei / § 19", "8195"], ["debitor", "Debitor (Sammelkonto)", "10000"]] as const).map(([k, l, d]) => (
            <Field key={k} label={l} name={`acc_${k}`}><Input name={`acc_${k}`} defaultValue={((company.accounting_config as Record<string, string> | undefined)?.[k]) ?? d} /></Field>
          ))}
          <p className="text-xs text-muted-foreground sm:col-span-3">Standard: SKR03. Bitte mit deinem Steuerberater abstimmen.</p>
        </div>
        <Field label="Gültigkeit von Angeboten (Tage)" name="quote_validity_days"><Input name="quote_validity_days" inputMode="numeric" defaultValue={String(company.quote_validity_days ?? 30)} /></Field>
        <Field label="Standard-Angebotsbedingungen" name="quote_terms" className="sm:col-span-2"><Textarea name="quote_terms" defaultValue={v("quote_terms")} /></Field>
      </fieldset>
      {!readOnly && <div className="flex items-center gap-3"><SubmitButton>Speichern</SubmitButton><FormMessage state={state} /></div>}
    </form>
  );
}

export function InviteForm() {
  const [state, action] = useActionState(inviteMember, undefined);
  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input name="email" type="email" placeholder="E-Mail des Mitarbeiters" required />
        <Select name="role" defaultValue="staff" className="sm:w-48"><option value="staff">Mitarbeiter</option><option value="office">Büro / Verwaltung</option><option value="admin">Administrator</option></Select>
        <SubmitButton pendingText="…">Einladen</SubmitButton>
      </div>
      {state?.message && <p className={`break-all text-sm ${state.ok ? "text-foreground" : "text-danger"}`}>{state.message}</p>}
    </form>
  );
}
