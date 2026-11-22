import { describe, expect, it } from "vitest";
import { buildDatevCsv, buildInvoiceBookCsv, DEFAULT_ACCOUNTING, grossByRate, toWindows1252, type ExportInvoice } from "@/lib/datev";

const inv: ExportInvoice = {
  number: "RE-2026-0001", kind: "invoice", status: "paid", issue_date: "2026-11-15", due_date: "2026-11-29", customer: "Jörg Müller",
  subtotal_net: 110, tax_total: 19.7, total_gross: 129.7, paid_amount: 129.7,
  items: [{ tax_rate: 19, total_net: 100 }, { tax_rate: 7, total_net: 10 }],
};
const storno: ExportInvoice = { ...inv, number: "RE-2026-0002", kind: "cancellation", items: [{ tax_rate: 19, total_net: -100 }] };

describe("DATEV-Export", () => {
  it("Kopfzeile im EXTF-Format mit Zeitraum und Wirtschaftsjahr", () => {
    const csv = buildDatevCsv([inv], { ...DEFAULT_ACCOUNTING, consultant: "1234567", client: "10001" }, "2026-11-01", "2026-11-30", new Date("2026-12-01T10:00:00Z"));
    const [head, cols] = csv.split("\r\n");
    const f = head.split(";");
    expect(f.slice(0, 5)).toEqual(['"EXTF"', "700", "21", '"Buchungsstapel"', "13"]);
    expect(f[10]).toBe("1234567");
    expect(f[11]).toBe("10001");
    expect(f[12]).toBe("20260101");
    expect(f[14]).toBe("20261101");
    expect(f[15]).toBe("20261130");
    expect(cols.startsWith("Umsatz (ohne Soll/Haben-Kz);Soll/Haben-Kennzeichen")).toBe(true);
  });
  it("bucht je Steuersatz brutto auf das passende Erlöskonto", () => {
    const rows = buildDatevCsv([inv], DEFAULT_ACCOUNTING, "2026-11-01", "2026-11-30").trim().split("\r\n").slice(2);
    expect(rows).toEqual([
      '119,00;"S";"EUR";;;;10000;8400;;1511;"RE-2026-0001";;;"Jörg Müller"',
      '10,70;"S";"EUR";;;;10000;8300;;1511;"RE-2026-0001";;;"Jörg Müller"',
    ]);
  });
  it("Storno wird im Haben gebucht", () => {
    const rows = buildDatevCsv([storno], DEFAULT_ACCOUNTING, "2026-11-01", "2026-11-30").trim().split("\r\n").slice(2);
    expect(rows[0]).toBe('119,00;"H";"EUR";;;;10000;8400;;1511;"RE-2026-0002";;;"Storno Jörg Müller"');
  });
  it("Kleinunternehmer (0 %) auf Konto 8195", () => {
    expect(grossByRate({ ...inv, items: [{ tax_rate: 0, total_net: 50 }] })).toEqual([{ rate: 0, gross: 50 }]);
    const rows = buildDatevCsv([{ ...inv, items: [{ tax_rate: 0, total_net: 50 }] }], DEFAULT_ACCOUNTING, "2026-11-01", "2026-11-30").trim().split("\r\n").slice(2);
    expect(rows[0]).toContain(";10000;8195;");
  });
  it("kodiert Umlaute und Euro in Windows-1252", () => {
    expect(Array.from(toWindows1252("Jörg €"))).toEqual([0x4a, 0xf6, 0x72, 0x67, 0x20, 0x80]);
    expect(Array.from(toWindows1252("✓"))).toEqual([0x3f]);
  });
  it("Rechnungsausgangsbuch als Excel-taugliche CSV", () => {
    const csv = buildInvoiceBookCsv([inv]);
    expect(csv.startsWith("﻿Rechnungsnummer;")).toBe(true);
    expect(csv).toContain('"RE-2026-0001";"Rechnung";2026-11-15;2026-11-29;"Jörg Müller";110,00;19,70;129,70;129,70;"paid"');
  });
});
