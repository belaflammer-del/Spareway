import { describe, expect, it } from "vitest";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { buildXRechnung, computeTotals, missingForXRechnung, type XInvoice } from "@/lib/xrechnung";

const base: XInvoice = {
  number: "RE-2026-0001", kind: "invoice", issue_date: "2026-11-15", due_date: "2026-11-29", service_date: "2026-11-14",
  payment_terms: "Zahlbar innerhalb von 14 Tagen ohne Abzug.", small_business: false,
  seller: { name: "Premium Detailing Köln", street: "Industriestraße 42", zip: "50735", city: "Köln", email: "info@premium.de", phone: "0221 1", tax_id: "217/5123/4567", iban: "DE89 3704 0044 0532 0130 00" },
  buyer: { name: "Autohaus Rheinblick GmbH", street: "Rheinallee 1", zip: "50996", city: "Köln", email: "service@rheinblick.de", vat_id: "DE123456789" },
  items: [
    { title: "Paket: Komplettaufbereitung", quantity: 1, unit_price_net: 450, tax_rate: 19, total_net: 450 },
    { title: "Lederpflege & Co. <Spezial>", quantity: 2, unit_price_net: 39.99, tax_rate: 19, total_net: 79.98 },
  ],
};
const parse = (xml: string) => new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false }).parse(xml).Invoice;

describe("XRechnung (UBL)", () => {
  it("erzeugt wohlgeformtes XML mit XRechnung-3.0-Kennung", () => {
    const xml = buildXRechnung(base);
    expect(XMLValidator.validate(xml)).toBe(true);
    const inv = parse(xml);
    expect(inv.CustomizationID).toBe("urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0");
    expect(inv.InvoiceTypeCode).toBe("380");
    expect(inv.ID).toBe("RE-2026-0001");
  });

  it("berechnet Summen konsistent (Positionen = Netto, Netto + Steuer = Brutto)", () => {
    const inv = parse(buildXRechnung(base));
    const t = inv.LegalMonetaryTotal;
    expect(t.LineExtensionAmount["#text"]).toBe("529.98");
    expect(inv.TaxTotal.TaxAmount["#text"]).toBe("100.70");
    expect(t.PayableAmount["#text"]).toBe("630.68");
    expect(inv.InvoiceLine).toHaveLength(2);
  });

  it("maskiert Sonderzeichen und entfernt Leerzeichen in der IBAN", () => {
    const xml = buildXRechnung(base);
    expect(xml).toContain("Lederpflege &amp; Co. &lt;Spezial&gt;");
    expect(xml).toContain("<cbc:ID>DE89370400440532013000</cbc:ID>");
    expect(xml).toContain('<cbc:CompanyID>217/5123/4567</cbc:CompanyID><cac:TaxScheme><cbc:ID>FC</cbc:ID>');
  });

  it("Kleinunternehmer: Steuerkategorie E mit Befreiungsgrund und 0 € Steuer", () => {
    const xml = buildXRechnung({ ...base, small_business: true, items: base.items.map((i) => ({ ...i, tax_rate: 0 })) });
    const inv = parse(xml);
    expect(inv.TaxTotal.TaxAmount["#text"]).toBe("0.00");
    expect(inv.TaxTotal.TaxSubtotal.TaxCategory.ID).toBe("E");
    expect(xml).toContain("§ 19 UStG");
  });

  it("Storno: Typ 384 mit Verweis auf die Originalrechnung und negativen Beträgen", () => {
    const xml = buildXRechnung({ ...base, kind: "cancellation", number: "RE-2026-0002", cancels_number: "RE-2026-0001", items: base.items.map((i) => ({ ...i, quantity: -i.quantity, total_net: -i.total_net })) });
    const inv = parse(xml);
    expect(inv.InvoiceTypeCode).toBe("384");
    expect(inv.BillingReference.InvoiceDocumentReference.ID).toBe("RE-2026-0001");
    expect(inv.LegalMonetaryTotal.PayableAmount["#text"]).toBe("-630.68");
  });

  it("gemischte Steuersätze werden getrennt ausgewiesen", () => {
    const t = computeTotals({ small_business: false, items: [{ title: "A", quantity: 1, unit_price_net: 100, tax_rate: 19, total_net: 100 }, { title: "B", quantity: 1, unit_price_net: 10, tax_rate: 7, total_net: 10 }] });
    expect(t.subtotals.map((s) => [s.rate, s.tax])).toEqual([[19, 19], [7, 0.7]]);
    expect(t.gross).toBe(129.7);
  });

  it("meldet fehlende Pflichtangaben verständlich", () => {
    const m = missingForXRechnung({ ...base, seller: { ...base.seller, email: null }, buyer: { ...base.buyer, street: null } });
    expect(m).toEqual(["E-Mail-Adresse deiner Firma (Einstellungen)", "Rechnungsadresse des Kunden"]);
  });
});
