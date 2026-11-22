import type { Category, ListingFieldKey } from "./schemas";

export interface FieldRequirement {
  field: ListingFieldKey;
  importance: "critical" | "important" | "helpful";
  question: string;
  /** Gewicht für die Datenqualität */
  weight: number;
}

export interface CategoryProfile {
  category: Category;
  fields: FieldRequirement[];
  /** Mindestanzahl Produktbilder für eine belastbare Bildprüfung */
  minImages: number;
  /** Empfohlene Ansichten */
  recommendedViews: string[];
  /** Ab welchem Preis eine professionelle Authentifizierung empfohlen wird */
  authenticationThresholdEur?: number;
}

const base: FieldRequirement[] = [
  { field: "priceEur", importance: "critical", weight: 3, question: "Welchen Preis verlangt der Verkäufer?" },
  { field: "brand", importance: "critical", weight: 2, question: "Welche Marke hat der Artikel?" },
  { field: "model", importance: "critical", weight: 2, question: "Um welches Modell genau handelt es sich?" },
  { field: "condition", importance: "important", weight: 1.5, question: "Wie beschreibt der Verkäufer den Zustand?" },
  { field: "description", importance: "important", weight: 1, question: "Kannst du den Beschreibungstext einfügen?" },
];

export const CATEGORY_PROFILES: Record<Category, CategoryProfile> = {
  vehicle: {
    category: "vehicle",
    minImages: 6,
    recommendedViews: [
      "Front und Heck",
      "Beide Seiten",
      "Innenraum / Fahrersitz",
      "Kombiinstrument mit Kilometerstand",
      "Motorraum",
      "Reifen / Felgen",
    ],
    fields: [
      ...base,
      { field: "year", importance: "critical", weight: 2, question: "Welches Baujahr bzw. welche Erstzulassung hat das Fahrzeug?" },
      { field: "mileageKm", importance: "critical", weight: 2.5, question: "Welchen Kilometerstand gibt der Verkäufer an?" },
      { field: "engine", importance: "important", weight: 1.5, question: "Welcher Motor ist verbaut (z. B. Hubraum, Bezeichnung)?" },
      { field: "powerKw", importance: "helpful", weight: 0.5, question: "Welche Leistung hat das Fahrzeug (kW/PS)?" },
      { field: "fuel", importance: "important", weight: 1, question: "Welcher Kraftstoff (Benzin, Diesel, Elektro, Hybrid)?" },
      { field: "transmission", importance: "important", weight: 1, question: "Schaltgetriebe oder Automatik?" },
      { field: "serviceHistory", importance: "important", weight: 1.5, question: "Gibt es ein Scheckheft oder Wartungsnachweise?" },
      { field: "accidentFree", importance: "important", weight: 1, question: "Ist das Fahrzeug laut Verkäufer unfallfrei?" },
      { field: "previousOwners", importance: "helpful", weight: 0.5, question: "Wie viele Vorbesitzer hatte das Fahrzeug?" },
      { field: "sellerType", importance: "helpful", weight: 0.5, question: "Verkauft eine Privatperson oder ein Händler?" },
    ],
  },
  electronics: {
    category: "electronics",
    minImages: 4,
    recommendedViews: ["Display eingeschaltet", "Rückseite", "Kanten / Rahmen", "Einstellungen > Info (Modell, Seriennummer abgedeckt)", "Akkuzustand-Anzeige"],
    fields: [
      ...base,
      { field: "storageGb", importance: "important", weight: 1.5, question: "Wie viel Speicher hat das Gerät?" },
      { field: "batteryHealthPct", importance: "important", weight: 1.5, question: "Welcher Akkuzustand (%) wird angezeigt?" },
      { field: "activationLockFree", importance: "critical", weight: 2, question: "Ist das Gerät von iCloud/Google-Konto bzw. Aktivierungssperre befreit?" },
      { field: "accessories", importance: "helpful", weight: 0.5, question: "Welches Zubehör ist dabei (Originalverpackung, Kabel)?" },
      { field: "purchaseReceipt", importance: "helpful", weight: 1, question: "Gibt es eine Rechnung / einen Kaufbeleg?" },
      { field: "year", importance: "helpful", weight: 0.5, question: "Wann wurde das Gerät gekauft?" },
    ],
  },
  fashion: {
    category: "fashion",
    minImages: 5,
    recommendedViews: ["Gesamtansicht", "Etikett / Innenlabel", "Pflegeetikett", "Nähte im Detail", "Reißverschluss / Knöpfe", "Logo im Detail"],
    authenticationThresholdEur: 300,
    fields: [
      ...base,
      { field: "size", importance: "important", weight: 1, question: "Welche Größe hat der Artikel?" },
      { field: "material", importance: "helpful", weight: 0.5, question: "Welches Material laut Etikett?" },
      { field: "purchaseReceipt", importance: "important", weight: 1.5, question: "Gibt es einen Kaufbeleg?" },
    ],
  },
  watches_jewelry: {
    category: "watches_jewelry",
    minImages: 5,
    recommendedViews: ["Zifferblatt frontal", "Gehäuseboden", "Schließe / Armband", "Seriennummer/Referenz (teilweise abgedeckt)", "Box & Papiere"],
    authenticationThresholdEur: 500,
    fields: [
      ...base,
      { field: "serialNumber", importance: "important", weight: 1.5, question: "Welche Referenz-/Modellnummer hat die Uhr?" },
      { field: "boxAndPapers", importance: "important", weight: 1.5, question: "Sind Box und Papiere (Garantiekarte) vorhanden?" },
      { field: "year", importance: "helpful", weight: 1, question: "Aus welchem Jahr stammt der Artikel?" },
      { field: "serviceHistory", importance: "helpful", weight: 1, question: "Gibt es Servicenachweise?" },
    ],
  },
  gaming_collectibles: {
    category: "gaming_collectibles",
    minImages: 4,
    recommendedViews: ["Vorderseite", "Rückseite", "Datenträger / Modul", "Seriennummer / Regionscode", "Verpackungskanten"],
    authenticationThresholdEur: 250,
    fields: [
      ...base,
      { field: "variant", importance: "important", weight: 1.5, question: "Welche Version/Region/Auflage (z. B. PAL, Erstauflage)?" },
      { field: "accessories", importance: "helpful", weight: 1, question: "Ist es komplett (Verpackung, Anleitung)?" },
    ],
  },
  other: {
    category: "other",
    minImages: 3,
    recommendedViews: ["Gesamtansicht", "Typenschild / Modellbezeichnung", "Gebrauchsspuren im Detail"],
    fields: [...base],
  },
};
