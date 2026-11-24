/**
 * Regelbasierte Verkäuferchat-Analyse (ohne KI lauffähig und testbar).
 *
 * Grundsätze:
 * - Warnsignale sind Hinweise, keine Beweise. Niemand wird als Betrüger bezeichnet.
 * - „Belegter Widerspruch“ nur, wenn beide Aussagen wörtlich vorliegen und sich
 *   ausschließen. Alles, was Deutung braucht, ist „möglicher Widerspruch“.
 * - Ausgewertet werden nur Nachrichten des Verkäufers bzw. unbekannter Absender.
 */
import type { AnalysisReport, Listing, Recommendation } from "../domain/schemas";
import { normalizeReviewText, similarity } from "../engine/seller";
import type { ChatCategory, ChatContradiction, ChatMessage, ChatSignal } from "../akte/schemas";
import { CHAT_CATEGORIES } from "../akte/schemas";

export interface RawChatMessage {
  sender: ChatMessage["sender"];
  text: string;
  time?: string;
  imageIndex?: number;
  source: ChatMessage["source"];
}

// ── Zusammenführen mehrerer Screenshots ─────────────────────

/**
 * Führt Nachrichten aus mehreren Screenshots/Frames zusammen. Überlappende
 * Bildausschnitte erzeugen doppelte Nachrichten – diese werden entfernt
 * (gleicher Absender und nahezu identischer Text).
 */
export function mergeChatMessages(raw: RawChatMessage[], threshold = 0.9): { messages: ChatMessage[]; duplicatesRemoved: number } {
  const out: ChatMessage[] = [];
  let dup = 0;
  for (const m of raw) {
    const text = m.text.replace(/\s+/g, " ").trim();
    if (text.length === 0) continue;
    const norm = normalizeReviewText(text);
    const isDup = out.some(
      (o) =>
        (o.sender === m.sender || o.sender === "unknown" || m.sender === "unknown") &&
        (!o.time || !m.time || o.time === m.time) &&
        (normalizeReviewText(o.text) === norm || (norm.length > 12 && similarity(normalizeReviewText(o.text), norm) >= threshold)),
    );
    if (isDup) {
      dup++;
      continue;
    }
    out.push({ id: `m${out.length + 1}`, sender: m.sender, text, time: m.time, source: m.source, imageIndex: m.imageIndex, redacted: false });
  }
  return { messages: out, duplicatesRemoved: dup };
}

/**
 * Eingefügten Chattext in Nachrichten zerlegen. Erkennt Präfixe wie
 * „Verkäufer:“, „Ich:“, „[12:30] Name:“. Zeilen ohne Präfix gehören zur
 * vorherigen Nachricht.
 */
export function parsePastedChat(input: string): RawChatMessage[] {
  const out: RawChatMessage[] = [];
  const lines = input.replace(/\r/g, "").split("\n");
  const PREFIX = /^\s*(?:\[?(\d{1,2}[:.]\d{2})\]?\s*[-–]?\s*)?([^:\n]{1,30}):\s+(.*)$/;
  for (const line of lines) {
    const l = line.trim();
    if (!l) continue;
    const m = l.match(PREFIX);
    if (m && !/^https?$/i.test(m[2].trim())) {
      const who = m[2].trim().toLowerCase();
      const sender: ChatMessage["sender"] = /^(ich|me|käufer|kaeufer|du|buyer|interessent)$/.test(who)
        ? "buyer"
        : /^(verkäufer|verkaeufer|seller|anbieter|vk)$/.test(who)
          ? "seller"
          : "unknown";
      out.push({ sender, text: m[3], time: m[1]?.replace(".", ":"), source: "pasted_text" });
    } else if (out.length) {
      out[out.length - 1].text += ` ${l}`;
    } else {
      out.push({ sender: "unknown", text: l, source: "pasted_text" });
    }
  }
  return out;
}

// ── Warnsignale ─────────────────────────────────────────────

interface Rule {
  id: string;
  category: ChatCategory;
  level: ChatSignal["level"];
  re: RegExp;
  title: string;
  explanation: string;
  /** Nur werten, wenn vom Verkäufer (bzw. unbekannt) geschrieben */
  sellerOnly?: boolean;
  vehicleLevel?: ChatSignal["level"];
}

const RULES: Rule[] = [
  {
    id: "pay_untraceable",
    category: "payment",
    level: "high",
    re: /\b(western\s*union|moneygram|paysafe\w*|amazon[- ]?gutschein\w*|itunes[- ]?karte\w*|google[- ]?play[- ]?karte\w*|steam[- ]?karte\w*|gutscheinkarte\w*|guthabenkarte\w*|bitcoin|krypto\w*|crypto|usdt|ethereum)\b/i,
    title: "Bezahlung per Gutschein, Bargeldtransfer oder Kryptowährung",
    explanation: "Solche Zahlungen sind kaum rückholbar. Seriöse Privatverkäufe laufen nicht darüber.",
    sellerOnly: true,
  },
  {
    id: "pay_friends",
    category: "payment",
    level: "high",
    re: /(paypal\s*(an\s*)?(freunde|friends|familie|f\s*&\s*f|fnf)|als\s*freunde?\s*(senden|schicken|zahlen)|freunde\s*und\s*familie)/i,
    title: "PayPal „Freunde & Familie“ verlangt",
    explanation: "Bei dieser Zahlungsart gibt es keinen Käuferschutz für Warenkäufe.",
    sellerOnly: true,
  },
  {
    id: "pay_bypass",
    category: "payment",
    level: "high",
    re: /((außerhalb|ausserhalb|ohne)\s*(der\s*|von\s*)?(plattform|kleinanzeigen|ebay|vinted|sicher\s*bezahlen|käuferschutz)|nicht\s*(über|ueber|per)\s*(sicher\s*bezahlen|ebay|vinted|die\s*plattform|paypal\s*waren)|direkt\s*(überweisen|ueberweisen|an\s*mich\s*zahlen))/i,
    title: "Zahlung außerhalb der geschützten Plattformzahlung",
    explanation: "Die Aufforderung, den Plattform-Zahlungsweg zu umgehen, nimmt dir den Käuferschutz.",
    sellerOnly: true,
  },
  {
    id: "pay_prepay",
    category: "payment",
    level: "warning",
    re: /\b(vorkasse|anzahlung|reservierungs?gebühr|reservierungs?gebuehr|kaution|vorab\s*(zahlen|überweisen|ueberweisen|bezahlen)|erst\s*(das\s*)?geld|zuerst\s*(überweisen|ueberweisen|zahlen))\b/i,
    title: "Zahlung vor Erhalt bzw. Besichtigung",
    explanation: "Vorauszahlung ohne Besichtigung oder Käuferschutz ist ein häufiges Risiko.",
    sellerOnly: true,
  },
  {
    id: "comm_pressure",
    category: "communication",
    level: "warning",
    re: /(heute\s*noch|nur\s*(noch\s*)?heute|sofort\s*(zahlen|überweisen|ueberweisen|entscheiden)|schnell\s*(entscheiden|zahlen|überweisen)|viele\s*(andere\s*)?interessenten|wer\s*(zuerst|als\s*erstes?)\s*(zahlt|überweist|ueberweist)|letzte\s*chance|sonst\s*(ist\s*es|geht\s*es)\s*weg)/i,
    title: "Zeitdruck zur schnellen Entscheidung oder Zahlung",
    explanation: "Druck soll gründliches Prüfen verhindern. Lass dir Zeit.",
    sellerOnly: true,
  },
  {
    id: "comm_channel",
    category: "communication",
    level: "warning",
    re: /(whats\s?app|telegram|signal[- ]?app|\bsignal\b|schreib(e|en)?\s*(mir|sie)?\s*(per|auf|an|eine)\s*(mail|e-?mail|sms)|\[telefonnummer\]|\[e-mail\])/i,
    title: "Wechsel auf einen anderen Kommunikationskanal",
    explanation: "Außerhalb der Plattform fehlen Nachweise und Schutzmechanismen. Bleib möglichst im Plattform-Chat.",
    sellerOnly: true,
  },
  {
    id: "comm_story",
    category: "communication",
    level: "hint",
    re: /(im\s*ausland|auf\s*montage|beruflich\s*(unterwegs|im\s*ausland)|bundeswehr|auslandseinsatz|umzug\s*ins\s*ausland|erbschaft|geerbt|verstorben)/i,
    title: "Begründung, warum keine persönliche Übergabe möglich ist",
    explanation: "Solche Geschichten kommen bei Vorkasse-Betrug häufig vor – sie können aber auch zutreffen.",
    sellerOnly: true,
  },
  {
    id: "comm_no_inspection",
    category: "communication",
    level: "warning",
    re: /(keine\s*(besichtigung|probefahrt|abholung)|besichtigung\s*(ist\s*)?(leider\s*)?nicht\s*möglich|probefahrt\s*(ist\s*)?(leider\s*)?nicht\s*möglich|nur\s*(per\s*)?versand)/i,
    title: "Besichtigung bzw. Probefahrt wird abgelehnt",
    explanation: "Ohne Besichtigung lässt sich der Zustand nicht prüfen.",
    sellerOnly: true,
  },
  {
    id: "ship_agent",
    category: "shipping",
    level: "warning",
    vehicleLevel: "high",
    re: /(spedition|kurierdienst|\bkurier\b|treuhand\w*|transportfirma|transportunternehmen|lieferung\s*(durch|über|per)\s*(eine\s*)?(firma|agentur|spedition)|versand\s*(über|per|durch)\s*(spedition|agentur|treuhand))/i,
    title: "Lieferung über Spedition, Kurier oder Treuhand",
    explanation: "Angebliche Treuhand- oder Speditionsdienste sind ein bekanntes Muster bei Vorkasse-Betrug, besonders bei Fahrzeugen.",
    sellerOnly: true,
  },
  {
    id: "phish_confirm",
    category: "phishing",
    level: "high",
    re: /((zahlung|geld|betrag)\s*(freischalten|bestätigen|bestaetigen|empfangen|erhalten)\s*(über|ueber|unter|per)?\s*(den|diesen|folgenden)?\s*link|link\s*(öffnen|klicken|anklicken).{0,40}(zahlung|geld|betrag)|kartendaten\s*eingeben|daten\s*(im|über\s*den)\s*link)/i,
    title: "Aufforderung, Zahlungsdaten über einen Link zu bestätigen",
    explanation: "Das ist ein typisches Phishing-Muster. Gib keine Karten- oder Bankdaten über zugeschickte Links ein.",
    sellerOnly: true,
  },
  {
    id: "pd_credentials",
    category: "personal_data",
    level: "high",
    re: /\b(kreditkarten?(nummer|daten)?|cvc|cvv|prüfziffer|pin\b|tan\b|online-?banking|zugangsdaten|passwort|sms-?code|bestätigungs-?code|bestaetigungs-?code|verifizierungs-?code|login-?daten)\b/i,
    title: "Abfrage von Zugangs-, Karten- oder Bestätigungsdaten",
    explanation: "Codes, Passwörter und Kartendaten gibt man nie an Verkäufer weiter.",
    sellerOnly: true,
  },
  {
    id: "pd_id",
    category: "personal_data",
    level: "warning",
    re: /\b(personalausweis|ausweis(kopie|foto|bild)?|reisepass|führerschein(kopie|foto)?|fuehrerschein|selfie\s*mit)\b.{0,60}\b(schick|send|foto|kopie|brauch)/i,
    title: "Anfrage nach Ausweiskopie oder Ausweisfoto",
    explanation: "Ausweiskopien werden für Identitätsmissbrauch genutzt. Beim Kaufvertrag genügt das Vorzeigen vor Ort.",
    sellerOnly: true,
  },
];

const PLATFORM_HOSTS = /(^|\.)(kleinanzeigen\.de|ebay\.[a-z.]+|mobile\.de|autoscout24\.[a-z.]+|vinted\.[a-z.]+|paypal\.com|paypal\.de|dhl\.de|hermesworld\.com|myhermes\.de|dpd\.de|gls-pakete\.de|ups\.com|apple\.com|google\.com|adac\.de|dealnivo\.onrender\.com)$/i;
const BRAND_LOOKALIKE = /(kleinanzeigen|ebay|paypal|vinted|mobile-?de|autoscout|dhl|hermes|dpd)/i;
const SHORTENERS = /^(bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd|cutt\.ly|rb\.gy|shorturl\.at|ow\.ly|t\.ly|s\.id)$/i;

function quote(text: string, re: RegExp): string {
  const m = text.match(re);
  if (!m || m.index == null) return text.slice(0, 160);
  const start = Math.max(0, m.index - 50);
  return `${start > 0 ? "…" : ""}${text.slice(start, m.index + m[0].length + 60).trim()}${m.index + m[0].length + 60 < text.length ? "…" : ""}`;
}

const isSellerSide = (m: ChatMessage) => m.sender !== "buyer";

export function detectSignals(messages: ChatMessage[], listing: Pick<Listing, "category" | "platform">): ChatSignal[] {
  const out: ChatSignal[] = [];
  for (const r of RULES) {
    const hits = messages.filter((m) => (!r.sellerOnly || isSellerSide(m)) && r.re.test(m.text));
    if (!hits.length) continue;
    out.push({
      id: r.id,
      category: r.category,
      level: listing.category === "vehicle" && r.vehicleLevel ? r.vehicleLevel : r.level,
      title: r.title,
      explanation: r.explanation,
      evidence: hits.slice(0, 3).map((m) => ({ messageId: m.id, quote: quote(m.text, r.re) })),
      basis: "rule",
    });
  }

  // Links: fremde Domains, Nachahmungen bekannter Marken, Kurzlinks
  const links: { m: ChatMessage; host: string; url: string }[] = [];
  for (const m of messages.filter(isSellerSide)) {
    for (const raw of m.text.match(/(?:https?:\/\/|www\.)[^\s<>"')]+/gi) ?? []) {
      try {
        const u = new URL(/^https?:/i.test(raw) ? raw : `https://${raw}`);
        links.push({ m, host: u.hostname.toLowerCase().replace(/^www\./, ""), url: raw });
      } catch {
        /* ignorieren */
      }
    }
  }
  const lookalikes = links.filter((l) => !PLATFORM_HOSTS.test(l.host) && BRAND_LOOKALIKE.test(l.host));
  if (lookalikes.length)
    out.push({
      id: "phish_lookalike",
      category: "phishing",
      level: "high",
      title: "Link auf eine Seite, die einer bekannten Plattform ähnelt",
      explanation: `Die Adresse ${lookalikes[0].host} gehört nicht zur echten Plattform. Nachgemachte Bezahl- oder Versandseiten sind ein bekanntes Phishing-Muster.`,
      evidence: lookalikes.slice(0, 3).map((l) => ({ messageId: l.m.id, quote: l.url })),
      basis: "rule",
    });
  const shorts = links.filter((l) => SHORTENERS.test(l.host));
  const foreign = links.filter((l) => !PLATFORM_HOSTS.test(l.host) && !BRAND_LOOKALIKE.test(l.host) && !SHORTENERS.test(l.host));
  if (shorts.length || foreign.length)
    out.push({
      id: "phish_link",
      category: "phishing",
      level: "warning",
      title: shorts.length ? "Gekürzter oder unbekannter Link vom Verkäufer" : "Link auf eine fremde Website",
      explanation: "Öffne Links von Verkäufern nur, wenn klar ist, wohin sie führen, und gib dort keine Zahlungs- oder Zugangsdaten ein.",
      evidence: [...shorts, ...foreign].slice(0, 3).map((l) => ({ messageId: l.m.id, quote: l.url })),
      basis: "rule",
    });

  // Unbeantwortete Fragen des Käufers (nur wenn Absender erkennbar sind)
  const hasSenders = messages.some((m) => m.sender === "seller") && messages.some((m) => m.sender === "buyer");
  if (hasSenders) {
    const unanswered: ChatMessage[] = [];
    messages.forEach((m, i) => {
      if (m.sender === "buyer" && m.text.includes("?") && !messages.slice(i + 1).some((n) => n.sender === "seller")) unanswered.push(m);
    });
    if (unanswered.length)
      out.push({
        id: "missing_unanswered",
        category: "missing_info",
        level: "hint",
        title: "Fragen ohne Antwort im erfassten Verlauf",
        explanation: "Auf diese Fragen ist im hochgeladenen Verlauf keine Antwort zu sehen. Möglicherweise fehlt nur ein Screenshot.",
        evidence: unanswered.slice(0, 3).map((m) => ({ messageId: m.id, quote: m.text.slice(0, 160) })),
        basis: "rule",
      });
  }
  return out;
}

// ── Widersprüche Inserat ↔ Chat ────────────────────────────

function listingText(l: Listing): string {
  return [l.title, l.description, l.condition, l.accidentFree, l.serviceHistory, l.purchaseReceipt, l.activationLockFree, l.boxAndPapers].filter(Boolean).join(" \n ");
}

const NEG = /\b(kein|keine|keinen|nie|niemals|nicht|ohne|null)\b[^.!?]{0,25}$/i;
function positiveMention(text: string, re: RegExp): RegExpMatchArray | null {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  for (const m of text.matchAll(g)) {
    const before = text.slice(Math.max(0, (m.index ?? 0) - 40), m.index);
    if (!NEG.test(before)) return m;
  }
  return null;
}

function claimsYes(v: string | undefined, positive: RegExp): boolean {
  if (!v) return false;
  return positive.test(v) || /^(ja|yes|true|vorhanden|gegeben)\b/i.test(v.trim());
}

export function detectContradictions(messages: ChatMessage[], listing: Listing): ChatContradiction[] {
  const out: ChatContradiction[] = [];
  const lt = listingText(listing);
  const seller = messages.filter(isSellerSide);
  const add = (c: Omit<ChatContradiction, "id" | "basis">) => {
    if (!out.some((x) => x.field === c.field)) out.push({ ...c, id: `c${out.length + 1}`, basis: "rule" });
  };

  // Unfallfreiheit
  const accidentFreeClaim = claimsYes(listing.accidentFree, /unfallfrei/i) || positiveMention(lt, /unfallfrei/i) !== null;
  if (accidentFreeClaim && listing.category === "vehicle") {
    for (const m of seller) {
      const hard = positiveMention(m.text, /\b(unfall\w*|blechschaden|totalschaden|hagelschaden|parkrempler|auffahrunfall)\b/i);
      const soft = positiveMention(m.text, /\b(nachlackiert|neu\s*lackiert|lackiert|instand\s*gesetzt|(kotflügel|kotfluegel|stoßstange|stossstange|tür|tuer|motorhaube|heckklappe)\s*(wurde\s*)?(getauscht|ersetzt|erneuert|neu))\b/i);
      if (hard && !/unfallfrei/i.test(hard[0])) {
        add({
          field: "accidentFree",
          listingStatement: listing.accidentFree ? `Unfallfrei: ${listing.accidentFree}` : quote(lt, /unfallfrei/i),
          chatStatement: quote(m.text, /\b(unfall\w*|blechschaden|totalschaden|hagelschaden|parkrempler|auffahrunfall)\b/i),
          messageId: m.id,
          kind: "documented",
          explanation: "Im Inserat steht „unfallfrei“, im Chat wird ein Unfall bzw. Schaden erwähnt.",
        });
        break;
      }
      if (soft) {
        add({
          field: "accidentFree",
          listingStatement: listing.accidentFree ? `Unfallfrei: ${listing.accidentFree}` : quote(lt, /unfallfrei/i),
          chatStatement: quote(m.text, /\b(nachlackiert|neu\s*lackiert|lackiert|instand\s*gesetzt|getauscht|ersetzt|erneuert)\b/i),
          messageId: m.id,
          kind: "possible",
          explanation: "Lackier- oder Austauscharbeiten können auf einen reparierten Schaden hindeuten – nicht zwingend auf einen Unfall. Nachfragen und Belege zeigen lassen.",
        });
      }
    }
  }

  // Kilometerstand
  if (listing.mileageKm && listing.mileageKm > 1000) {
    for (const m of seller) {
      for (const hit of m.text.matchAll(/(\d{1,3}(?:[.\s]\d{3})+|\d{4,7})\s*(?:km|kilometer)\b/gi)) {
        const n = Number(hit[1].replace(/[.\s]/g, ""));
        if (n > 1000 && Math.abs(n - listing.mileageKm) / listing.mileageKm > 0.05) {
          add({
            field: "mileageKm",
            listingStatement: `Kilometerstand im Inserat: ${listing.mileageKm.toLocaleString("de-DE")} km`,
            chatStatement: quote(m.text, new RegExp(hit[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))),
            messageId: m.id,
            kind: "documented",
            explanation: "Im Chat wird ein anderer Kilometerstand genannt als im Inserat.",
          });
        }
      }
    }
  }

  // Scheckheft / Wartung
  if (claimsYes(listing.serviceHistory, /scheckheft|lückenlos|lueckenlos/i) || positiveMention(lt, /scheckheft\w*/i)) {
    for (const m of seller) {
      if (/\b(kein\w*\s*scheckheft|scheckheft\s*(fehlt|nicht\s*(mehr\s*)?(vorhanden|da)|ist\s*weg|verloren)|nicht\s*scheckheft\w*|wartung\w*\s*(fehl|nicht\s*nachweis)|lücke\w*\s*im\s*scheckheft|keine\s*(wartungs)?nachweise)\b/i.test(m.text)) {
        add({
          field: "serviceHistory",
          listingStatement: listing.serviceHistory ? `Wartung: ${listing.serviceHistory}` : quote(lt, /scheckheft/i),
          chatStatement: quote(m.text, /scheckheft|wartung|nachweis/i),
          messageId: m.id,
          kind: "documented",
          explanation: "Das Inserat nennt ein (lückenloses) Scheckheft, im Chat wird das eingeschränkt.",
        });
        break;
      }
    }
  }

  // Vorbesitzer
  if (listing.previousOwners != null) {
    for (const m of seller) {
      const h = m.text.match(/\b(\d)\s*\.?\s*(hand|halter|vorbesitzer)\b/i);
      if (h && Number(h[1]) !== listing.previousOwners && Number(h[1]) !== listing.previousOwners + 1) {
        add({
          field: "previousOwners",
          listingStatement: `Vorbesitzer im Inserat: ${listing.previousOwners}`,
          chatStatement: quote(m.text, /\b\d\s*\.?\s*(hand|halter|vorbesitzer)\b/i),
          messageId: m.id,
          kind: "possible",
          explanation: "Die Anzahl der Halter im Chat passt nicht eindeutig zum Inserat (Zählweise „x. Hand“ beachten).",
        });
        break;
      }
    }
  }

  // Mängelfreiheit
  const noDefectClaim = /\b(ohne\s*mängel|keine\s*mängel|mängelfrei|maengelfrei|top\s*zustand|neuwertig|wie\s*neu|einwandfrei|voll\s*funktionsfähig|funktioniert\s*einwandfrei)\b/i;
  if (noDefectClaim.test(lt)) {
    for (const m of seller) {
      const d = positiveMention(m.text, /\b(defekt\w*|kaputt|funktioniert\s*nicht|geht\s*nicht|riss\w*|gesprungen|macke\w*|delle\w*|kratzer\w*|leck\w*|ölverlust|oelverlust|rost\w*|reparatur\s*nötig|werkstatt\s*muss)\b/i);
      if (d) {
        add({
          field: "condition",
          listingStatement: quote(lt, noDefectClaim),
          chatStatement: quote(m.text, /\b(defekt\w*|kaputt|funktioniert\s*nicht|geht\s*nicht|riss\w*|gesprungen|macke\w*|delle\w*|kratzer\w*|leck\w*|ölverlust|oelverlust|rost\w*|reparatur\s*nötig|werkstatt\s*muss)\b/i),
          messageId: m.id,
          kind: /defekt|kaputt|funktioniert\s*nicht|geht\s*nicht|riss|gesprungen|ölverlust|oelverlust/i.test(d[0]) ? "documented" : "possible",
          explanation: "Das Inserat beschreibt einen mängelfreien Zustand, im Chat wird ein Mangel erwähnt.",
        });
        break;
      }
    }
  }

  // Aktivierungssperre (Elektronik)
  if (listing.category === "electronics" && (claimsYes(listing.activationLockFree, /frei|deaktiviert|abgemeldet/i) || /icloud\s*frei|aktivierungssperre\s*(aus|deaktiviert)/i.test(lt))) {
    for (const m of seller) {
      if (positiveMention(m.text, /\b(icloud[- ]?(gesperrt|sperre|lock)|aktivierungssperre\s*(aktiv|an|drin)|noch\s*(mit\s*)?(meinem|einem)\s*(apple-?id|konto)\s*verknüpft|google[- ]?sperre|frp)\b/i)) {
        add({
          field: "activationLockFree",
          listingStatement: listing.activationLockFree ? `Aktivierungssperre: ${listing.activationLockFree}` : "Inserat: Gerät frei / abgemeldet",
          chatStatement: quote(m.text, /icloud|aktivierungssperre|apple-?id|konto|google|frp/i),
          messageId: m.id,
          kind: "documented",
          explanation: "Laut Inserat ist das Gerät frei, im Chat ist von einer aktiven Sperre bzw. Kontoverknüpfung die Rede.",
        });
        break;
      }
    }
  }

  // Rechnung / Kaufbeleg
  if (claimsYes(listing.purchaseReceipt, /vorhanden|ja|rechnung/i) || positiveMention(lt, /\b(rechnung|kaufbeleg|quittung)\s*(vorhanden|liegt\s*bei|dabei)\b/i)) {
    for (const m of seller) {
      if (/\b(keine\s*(rechnung|quittung|kaufbeleg)|rechnung\s*(nicht\s*mehr|fehlt|verloren|ist\s*weg))\b/i.test(m.text)) {
        add({
          field: "purchaseReceipt",
          listingStatement: listing.purchaseReceipt ? `Rechnung: ${listing.purchaseReceipt}` : quote(lt, /rechnung|kaufbeleg|quittung/i),
          chatStatement: quote(m.text, /rechnung|quittung|kaufbeleg/i),
          messageId: m.id,
          kind: "documented",
          explanation: "Laut Inserat liegt ein Kaufbeleg vor, im Chat nicht mehr.",
        });
        break;
      }
    }
  }
  return out;
}

// ── Bewertung & Empfehlungen ────────────────────────────────

export function categorize(signals: ChatSignal[], contradictions: ChatContradiction[]) {
  const rank = { none: 0, hint: 1, warning: 2, high: 3 } as const;
  const cats = Object.fromEntries(CHAT_CATEGORIES.map((c) => [c, { level: "none" as keyof typeof rank, count: 0 }])) as Record<ChatCategory, { level: keyof typeof rank; count: number }>;
  for (const s of signals) {
    const c = cats[s.category];
    c.count++;
    if (rank[s.level] > rank[c.level]) c.level = s.level;
  }
  for (const x of contradictions) {
    const c = cats.contradiction;
    c.count++;
    const lvl = x.kind === "documented" ? "high" : "warning";
    if (rank[lvl] > rank[c.level]) c.level = lvl;
  }
  return cats;
}

export function updateRecommendation(previous: Recommendation, signals: ChatSignal[], contradictions: ChatContradiction[]): { current: Recommendation; reason: string } {
  const high = signals.filter((s) => s.level === "high");
  const docSevere = contradictions.filter((c) => c.kind === "documented");
  if (high.length || docSevere.length) {
    const why = [
      ...high.slice(0, 2).map((s) => s.title),
      ...docSevere.slice(0, 2).map((c) => `Widerspruch: ${c.explanation}`),
    ].join(" · ");
    return { current: "elevated_risk", reason: `Nach der Chatprüfung erhöhtes Risiko: ${why}` };
  }
  const warnings = signals.filter((s) => s.level === "warning").length + contradictions.length;
  if (warnings && previous === "interesting") return { current: "inspect_further", reason: "Im Chat gibt es Warnhinweise – vor dem Kauf genauer prüfen bzw. nachfragen." };
  return { current: previous, reason: warnings ? "Der Chat enthält Hinweise, die Einschätzung bleibt aber unverändert." : "Im erfassten Chatverlauf wurden keine Warnsignale erkannt." };
}

export function safePaymentAdvice(listing: Pick<Listing, "platform" | "category">): string[] {
  const out: string[] = [];
  if (listing.platform === "kleinanzeigen") out.push("Bei Versand nur die Bezahlfunktion „Sicher bezahlen“ direkt in der Kleinanzeigen-App nutzen – keine zugeschickten Links.");
  if (listing.platform === "ebay") out.push("Nur über den eBay-Checkout bezahlen, nicht per Überweisung oder außerhalb von eBay.");
  if (listing.platform === "vinted") out.push("Nur über die Vinted-Bezahlfunktion in der App zahlen, nie außerhalb.");
  if (listing.category === "vehicle")
    out.push("Fahrzeuge erst bei Übergabe bezahlen: nach Besichtigung, Abgleich der Papiere (Fahrzeugbrief, FIN) und mit schriftlichem Kaufvertrag – z. B. Barzahlung gegen Quittung oder Echtzeitüberweisung vor Ort.");
  else out.push("Bei Abholung erst nach Prüfung bezahlen (bar oder Echtzeitüberweisung vor Ort).");
  out.push("Nie per Gutscheinkarte, Bargeldtransfer, Kryptowährung oder PayPal „Freunde & Familie“ zahlen.");
  out.push("Keine Ausweiskopien, Codes, Passwörter oder Kartendaten an Verkäufer weitergeben.");
  return out;
}

export function buildQuestions(contradictions: ChatContradiction[], signals: ChatSignal[], report?: Pick<AnalysisReport, "missingInfo">): string[] {
  const q: string[] = [];
  for (const c of contradictions.slice(0, 3)) q.push(`Im Inserat steht „${c.listingStatement.slice(0, 80)}“, im Chat „${c.chatStatement.slice(0, 80)}“ – können Sie das bitte erklären und Belege zeigen?`);
  if (signals.some((s) => s.id === "comm_no_inspection")) q.push("Ist eine Besichtigung vor dem Kauf möglich? Ohne Besichtigung kann ich leider nicht kaufen.");
  if (signals.some((s) => s.category === "payment")) q.push("Können wir den Kauf über die geschützte Bezahlfunktion der Plattform bzw. bei persönlicher Übergabe abwickeln?");
  for (const m of (report?.missingInfo ?? []).filter((x) => x.importance === "critical").slice(0, 2)) q.push(m.question);
  return [...new Set(q)].slice(0, 6);
}

export function buildReplyDraft(questions: string[], signals: ChatSignal[]): string | undefined {
  if (!questions.length && !signals.length) return undefined;
  const lines = ["Hallo,", "", "vielen Dank für Ihre Nachricht. Bevor ich mich entscheide, habe ich noch ein paar Fragen:"];
  for (const q of questions.slice(0, 4)) lines.push(`• ${q}`);
  if (signals.some((s) => s.category === "payment" || s.category === "shipping"))
    lines.push("", "Bezahlen möchte ich ausschließlich über die geschützte Bezahlfunktion der Plattform bzw. bei persönlicher Übergabe nach Besichtigung.");
  lines.push("", "Viele Grüße");
  return lines.join("\n");
}

export const CHAT_DISCLAIMER =
  "Die Chatprüfung erkennt typische Warnsignale und Widersprüche im hochgeladenen Verlauf. Sie ist kein Beweis für ein Fehlverhalten des Verkäufers – Hinweise können auch harmlose Gründe haben. Ausgewertet wurde nur, was du hochgeladen hast.";
