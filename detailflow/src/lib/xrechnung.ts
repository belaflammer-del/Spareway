/**
 * E-Rechnung im Format XRechnung 3.0 (Syntax: UBL 2.1 Invoice), EN 16931.
 * Reine Funktion – erzeugt das XML aus einer finalisierten Rechnung.
 *
 * ⚠️ Vor dem Produktivbetrieb mit dem offiziellen KoSIT-Validator prüfen
 *    (https://github.com/itplr-kosit/validator) und mit Steuerberatung abstimmen.
 */
export type XParty = {
  name: string; street?: string | null; zip?: string | null; city?: string | null; country?: string | null;
  email?: string | null; phone?: string | null; contact_name?: string | null; vat_id?: string | null; tax_id?: string | null;
};
export type XInvoice = {
  number: string;
  kind: "invoice" | "cancellation";
  issue_date: string;          // YYYY-MM-DD
  due_date?: string | null;
  service_date: string;
  buyer_reference?: string | null;
  note?: string | null;
  payment_terms?: string | null;
  cancels_number?: string | null;
  small_business: boolean;
  seller: XParty & { iban?: string | null; bic?: string | null; bank_name?: string | null };
  buyer: XParty;
  items: { title: string; description?: string | null; quantity: number; unit?: string; unit_price_net: number; tax_rate: number; total_net: number }[];
};

const KLEINUNTERNEHMER = "Kein Ausweis von Umsatzsteuer, da Kleinunternehmer gemäß § 19 UStG.";

export function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
}
const amt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const r2 = (n: number) => Math.round(n * 100) / 100;

function category(rate: number, small: boolean) {
  if (rate > 0) return { id: "S", percent: rate, reason: null as string | null };
  return { id: "E", percent: 0, reason: small ? KLEINUNTERNEHMER : "Steuerbefreite Leistung" };
}

export function computeTotals(inv: Pick<XInvoice, "items" | "small_business">) {
  const groups = new Map<number, number>();
  for (const it of inv.items) groups.set(Number(it.tax_rate), r2((groups.get(Number(it.tax_rate)) ?? 0) + Number(it.total_net)));
  const subtotals = [...groups.entries()].map(([rate, net]) => ({ rate, net, tax: r2((net * rate) / 100), cat: category(rate, inv.small_business) }));
  const net = r2(subtotals.reduce((a, s) => a + s.net, 0));
  const tax = r2(subtotals.reduce((a, s) => a + s.tax, 0));
  return { subtotals, net, tax, gross: r2(net + tax) };
}

function address(p: XParty) {
  return `<cac:PostalAddress>
        <cbc:StreetName>${esc(p.street)}</cbc:StreetName>
        <cbc:CityName>${esc(p.city)}</cbc:CityName>
        <cbc:PostalZone>${esc(p.zip)}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${esc(p.country || "DE")}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>`;
}

export function buildXRechnung(inv: XInvoice): string {
  const t = computeTotals(inv);
  const s = inv.seller, b = inv.buyer;
  const typeCode = inv.kind === "cancellation" ? "384" : "380"; // 384 = Rechnungskorrektur
  const notes = [inv.note, inv.small_business ? KLEINUNTERNEHMER : null].filter(Boolean);
  const sellerTax = [
    s.vat_id ? `<cac:PartyTaxScheme><cbc:CompanyID>${esc(s.vat_id)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : "",
    s.tax_id ? `<cac:PartyTaxScheme><cbc:CompanyID>${esc(s.tax_id)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>FC</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : "",
  ].join("\n      ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<ubl:Invoice xmlns:ubl="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${esc(inv.number)}</cbc:ID>
  <cbc:IssueDate>${esc(inv.issue_date)}</cbc:IssueDate>
  ${inv.due_date ? `<cbc:DueDate>${esc(inv.due_date)}</cbc:DueDate>` : ""}
  <cbc:InvoiceTypeCode>${typeCode}</cbc:InvoiceTypeCode>
  ${notes.map((n) => `<cbc:Note>${esc(n)}</cbc:Note>`).join("\n  ")}
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cbc:BuyerReference>${esc(inv.buyer_reference || inv.number)}</cbc:BuyerReference>
  ${inv.cancels_number ? `<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${esc(inv.cancels_number)}</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>` : ""}
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="EM">${esc(s.email)}</cbc:EndpointID>
      ${address(s)}
      ${sellerTax}
      <cac:PartyLegalEntity><cbc:RegistrationName>${esc(s.name)}</cbc:RegistrationName></cac:PartyLegalEntity>
      <cac:Contact>
        <cbc:Name>${esc(s.contact_name || s.name)}</cbc:Name>
        <cbc:Telephone>${esc(s.phone)}</cbc:Telephone>
        <cbc:ElectronicMail>${esc(s.email)}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="EM">${esc(b.email)}</cbc:EndpointID>
      ${address(b)}
      ${b.vat_id ? `<cac:PartyTaxScheme><cbc:CompanyID>${esc(b.vat_id)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ""}
      <cac:PartyLegalEntity><cbc:RegistrationName>${esc(b.name)}</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:Delivery><cbc:ActualDeliveryDate>${esc(inv.service_date)}</cbc:ActualDeliveryDate></cac:Delivery>
  ${s.iban ? `<cac:PaymentMeans>
    <cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>
    <cbc:PaymentID>${esc(inv.number)}</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>${esc(s.iban.replace(/\s+/g, ""))}</cbc:ID>
      <cbc:Name>${esc(s.name)}</cbc:Name>
      ${s.bic ? `<cac:FinancialInstitutionBranch><cbc:ID>${esc(s.bic)}</cbc:ID></cac:FinancialInstitutionBranch>` : ""}
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>` : ""}
  ${inv.payment_terms ? `<cac:PaymentTerms><cbc:Note>${esc(inv.payment_terms)}</cbc:Note></cac:PaymentTerms>` : ""}
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="EUR">${amt(t.tax)}</cbc:TaxAmount>
    ${t.subtotals.map((g) => `<cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="EUR">${amt(g.net)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="EUR">${amt(g.tax)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${g.cat.id}</cbc:ID>
        <cbc:Percent>${amt(g.cat.percent)}</cbc:Percent>
        ${g.cat.reason ? `<cbc:TaxExemptionReason>${esc(g.cat.reason)}</cbc:TaxExemptionReason>` : ""}
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`).join("\n    ")}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="EUR">${amt(t.net)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="EUR">${amt(t.net)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">${amt(t.gross)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="EUR">${amt(t.gross)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${inv.items.map((it, i) => {
    const cat = category(Number(it.tax_rate), inv.small_business);
    return `<cac:InvoiceLine>
    <cbc:ID>${i + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${esc(it.unit || "C62")}">${Number(it.quantity)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="EUR">${amt(Number(it.total_net))}</cbc:LineExtensionAmount>
    <cac:Item>
      ${it.description ? `<cbc:Description>${esc(it.description)}</cbc:Description>` : ""}
      <cbc:Name>${esc(it.title)}</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:ID>${cat.id}</cbc:ID><cbc:Percent>${amt(cat.percent)}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="EUR">${amt(Math.abs(Number(it.unit_price_net)))}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>`;
  }).join("\n  ")}
</ubl:Invoice>
`.replace(/\n\s*\n/g, "\n");
}

/** Pflichtangaben prüfen, bevor eine E-Rechnung erzeugt wird. Gibt verständliche Hinweise zurück. */
export function missingForXRechnung(inv: XInvoice): string[] {
  const m: string[] = [];
  if (!inv.seller.email) m.push("E-Mail-Adresse deiner Firma (Einstellungen)");
  if (!inv.seller.phone) m.push("Telefonnummer deiner Firma (Einstellungen)");
  if (!inv.seller.vat_id && !inv.seller.tax_id) m.push("Steuernummer oder USt-IdNr. (Einstellungen)");
  if (!inv.seller.street || !inv.seller.zip || !inv.seller.city) m.push("Adresse deiner Firma (Einstellungen)");
  if (!inv.buyer.email) m.push("E-Mail-Adresse des Kunden");
  if (!inv.buyer.street || !inv.buyer.zip || !inv.buyer.city) m.push("Rechnungsadresse des Kunden");
  return m;
}
