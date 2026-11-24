/**
 * Besichtigungs-Checklisten: Grundgerüst je Kategorie + dynamische Punkte aus
 * der Kaufakte (Inseratsangaben, Bildbefunde, Schwachstellen, Risiken,
 * fehlende Angaben, Chat-Widersprüche).
 *
 * Die Prüfpunkte sind Vorgehensempfehlungen, keine Ferndiagnose.
 */
import type { ChatCheckData, InspectionData, InspectionItem } from "../akte/schemas";
import type { AnalysisReport, Category, Recommendation } from "../domain/schemas";

type Tpl = { group: string; title: string; how?: string; photo?: boolean; high?: boolean };

const VEHICLE: Tpl[] = [
  { group: "Identität & Papiere", title: "FIN am Fahrzeug mit den Papieren abgleichen", how: "Fahrgestellnummer an Windschutzscheibe/Typenschild mit Zulassungsbescheinigung Teil I und II vergleichen.", photo: true, high: true },
  { group: "Identität & Papiere", title: "Verkäufer ist Halter bzw. verfügungsberechtigt", how: "Name in Teil II mit dem Ausweis des Verkäufers vergleichen (nur ansehen, keine Kopie).", high: true },
  { group: "Identität & Papiere", title: "HU-Bericht und Prüfplakette prüfen", how: "Datum, festgestellte Mängel und Kilometerstand im letzten Bericht ansehen.", photo: true },
  { group: "Karosserie", title: "Spaltmaße und Lackbild prüfen", how: "Bei Tageslicht schräg über die Flächen schauen: Farbunterschiede, Lacknebel an Dichtungen, ungleichmäßige Spalten.", photo: true },
  { group: "Karosserie", title: "Rost an Radläufen, Schwellern und Türunterkanten", how: "Auch Kofferraumboden und – falls sicher einsehbar – Unterboden ansehen.", photo: true },
  { group: "Karosserie", title: "Scheiben und Leuchten auf Schäden prüfen", how: "Steinschläge, Risse, Feuchtigkeit in Scheinwerfern." },
  { group: "Reifen & Felgen", title: "Profiltiefe aller Reifen messen", how: "Gesetzlich mind. 1,6 mm; empfohlen werden deutlich mehr. Mit Münze oder Profiltiefenmesser.", photo: true },
  { group: "Reifen & Felgen", title: "Reifenalter (DOT) und gleichmäßigen Verschleiß prüfen", how: "Vierstellige DOT-Nummer = Woche/Jahr. Einseitiger Verschleiß kann auf Fahrwerksprobleme hindeuten.", photo: true },
  { group: "Reifen & Felgen", title: "Felgen auf Bordsteinschäden prüfen", photo: true },
  { group: "Innenraum", title: "Verschleiß passend zur Laufleistung?", how: "Lenkrad, Schaltknauf, Fahrersitz und Pedale ansehen.", photo: true },
  { group: "Innenraum", title: "Warnleuchten nach dem Start", how: "Alle Kontrollleuchten müssen nach dem Start ausgehen.", photo: true, high: true },
  { group: "Innenraum", title: "Elektrik und Klimaanlage testen", how: "Fenster, Spiegel, Licht, Infotainment, Sitzheizung, Klima." },
  { group: "Innenraum", title: "Feuchtigkeit und Gerüche", how: "Teppich im Fußraum und Kofferraum fühlen; muffiger Geruch kann auf Wassereintritt hindeuten." },
  { group: "Wartungsnachweise", title: "Scheckheft bzw. Rechnungen vorlegen lassen", how: "Stempel, Daten und Kilometerstände auf Plausibilität prüfen.", photo: true },
  { group: "Wartungsnachweise", title: "Letzte Inspektion und anstehende Wartungen klären", how: "Wann ist die nächste Inspektion fällig? Zahnriemen/Steuerkette laut Hersteller?" },
  { group: "Motorraum", title: "Ölstand und Ölzustand", how: "Messstab ziehen: Stand im Sollbereich? Milchiger Belag am Deckel ist ein Warnzeichen.", photo: true },
  { group: "Motorraum", title: "Kühlmittel und Undichtigkeiten", how: "Kühlmittelstand, feuchte Stellen, Ölnebel. Frisch gewaschener Motor kann Undichtigkeiten verdecken." },
  { group: "Kaltstart", title: "Motor kalt starten", how: "Vorher fragen, ob der Motor kalt ist (Motorhaube fühlen). Auf Geräusche, Rauch und unruhigen Leerlauf achten.", high: true },
  { group: "Probefahrt", title: "Probefahrt – nur wenn sicher und erlaubt", how: "Kennzeichen/Versicherung klären. Kupplung, Schaltung bzw. Automatik, Bremsen, Geradeauslauf, Geräusche bei Kurvenfahrt." },
  { group: "Probefahrt", title: "Bremsen und Lenkung", how: "Zieht das Fahrzeug beim Bremsen zur Seite? Vibriert das Lenkrad?" },
];

const ELECTRONICS: Tpl[] = [
  { group: "Identität & Sperren", title: "Aktivierungssperre bzw. „Wo ist?“ deaktiviert", how: "In den Einstellungen prüfen; Gerät im Beisein des Verkäufers auf Werkseinstellungen zurücksetzen lassen.", high: true },
  { group: "Identität & Sperren", title: "Seriennummer/IMEI mit Verpackung bzw. Beleg vergleichen", how: "Einstellungen → Info. Nur abgleichen, nicht öffentlich weitergeben.", photo: true },
  { group: "Akku", title: "Akkuzustand ablesen", how: "Einstellungen → Batterie → Batteriezustand (bzw. Diagnose-App).", photo: true },
  { group: "Display", title: "Display auf Pixelfehler, Verfärbungen und Risse prüfen", how: "Weißes und schwarzes Bild anzeigen, Helligkeit maximal.", photo: true },
  { group: "Display", title: "Touch auf der gesamten Fläche testen", how: "Ein App-Symbol über den ganzen Bildschirm ziehen." },
  { group: "Anschlüsse & Tasten", title: "Laden und Anschlüsse testen", how: "Ladekabel einstecken, Ladesymbol prüfen; alle Tasten drücken." },
  { group: "Funktionen", title: "Kameras, Mikrofon und Lautsprecher testen", how: "Foto/Video aufnehmen, Sprachmemo abspielen." },
  { group: "Funktionen", title: "WLAN, Bluetooth, Mobilfunk und biometrische Entsperrung", how: "SIM einlegen, Anruf testen; Face ID/Fingerabdruck einrichten." },
  { group: "Gehäuse", title: "Gehäuse auf Dellen, Verbiegung und Fremdteile prüfen", photo: true },
  { group: "Zubehör & Belege", title: "Zubehör und Kaufbeleg wie angegeben vorhanden?", photo: true },
];

const FASHION: Tpl[] = [
  { group: "Zustand", title: "Flecken, Abrieb, Pilling und Gerüche prüfen", how: "Bei Tageslicht innen und außen ansehen.", photo: true },
  { group: "Etiketten", title: "Marken- und Pflegeetikett vorhanden und stimmig", how: "Schrift, Nähte am Etikett, Sprache und Angaben vergleichen.", photo: true },
  { group: "Material", title: "Materialangabe mit Etikett vergleichen", photo: true },
  { group: "Nähte", title: "Nähte gleichmäßig und sauber", how: "Stichdichte, lose Fäden, schiefe Nähte.", photo: true },
  { group: "Größe", title: "Größenangabe auf Etikett = Inserat", how: "Wenn möglich anprobieren.", photo: true },
  { group: "Verschlüsse", title: "Reißverschlüsse, Knöpfe und Druckknöpfe prüfen", how: "Funktion und Prägungen ansehen.", photo: true },
  { group: "Echtheitsnachweise", title: "Kaufbeleg, Echtheitszertifikat oder Herstellercode vorhanden?", how: "DEAL-NIVO kann Echtheit nicht garantieren. Bei hochpreisigen Stücken professionelle Authentifizierung nutzen.", high: true },
];

const WATCHES: Tpl[] = [
  { group: "Sichtbarer Zustand", title: "Glas, Gehäuse, Armband und Schließe prüfen", photo: true },
  { group: "Modellangaben", title: "Referenznummer am Gehäuse mit Papieren vergleichen", photo: true },
  { group: "Dokumentation", title: "Box, Papiere, Kaufbeleg und Servicenachweise", photo: true },
  { group: "Funktion", title: "Aufzug, Gangreserve, Datum, Krone und Lünette testen", how: "Uhr nicht öffnen lassen." },
  { group: "Seriennummer", title: "Seriennummer ablesen und mit Papieren abgleichen", how: "Nur soweit ohne Öffnen möglich; Abfrage ggf. über einen Konzessionär." },
  { group: "Echtheit", title: "Professionelle Echtheitsprüfung einplanen", how: "Fotos ersetzen keine Prüfung durch Uhrmacher bzw. Konzessionär. Kauf ggf. davon abhängig machen.", high: true },
];

const GAMING: Tpl[] = [
  { group: "Zustand", title: "Modul/Disc und Verpackung auf Schäden prüfen", photo: true },
  { group: "Funktion", title: "Gerät starten und ein Spiel laden", how: "Spielstand anlegen, einige Minuten spielen." },
  { group: "Controller", title: "Controller auf Drift und Tastenfehler prüfen" },
  { group: "Anschlüsse", title: "Anschlüsse, Laufwerk und Lüftergeräusch prüfen" },
  { group: "Konto & Sperren", title: "Konsole vom Konto des Verkäufers abgemeldet?", high: true },
  { group: "Vollständigkeit", title: "Anleitung, OVP und Kabel wie angegeben", photo: true },
  { group: "Echtheit", title: "Label und Platinenmerkmale stimmig?", how: "Keine Echtheitsgarantie – bei teuren Sammlerstücken Expertenprüfung." },
];

const OTHER: Tpl[] = [
  { group: "Zustand", title: "Sichtbarer Zustand wie beschrieben?", photo: true },
  { group: "Funktion", title: "Alle Funktionen vor Ort testen" },
  { group: "Vollständigkeit", title: "Zubehör und Unterlagen vollständig?", photo: true },
  { group: "Belege", title: "Kaufbeleg bzw. Herkunftsnachweis vorhanden?" },
];

const TEMPLATES: Record<Category, Tpl[]> = {
  vehicle: VEHICLE,
  electronics: ELECTRONICS,
  fashion: FASHION,
  watches_jewelry: WATCHES,
  gaming_collectibles: GAMING,
  other: OTHER,
};

export const INSPECTION_SAFETY_NOTE =
  "Die Checkliste ist eine Hilfe zur eigenen Besichtigung – keine technische Ferndiagnose. Probefahrten nur mit Kennzeichen/Versicherung und wenn sicher. Nicht unter angehobene Fahrzeuge legen. Für verbindliche Aussagen eine Werkstatt bzw. einen Gutachter hinzuziehen.";

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" })[c] as string)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function item(t: Tpl & { origin: InspectionItem["origin"]; reason?: string }): InspectionItem {
  return {
    id: `${slug(t.group)}--${slug(t.title)}`,
    group: t.group,
    title: t.title,
    how: t.how,
    reason: t.reason,
    origin: t.origin,
    priority: t.high ? "high" : "normal",
    photoSuggested: !!t.photo,
    status: "unchecked",
    photos: [],
  };
}

function groupForFinding(cat: Category, text: string): string {
  const t = text.toLowerCase();
  if (cat === "vehicle") {
    if (/reifen|felge|profil/.test(t)) return "Reifen & Felgen";
    if (/innen|sitz|lenkrad|leder|kombiinstrument|tacho|warnleuchte/.test(t)) return "Innenraum";
    if (/motor|öl|oel|kühl/.test(t)) return "Motorraum";
    return "Karosserie";
  }
  if (cat === "electronics") return /display|bildschirm|riss/.test(t) ? "Display" : /akku|batterie/.test(t) ? "Akku" : "Gehäuse";
  return "Zustand";
}

/** Erzeugt die individuelle Checkliste für eine Kaufakte. */
export function buildInspectionChecklist(report: AnalysisReport, chatChecks: ChatCheckData[] = []): InspectionItem[] {
  const l = report.listing;
  const cat = l.category;
  const items: InspectionItem[] = TEMPLATES[cat].map((t) => item({ ...t, origin: "template" }));
  const add = (x: InspectionItem) => {
    if (!items.some((i) => i.id === x.id)) items.push(x);
  };

  // Inseratsangaben gezielt bestätigen
  if (cat === "vehicle" && l.mileageKm)
    add(item({ group: "Innenraum", title: `Kilometerstand im Kombiinstrument = ${l.mileageKm.toLocaleString("de-DE")} km?`, how: "Anzeige fotografieren und mit Inserat, HU-Bericht und Wartungsnachweisen vergleichen.", photo: true, high: true, origin: "listing", reason: "Angabe im Inserat" }));
  if (cat === "vehicle" && l.serviceHistory)
    add(item({ group: "Wartungsnachweise", title: `Wartungsangabe belegen lassen: „${l.serviceHistory.slice(0, 60)}“`, photo: true, origin: "listing", reason: "Angabe im Inserat" }));
  if (cat === "vehicle" && l.accidentFree)
    add(item({ group: "Karosserie", title: `Angabe „${l.accidentFree.slice(0, 40)}“ (Unfallfreiheit) schriftlich im Kaufvertrag festhalten`, origin: "listing", reason: "Angabe im Inserat" }));
  if (cat === "electronics" && l.batteryHealthPct != null)
    add(item({ group: "Akku", title: `Akkuzustand = ${l.batteryHealthPct} % wie im Inserat?`, photo: true, high: true, origin: "listing", reason: "Angabe im Inserat" }));
  if (cat === "electronics" && l.storageGb)
    add(item({ group: "Funktionen", title: `Speicher = ${l.storageGb} GB wie angegeben?`, how: "Einstellungen → Allgemein → Info.", origin: "listing", reason: "Angabe im Inserat" }));
  if ((cat === "watches_jewelry" || cat === "fashion") && l.boxAndPapers)
    add(item({ group: "Dokumentation", title: `Box/Papiere wie angegeben: „${l.boxAndPapers.slice(0, 60)}“`, photo: true, origin: "listing", reason: "Angabe im Inserat" }));

  // Befunde aus den Inseratsfotos vor Ort prüfen
  for (const f of report.product.imageFindings.filter((x) => x.evidenceLevel !== "unverifiable").slice(0, 6))
    add(
      item({
        group: groupForFinding(cat, `${f.title} ${f.detail}`),
        title: `Befund aus den Inseratsfotos prüfen: ${f.title}`,
        how: f.detail,
        photo: true,
        high: f.severity === "high" || f.severity === "medium",
        origin: "finding",
        reason: f.evidenceLevel === "visible" ? "Auf einem Inseratsfoto sichtbar" : "Auf einem Inseratsfoto möglicherweise erkennbar",
      }),
    );

  // Bekannte Schwachstellen (mit Quelle)
  for (const w of report.product.weaknesses.slice(0, 6))
    add(
      item({
        group: cat === "vehicle" ? "Modellspezifisch" : "Bekannte Schwachstellen",
        title: w.title,
        how: w.checkAdvice ?? w.detail,
        high: w.severity === "high",
        origin: "weakness",
        reason: `${w.claim.verified ? "Geprüfte Wissensdatenbank" : "Hinweis (nicht verifiziert)"} – gilt für ${w.appliesTo}`,
      }),
    );

  // Erhöhte Risiken klären
  for (const r of report.risks.filter((x) => x.severity === "high" || x.severity === "medium").slice(0, 4))
    add(item({ group: "Offene Fragen", title: `Klären: ${r.title}`, how: r.explanation, high: r.severity === "high", origin: "risk", reason: "Risiko aus der Analyse" }));

  // Fehlende wichtige Angaben
  for (const m of report.missingInfo.filter((x) => x.importance !== "helpful").slice(0, 4))
    add(item({ group: "Offene Fragen", title: m.question, high: m.importance === "critical", origin: "missing_info", reason: `Im Inserat fehlt: ${m.label}` }));

  // Widersprüche aus dem Verkäuferchat
  for (const c of chatChecks.flatMap((x) => x.contradictions).slice(0, 4))
    add(item({ group: "Offene Fragen", title: `Widerspruch klären: ${c.explanation.slice(0, 90)}`, how: `Inserat: „${c.listingStatement.slice(0, 100)}“ – Chat: „${c.chatStatement.slice(0, 100)}“`, high: c.kind === "documented", origin: "chat", reason: "Aus der Chatprüfung" }));

  // Offene Fragen an den Verkäufer vor Ort klären
  for (const q of report.checklist.questionsForSeller.slice(0, 4))
    add(item({ group: "Offene Fragen", title: q, origin: "template", reason: "Frage an den Verkäufer" }));

  // Gruppen in Vorlagenreihenfolge, dynamische Gruppen danach
  const order = [...new Set([...TEMPLATES[cat].map((t) => t.group), ...items.map((i) => i.group)])];
  const offen = order.indexOf("Offene Fragen");
  if (offen >= 0) order.push(order.splice(offen, 1)[0]);
  return items.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
}

export function newInspection(report: AnalysisReport, chatChecks: ChatCheckData[], now: string): InspectionData {
  return {
    state: "in_progress",
    category: report.listing.category,
    startedAt: now,
    items: buildInspectionChecklist(report, chatChecks),
    openQuestions: report.checklist.questionsForSeller.slice(0, 6),
    safetyNote: INSPECTION_SAFETY_NOTE,
  };
}

/**
 * Offline-Synchronisierung: Pro Prüfpunkt gewinnt die jüngere Änderung.
 * Prüfpunkte, die der Server nicht kennt, werden ignoriert.
 */
export function mergeInspectionItems(server: InspectionItem[], incoming: Partial<InspectionItem>[]): InspectionItem[] {
  return server.map((s) => {
    const c = incoming.find((x) => x.id === s.id);
    if (!c) return s;
    if (s.updatedAt && c.updatedAt && c.updatedAt < s.updatedAt) return s;
    return {
      ...s,
      status: c.status ?? s.status,
      note: c.note !== undefined ? c.note?.slice(0, 2000) : s.note,
      updatedAt: c.updatedAt ?? s.updatedAt,
    };
  });
}

/** Besichtigungsbericht mit aktualisierter Risikoeinschätzung. */
export function summarizeInspection(data: InspectionData, previous: Recommendation): NonNullable<InspectionData["report"]> {
  const by = (st: InspectionItem["status"]) => data.items.filter((i) => i.status === st).length;
  const ok = by("ok");
  const conspicuous = by("conspicuous");
  const unchecked = by("unchecked");
  const na = by("na");
  const checked = ok + conspicuous;
  const relevant = data.items.length - na;
  const highConspicuous = data.items.filter((i) => i.status === "conspicuous" && i.priority === "high").length;
  const highPriorityOpen = data.items.filter((i) => i.status === "unchecked" && i.priority === "high").length;

  let risk: "low" | "medium" | "high" | "incomplete";
  let riskText: string;
  if (highConspicuous > 0 || conspicuous >= 3) {
    risk = "high";
    riskText = `${conspicuous} auffällige${conspicuous === 1 ? "r Prüfpunkt" : " Prüfpunkte"}${highConspicuous ? (conspicuous === 1 ? " (wichtig)" : `, davon ${highConspicuous} wichtige`) : ""}. Vor dem Kauf klären oder Fachbetrieb hinzuziehen.`;
  } else if (conspicuous > 0) {
    risk = "medium";
    riskText = `${conspicuous} auffälliger Prüfpunkt. Klären und ggf. im Preis berücksichtigen.`;
  } else if (relevant === 0 || checked / relevant < 0.5 || highPriorityOpen > 0) {
    risk = "incomplete";
    riskText = `Erst ${checked} von ${relevant} Punkten geprüft${highPriorityOpen ? `, ${highPriorityOpen} wichtige offen` : ""}. Eine Einschätzung ist noch nicht belastbar.`;
  } else {
    risk = "low";
    riskText = "Bei den geprüften Punkten ist nichts aufgefallen. Das ersetzt keine Werkstattprüfung.";
  }
  const updatedRecommendation: Recommendation = risk === "high" ? "elevated_risk" : risk === "medium" && previous === "interesting" ? "inspect_further" : previous;
  return { checked, ok, conspicuous, unchecked, na, highPriorityOpen, risk, riskText, updatedRecommendation };
}
