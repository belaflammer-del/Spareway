import { QuoteDocument } from "@/components/quote-document";
import { calculate } from "@/lib/pricing";
import { config, packages, services, tax } from "../demo";

export default function PreviewQuote() {
  const r = calculate({ vehicleClass: "sportwagen", soiling: "normal", serviceIds: ["s18"], packageIds: ["p4"] }, { services, packages }, config, tax);
  return (
    <QuoteDocument q={{
      number: "AN-2026-0001", created_at: new Date().toISOString(), valid_until: new Date(Date.now() + 30 * 864e5).toISOString(),
      intro_text: "Sehr geehrter Herr Becker,\nvielen Dank für Ihre Anfrage. Gerne bieten wir Ihnen für Ihren Porsche folgende Leistungen an:",
      terms: "Die Preise verstehen sich inklusive der gesetzlichen Mehrwertsteuer. Der tatsächliche Aufwand kann je nach Fahrzeugzustand abweichen; größere Abweichungen werden vorab abgestimmt.",
      subtotal_net: r.netTotal, tax_total: r.taxTotal, total_gross: r.grossTotal,
      company: { name: "Premium Detailing Köln", street: "Industriestraße 42", zip: "50735", city: "Köln", phone: "0221 123456-0", email: "info@premium-detailing.test", tax_id: "217/5123/4567" },
      customer: { name: "Jonas Becker", lines: ["Aachener Str. 45", "50674 Köln"] },
      vehicle: { make: "Porsche", model: "911 Carrera S", license_plate: "K-JB 911" },
      items: r.lines.map((l) => ({ title: l.title, description: l.includes ? `Enthält: ${l.includes.join(", ")}` : null, quantity: 1, unit_price_net: l.unitPriceNet, tax_rate: l.taxRate, total_net: l.totalNet })),
    }} />
  );
}
