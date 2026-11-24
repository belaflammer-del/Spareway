/**
 * Schwärzung personenbezogener Daten in Chatverläufen (Datenminimierung).
 * Telefonnummern, E-Mail-Adressen, IBANs, Kartennummern und Anschriften
 * werden durch Platzhalter ersetzt, BEVOR etwas gespeichert wird.
 * Preise („18.500 €“), Kilometerstände und Baujahre bleiben erhalten.
 */
export interface RedactionCounts {
  email: number;
  phone: number;
  iban: number;
  card: number;
  address: number;
  url_query: number;
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const IBAN = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g;
const CARD = /\b(?:\d[ -]?){13,19}\b/g;
// +49 / 0049 / 0 gefolgt von Vorwahl und Rufnummer (mind. 8 Ziffern), nicht vor € oder km
const PHONE = /(?<![\d.,])(?:\+\d{2}|00\d{2}|0)[\s/()-]{0,2}\d{2,5}(?:[\s/()-]{0,2}\d{2,}){1,4}(?![\d.,]*\s?(?:€|eur|euro|km|kw|ps|gb|tb|%))/gi;
const STREET = /\b[A-ZÄÖÜ][a-zäöüß-]+(?:straße|strasse|str\.|weg|gasse|allee|platz|ring|damm|ufer|chaussee)\s+\d{1,4}\s?[a-z]?\b/g;
const ZIP_CITY = /\b\d{5}\s+(?!Kilometer|Km\b|KM\b|Euro|Eur\b|Meilen|Stück|Meter|Mal\b|Jahre|Tage|Std)[A-ZÄÖÜ][a-zäöüß]+(?:[- ][A-ZÄÖÜ][a-zäöüß]+)?\b/g;

function digits(s: string) {
  return s.replace(/\D/g, "").length;
}

/** Luhn-Prüfung – nur echte Kartennummern schwärzen, keine beliebigen Ziffernfolgen. */
function luhn(num: string): boolean {
  const d = num.replace(/\D/g, "");
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return d.length >= 13 && sum % 10 === 0;
}

export function redactPersonalData(input: string): { text: string; counts: RedactionCounts } {
  const counts: RedactionCounts = { email: 0, phone: 0, iban: 0, card: 0, address: 0, url_query: 0 };
  let t = input;
  // URL-Parameter können Tokens/Sitzungen enthalten → entfernen, Domain/Pfad bleiben für die Phishing-Prüfung
  t = t.replace(/(https?:\/\/[^\s?#]+)\?[^\s]*/gi, (_m, base: string) => {
    counts.url_query++;
    return `${base}?[…]`;
  });
  t = t.replace(EMAIL, () => {
    counts.email++;
    return "[E-Mail]";
  });
  t = t.replace(IBAN, (m) => {
    if (digits(m) < 12) return m;
    counts.iban++;
    return "[IBAN]";
  });
  t = t.replace(CARD, (m) => {
    if (!luhn(m)) return m;
    counts.card++;
    return "[Kartennummer]";
  });
  t = t.replace(PHONE, (m) => {
    if (digits(m) < 8) return m;
    counts.phone++;
    return "[Telefonnummer]";
  });
  t = t.replace(STREET, () => {
    counts.address++;
    return "[Adresse]";
  });
  t = t.replace(ZIP_CITY, () => {
    counts.address++;
    return "[PLZ Ort]";
  });
  return { text: t, counts };
}

export function totalRedactions(c: RedactionCounts): number {
  return c.email + c.phone + c.iban + c.card + c.address;
}
