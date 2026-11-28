import type { OutcomeData } from "./schemas";

export interface SavingsSummary {
  /** Anzahl Käufe mit angegebenem Preis */
  bought: number;
  /** Summe aus (Angebotspreis − bezahlter Preis), nur positive Differenzen */
  savedEur: number;
  /** Nicht gekauft, obwohl bzw. weil DEAL-NIVO ein erhöhtes Risiko gesehen hat */
  avoidedRisky: number;
  /** Alle erfassten Entscheidungen */
  decided: number;
}

/** Ersparnis eines einzelnen Kaufs gegenüber dem Angebotspreis (nie negativ). */
export function savedFor(o: Pick<OutcomeData, "status" | "paidEur" | "askingEur">): number {
  if (o.status !== "bought" || o.paidEur == null || o.askingEur == null) return 0;
  return Math.max(0, Math.round((o.askingEur - o.paidEur) * 100) / 100);
}

/** Fasst die jeweils neueste Entscheidung je Analyse zusammen. Eingabe: neueste zuerst. */
export function summarizeSavings(items: { analysisId: string; data: OutcomeData }[]): SavingsSummary {
  const latest = new Map<string, OutcomeData>();
  for (const it of items) if (!latest.has(it.analysisId)) latest.set(it.analysisId, it.data);
  const s: SavingsSummary = { bought: 0, savedEur: 0, avoidedRisky: 0, decided: latest.size };
  for (const o of latest.values()) {
    if (o.status === "bought") {
      s.bought++;
      s.savedEur += savedFor(o);
    } else if (o.recommendation === "elevated_risk") s.avoidedRisky++;
  }
  s.savedEur = Math.round(s.savedEur * 100) / 100;
  return s;
}
