/**
 * Export der Ausgangsrechnungen für die Steuerberatung.
 *  - DATEV-Format „Buchungsstapel“ (EXTF, Version 700, Kategorie 21), Windows-1252, Semikolon
 *  - Rechnungsausgangsbuch als CSV (UTF-8 mit BOM, für Excel)
 *
 * ⚠️ Kontenrahmen/Konten (Standard: SKR03 8400/8300/8195, Sammeldebitor 10000) und den Import
 *    vor dem Produktivbetrieb mit der Steuerberatung abstimmen und einmal testweise einlesen.
 */
export type AccountingConfig = { revenue19: string; revenue7: string; revenue0: string; debitor: string; consultant: string; client: string; fiscalYearStart: string };
export const DEFAULT_ACCOUNTING: AccountingConfig = { revenue19: "8400", revenue7: "8300", revenue0: "8195", debitor: "10000", consultant: "", client: "", fiscalYearStart: "01-01" };

export type ExportInvoice = {
  number: string; kind: "invoice" | "cancellation"; status: string; issue_date: string; due_date: string | null; customer: string;
  subtotal_net: number; tax_total: number; total_gross: number; paid_amount: number;
  items: { tax_rate: number; total_net: number }[];
};

const q = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
const num = (n: number) => Math.abs(n).toFixed(2).replace(".", ",");
const r2 = (n: number) => Math.round(n * 100) / 100;

function revenueAccount(rate: number, cfg: AccountingConfig) {
  if (rate >= 19) return cfg.revenue19;
  if (rate > 0) return cfg.revenue7;
  return cfg.revenue0;
}

/** Bruttobetrag je Steuersatz (DATEV bucht auf Automatikkonten brutto) */
export function grossByRate(inv: ExportInvoice) {
  const m = new Map<number, number>();
  for (const it of inv.items) m.set(Number(it.tax_rate), r2((m.get(Number(it.tax_rate)) ?? 0) + Number(it.total_net)));
  return [...m.entries()].map(([rate, net]) => ({ rate, gross: r2(net + r2((net * rate) / 100)) }));
}

export function buildDatevCsv(invoices: ExportInvoice[], cfg: AccountingConfig, from: string, to: string, created = new Date()): string {
  const ymd = (d: string) => d.replace(/-/g, "");
  const stamp = created.toISOString().replace(/[-:TZ.]/g, "").slice(0, 17);
  const fyStart = `${from.slice(0, 4)}${cfg.fiscalYearStart.replace("-", "")}`;
  const header = [
    q("EXTF"), 700, 21, q("Buchungsstapel"), 13, stamp, "", q("RE"), q("DetailFlow"), "", cfg.consultant || "", cfg.client || "",
    fyStart, 4, ymd(from), ymd(to), q(`Ausgangsrechnungen ${from} bis ${to}`), "", 1, 0, 0, q("EUR"), "", "", "", "", "", "", "", "", "",
  ].join(";");
  const columns = ["Umsatz (ohne Soll/Haben-Kz)", "Soll/Haben-Kennzeichen", "WKZ Umsatz", "Kurs", "Basis-Umsatz", "WKZ Basis-Umsatz", "Konto",
    "Gegenkonto (ohne BU-Schlüssel)", "BU-Schlüssel", "Belegdatum", "Belegfeld 1", "Belegfeld 2", "Skonto", "Buchungstext"].join(";");
  const rows: string[] = [];
  for (const inv of invoices) {
    for (const g of grossByRate(inv)) {
      if (g.gross === 0) continue;
      const dd = inv.issue_date.slice(8, 10) + inv.issue_date.slice(5, 7);
      // Rechnung: Debitor an Erlös (S). Storno/negativer Betrag: Haben.
      rows.push([num(g.gross), q(g.gross >= 0 ? "S" : "H"), q("EUR"), "", "", "", cfg.debitor, revenueAccount(g.rate, cfg), "", dd,
        q(inv.number.slice(0, 36)), "", "", q(`${inv.kind === "cancellation" ? "Storno " : ""}${inv.customer}`.slice(0, 60))].join(";"));
    }
  }
  return [header, columns, ...rows].join("\r\n") + "\r\n";
}

export function buildInvoiceBookCsv(invoices: ExportInvoice[]): string {
  const head = ["Rechnungsnummer", "Art", "Rechnungsdatum", "Fällig am", "Kunde", "Netto", "USt.", "Brutto", "Bezahlt", "Status"].join(";");
  const de = (n: number) => r2(n).toFixed(2).replace(".", ",");
  const rows = invoices.map((i) => [q(i.number), q(i.kind === "cancellation" ? "Storno" : "Rechnung"), i.issue_date, i.due_date ?? "", q(i.customer),
    de(i.subtotal_net), de(i.tax_total), de(i.total_gross), de(i.paid_amount), q(i.status)].join(";"));
  return "﻿" + [head, ...rows].join("\r\n") + "\r\n";
}

/** Text in Windows-1252 kodieren (von DATEV erwartet). Nicht darstellbare Zeichen werden durch „?“ ersetzt. */
export function toWindows1252(s: string): Uint8Array {
  const special: Record<string, number> = { "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "–": 0x96, "—": 0x97, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "™": 0x99 };
  const out = new Uint8Array(s.length);
  let i = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    out[i++] = special[ch] ?? (c < 0x80 || (c >= 0xa0 && c <= 0xff) ? c : 0x3f);
  }
  return out.slice(0, i);
}
