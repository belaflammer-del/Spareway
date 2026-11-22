/**
 * ENTWÜRFE für Rechtstexte – vor Veröffentlichung zwingend juristisch prüfen
 * und um die tatsächlichen Unternehmensangaben ergänzen.
 */
export interface LegalDoc {
  title: string;
  sections: { h: string; p: string[] }[];
}

export const LEGAL_DOCS: Record<string, LegalDoc> = {
  impressum: {
    title: "Impressum",
    sections: [
      {
        h: "Angaben gemäß § 5 DDG",
        p: ["[Firmenname / Name des Betreibers]", "[Straße Hausnummer]", "[PLZ Ort]", "Vertreten durch: [Geschäftsführung]", "Handelsregister: [Registergericht, HRB-Nummer]", "USt-IdNr.: [falls vorhanden]"],
      },
      { h: "Kontakt", p: ["E-Mail: [Kontaktadresse]", "Telefon: [optional]"] },
      { h: "Verantwortlich für den Inhalt", p: ["[Name, Anschrift] (gemäß § 18 Abs. 2 MStV)"] },
      {
        h: "Verbraucherstreitbeilegung",
        p: ["[Angabe, ob Bereitschaft oder Verpflichtung zur Teilnahme an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle besteht.]"],
      },
    ],
  },
  datenschutz: {
    title: "Datenschutzerklärung",
    sections: [
      { h: "1. Verantwortlicher", p: ["[Name und Anschrift des Verantwortlichen, Kontakt Datenschutz bzw. Datenschutzbeauftragter, falls benannt]"] },
      {
        h: "2. Verarbeitete Daten und Zwecke",
        p: [
          "Kontodaten (E-Mail-Adresse, Passwort-Hash) zur Bereitstellung des Nutzerkontos – Art. 6 Abs. 1 lit. b DSGVO.",
          "Von dir eingegebene oder hochgeladene Inhalte (Inseratsangaben, Produktbilder, Screenshots, Bildschirmaufnahmen, Bewertungstexte) zur Durchführung der Kaufprüfung – Art. 6 Abs. 1 lit. b DSGVO.",
          "Zahlungs- und Buchungsdaten (Tokenkäufe, Transaktionsprotokoll) zur Vertragserfüllung und Erfüllung gesetzlicher Aufbewahrungspflichten – Art. 6 Abs. 1 lit. b und c DSGVO.",
          "Gehashte IP-Adressen zum Schutz vor Missbrauch (Rate Limiting) – Art. 6 Abs. 1 lit. f DSGVO.",
        ],
      },
      {
        h: "3. Daten Dritter in Uploads",
        p: [
          "Screenshots von Inseraten oder Bewertungsprofilen können personenbezogene Daten Dritter enthalten (z. B. Nutzernamen). Diese werden ausschließlich zur Durchführung deiner Prüfung verarbeitet, nicht dauerhaft gespeichert und nicht weitergegeben. Die KI ist angewiesen, Namen Dritter nicht wiederzugeben. [Interessenabwägung juristisch prüfen.]",
        ],
      },
      {
        h: "4. Empfänger / Auftragsverarbeiter",
        p: [
          "Hosting und Datenbank: [Hosting-Anbieter], Supabase Inc. (Datenbank, Authentifizierung, Speicher) – [Serverstandort, AV-Vertrag, ggf. Standardvertragsklauseln].",
          "KI-Analyse: OpenAI (Verarbeitung von Text und Bildern zur Analyse) – [AV-Vertrag, Drittlandübermittlung, Einstellungen zur Datenspeicherung prüfen].",
          "Zahlungen: Stripe Payments Europe Ltd. – [eigene Verantwortlichkeit bzw. AV prüfen].",
        ],
      },
      {
        h: "5. Speicherdauer",
        p: [
          "Hochgeladene Bilder: automatische Löschung nach der konfigurierten Frist (Standard 24 Stunden); Bildmetadaten (EXIF/GPS) werden beim Upload entfernt.",
          "Bildschirmaufnahmen: Löschung unmittelbar nach der Extraktion der Einzelbilder; Einzelbilder von Bewertungen werden nach der Analyse gelöscht.",
          "Prüfberichte: bis zur Löschung durch dich oder Löschung des Kontos.",
          "Buchungsdaten: gemäß gesetzlicher Aufbewahrungsfristen (z. B. § 147 AO, § 257 HGB), nach Kontolöschung pseudonymisiert.",
        ],
      },
      {
        h: "6. Deine Rechte",
        p: [
          "Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch (Art. 15–21 DSGVO). Datenexport und Kontolöschung sind direkt im Bereich „Konto & Datenschutz“ möglich.",
          "Beschwerderecht bei einer Datenschutz-Aufsichtsbehörde.",
        ],
      },
      { h: "7. Cookies", p: ["Es werden nur technisch notwendige Cookies (Sitzung, Anmeldung, Darstellungsmodus) verwendet. Keine Tracking- oder Werbecookies."] },
    ],
  },
  agb: {
    title: "Allgemeine Geschäftsbedingungen",
    sections: [
      { h: "1. Geltungsbereich", p: ["Diese AGB gelten für die Nutzung von Kaufklar durch Verbraucher und Unternehmer. [Anbieterangaben ergänzen.]"] },
      {
        h: "2. Leistungsbeschreibung",
        p: [
          "Kaufklar erstellt automatisierte Prüfberichte zu Gebrauchtwarenangeboten auf Grundlage der verfügbaren und von dir bereitgestellten Daten.",
          "Die Berichte sind eine Orientierungshilfe. Sie stellen keine Garantie für Zustand, Echtheit, Wert, Seriosität des Verkäufers oder Betrugsfreiheit dar und ersetzen keine Besichtigung, Fachprüfung, Authentifizierung oder Rechtsberatung.",
          "Ein Marktwert wird nur angegeben, wenn ausreichende Vergleichsdaten vorliegen.",
        ],
      },
      {
        h: "3. Tokens",
        p: [
          "Tokens sind vorausbezahlte Nutzungsrechte für vollständige Kaufchecks. Sie sind nicht übertragbar, nicht verzinst und nicht in Geld auszahlbar. [Gültigkeitsdauer festlegen, z. B. 3 Jahre ab Kauf – juristisch prüfen.]",
          "Tokens werden erst nach bestätigter Zahlung gutgeschrieben. Schlägt eine Analyse aus technischen Gründen fehl, wird der Token automatisch zurückgebucht.",
          "Preise und Tokenverbrauch werden vor dem Kauf angezeigt. Preisänderungen gelten nur für künftige Käufe.",
          "Bei Käufen über App-Stores (iOS/Android) gelten zusätzlich die Bedingungen des jeweiligen Stores; dort gekaufte Tokens sind ggf. nur in der jeweiligen App nutzbar. [Bei Einführung ergänzen.]",
        ],
      },
      {
        h: "4. Pflichten der Nutzer",
        p: [
          "Lade nur Inhalte hoch, zu deren Nutzung du berechtigt bist. Keine missbräuchliche oder automatisierte Massennutzung des kostenlosen Schnellchecks.",
        ],
      },
      { h: "5. Haftung", p: ["[Haftungsregelung entsprechend §§ 307 ff. BGB formulieren – juristisch prüfen.]"] },
      { h: "6. Schlussbestimmungen", p: ["[Anwendbares Recht, Gerichtsstand für Kaufleute, salvatorische Klausel.]"] },
    ],
  },
  widerruf: {
    title: "Widerrufsbelehrung",
    sections: [
      {
        h: "Widerrufsrecht",
        p: [
          "Verbraucher haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen den Vertrag zu widerrufen. Die Frist beträgt vierzehn Tage ab Vertragsschluss. [Vollständige Muster-Widerrufsbelehrung gemäß Anlage 1 zu Art. 246a § 1 Abs. 2 EGBGB einfügen.]",
        ],
      },
      {
        h: "Vorzeitiges Erlöschen",
        p: [
          "Bei Verträgen über digitale Leistungen kann das Widerrufsrecht vorzeitig erlöschen, wenn wir mit der Ausführung begonnen haben, nachdem du ausdrücklich zugestimmt und deine Kenntnis vom Erlöschen bestätigt hast (§ 356 Abs. 5 BGB). Kaufklar holt diese Zustimmung vor dem Kauf ein. Nicht eingelöste Tokens: [Behandlung beim Widerruf festlegen – juristisch prüfen].",
        ],
      },
      { h: "Folgen des Widerrufs", p: ["[Mustertext einfügen.]"] },
    ],
  },
};
