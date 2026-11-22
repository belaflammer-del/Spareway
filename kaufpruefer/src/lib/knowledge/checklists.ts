/**
 * Allgemeine Prüf- und Fragelisten je Kategorie.
 * Dies sind allgemeine Prüfempfehlungen (Vorgehensweise), keine
 * modellspezifischen Tatsachenbehauptungen.
 */
import type { Category, Checklist, Listing } from "../domain/schemas";
import { hasValue } from "../engine/missing-info";

const TEMPLATES: Record<Category, Checklist> = {
  vehicle: {
    questionsForSeller: [
      "Gibt es ein Scheckheft oder Rechnungen über die durchgeführten Wartungen?",
      "Wurden größere Reparaturen durchgeführt (Motor, Getriebe, Kupplung, Zahnriemen/Steuerkette)?",
      "Hatte das Fahrzeug Unfall- oder Lackschäden, auch reparierte?",
      "Wann war die letzte Hauptuntersuchung (HU) und gab es Mängel?",
      "Sind Sie als Halter im Fahrzeugbrief (Zulassungsbescheinigung Teil II) eingetragen?",
      "Kann ich das Fahrzeug kalt starten und eine Probefahrt machen?",
    ],
    inspection: [
      "Kaltstart: auf ungewöhnliche Geräusche, Rauch und Warnleuchten achten",
      "Spaltmaße und Lackbild prüfen (Farbunterschiede, Lacknebel an Dichtungen)",
      "Reifenprofil und gleichmäßigen Verschleiß prüfen",
      "Unterboden, Schweller und Radläufe auf Rost prüfen",
      "Ölstand und Ölzustand, Kühlmittel, Undichtigkeiten im Motorraum",
      "Probefahrt: Kupplung, Schaltvorgänge, Bremsen, Geradeauslauf, Geräusche",
      "Alle elektrischen Funktionen und Klimaanlage testen",
      "Fehlerspeicher in einer Werkstatt auslesen lassen (wenn möglich)",
      "FIN am Fahrzeug mit den Papieren abgleichen",
    ],
    documents: [
      "Zulassungsbescheinigung Teil I und Teil II (Original)",
      "HU-/AU-Bericht",
      "Scheckheft / Wartungsrechnungen",
      "Rechnungen größerer Reparaturen",
      "Personalausweis des Verkäufers (Abgleich mit Halter)",
      "Schriftlicher Kaufvertrag (z. B. ADAC-Mustervertrag)",
    ],
    expensiveDamages: [
      "Motorschäden (z. B. Steuertrieb, Turbolader, Kopfdichtung)",
      "Getriebeschäden, insbesondere bei Automatikgetrieben",
      "Rost an tragenden Teilen",
      "Unfallschäden an Struktur oder Achsen",
      "Abgasnachbehandlung (z. B. Partikelfilter, AGR-Ventil)",
    ],
  },
  electronics: {
    questionsForSeller: [
      "Ist das Gerät von Ihrem Konto abgemeldet und die Aktivierungssperre deaktiviert?",
      "Welchen Akkuzustand zeigt das Gerät an?",
      "Wurde das Gerät schon einmal repariert oder geöffnet (Display, Akku)?",
      "Gibt es eine Rechnung? Besteht noch Garantie?",
      "Gab es Wasserschäden oder Stürze?",
    ],
    inspection: [
      "Gerät vor Ort einschalten, mit WLAN verbinden und Grundfunktionen testen",
      "Display auf Pixelfehler, Einbrennen und Touch-Funktion prüfen",
      "Kameras, Lautsprecher, Mikrofon, Tasten und Ladeanschluss testen",
      "Akkuzustand in den Einstellungen ansehen",
      "Seriennummer/IMEI im Gerät mit Verpackung und Rechnung vergleichen",
      "Prüfen, dass das Gerät auf Werkseinstellungen zurückgesetzt werden kann",
    ],
    documents: ["Kaufbeleg/Rechnung", "Originalverpackung mit Seriennummer", "Reparaturbelege (falls vorhanden)"],
    expensiveDamages: ["Displaybruch oder Displaytausch mit Fremdteil", "Platinen-/Wasserschaden", "Stark gealterter Akku"],
  },
  fashion: {
    questionsForSeller: [
      "Wo und wann wurde der Artikel gekauft? Gibt es einen Kaufbeleg?",
      "Können Sie Detailfotos von Etiketten, Nähten und Reißverschluss senden?",
      "Gibt es Gebrauchsspuren, Flecken oder Reparaturen?",
    ],
    inspection: [
      "Etiketten, Logos und Nähte im Detail ansehen",
      "Material und Verarbeitung prüfen",
      "Reißverschlüsse und Knöpfe auf Markenprägung prüfen",
    ],
    documents: ["Kaufbeleg", "Echtheitszertifikat (falls vorhanden)"],
    expensiveDamages: ["Risse im Obermaterial", "Defekte Daunenkammern", "Verfärbungen"],
  },
  watches_jewelry: {
    questionsForSeller: [
      "Sind Box und Papiere (Garantiekarte) vorhanden?",
      "Wann war die letzte Revision und gibt es einen Beleg?",
      "Wurden Teile getauscht (Zifferblatt, Lünette, Armband)?",
      "Ist eine Prüfung bei einem Juwelier oder Konzessionär vor Kauf möglich?",
    ],
    inspection: [
      "Gangverhalten und Funktionen prüfen",
      "Referenz- und Seriennummer mit Papieren abgleichen",
      "Verarbeitung von Zifferblatt, Gravuren und Schließe ansehen",
      "Professionelle Echtheitsprüfung vor Ort durchführen lassen",
    ],
    documents: ["Garantiekarte/Zertifikat", "Kaufbeleg", "Servicebelege"],
    expensiveDamages: ["Werksschäden / Revision", "Nicht originale Teile", "Wasserschäden"],
  },
  gaming_collectibles: {
    questionsForSeller: [
      "Welche Version/Region ist es genau?",
      "Ist der Artikel vollständig (Verpackung, Anleitung, Beilagen)?",
      "Wurde der Artikel repariert, gereinigt oder neu verpackt?",
    ],
    inspection: [
      "Druckqualität von Cover und Etiketten prüfen",
      "Platine/Datenträger auf Originalität prüfen (falls möglich)",
      "Bei versiegelten Artikeln: Siegelart mit bekannten Originalen vergleichen",
    ],
    documents: ["Grading-Zertifikat (falls vorhanden)", "Kaufbeleg"],
    expensiveDamages: ["Reproduktionen statt Original", "Wiederversiegelung", "Beschädigte Verpackung"],
  },
  other: {
    questionsForSeller: [
      "Gibt es Mängel oder Gebrauchsspuren, die auf den Bildern nicht zu sehen sind?",
      "Gibt es einen Kaufbeleg?",
      "Ist eine Abholung mit Funktionsprüfung möglich?",
    ],
    inspection: ["Funktion vor Ort prüfen", "Typenschild und Modellbezeichnung abgleichen"],
    documents: ["Kaufbeleg", "Bedienungsanleitung"],
    expensiveDamages: ["Funktionsdefekte"],
  },
};

/** Liefert eine auf die vorhandenen Angaben zugeschnittene Checkliste. */
export function baseChecklist(listing: Listing): Checklist {
  const t = TEMPLATES[listing.category];
  const questions = [...t.questionsForSeller];
  // Fragen zu bereits beantworteten Punkten nach hinten stellen
  if (hasValue(listing, "serviceHistory") && listing.category === "vehicle") {
    questions.push(questions.shift() as string);
  }
  if (listing.category === "vehicle" && hasValue(listing, "vin")) {
    questions.push("Darf ich anhand der FIN einen Historienbericht abrufen?");
  }
  return { ...t, questionsForSeller: questions };
}
