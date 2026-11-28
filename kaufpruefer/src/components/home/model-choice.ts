/** Auswahl des passenden 3D-Symbolbilds – ohne three.js, damit Berichte leicht bleiben. */
import type { Category } from "@/lib/domain/schemas";

export type ModelName =
  | "uhr"
  | "schluessel"
  | "smartphone"
  | "jacke"
  | "sneaker"
  | "controller"
  | "kombi"
  | "limousine"
  | "suv"
  | "sportwagen"
  | "kleinwagen"
  | "motorrad"
  | "roller";

/** Fahrzeugtyp aus Inseratsangaben ableiten (für passende Darstellung ohne Markenlogos). */
export function vehicleModelFor(text: string): ModelName {
  const t = text.toLowerCase();
  if (/roller|scooter|vespa|mofa|moped|runner|piaggio|gilera|aprilia sr|kymco|sym\b/.test(t)) return "roller";
  if (/motorrad|bike|naked|enduro|chopper|kawasaki|yamaha (mt|r\d)|ducati|ktm|harley|triumph|suzuki gsx|honda cb/.test(t)) return "motorrad";
  if (/suv|geländewagen|x[1-7]\b|q[2-8]\b|tiguan|touareg|gle?\b|glc|xc[4-9]0|range rover|cayenne|macan|kodiaq|kuga|tucson|sportage/.test(t)) return "suv";
  if (/coupé|coupe|cabrio|roadster|911|cayman|boxster|amg gt|z4|tt\b|supra|mustang|corvette|sportwagen/.test(t)) return "sportwagen";
  if (/kombi|touring|avant|variant|estate|t-modell|sports tourer|sw\b|break/.test(t)) return "kombi";
  if (/polo|fiesta|corsa|yaris|clio|up!|fabia|ibiza|mini|kleinwagen|i10|i20|picanto|aygo|c1\b|108\b|twingo|micra|sandero|swift/.test(t)) return "kleinwagen";
  return "limousine";
}

/** Symbolbild je Kategorie (Fahrzeuge nach Karosserieform). */
export function modelForListing(category: Category, text: string): ModelName | null {
  const t = text.toLowerCase();
  switch (category) {
    case "vehicle":
      return vehicleModelFor(t);
    case "electronics":
      return "smartphone";
    case "fashion":
      return /schuh|sneaker|boots|stiefel/.test(t) ? "sneaker" : "jacke";
    case "watches_jewelry":
      return "uhr";
    case "gaming_collectibles":
      return "controller";
    default:
      return null;
  }
}
