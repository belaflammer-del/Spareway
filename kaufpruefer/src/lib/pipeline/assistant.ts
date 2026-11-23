/**
 * KI-Rückfragen zum fertigen Kaufbericht. Der Assistent nutzt ausschließlich
 * den vorhandenen Bericht als Kontext – keine neue Analyse, keine neuen Fakten.
 */
import { z } from "zod";
import { BASE_RULES } from "../ai/prompts";
import type { AIProvider, UsageMeter } from "../ai/provider";
import { CLAIM_SOURCE_LABELS, EVIDENCE_LABELS, formatEur, PRICE_RATING_LABELS, RECOMMENDATION_LABELS } from "../domain/labels";
import type { AnalysisReport } from "../domain/schemas";
import { sanitizeUntrustedText, wrapUntrusted } from "../security/untrusted";

export const AssistantOutputSchema = z.object({
  answer: z.string(),
  basedOn: z.array(z.string()),
  insufficientData: z.boolean(),
});

export const ASSISTANT_PROMPT = `${BASE_RULES}

Du beantwortest Fragen eines Käufers zu einem bereits erstellten DEAL-NIVO-Prüfbericht.
- Nutze AUSSCHLIESSLICH die Angaben im Abschnitt BERICHT. Keine neuen Fakten, Preise, Marktwerte, Reparaturkosten oder Quellen erfinden.
- Steht die Antwort nicht im Bericht, sage das klar (insufficientData=true) und nenne, wie der Käufer es herausfinden kann (z. B. Werkstatt-Kostenvoranschlag, Frage an den Verkäufer, Fachbetrieb).
- Kennzeichne nicht verifizierte Hinweise als solche. Bewertungen anderer Käufer sind Behauptungen, keine Tatsachen.
- basedOn: Namen der genutzten Berichtsabschnitte (z. B. "Preis", "Risiken", "Verkäufer", "Checkliste").
- Antworte kurz (max. 6 Sätze oder 5 Stichpunkte), freundlich, auf Deutsch.`;

/** Kompakter, textueller Berichtskontext (keine Bilder, keine personenbezogenen Daten). */
export function buildReportContext(r: AnalysisReport): string {
  const l = r.listing;
  const lines: string[] = [];
  lines.push(`Produkt: ${l.title ?? [l.brand, l.model].filter(Boolean).join(" ")} (${l.category}, Plattform ${l.platform})`);
  const facts = ["brand", "model", "variant", "year", "mileageKm", "engine", "fuel", "transmission", "powerKw", "serviceHistory", "accidentFree", "storageGb", "batteryHealthPct", "activationLockFree", "condition", "boxAndPapers", "purchaseReceipt"]
    .map((k) => [k, (l as Record<string, unknown>)[k]] as const)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${k}=${String(v)}`);
  lines.push(`Angaben: ${facts.join("; ")}`);
  lines.push(`Angebotspreis: ${formatEur(l.priceEur)}`);
  const m = r.market;
  lines.push(
    m.status === "ok" && m.range
      ? `Preis: ${PRICE_RATING_LABELS[m.rating]}, Marktbereich ${formatEur(m.range.low)}–${formatEur(m.range.high)} (Median ${formatEur(m.range.median)}), Abweichung ${m.deviationPct} %, ${m.comparables.used} Vergleiche (${m.comparables.soldPrices} Verkaufspreise)`
      : "Preis: Marktwert nicht verlässlich bestimmbar (zu wenige Vergleichsdaten)",
  );
  lines.push(`Deal-Score: ${r.score.overall ?? "keiner"} / 100, Empfehlung: ${RECOMMENDATION_LABELS[r.score.recommendation]}, Datenqualität ${r.dataQuality.score}/100`);
  if (r.product.conditionSummary) lines.push(`Zustand: ${r.product.conditionSummary}`);
  for (const f of r.product.imageFindings.slice(0, 8)) lines.push(`Bildbefund (${EVIDENCE_LABELS[f.evidenceLevel]}): ${f.title} – ${f.detail}`);
  for (const w of r.product.weaknesses.slice(0, 6)) lines.push(`Schwachstelle [${CLAIM_SOURCE_LABELS[w.claim.source.type]}${w.claim.verified ? ", geprüft" : ""}]: ${w.title} (gilt für ${w.appliesTo}). Prüfen: ${w.checkAdvice ?? "–"}`);
  for (const x of r.risks.slice(0, 8)) lines.push(`Risiko (${x.severity}): ${x.title} – ${x.explanation}${x.caveat ? ` Hinweis: ${x.caveat}` : ""}`);
  if (r.seller) {
    const s = r.seller;
    lines.push(`Verkäufer: ${s.visibleReviewCount} erfasste Bewertungen (${s.positive} positiv, ${s.neutral} neutral, ${s.negative} negativ). ${s.coverageNote}`);
    for (const c of s.complaints.slice(0, 4)) lines.push(`Beschwerdethema ${c.category} (${c.count}×): ${c.examples.map((e) => `„${e.text.slice(0, 160)}“`).join(" ")}`);
  } else lines.push("Verkäufer: nicht geprüft");
  lines.push(`Fragen an Verkäufer: ${r.checklist.questionsForSeller.slice(0, 6).join(" | ")}`);
  lines.push(`Besichtigung: ${r.checklist.inspection.slice(0, 8).join(" | ")}`);
  lines.push(`Unterlagen: ${r.checklist.documents.slice(0, 6).join(" | ")}`);
  if (r.negotiation.possible) lines.push(`Verhandlung: ${r.negotiation.arguments.map((a) => a.text).join(" | ")}${r.negotiation.suggestedOpeningEur ? `; Vorschlag ${formatEur(r.negotiation.suggestedOpeningEur)}` : ""}`);
  lines.push(`Bezahlung: ${r.payment.slice(0, 5).map((p) => p.title).join(" | ")}`);
  if (r.isDemo) lines.push("ACHTUNG: Demo-Bericht mit fiktiven Daten.");
  return lines.join("\n");
}

export async function askReport(
  ai: AIProvider,
  meter: UsageMeter,
  report: AnalysisReport,
  question: string,
  history: { q: string; a: string }[],
) {
  const q = sanitizeUntrustedText(question, 500);
  const { data, usage } = await ai.generate({
    task: "chat",
    system: ASSISTANT_PROMPT,
    parts: [
      { type: "text", text: `BERICHT:\n${wrapUntrusted("bericht", buildReportContext(report))}` },
      ...(history.length ? [{ type: "text" as const, text: `Bisherige Fragen:\n${history.slice(-3).map((h) => `F: ${h.q}\nA: ${h.a}`).join("\n")}` }] : []),
      { type: "text", text: `FRAGE DES KÄUFERS:\n${wrapUntrusted("frage", q)}` },
    ],
    schema: AssistantOutputSchema,
    schemaName: "report_assistant",
    maxOutputTokens: 900,
  });
  meter.add("chat", ai.model, usage);
  return { ...data, answer: sanitizeUntrustedText(data.answer, 2000) };
}
