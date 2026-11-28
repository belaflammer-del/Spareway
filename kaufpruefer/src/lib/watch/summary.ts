import { z } from "zod";
import { BASE_RULES } from "../ai/prompts";
import type { AIProvider, UsageMeter } from "../ai/provider";
import type { SnapshotData } from "../akte/schemas";
import type { AnalysisReport } from "../domain/schemas";
import { buildReportContext } from "../pipeline/assistant";
import { wrapUntrusted } from "../security/untrusted";

type Change = SnapshotData["changes"][number];
export type WatchSummary = NonNullable<SnapshotData["summary"]>;

const eur = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;

/**
 * Regelbasierte Zusammenfassung mit Kaufeinschätzung – nutzt nur die
 * tatsächlich erfassten Änderungen und den vorhandenen Bericht.
 */
export function ruleSummary(changes: Change[], report: AnalysisReport, snap: Pick<SnapshotData, "priceEur">): WatchSummary {
  const parts: string[] = [];
  const advice: string[] = [];
  let tone: WatchSummary["tone"] = "neutral";
  const m = report.market;

  if (changes.some((c) => c.type === "availability")) {
    return { text: "Das Angebot ist nicht mehr verfügbar.", assessment: "Die Beobachtung wurde beendet. Prüfe ähnliche Angebote mit einem neuen Check.", tone: "neutral", basis: "rules" };
  }
  const price = changes.find((c) => c.type === "price");
  if (price) {
    parts.push(price.summary + ".");
    if (snap.priceEur != null && m.status === "ok" && m.range) {
      const dev = Math.round(((snap.priceEur - m.range.median) / m.range.median) * 100);
      parts.push(`Der neue Preis liegt ${Math.abs(dev)} % ${dev <= 0 ? "unter" : "über"} dem Marktmittel der Erstprüfung (${eur(m.range.median)}).`);
      if (snap.priceEur <= m.range.median) {
        advice.push("Preislich ist das Angebot jetzt interessanter.");
        tone = "positive";
      } else if (snap.priceEur > m.range.high) advice.push("Der Preis liegt weiterhin über dem üblichen Marktbereich – Verhandlungsspielraum nutzen.");
    } else if (/gesenkt/.test(price.summary)) {
      advice.push("Ob der Preis jetzt fair ist, lässt sich ohne Marktdaten nicht sicher sagen.");
      tone = "positive";
    }
  }
  const removed = changes.filter((c) => c.type === "statement_removed");
  for (const r of removed.slice(0, 2)) parts.push(r.summary);
  if (removed.length) {
    advice.push("Frag beim Verkäufer nach, warum die Angabe entfernt wurde, und lass sie dir schriftlich bestätigen.");
    tone = "caution";
  }
  const attrs = changes.filter((c) => c.type === "attribute" && c.important);
  for (const a of attrs.slice(0, 2)) parts.push(a.summary + ".");
  if (attrs.length) {
    advice.push("Geänderte Eckdaten sind ein Warnsignal – Widerspruch vor einer Besichtigung klären.");
    tone = "caution";
  }
  const neg = changes.find((c) => c.type === "statement_added" && c.field === "negative");
  if (neg) {
    parts.push("In der Beschreibung wird neu ein Mangel erwähnt.");
    advice.push("Den neuen Mangel in die Kostenrechnung aufnehmen.");
    tone = "caution";
  }
  if (!parts.length) parts.push(changes.map((c) => c.summary).join(" ") || "Keine wesentlichen Änderungen.");
  return { text: parts.join(" "), assessment: advice.join(" ") || "Die Einschätzung aus der Erstprüfung gilt weiter.", tone, basis: "rules" };
}

export const WatchSummaryAiSchema = z.object({ text: z.string(), assessment: z.string(), tone: z.enum(["positive", "neutral", "caution"]) });

const PROMPT = `${BASE_RULES}

Aufgabe: Ein Käufer beobachtet ein Inserat. Fasse die erfassten ÄNDERUNGEN in max. 2 Sätzen zusammen (text) und gib eine kurze Kaufeinschätzung in max. 2 Sätzen (assessment).
- Nutze ausschließlich die Angaben aus BERICHT und ÄNDERUNGEN. Keine neuen Preise, Marktwerte oder Fakten erfinden.
- tone: positive (z. B. fairerer Preis), caution (z. B. entfernte Angaben, Widersprüche), sonst neutral.`;

/** KI-Variante: gleiche Fakten, natürlich formuliert. Fällt bei Fehlern auf die Regelversion zurück. */
export async function buildWatchSummary(
  changes: Change[],
  report: AnalysisReport,
  snap: Pick<SnapshotData, "priceEur">,
  deps: { ai: AIProvider | null; meter?: UsageMeter },
): Promise<WatchSummary> {
  const base = ruleSummary(changes, report, snap);
  if (!deps.ai || !changes.some((c) => c.important)) return base;
  try {
    const { data, usage } = await deps.ai.generate({
      task: "watch_summary",
      system: PROMPT,
      parts: [
        { type: "text", text: `BERICHT:\n${wrapUntrusted("bericht", buildReportContext(report))}` },
        { type: "text", text: `ÄNDERUNGEN:\n${wrapUntrusted("aenderungen", changes.map((c) => `- ${c.summary}${c.before ? ` (vorher: ${c.before})` : ""}${c.after ? ` (jetzt: ${c.after})` : ""}`).join("\n"))}` },
        { type: "text", text: `Regelbasierte Einschätzung zur Orientierung: ${base.assessment}` },
      ],
      schema: WatchSummaryAiSchema,
      schemaName: "watch_summary",
      maxOutputTokens: 500,
    });
    deps.meter?.add("watch_summary", deps.ai.model, usage);
    return { text: data.text.slice(0, 500), assessment: data.assessment.slice(0, 500), tone: base.tone === "caution" ? "caution" : data.tone, basis: "ai" };
  } catch {
    return base;
  }
}
