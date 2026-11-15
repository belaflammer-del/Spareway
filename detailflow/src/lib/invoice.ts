import type { XInvoice } from "./xrechnung";

export const INVOICE_STATUS_LABELS = { draft: "Entwurf", finalized: "Offen", paid: "Bezahlt", cancelled: "Storniert" } as const;
export type InvoiceStatus = keyof typeof INVOICE_STATUS_LABELS;

type Row = {
  number: string | null; kind: "invoice" | "cancellation"; issue_date: string | null; due_date: string | null; service_date: string;
  intro_text?: string | null; payment_terms: string | null; seller_snapshot: Record<string, any> | null; buyer_snapshot: Record<string, any> | null;
  cancels_number?: string | null;
  items: { title: string; description?: string | null; quantity: number; unit?: string; unit_price_net: number; tax_rate: number; total_net: number; sort?: number }[];
};

/** Finalisierte Rechnung (mit eingefrorenen Firmen-/Kundendaten) in das E-Rechnungsmodell überführen */
export function toXInvoice(r: Row): XInvoice {
  const s = r.seller_snapshot ?? {}, b = r.buyer_snapshot ?? {};
  return {
    number: r.number ?? "", kind: r.kind, issue_date: r.issue_date ?? "", due_date: r.due_date, service_date: r.service_date,
    buyer_reference: b.buyer_reference, note: r.intro_text, payment_terms: r.payment_terms, cancels_number: r.cancels_number,
    small_business: Boolean(s.small_business),
    seller: { name: s.name, street: s.street, zip: s.zip, city: s.city, country: s.country, email: s.email, phone: s.phone, contact_name: s.contact_name, vat_id: s.vat_id, tax_id: s.tax_id, iban: s.iban, bic: s.bic, bank_name: s.bank_name },
    buyer: { name: b.name, street: b.street, zip: b.zip, city: b.city, country: b.country, email: b.email, vat_id: b.vat_id },
    items: [...r.items].sort((a, c) => (a.sort ?? 0) - (c.sort ?? 0)).map((i) => ({ ...i, quantity: Number(i.quantity), unit_price_net: Number(i.unit_price_net), tax_rate: Number(i.tax_rate), total_net: Number(i.total_net) })),
  };
}

/** Platzhalter in Nachrichtenvorlagen ersetzen */
export function fillTemplate(body: string, vars: Record<string, string | undefined>) {
  return body.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);
}

export const INVOICE_STATUS_TONE = { draft: "gray", finalized: "amber", paid: "green", cancelled: "red" } as const;
