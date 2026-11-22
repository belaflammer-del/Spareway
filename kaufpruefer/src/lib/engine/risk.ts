/**
 * Risk-Analysis-Engine – deterministische, nachvollziehbare Regeln.
 *
 * Grundsätze:
 *  - Hinweise statt Vorwürfe: Jede Regel liefert Belege und, wo nötig, eine
 *    Einordnung („kein Beweis für …“).
 *  - Ein günstiger Preis allein ist kein Betrugsnachweis.
 *  - Ein niedriger Kilometerstand allein ist kein Beweis für Manipulation.
 */
import { CATEGORY_PROFILES } from "../domain/category-profiles";
import type { Listing, MarketValuation, RiskFinding, SellerAnalysis } from "../domain/schemas";
import { detectPromptInjection } from "../security/untrusted";
import { hasValue } from "./missing-info";

export interface RiskInput {
  listing: Listing;
  market?: MarketValuation;
  seller?: SellerAnalysis;
  /** Zusätzliche, belegte Befunde aus der KI-Bildanalyse (Text-Bild-Abgleich) */
  externalFindings?: RiskFinding[];
  currentYear?: number;
}

interface PaymentPattern {
  id: string;
  re: RegExp;
  severity: RiskFinding["severity"];
  title: string;
  explanation: string;
}

const PAYMENT_PATTERNS: PaymentPattern[] = [
  {
    id: "money_transfer_service",
    re: /\b(western\s*union|moneygram|ria\s+money|bargeldtransfer)\b/i,
    severity: "high",
    title: "Bargeldtransferdienst als Zahlungsweg genannt",
    explanation: "Zahlungen über Bargeldtransferdienste sind praktisch nicht rückholbar und bieten keinen Käuferschutz.",
  },
  {
    id: "voucher_payment",
    re: /\b(paysafe\s*card|amazon[-\s]?gutschein|itunes[-\s]?karte|google\s*play[-\s]?karte|gutscheinkarte)\b/i,
    severity: "high",
    title: "Zahlung per Gutscheinkarte genannt",
    explanation: "Seriöse Verkäufer verlangen keine Bezahlung mit Gutschein- oder Prepaidkarten.",
  },
  {
    id: "friends_family",
    re: /\b(freunde\s*(&|und)\s*familie|friends\s*(&|and)\s*family|paypal\s*f(&|n)f)\b/i,
    severity: "medium",
    title: "„PayPal Freunde & Familie“ gewünscht",
    explanation: "Diese Zahlungsart ist für private Geldgeschenke gedacht und bietet beim Warenkauf in der Regel keinen Käuferschutz.",
  },
  {
    id: "crypto",
    re: /\b(bitcoin|btc|krypto|crypto|usdt|ethereum)\b/i,
    severity: "high",
    title: "Kryptowährung als Zahlungsweg genannt",
    explanation: "Kryptozahlungen sind nicht rückholbar und bieten keinen Käuferschutz.",
  },
  {
    id: "escrow_courier",
    re: /\b(treuhand\w*|spedition\w*\s+(übernimmt|zahlung)|kurier\w*\s+(bringt|zahlung)|zahlung\s+an\s+(die\s+)?spedition)\b/i,
    severity: "medium",
    title: "Treuhand- oder Speditionsabwicklung erwähnt",
    explanation:
      "Angeblich sichere Treuhand- oder Speditionsdienste werden bei Betrugsmaschen häufig vorgeschoben. Nur bekannte, selbst gewählte Dienste nutzen.",
  },
  {
    id: "prepayment_only",
    re: /(nur\s+(gegen\s+)?vorkasse|(ausschließlich|nur)\s+(per\s+|via\s+)?überweisung|überweisung\s+(im\s+)?voraus|überweisung\s+vorab|vorab\s+überweis)/i,
    severity: "low",
    title: "Nur Vorkasse bzw. Überweisung",
    explanation: "Vorkasse per Überweisung ist bei Privatkäufen ohne Käuferschutz schwer rückholbar.",
  },
  {
    id: "abroad",
    re: /\b(bin\s+(gerade\s+|derzeit\s+|beruflich\s+)?im\s+ausland|befinde\s+mich\s+im\s+ausland|lebe\s+(jetzt\s+)?im\s+ausland)\b/i,
    severity: "medium",
    title: "Verkäufer gibt an, im Ausland zu sein",
    explanation: "Das ist nicht per se verdächtig, wird aber häufig mit Vorkasse- und Versandmaschen kombiniert. Keine Übergabe, keine Vorkasse.",
  },
  {
    id: "off_platform_contact",
    re: /\b(whatsapp|telegram|signal)\b|[\w.+-]+@[\w-]+\.[\w.]+/i,
    severity: "low",
    title: "Kontakt außerhalb der Plattform angeboten",
    explanation: "Kommunikation außerhalb der Plattform kann den Plattform-Käuferschutz und die Nachvollziehbarkeit ausschließen.",
  },
];

function textOf(l: Listing): string {
  return [l.title, l.description, l.paymentMethods].filter(Boolean).join("\n");
}

export function evaluateRisks(input: RiskInput): RiskFinding[] {
  const { listing, market, seller } = input;
  const year = input.currentYear ?? new Date().getFullYear();
  const out: RiskFinding[] = [];
  const text = textOf(listing);

  // 1) Zahlungsforderungen im Text
  for (const p of PAYMENT_PATTERNS) {
    const m = text.match(p.re);
    if (m) {
      out.push({
        id: `pay_${p.id}`,
        rule: `payment.${p.id}`,
        area: "payment",
        severity: p.severity,
        title: p.title,
        explanation: p.explanation,
        evidence: [`Im Inseratstext: „${m[0]}“`],
        source: "listing_text",
      });
    }
  }

  // 2) Preis relativ zum Markt – nur bei belastbarer Marktbewertung
  if (market?.status === "ok" && market.range && listing.priceEur != null && market.deviationPct != null) {
    if (market.deviationPct <= -30) {
      out.push({
        id: "price_far_below",
        rule: "price.far_below_market",
        area: "price",
        severity: market.deviationPct <= -45 ? "medium" : "low",
        title: "Preis ungewöhnlich weit unter vergleichbaren Angeboten",
        explanation:
          "Sehr niedrige Preise kommen bei Betrugsmaschen häufiger vor, haben aber oft harmlose Gründe (schneller Verkauf, Mängel, Unkenntnis). Besonders auf Zahlungsweg und Übergabe achten.",
        evidence: [`${Math.abs(market.deviationPct)} % unter dem mittleren Vergleichswert (${market.comparables.used} Vergleichsangebote)`],
        caveat: "Ein günstiger Preis allein ist kein Hinweis auf Betrug.",
        source: "market_data",
      });
    }
  }

  // 3) Fehlende kritische Angaben
  const profile = CATEGORY_PROFILES[listing.category];
  const missingCritical = profile.fields.filter((f) => f.importance === "critical" && !hasValue(listing, f.field));
  if (missingCritical.length > 0) {
    out.push({
      id: "missing_critical",
      rule: "information.missing_critical",
      area: "information",
      severity: missingCritical.length >= 3 ? "medium" : "low",
      title: "Wesentliche Angaben fehlen",
      explanation: "Ohne diese Angaben lässt sich das Angebot nur eingeschränkt bewerten. Frage gezielt beim Verkäufer nach.",
      evidence: missingCritical.map((f) => f.question),
      source: "rule_engine",
    });
  }

  // 4) Plausibilität: Jahr
  if (listing.year != null && (listing.year > year + 1 || listing.year < 1900)) {
    out.push({
      id: "year_implausible",
      rule: "plausibility.year_range",
      area: "plausibility",
      severity: "medium",
      title: "Unplausibles Baujahr",
      explanation: "Das angegebene Jahr liegt außerhalb eines plausiblen Bereichs – möglicherweise ein Tippfehler.",
      evidence: [`Angegeben: ${listing.year}`],
      source: "rule_engine",
    });
  }
  const titleYear = listing.title?.match(/\b(19[5-9]\d|20[0-4]\d)\b/);
  if (listing.category === "vehicle" && titleYear && listing.year != null && Math.abs(Number(titleYear[1]) - listing.year) >= 2) {
    out.push({
      id: "year_mismatch",
      rule: "plausibility.year_title_mismatch",
      area: "plausibility",
      severity: "low",
      title: "Jahresangaben passen nicht zusammen",
      explanation: "Im Titel steht ein anderes Jahr als in den Fahrzeugdaten. Beim Verkäufer nachfragen und mit den Fahrzeugpapieren abgleichen.",
      evidence: [`Titel: ${titleYear[1]}`, `Baujahr-Feld: ${listing.year}`],
      source: "rule_engine",
    });
  }

  // 5) Plausibilität: Laufleistung (nur Hinweis!)
  if (listing.category === "vehicle" && listing.mileageKm != null && listing.year != null) {
    const ageYears = Math.max(0.5, year - listing.year + 0.5);
    const perYear = listing.mileageKm / ageYears;
    if (ageYears >= 3 && perYear < 3000) {
      out.push({
        id: "mileage_low",
        rule: "plausibility.mileage_low",
        area: "plausibility",
        severity: "info",
        title: "Sehr niedrige jährliche Laufleistung",
        explanation:
          "Rund " +
          Math.round(perYear).toLocaleString("de-DE") +
          " km pro Jahr sind wenig. Das kann völlig normal sein (Zweitwagen, Garagenfahrzeug). Lass dir den Verlauf mit Wartungsbelegen, HU-Berichten oder Werkstattrechnungen belegen.",
        evidence: [`${listing.mileageKm.toLocaleString("de-DE")} km bei ca. ${Math.round(ageYears)} Jahren Fahrzeugalter`],
        caveat: "Ein niedriger Kilometerstand allein ist kein Beweis für eine Tachomanipulation.",
        source: "rule_engine",
      });
    } else if (perYear > 45000) {
      out.push({
        id: "mileage_high",
        rule: "plausibility.mileage_high",
        area: "plausibility",
        severity: "info",
        title: "Hohe jährliche Laufleistung",
        explanation: "Viele Kilometer pro Jahr bedeuten erhöhten Verschleiß. Wartungsnachweise sind hier besonders wichtig.",
        evidence: [`ca. ${Math.round(perYear).toLocaleString("de-DE")} km pro Jahr`],
        source: "rule_engine",
      });
    }
  }

  // 6) Elektronik: Aktivierungssperre
  if (listing.category === "electronics" && listing.activationLockFree && /nein|no|unbekannt|gesperrt|locked/i.test(listing.activationLockFree)) {
    out.push({
      id: "activation_lock",
      rule: "plausibility.activation_lock",
      area: "plausibility",
      severity: "high",
      title: "Aktivierungssperre nicht bestätigt entfernt",
      explanation: "Ein Gerät mit aktiver Aktivierungssperre ist für dich in der Regel nicht nutzbar. Kaufe erst, wenn die Sperre nachweislich entfernt ist.",
      evidence: [`Angabe: „${listing.activationLockFree}“`],
      source: "user_input",
    });
  }

  // 6b) Hochpreisige Artikel ohne Echtheitsnachweis
  const authThreshold = profile.authenticationThresholdEur;
  if (authThreshold != null && (listing.priceEur ?? 0) >= authThreshold) {
    const proof = [listing.boxAndPapers, listing.purchaseReceipt].filter(Boolean).join(" ");
    const noProof = !proof || /^(nein|no|keine?|ohne|nicht)\b/i.test(proof.trim());
    if (noProof) {
      out.push({
        id: "authenticity_unproven",
        rule: "plausibility.authenticity_unproven",
        area: "plausibility",
        severity: "medium",
        title: "Echtheit nicht belegt",
        explanation:
          "Für diesen hochpreisigen Artikel liegen weder Kaufbeleg noch Zertifikat bzw. Papiere vor. Fotos reichen für eine Echtheitsbestätigung nicht aus – eine professionelle Authentifizierung vor der Zahlung ist dringend zu empfehlen.",
        evidence: [proof ? `Angabe: „${proof}“` : "Keine Angabe zu Kaufbeleg oder Papieren"],
        caveat: "Fehlende Papiere bedeuten nicht, dass der Artikel unecht ist.",
        source: proof ? "listing_text" : "rule_engine",
      });
    }
  }

  // 7) Wenige Bilder
  const photoCount = listing.images.filter((i) => i.kind === "product_photo" || i.kind === "listing_screenshot").length;
  if (photoCount < Math.min(3, profile.minImages)) {
    out.push({
      id: "few_images",
      rule: "images.few",
      area: "images",
      severity: "low",
      title: photoCount === 0 ? "Keine Produktbilder ausgewertet" : "Wenige Produktbilder",
      explanation: `Für diese Kategorie empfehlen wir mindestens ${profile.minImages} aussagekräftige Ansichten. Fordere fehlende Ansichten beim Verkäufer an.`,
      evidence: [`${photoCount} Bild(er) vorhanden`],
      source: "rule_engine",
    });
  }

  // 8) Prompt-Injection im Inseratstext
  const inj = detectPromptInjection(text);
  if (inj.length > 0) {
    out.push({
      id: "prompt_injection",
      rule: "security.prompt_injection",
      area: "security",
      severity: "medium",
      title: "Inseratstext enthält Anweisungen an KI-Systeme",
      explanation:
        "Der Text enthält Formulierungen, die automatische Prüfsysteme beeinflussen sollen. Diese Anweisungen wurden ignoriert. Das ist ein ungewöhnliches Signal.",
      evidence: inj.map((s) => `„${s}“`),
      source: "listing_text",
    });
  }

  // 9) Verkäuferanalyse
  if (seller && seller.visibleReviewCount > 0) {
    const negShare = seller.negative / seller.visibleReviewCount;
    const notReceived = seller.complaints.find((c) => c.category === "not_received")?.count ?? 0;
    if (seller.visibleReviewCount >= 5 && negShare >= 0.2) {
      out.push({
        id: "seller_negative_share",
        rule: "seller.negative_share",
        area: "seller",
        severity: negShare >= 0.4 ? "medium" : "low",
        title: "Hoher Anteil negativer Bewertungen",
        explanation: "Ein erheblicher Teil der erkannten Bewertungen ist negativ. Lies die einzelnen Bewertungen im Kontext.",
        evidence: [`${seller.negative} von ${seller.visibleReviewCount} erkannten Bewertungen negativ`],
        caveat: "Bewertungen sind Aussagen anderer Nutzer und nicht verifiziert.",
        source: "seller_reviews",
      });
    }
    if (notReceived >= 2) {
      out.push({
        id: "seller_not_received",
        rule: "seller.repeated_not_received",
        area: "seller",
        severity: "medium",
        title: "Wiederholte Beschwerden „Ware nicht erhalten“",
        explanation: "Mehrere Käufer berichten, die Ware nicht erhalten zu haben. Nur mit Käuferschutz oder bei persönlicher Übergabe kaufen.",
        evidence: [`${notReceived} Bewertungen in dieser Kategorie`],
        caveat: "Behauptungen anderer Käufer – nicht verifiziert.",
        source: "seller_reviews",
      });
    }
  }

  if (input.externalFindings) out.push(...input.externalFindings);

  const order = { high: 0, medium: 1, low: 2, info: 3 } as const;
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}
