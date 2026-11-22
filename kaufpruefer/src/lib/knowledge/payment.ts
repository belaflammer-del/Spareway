/**
 * Empfehlungen zu Bezahlung und Übergabe – abhängig von Plattform,
 * Kategorie und Preis. Plattformspezifische Schutzmechanismen ändern sich;
 * die Texte verweisen daher immer auf die aktuellen Bedingungen der Plattform.
 */
import type { Listing, PaymentAdvice, RiskFinding } from "../domain/schemas";

export const PLATFORM_PROTECTION_REVIEWED_AT = "2026-11";

export function paymentAdvice(listing: Listing, risks: RiskFinding[]): PaymentAdvice[] {
  const out: PaymentAdvice[] = [];
  const price = listing.priceEur ?? 0;
  const p = listing.platform;

  if (listing.category === "vehicle") {
    out.push(
      {
        id: "veh_handover",
        kind: "handover",
        title: "Bezahlung erst bei Übergabe",
        detail:
          "Keine Anzahlung oder Reservierungsgebühr vorab. Bezahle erst, wenn Fahrzeug, beide Zulassungsbescheinigungen und alle Schlüssel übergeben werden.",
      },
      {
        id: "veh_identity",
        kind: "documents",
        title: "Identität und Halter prüfen",
        detail:
          "Lass dir den Personalausweis zeigen und gleiche den Namen mit der Zulassungsbescheinigung Teil II ab. Vergleiche die FIN am Fahrzeug mit den Papieren.",
      },
      {
        id: "veh_contract",
        kind: "documents",
        title: "Schriftlicher Kaufvertrag",
        detail:
          "Nutze einen Mustervertrag (z. B. von Automobilclubs) und halte Kilometerstand, bekannte Mängel, Zubehör und Unfallfreiheit schriftlich fest.",
      },
      {
        id: "veh_payment",
        kind: price > 5000 ? "recommended" : "caution",
        title: price > 5000 ? "Bankbestätigte Zahlung bei hohen Beträgen" : "Bargeld nur mit Quittung",
        detail:
          price > 5000
            ? "Bei hohen Beträgen ist eine Echtzeitüberweisung bei der Übergabe vor Ort oder die Abwicklung in einer Bankfiliale sicherer als große Bargeldsummen."
            : "Lass dir den Erhalt des Kaufpreises im Kaufvertrag quittieren. Zähle größere Beträge gemeinsam ab.",
      },
      {
        id: "veh_meeting",
        kind: "handover",
        title: "Sicherer Treffpunkt",
        detail: "Besichtige am Wohnort des Verkäufers oder an einem belebten Ort bei Tageslicht. Nimm eine Begleitperson mit.",
      },
    );
  } else {
    if (p === "ebay") {
      out.push({
        id: "ebay_checkout",
        kind: "recommended",
        title: "Über den eBay-Checkout bezahlen",
        detail:
          "Bezahle ausschließlich über die Bezahlfunktion von eBay. Nur dann greift in der Regel der eBay-Käuferschutz. Bedingungen auf eBay prüfen.",
      });
    } else if (p === "kleinanzeigen") {
      out.push({
        id: "ka_secure",
        kind: "recommended",
        title: "„Sicher bezahlen“ von Kleinanzeigen nutzen",
        detail:
          "Für den Versand bietet Kleinanzeigen eine integrierte Bezahlfunktion mit Käuferschutz an (ggf. gebührenpflichtig). Bedingungen auf der Plattform prüfen.",
      });
    } else if (p === "vinted") {
      out.push({
        id: "vinted_inapp",
        kind: "recommended",
        title: "Nur in der Vinted-App bezahlen",
        detail:
          "Der Käuferschutz von Vinted gilt nur für Zahlungen über die Plattform. Auf Anfragen, außerhalb der App zu bezahlen, nicht eingehen.",
      });
    } else {
      out.push({
        id: "generic_protected",
        kind: "recommended",
        title: "Zahlung mit Käuferschutz",
        detail: "Nutze eine Bezahlmethode mit Käuferschutz der Plattform oder eines Zahlungsdienstleisters (Zahlung für Waren und Dienstleistungen).",
      });
    }
    out.push({
      id: "pickup",
      kind: "handover",
      title: "Abholung mit Funktionsprüfung",
      detail: "Wenn möglich persönlich abholen, den Artikel vor Ort prüfen und erst dann bezahlen.",
    });
    out.push({
      id: "shipping",
      kind: "caution",
      title: "Versand nur mit Sendungsverfolgung",
      detail: price > 250 ? "Bei höherem Wert versicherten Versand mit Sendungsverfolgung vereinbaren." : "Versand mit Sendungsnummer vereinbaren.",
    });
  }

  out.push({
    id: "avoid_untraceable",
    kind: "avoid",
    title: "Unsichere Zahlungswege vermeiden",
    detail:
      "Keine Zahlung per Bargeldtransferdienst, Gutscheinkarte, Kryptowährung oder „PayPal Freunde & Familie“ an Unbekannte. Keine Links zu angeblichen Zahlungs- oder Treuhandseiten öffnen.",
  });

  if (risks.some((r) => r.area === "payment")) {
    out.unshift({
      id: "suspicious_request",
      kind: "avoid",
      title: "Verdächtige Zahlungsaufforderung erkannt",
      detail:
        "Im Inserat wird ein riskanter Zahlungsweg genannt. Nicht darauf eingehen. Bei Druck oder Ausreden den Kontakt abbrechen und das Inserat ggf. der Plattform melden.",
    });
  }
  return out;
}
