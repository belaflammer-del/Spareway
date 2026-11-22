/**
 * Verkäuferanalyse: Strukturierung, Deduplizierung, Klassifizierung und
 * Aggregation von Bewertungen (aus API, OCR von Screenshots/Video-Frames
 * oder eingefügtem Text).
 *
 * Wichtig: Bewertungen sind Behauptungen anderer Nutzer – keine Tatsachen.
 */
import type { ComplaintCategory, Review, SellerAnalysis } from "../domain/schemas";
import { COMPLAINT_LABELS } from "../domain/labels";
import { sanitizeUntrustedText } from "../security/untrusted";
import { newId } from "../utils";

export interface RawReview {
  text: string;
  sentiment?: Review["sentiment"];
  date?: string;
  evidenceRef?: string;
}

const COMPLAINT_KEYWORDS: Record<Exclude<ComplaintCategory, "other">, RegExp> = {
  not_received: /\b(nie\s+angekommen|nicht\s+(angekommen|erhalten|geliefert)|nichts\s+(erhalten|bekommen)|ware\s+fehlt|never\s+(arrived|received))\b/i,
  not_as_described: /\b(nicht\s+wie\s+beschrieben|entspricht\s+nicht|weicht\s+ab|anders\s+als\s+(beschrieben|auf\s+den\s+bildern)|verschwiegen|defekt\s+angekommen|mängel\s+verschwiegen|not\s+as\s+described)\b/i,
  counterfeit_suspicion: /\b(fake|fälschung|gefälscht|plagiat|replik|nicht\s+(echt|original)|counterfeit)\b/i,
  payment_issues: /\b(geld\s+(nicht\s+)?(zurück|erstattet)|rückerstattung|zahlung\w*\s+(problem|abgelehnt)|vorkasse|überweisung\s+(weg|verloren))\b/i,
  communication: /\b(keine\s+antwort|antwortet\s+nicht|nicht\s+erreichbar|unfreundlich|ignoriert|meldet\s+sich\s+nicht|unhöflich)\b/i,
  shipping: /\b(versand\w*|verpackung\w*|lieferung\s+(dauerte|verspätet)|zu\s+spät|beschädigt\s+angekommen|schlecht\s+verpackt)\b/i,
};

const NEG_HINTS = /\b(negativ|enttäuscht|betrug|abzocke|nie\s+wieder|finger\s+weg|schlecht|katastrophe|ärgerlich|nicht\s+zu\s+empfehlen)\b/i;
const POS_HINTS = /\b(positiv|top|super|schnell|zuverlässig|freundlich|gerne\s+wieder|alles\s+bestens|empfehlenswert|reibungslos|einwandfrei|perfekt|danke)\b/i;
const NEUTRAL_HINTS = /\b(neutral|ok(ay)?|in\s+ordnung|geht\s+so)\b/i;

export function normalizeReviewText(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9äöüß ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  const p = `  ${s} `;
  for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
  return out;
}

export function similarity(a: string, b: string): number {
  const A = trigrams(normalizeReviewText(a));
  const B = trigrams(normalizeReviewText(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Abgeschnittene Bewertung (z. B. am Frame-Rand) ist in der längeren enthalten. */
function isContained(a: string, b: string): boolean {
  const na = normalizeReviewText(a);
  const nb = normalizeReviewText(b);
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  return short.length >= 20 && long.includes(short);
}

/**
 * Entfernt Duplikate, wie sie beim Scrollen durch Bildschirmaufnahmen
 * (überlappende Frames) oder mehrfach hochgeladene Screenshots entstehen.
 */
export function dedupeReviews(raw: RawReview[], threshold = 0.82): { unique: RawReview[]; duplicates: number } {
  const unique: RawReview[] = [];
  let duplicates = 0;
  for (const r of raw) {
    const text = r.text.trim();
    if (normalizeReviewText(text).length < 2) continue;
    const dupIdx = unique.findIndex(
      (u) => (u.date ?? "") === (r.date ?? "") && (normalizeReviewText(u.text) === normalizeReviewText(text) || isContained(u.text, text) || similarity(u.text, text) >= threshold),
    );
    if (dupIdx >= 0) {
      duplicates++;
      // längere (vollständiger erfasste) Variante behalten
      if (text.length > unique[dupIdx].text.length) unique[dupIdx] = { ...unique[dupIdx], ...r, text };
    } else unique.push({ ...r, text });
  }
  return { unique, duplicates };
}

export function classifyComplaints(text: string): ComplaintCategory[] {
  const cats: ComplaintCategory[] = [];
  for (const [cat, re] of Object.entries(COMPLAINT_KEYWORDS) as [ComplaintCategory, RegExp][]) if (re.test(text)) cats.push(cat);
  return cats;
}

export function inferSentiment(text: string): Review["sentiment"] {
  const stars = text.match(/([★⭐])/g)?.length;
  if (stars) return stars >= 4 ? "positive" : stars === 3 ? "neutral" : "negative";
  const neg = NEG_HINTS.test(text) || classifyComplaints(text).length > 0;
  const pos = POS_HINTS.test(text);
  if (neg && !pos) return "negative";
  if (pos && !neg) return "positive";
  if (NEUTRAL_HINTS.test(text)) return "neutral";
  return "unknown";
}

/**
 * Zerlegt eingefügten Text in einzelne Bewertungen. Erkennt Blöcke,
 * die durch Leerzeilen getrennt sind, sowie explizite Marker wie
 * „Positiv:“, „Negativ:“, „Neutral:“ am Zeilenanfang.
 */
export function parsePastedReviews(input: string): RawReview[] {
  const text = sanitizeUntrustedText(input, 50_000);
  const blocks = text.split(/\n\s*\n|\r\n\s*\r\n/).map((b) => b.trim()).filter(Boolean);
  const lines = blocks.length <= 1 ? text.split(/\n/).map((l) => l.trim()).filter(Boolean) : blocks;
  return lines.map((b) => {
    const m = b.match(/^(positiv|negativ|neutral|positive|negative)\s*[:\-–]\s*/i);
    const date = b.match(/\b(\d{1,2}\.\d{1,2}\.(\d{2}|\d{4}))\b/)?.[1];
    let sentiment: Review["sentiment"] | undefined;
    if (m) sentiment = /^pos/i.test(m[1]) ? "positive" : /^neg/i.test(m[1]) ? "negative" : "neutral";
    return { text: m ? b.slice(m[0].length) : b, sentiment, date };
  });
}

export function analyzeSeller(input: {
  raw: RawReview[];
  inputMethod: SellerAnalysis["inputMethod"];
  unreadableSegments?: number;
  platformTotalClaimed?: number;
  aiSummary?: string;
}): SellerAnalysis {
  const { unique, duplicates } = dedupeReviews(input.raw);
  const reviews: Review[] = unique.map((r) => {
    const explicit = r.sentiment && r.sentiment !== "unknown";
    return {
      id: newId("rev"),
      text: sanitizeUntrustedText(r.text, 2000),
      sentiment: explicit ? (r.sentiment as Review["sentiment"]) : inferSentiment(r.text),
      sentimentSource: explicit ? "explicit" : "inferred",
      date: r.date,
      complaintCategories: classifyComplaints(r.text),
      evidenceRef: r.evidenceRef,
    };
  });

  const count = (s: Review["sentiment"]) => reviews.filter((r) => r.sentiment === s).length;
  const positive = count("positive");
  const neutral = count("neutral");
  const negative = count("negative");
  const unknown = count("unknown");

  // Beschwerden nur aus nicht-positiven Bewertungen zählen (Kontext!)
  const complaintMap = new Map<ComplaintCategory, Review[]>();
  for (const r of reviews) {
    if (r.sentiment === "positive") continue;
    const cats = r.complaintCategories.length ? r.complaintCategories : r.sentiment === "negative" ? (["other"] as ComplaintCategory[]) : [];
    for (const c of cats) complaintMap.set(c, [...(complaintMap.get(c) ?? []), r]);
  }
  const complaints = [...complaintMap.entries()]
    .map(([category, rs]) => ({
      category,
      count: rs.length,
      examples: rs.slice(0, 3).map((r) => ({ text: r.text.slice(0, 280), evidenceRef: r.evidenceRef })),
    }))
    .sort((a, b) => b.count - a.count);

  const patterns: SellerAnalysis["patterns"] = [];
  // Auffällig viele nahezu identische Bewertungstexte
  let nearIdentical = 0;
  for (let i = 0; i < reviews.length; i++)
    for (let j = i + 1; j < reviews.length; j++) if (reviews[i].text.length > 25 && similarity(reviews[i].text, reviews[j].text) > 0.6) nearIdentical++;
  if (nearIdentical >= 3)
    patterns.push({
      title: "Sehr ähnliche Bewertungstexte",
      detail: `${nearIdentical} Paare auffällig ähnlicher Bewertungen erkannt. Das kann auf Textbausteine, aber auch auf gekaufte Bewertungen hindeuten – nicht eindeutig.`,
      severity: "low",
    });
  // Viele Bewertungen am selben Tag
  const byDate = new Map<string, number>();
  for (const r of reviews) if (r.date) byDate.set(r.date, (byDate.get(r.date) ?? 0) + 1);
  const maxSameDay = Math.max(0, ...byDate.values());
  if (reviews.length >= 6 && maxSameDay >= Math.max(4, reviews.length * 0.4))
    patterns.push({
      title: "Viele Bewertungen am selben Tag",
      detail: `${maxSameDay} Bewertungen tragen dasselbe Datum. Bei Händlern normal, bei Privatverkäufern ungewöhnlich.`,
      severity: "info",
    });
  if (unknown > reviews.length * 0.5 && reviews.length > 0)
    patterns.push({
      title: "Viele Bewertungen nicht eindeutig einzuordnen",
      detail: "Für über die Hälfte der Bewertungen war keine eindeutige Tendenz erkennbar. Lies die Texte selbst.",
      severity: "info",
    });

  const trustSignals: string[] = [];
  if (reviews.length >= 20 && negative / Math.max(1, reviews.length) < 0.05) trustSignals.push("Viele überwiegend positive Bewertungen");
  if (reviews.some((r) => /\b(schnell|zügig)\b/i.test(r.text) && r.sentiment === "positive")) trustSignals.push("Mehrfach schnelle Abwicklung erwähnt");
  if (reviews.some((r) => /\b(wie\s+beschrieben|genau\s+wie\s+beschrieben)\b/i.test(r.text))) trustSignals.push("Artikel laut Käufern wie beschrieben");

  const n = reviews.length;
  const coverageNote =
    n === 0
      ? "Es konnten keine Bewertungen erkannt werden. Bitte lade besser lesbare Screenshots oder eine langsamere Bildschirmaufnahme hoch."
      : input.platformTotalClaimed && input.platformTotalClaimed > n
        ? `${n} von ${input.platformTotalClaimed} laut Profil vorhandenen Bewertungen erkannt. Es wurde nur ein Teil analysiert.`
        : `${n} Bewertungen erkannt. Es ist möglich, dass das Profil weitere Bewertungen enthält, die nicht erfasst wurden.`;

  const summary =
    input.aiSummary ??
    (n === 0
      ? "Keine auswertbaren Bewertungen."
      : `${positive} positive, ${neutral} neutrale und ${negative} negative Bewertungen erkannt` +
        (unknown ? ` (${unknown} ohne eindeutige Tendenz)` : "") +
        "." +
        (complaints.length ? ` Häufigstes Beschwerdethema: „${COMPLAINT_LABELS[complaints[0].category]}“ (${complaints[0].count}×).` : ""));

  return {
    inputMethod: input.inputMethod,
    visibleReviewCount: n,
    duplicatesRemoved: duplicates,
    unreadableSegments: input.unreadableSegments ?? 0,
    positive,
    neutral,
    negative,
    unknown,
    platformTotalClaimed: input.platformTotalClaimed,
    coverageNote,
    complaints,
    patterns,
    trustSignals,
    summary,
    reviews,
    disclaimer:
      "Bewertungen sind Aussagen anderer Nutzer und wurden nicht überprüft. Einzelne negative Bewertungen sind kein Beleg für unseriöses Verhalten. Diese Analyse ist keine Beurteilung der Person des Verkäufers.",
  };
}
