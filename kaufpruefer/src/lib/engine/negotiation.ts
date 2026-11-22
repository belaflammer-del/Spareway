/**
 * Verhandlungsassistent – Argumente werden ausschließlich aus belegten
 * Berichtsinhalten abgeleitet (Marktvergleich, sichtbare Befunde, fehlende
 * Nachweise). Die KI darf diese Argumente nur sprachlich formulieren.
 */
import type { ImageFinding, Listing, MarketValuation, Negotiation, Weakness } from "../domain/schemas";
import { formatEur } from "../domain/labels";
import { hasValue } from "./missing-info";

export function buildNegotiation(input: {
  listing: Listing;
  market: MarketValuation;
  imageFindings: ImageFinding[];
  weaknesses: Weakness[];
}): Negotiation {
  const { listing, market } = input;
  const args: Negotiation["arguments"] = [];

  if (market.status === "ok" && market.range && (market.deviationPct ?? 0) > 3) {
    args.push({
      text: `Vergleichbare Angebote liegen im Bereich von ${formatEur(market.range.low)} bis ${formatEur(market.range.high)}.`,
      basis: `Marktvergleich mit ${market.comparables.used} Angeboten`,
    });
  }
  for (const f of input.imageFindings.filter((f) => f.evidenceLevel === "visible" && (f.severity === "medium" || f.severity === "high"))) {
    args.push({ text: `Auf den Bildern ist erkennbar: ${f.title}.`, basis: "Sichtbar belegte Auffälligkeit" });
  }
  if (listing.category === "vehicle" && !hasValue(listing, "serviceHistory")) {
    args.push({ text: "Es liegen keine Wartungsnachweise vor.", basis: "Fehlende Angabe im Inserat" });
  }
  if (listing.category === "electronics" && listing.batteryHealthPct != null && listing.batteryHealthPct < 85) {
    args.push({ text: `Der Akkuzustand liegt bei ${listing.batteryHealthPct} %, ein Akkutausch steht absehbar an.`, basis: "Angabe im Inserat" });
  }
  for (const w of input.weaknesses.filter((w) => w.claim.verified && w.severity !== "low").slice(0, 2)) {
    args.push({ text: `Bei dieser Variante ist ${w.title.toLowerCase()} bekannt – ein Nachweis über die Behebung fehlt.`, basis: w.claim.source.label });
  }

  let suggestedOpeningEur: number | undefined;
  if (market.status === "ok" && market.range && listing.priceEur != null) {
    const target = Math.min(listing.priceEur, market.range.median);
    if (target < listing.priceEur) suggestedOpeningEur = Math.round((target * 0.97) / 50) * 50;
  }

  return {
    possible: args.length > 0,
    arguments: args,
    suggestedOpeningEur,
    note:
      args.length > 0
        ? "Bleib sachlich und freundlich. Nenne nur Argumente, die du belegen kannst. Ein Vorschlag ist eine Orientierung, kein Anspruch."
        : "Aus den vorliegenden Daten ergeben sich keine belastbaren Verhandlungsargumente. Ein Preisnachlass lässt sich ggf. nach der Besichtigung begründen.",
  };
}

/** Vorlagenbasierte, höfliche Nachricht an den Verkäufer (ohne KI). */
export function templateSellerMessage(listing: Listing, questions: string[]): string {
  const what =
    listing.category === "vehicle" ? "das Fahrzeug" : listing.title ? `„${listing.title}“` : "den Artikel";
  const q = questions.slice(0, 3).map((s) => `– ${s}`).join("\n");
  return `Hallo,\n\nich interessiere mich für ${what}. Bevor ich mich entscheide, hätte ich noch ein paar Fragen:\n\n${q}\n\nVielen Dank im Voraus und viele Grüße`;
}
