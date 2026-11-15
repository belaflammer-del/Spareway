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
