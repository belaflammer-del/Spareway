/**
 * Demo-Beispielanalysen – ALLE Werte sind fiktiv und dienen nur der
 * Veranschaulichung. Sie werden im UI durchgehend als Demo gekennzeichnet.
 */
import type { RawReview } from "../engine/seller";
import type { DemoDefinition } from "./build";

const posReviews = (texts: string[]): RawReview[] => texts.map((text) => ({ text, sentiment: "positive" }));

export const DEMO_DEFINITIONS: DemoDefinition[] = [
  {
    slug: "audi-a4",
    teaser: "Kombi von privat – Preis etwas über dem Vergleichsmarkt",
    listing: {
      platform: "mobile_de",
      category: "vehicle",
      title: "Audi A4 Avant 2.0 TDI S tronic (Demo)",
      brand: "Audi",
      model: "A4 Avant",
      variant: "2.0 TDI S tronic",
      year: 2017,
      priceEur: 18900,
      condition: "Gebraucht, gepflegt",
      mileageKm: 142000,
      engine: "2.0 TDI",
      fuel: "Diesel",
      transmission: "Automatik (Doppelkupplung)",
      powerKw: 140,
      serviceHistory: "Scheckheft bis 120.000 km",
      accidentFree: "Ja, laut Verkäufer",
      previousOwners: 2,
      location: "50667 Köln (Demo)",
      sellerType: "Privat",
      description:
        "Verkaufe unseren Familienkombi. Scheckheftgepflegt bis 120.000 km, danach freie Werkstatt. Kleine Gebrauchsspuren, Nichtraucher. Neue Bremsen vorne 2025. Probefahrt nach Absprache.",
      images: [
        { ref: "/demo/3d/audi-side-v2.webp", kind: "product_photo", label: "Front/Seite (Symbolbild)" },
        { ref: "/demo/3d/audi-rear-v2.webp", kind: "product_photo", label: "Heck (Symbolbild)" },
      ],
    },
    comparables: [
      { price: 17200, year: 2017, km: 150000 }, { price: 17900, year: 2017, km: 138000 }, { price: 16900, year: 2016, km: 145000 },
      { price: 18400, year: 2018, km: 152000 }, { price: 17500, year: 2017, km: 160000, type: "sold" }, { price: 18100, year: 2017, km: 128000 },
      { price: 16800, year: 2016, km: 171000, type: "sold" }, { price: 17700, year: 2017, km: 141000 }, { price: 19200, year: 2018, km: 118000 },
      { price: 17300, year: 2017, km: 149000, type: "sold" }, { price: 18600, year: 2018, km: 139000, ageDays: 75 }, { price: 17000, year: 2016, km: 133000 },
    ],
    findings: [
      { title: "Kratzer am hinteren Stoßfänger", detail: "Oberflächlicher Kratzer im Lack rechts unten am Stoßfänger.", level: "visible", severity: "low", image: "/demo/3d/audi-rear-v2.webp", box: [0.12, 0.5, 0.2, 0.13] },
      { title: "Möglicher Farbtonunterschied am Kotflügel vorne", detail: "Der vordere Kotflügel wirkt minimal heller. Kann an Licht/Kamera liegen – mit Lackschichtdickenmessgerät prüfen.", level: "possible", severity: "medium", image: "/demo/3d/audi-side-v2.webp", box: [0.27, 0.4, 0.17, 0.18] },
      { title: "Unterboden nicht beurteilbar", detail: "Es liegen keine Bilder des Unterbodens vor.", level: "unverifiable", severity: "info" },
    ],
    weaknesses: [
      { title: "Wartung der Abgasnachbehandlung", detail: "Bei Dieselfahrzeugen mit Kurzstreckenbetrieb können Partikelfilter und AGR-System Wartung benötigen.", appliesTo: "Dieselmotoren allgemein (Demo-Beispiel)", severity: "medium", check: "Nach Regenerationsverhalten und Fehlerspeicher fragen" },
      { title: "Ölwechsel des Doppelkupplungsgetriebes", detail: "Doppelkupplungsgetriebe haben eigene Wartungsintervalle. Nachweis anfragen.", appliesTo: "S tronic (Demo-Beispiel)", severity: "medium", check: "Rechnung über Getriebeölwechsel verlangen" },
    ],
    missingViews: ["Motorraum", "Reifen / Profiltiefe", "Innenraum Rücksitzbank"],
    reviews: posReviews([
      "Sehr freundlicher und ehrlicher Verkäufer, alles wie beschrieben.",
      "Reibungslose Abwicklung, gerne wieder.",
      "Top Kommunikation, schnelle Antworten.",
    ]).concat([{ text: "Abholung hat etwas gedauert, sonst ok.", sentiment: "neutral" as const }]),
    conditionSummary: "Gepflegter Gesamteindruck auf den Bildern, kleinere Gebrauchsspuren. Ein möglicher Farbtonunterschied sollte vor Ort geprüft werden.",
    summary:
      "Demo: Ein insgesamt plausibles Angebot mit lückenloser Wartung bis 120.000 km. Der Preis liegt etwas über vergleichbaren Angeboten – das bietet Verhandlungsspielraum. Vor dem Kauf Lackbild und Getriebewartung prüfen.",
  },
  {
    slug: "bmw-320d",
    teaser: "Auffällig günstig, Vorkasse & Spedition – typische Warnsignale",
    listing: {
      platform: "kleinanzeigen",
      category: "vehicle",
      title: "BMW 320d Touring Sport Line 2015 (Demo)",
      brand: "BMW",
      model: "320d Touring",
      variant: "Sport Line",
      year: 2015,
      priceEur: 9450,
      condition: "Sehr gut",
      mileageKm: 168000,
      engine: "2.0 Diesel",
      fuel: "Diesel",
      transmission: "Automatik",
      accidentFree: "Ja",
      location: "Deutschland (nicht angegeben)",
      sellerType: "Privat",
      description:
        "Wegen Auslandsaufenthalt schnell abzugeben. Ich bin beruflich im Ausland, das Fahrzeug steht bei einer Spedition. Bezahlung nur per Überweisung vorab, die Spedition übernimmt die Lieferung. Kontakt bitte per WhatsApp.",
      images: [{ ref: "/demo/3d/bmw-side-v2.webp", kind: "product_photo", label: "Front/Seite (Symbolbild)" }],
    },
    comparables: [
      { price: 15900, year: 2015, km: 160000 }, { price: 16400, year: 2015, km: 152000 }, { price: 14900, year: 2014, km: 175000 },
      { price: 15500, year: 2015, km: 171000, type: "sold" }, { price: 16900, year: 2016, km: 158000 }, { price: 15200, year: 2015, km: 180000 },
      { price: 16100, year: 2015, km: 149000 }, { price: 15700, year: 2015, km: 166000, type: "sold" },
    ],
    findings: [
      { title: "Nur ein Foto vorhanden", detail: "Für ein Fahrzeug dieser Preisklasse sind deutlich mehr Ansichten üblich.", level: "visible", severity: "low", image: "/demo/3d/bmw-side-v2.webp" },
      { title: "Kennzeichen und Umgebung nicht erkennbar", detail: "Das Bild lässt keinen Rückschluss auf den Standort zu.", level: "unverifiable", severity: "info" },
    ],
    weaknesses: [
      { title: "Steuerkette prüfen", detail: "Bei manchen Dieselmotoren ist die Steuerkette ein bekannter Prüfpunkt. Auf Rasselgeräusche beim Kaltstart achten.", appliesTo: "Beispielhafte Motorvariante (Demo – fiktiv)", severity: "high", check: "Kaltstart vor Ort, Rechnung über Steuerkettenwechsel erfragen" },
    ],
    missingViews: ["Front und Heck", "Innenraum", "Kombiinstrument mit Kilometerstand", "Motorraum", "Reifen"],
    summary:
      "Demo: Mehrere typische Warnsignale treffen zusammen – Preis deutlich unter Vergleichsangeboten, Verkäufer angeblich im Ausland, Vorkasse und Speditionslieferung. Einzelne Punkte sind kein Beweis, in Kombination ist jedoch große Vorsicht geboten. Keine Zahlung ohne persönliche Besichtigung.",
  },
  {
    slug: "iphone-15-pro",
    teaser: "Fairer Preis, guter Akku – Aktivierungssperre bestätigt entfernt",
    listing: {
      platform: "kleinanzeigen",
      category: "electronics",
      title: "iPhone 15 Pro 256 GB Titan Natur (Demo)",
      brand: "Apple",
      model: "iPhone 15 Pro",
      year: 2023,
      priceEur: 749,
      condition: "Sehr gut, immer mit Hülle",
      storageGb: 256,
      batteryHealthPct: 88,
      activationLockFree: "Ja, vom Account abgemeldet",
      accessories: "Originalkarton, Kabel",
      purchaseReceipt: "Ja, Rechnung vorhanden",
      location: "80331 München (Demo)",
      sellerType: "Privat",
      description: "Verkaufe mein iPhone 15 Pro, immer mit Hülle und Panzerglas genutzt. Akku 88 %. Rechnung vorhanden. Abholung oder Versand mit Sicher bezahlen.",
      images: [
        { ref: "/demo/3d/phone-back-v2.webp", kind: "product_photo", label: "Rückseite (Symbolbild)" },
      ],
    },
    comparables: [
      { price: 760 }, { price: 720, type: "sold" }, { price: 790 }, { price: 740, type: "sold" }, { price: 775 },
      { price: 699, type: "sold" }, { price: 810, ageDays: 90 }, { price: 745 }, { price: 730, type: "sold" }, { price: 765 },
    ],
    findings: [
      { title: "Feine Gebrauchsspur am Rahmen", detail: "Leichte Kratzer am Titanrahmen unten links.", level: "visible", severity: "low", image: "/demo/3d/phone-back-v2.webp", box: [0.37, 0.78, 0.1, 0.13] },
      { title: "Mögliche Luftblase unter Kamera-Schutzglas", detail: "Kleine Aufhellung an einer Kameralinse – vermutlich aufgeklebtes Schutzglas, kein Linsenschaden erkennbar.", level: "possible", severity: "info", image: "/demo/3d/phone-back-v2.webp", box: [0.51, 0.11, 0.11, 0.18] },
      { title: "Displayfunktion nicht prüfbar", detail: "Pixelfehler und Touch lassen sich nur am eingeschalteten Gerät prüfen.", level: "unverifiable", severity: "info" },
    ],
    missingViews: ["Einstellungen > Allgemein > Info", "Akkuzustand-Anzeige"],
    reviews: [
      ...posReviews([
        "Super schneller Versand, alles wie beschrieben!", "Sehr nett, gerne wieder.", "Top Verkäufer, schnelle Antwort.",
        "Artikel genau wie beschrieben, danke!", "Reibungslos und zuverlässig.", "Alles bestens.", "Schnell und unkompliziert.",
        "Freundlich und zuverlässig, empfehlenswert.", "Perfekt verpackt, danke.", "Hat alles super geklappt.",
      ]),
      { text: "Versand hat eine Woche gedauert, Ware aber ok.", sentiment: "neutral" },
      { text: "Antwortet nicht auf Nachrichten, Artikel kam dann doch an.", sentiment: "negative" },
    ],
    reviewsTotalClaimed: 31,
    conditionSummary: "Sehr guter optischer Zustand mit leichten Gebrauchsspuren am Rahmen.",
    summary:
      "Demo: Der Preis liegt im fairen Bereich vergleichbarer Angebote. Akkuzustand, Rechnung und entfernte Aktivierungssperre sind positive Signale. Vor Ort Funktion, Seriennummer und Akkuanzeige prüfen.",
  },
  {
    slug: "rolex-submariner",
    teaser: "Sehr günstig, ohne Box & Papiere – Authentifizierung nötig",
    listing: {
      platform: "kleinanzeigen",
      category: "watches_jewelry",
      title: "Rolex Submariner Date (Demo)",
      brand: "Rolex",
      model: "Submariner Date",
      year: 2019,
      priceEur: 8400,
      condition: "Getragen, guter Zustand",
      boxAndPapers: "Nein, ohne Box und Papiere",
      serialNumber: "nicht angegeben",
      location: "Hamburg (Demo)",
      sellerType: "Privat",
      description: "Verkaufe meine Submariner, leider ohne Box und Papiere (Umzug). Läuft einwandfrei. Nur Barzahlung oder Überweisung, kein Versand ins Ausland.",
      images: [
        { ref: "/demo/3d/watch-v2.webp", kind: "product_photo", label: "Zifferblatt (Symbolbild)" },
      ],
    },
    comparables: [{ price: 12400 }, { price: 12900 }, { price: 11800, type: "sold" }, { price: 13200 }, { price: 12100 }, { price: 12600, type: "sold" }],
    findings: [
      { title: "Datumslupe nicht eindeutig beurteilbar", detail: "Vergrößerung und Ausrichtung der Datumslupe lassen sich auf diesem Foto nicht sicher bewerten.", level: "possible", severity: "medium", image: "/demo/3d/watch-v2.webp", box: [0.49, 0.6, 0.11, 0.13] },
      { title: "Gravuren am Gehäuse nicht abgebildet", detail: "Referenz- und Seriennummer sind auf keinem Bild sichtbar.", level: "unverifiable", severity: "medium" },
    ],
    missingViews: ["Seriennummer zwischen den Bandanstößen", "Rehaut-Gravur", "Schließe im Detail", "Werk (nur durch Fachbetrieb)"],
    authenticity: [
      { feature: "Zifferblatt-Druck", status: "unverifiable", note: "Auflösung reicht nicht für eine Beurteilung." },
      { feature: "Datumslupe", status: "conspicuous", note: "Wirkt auf dem Foto schwach vergrößert – kann an der Perspektive liegen." },
      { feature: "Seriennummer / Referenz", status: "unverifiable", note: "Nicht angegeben und nicht abgebildet." },
      { feature: "Gehäuseboden", status: "consistent", note: "Glatter Boden ohne Gravuren, wie bei diesem Modelltyp üblich (Demo)." },
    ],
    summary:
      "Demo: Der Preis liegt deutlich unter vergleichbaren Angeboten, Box und Papiere fehlen, Seriennummer ist nicht angegeben. Eine Echtheitsbestätigung anhand von Fotos ist nicht möglich – nur nach Prüfung durch einen Fachbetrieb kaufen.",
  },
  {
    slug: "moncler-jacke",
    teaser: "Guter Preis auf Vinted – Etiketten & Nähte im Detail prüfen",
    listing: {
      platform: "vinted",
      category: "fashion",
      title: "Moncler Daunenjacke Maya, Gr. 3 (Demo)",
      brand: "Moncler",
      model: "Maya",
      size: "3 (L)",
      priceEur: 390,
      condition: "Sehr gut",
      material: "Polyamid, Daune",
      purchaseReceipt: "Nein",
      description: "Original Moncler Maya, wenig getragen. Kaufbeleg leider nicht mehr vorhanden. Versand über Vinted.",
      images: [
        { ref: "/demo/3d/jacket-v2.webp", kind: "product_photo", label: "Gesamtansicht (Symbolbild)" },
      ],
    },
    comparables: [{ price: 450 }, { price: 520 }, { price: 480, type: "sold" }, { price: 430, type: "sold" }, { price: 560 }, { price: 470 }, { price: 499 }],
    findings: [
      { title: "Logo-Patch am Ärmel sichtbar", detail: "Patch vorhanden; Stickqualität auf dem Foto nicht im Detail beurteilbar.", level: "possible", severity: "info", image: "/demo/3d/jacket-v2.webp", box: [0.55, 0.3, 0.09, 0.15] },
      { title: "Steppnähte leicht unregelmäßig", detail: "Zwei Steppnähte wirken auf dem Bild ungleichmäßig. Kann an Faltenwurf liegen.", level: "possible", severity: "low", image: "/demo/3d/jacket-v2.webp", box: [0.41, 0.45, 0.19, 0.11] },
    ],
    missingViews: ["Echtheits-Etikett (QR/NFC)", "Pflegeetikett innen", "Reißverschluss-Zipper im Detail"],
    authenticity: [
      { feature: "Innenetikett", status: "consistent", note: "Gestaltung auf dem Foto unauffällig (Demo)." },
      { feature: "Echtheits-Etikett mit Code", status: "unverifiable", note: "Nicht abgebildet." },
      { feature: "Nähte", status: "conspicuous", note: "Leicht unregelmäßig – weitere Detailfotos anfragen." },
    ],
    reviews: posReviews(["Schneller Versand!", "Alles super, danke.", "Wie beschrieben, gerne wieder."]),
    summary:
      "Demo: Guter Preis im Vergleich zu ähnlichen Angeboten. Ohne Kaufbeleg und ohne Foto des Echtheits-Etiketts bleibt die Echtheit offen. Über den Vinted-Käuferschutz bezahlen und Detailfotos anfragen.",
  },
  {
    slug: "seltenes-videospiel",
    teaser: "Sammlerstück mit zu wenig Vergleichsdaten – ehrlich: kein Marktwert",
    listing: {
      platform: "ebay",
      category: "gaming_collectibles",
      title: "Pokémon Smaragd-Edition (Game Boy Advance), PAL, nur Modul (Demo)",
      brand: "Nintendo",
      model: "Pokémon Smaragd-Edition",
      variant: "PAL, nur Modul",
      priceEur: 89,
      condition: "Gebraucht, Etikett leicht abgegriffen",
      accessories: "Nur Modul, ohne Verpackung",
      description: "Original Modul, Spielstand funktioniert. Versand versichert.",
      images: [{ ref: "/demo/3d/cartridge.webp", kind: "product_photo", label: "Modul Vorderseite (Symbolbild)" }],
    },
    comparables: [{ price: 85, type: "sold" }, { price: 110 }, { price: 95, type: "sold" }],
    findings: [
      { title: "Etikettendruck wirkt leicht unscharf", detail: "Kann an der Fotoqualität liegen. Reproduktionen haben oft unscharfe Drucke – Rückseite und Platine prüfen.", level: "possible", severity: "medium", image: "/demo/3d/cartridge.webp", box: [0.33, 0.14, 0.34, 0.46] },
      { title: "Platine nicht abgebildet", detail: "Die Originalität lässt sich ohne Blick auf die Platine nicht beurteilen.", level: "unverifiable", severity: "medium" },
    ],
    missingViews: ["Rückseite des Moduls", "Platine (Foto durch Verkäufer)", "Seriennummer / Prägung"],
    authenticity: [
      { feature: "Etikett", status: "conspicuous", note: "Druck leicht unscharf." },
      { feature: "Platine", status: "unverifiable", note: "Nicht abgebildet." },
    ],
    summary:
      "Demo: Für dieses Sammlerstück liegen nur drei Vergleichswerte vor – zu wenig für eine verlässliche Marktbewertung. Die App zeigt deshalb bewusst keinen Marktwert an. Vor dem Kauf Rückseite und Platine zeigen lassen.",
  },
];
