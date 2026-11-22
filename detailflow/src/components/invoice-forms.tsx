"use client";
import { useActionState } from "react";
import { addInvoiceItem, recordPayment, redeemVoucher, updateInvoiceDraft } from "@/app/actions/invoices";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";

export function DraftHeaderForm({ inv }: { inv: { id: string; service_date: string; intro_text: string | null; payment_terms: string | null } }) {
  const [state, action] = useActionState(updateInvoiceDraft, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={inv.id} />
      <Field label="Leistungsdatum" name="service_date" hint="Pflichtangabe: Tag der Aufbereitung"><Input id="service_date" name="service_date" type="date" defaultValue={inv.service_date} className="max-w-48" /></Field>
      <Field label="Einleitungstext (optional)" name="intro_text"><Textarea id="intro_text" name="intro_text" defaultValue={inv.intro_text ?? ""} className="min-h-16" placeholder="Vielen Dank für Ihren Auftrag. Wir berechnen Ihnen folgende Leistungen:" /></Field>
      <Field label="Zahlungsbedingungen" name="payment_terms"><Input id="payment_terms" name="payment_terms" defaultValue={inv.payment_terms ?? ""} /></Field>
      <div className="flex items-center gap-3"><SubmitButton variant="secondary">Speichern</SubmitButton><FormMessage state={state} /></div>
    </form>
  );
}

export function AddItemForm({ invoiceId, defaultTax }: { invoiceId: string; defaultTax: number }) {
  const [state, action] = useActionState(addInvoiceItem, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_7rem_5rem_auto]">
        <Input name="title" placeholder="Leistung, z. B. Anfahrt" aria-label="Bezeichnung" required />
        <Input name="quantity" defaultValue="1" inputMode="decimal" aria-label="Menge" />
        <Input name="unit_price_net" placeholder="€ netto" inputMode="decimal" aria-label="Einzelpreis netto" required />
        <Input name="tax_rate" defaultValue={defaultTax} inputMode="decimal" aria-label="USt. %" />
        <SubmitButton variant="secondary" pendingText="…">Hinzufügen</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function PaymentForm({ invoiceId, open }: { invoiceId: string; open: number }) {
  const [state, action] = useActionState(recordPayment, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Input name="amount" defaultValue={open.toFixed(2).replace(".", ",")} inputMode="decimal" aria-label="Betrag" />
        <Input name="paid_on" type="date" defaultValue={new Date().toISOString().slice(0, 10)} aria-label="Zahlungsdatum" />
        <Select name="method" defaultValue="Überweisung" aria-label="Zahlungsart">{["Überweisung", "Bar", "EC-Karte", "Kreditkarte", "PayPal", "Sonstiges"].map((m) => <option key={m}>{m}</option>)}</Select>
      </div>
      <div className="flex items-center gap-3"><SubmitButton>Zahlung erfassen</SubmitButton><FormMessage state={state} /></div>
    </form>
  );
}

export function VoucherRedeemForm({ invoiceId }: { invoiceId: string }) {
  const [state, action] = useActionState(redeemVoucher, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <div className="flex gap-2"><Input name="code" placeholder="Gutscheincode XXXX-XXXX" className="font-mono uppercase" aria-label="Gutscheincode" required /><SubmitButton variant="secondary" pendingText="…">Einlösen</SubmitButton></div>
      <FormMessage state={state} />
    </form>
  );
}
