import "server-only";
import type { Recommendation } from "../domain/schemas";
import { getStore } from "../store";
import type { JobRecord, ModuleRecord, WatchRecord } from "../store/akte-types";
import type { AnalysisRecord } from "../store/types";
import type { ChatCheckData, CostAnalysisData, ImageMatchData, InspectionData, OutcomeData, SnapshotData } from "./schemas";

export interface Akte {
  analysis: AnalysisRecord;
  chats: ModuleRecord<ChatCheckData>[];
  inspection: ModuleRecord<InspectionData> | null;
  inspections: ModuleRecord<InspectionData>[];
  costs: ModuleRecord<CostAnalysisData> | null;
  imageMatch: ModuleRecord<ImageMatchData> | null;
  snapshots: ModuleRecord<SnapshotData>[];
  outcome: ModuleRecord<OutcomeData> | null;
  watch: WatchRecord | null;
  activeJobs: JobRecord[];
  recommendation: { current: Recommendation; source: string; history: { at: string; value: Recommendation; source: string }[] };
  nextStep: NextStep;
}

export interface NextStep {
  id: "seller" | "chat" | "inspection" | "inspection_continue" | "costs" | "watch" | "images" | "export";
  title: string;
  text: string;
}

/** Gesamtempfehlung: Die jüngste Teilanalyse zählt, ein erhöhtes Risiko bleibt bestehen. */
export function aggregateRecommendation(
  base: { value: Recommendation; at: string },
  chats: { at: string; value: Recommendation }[],
  inspection?: { at: string; value: Recommendation },
): Akte["recommendation"] {
  const history = [
    { ...base, source: "Kaufcheck" },
    ...chats.map((c) => ({ ...c, source: "Verkäuferchat" })),
    ...(inspection ? [{ ...inspection, source: "Besichtigung" }] : []),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const risky = history.filter((h) => h.value === "elevated_risk").at(-1);
  const last = history.at(-1)!;
  return risky ? { current: "elevated_risk", source: risky.source, history } : { current: last.value, source: last.source, history };
}

export function suggestNextStep(x: { hasSeller: boolean; chats: number; inspection: InspectionData | null; costs: boolean; watch: boolean; imageMatch: boolean; recommendation: Recommendation; hasPhotos: boolean }): NextStep {
  if (!x.hasSeller) return { id: "seller", title: "Verkäufer prüfen", text: "Dein Angebot wurde analysiert. Möchtest du jetzt die Verkäuferbewertungen überprüfen?" };
  if (x.chats === 0) return { id: "chat", title: "Verkäuferchat prüfen", text: "Hast du schon mit dem Verkäufer geschrieben? Lade den Chat hoch – wir prüfen ihn auf Widersprüche und Warnsignale." };
  if (x.inspection?.state === "in_progress") return { id: "inspection_continue", title: "Besichtigung fortsetzen", text: "Deine Besichtigung ist noch nicht abgeschlossen." };
  if (!x.inspection && x.recommendation !== "elevated_risk") return { id: "inspection", title: "Besichtigung starten", text: "Wir führen dich Schritt für Schritt durch eine Prüfliste für genau dieses Angebot." };
  if (!x.costs) return { id: "costs", title: "Gesamtkosten berechnen", text: "Was kostet dich dieser Kauf wirklich? Wir zeigen belegte und mögliche Zusatzkosten getrennt." };
  if (!x.imageMatch && x.hasPhotos) return { id: "images", title: "Bilder vergleichen", text: "Prüfe, ob die Inseratsfotos schon in anderen Angeboten aufgetaucht sind." };
  if (!x.watch) return { id: "watch", title: "Angebot beobachten", text: "Erfasse Preisänderungen und geänderte Angaben bis zu deiner Entscheidung." };
  return { id: "export", title: "Kaufakte exportieren", text: "Alle Ergebnisse als Datei speichern – z. B. für die Übergabe oder den Kaufvertrag." };
}

export async function getAkte(userId: string, analysisId: string): Promise<Akte | null> {
  const store = getStore();
  const analysis = await store.getAnalysis(analysisId, userId);
  if (!analysis?.report) return null;
  const [mods, watch, jobs] = await Promise.all([
    store.listModules(analysisId, userId),
    store.getWatchByAnalysis(analysisId, userId),
    store.listJobs({ userId, analysisId, limit: 10 }),
  ]);
  const of = <T>(k: ModuleRecord["kind"]) => mods.filter((m) => m.kind === k) as ModuleRecord<T>[];
  const chats = of<ChatCheckData>("chat_check");
  const inspections = of<InspectionData>("inspection");
  const inspection = inspections.at(-1) ?? null;
  const costs = of<CostAnalysisData>("costs").at(-1) ?? null;
  const imageMatch = of<ImageMatchData>("image_match").at(-1) ?? null;
  const snapshots = of<SnapshotData>("snapshot");
  const outcome = of<OutcomeData>("outcome").at(-1) ?? null;
  const r = analysis.report;
  const recommendation = aggregateRecommendation(
    { value: r.score.recommendation, at: analysis.completedAt ?? analysis.createdAt },
    chats.map((c) => ({ at: c.createdAt, value: c.data.updatedRecommendation.current })),
    inspection?.data.report ? { at: inspection.data.finishedAt ?? inspection.createdAt, value: inspection.data.report.updatedRecommendation } : undefined,
  );
  return {
    analysis,
    chats,
    inspection,
    inspections,
    costs,
    imageMatch,
    snapshots,
    outcome,
    watch,
    activeJobs: jobs.filter((j) => j.status === "queued" || j.status === "running"),
    recommendation,
    nextStep: suggestNextStep({
      hasSeller: !!r.seller,
      chats: chats.length,
      inspection: inspection?.data ?? null,
      costs: !!costs,
      watch: !!watch,
      imageMatch: !!imageMatch,
      recommendation: recommendation.current,
      hasPhotos: r.listing.images.some((i) => i.kind === "product_photo"),
    }),
  };
}

/** Vollständiger Export der Kaufakte (JSON) – ohne interne Kennungen von Uploads Dritter. */
export function exportAkte(a: Akte) {
  return {
    exportiertAm: new Date().toISOString(),
    hinweis: "DEAL-NIVO Kaufakte. Alle Einschätzungen sind Hilfen zur eigenen Entscheidung, keine Garantie.",
    inserat: a.analysis.report?.listing,
    kaufcheck: a.analysis.report,
    gesamtempfehlung: a.recommendation,
    verkaeuferchat: a.chats.map((c) => ({ version: c.version, erstellt: c.createdAt, loeschtSichAm: c.expiresAt, ...c.data })),
    besichtigungen: a.inspections.map((i) => ({ version: i.version, erstellt: i.createdAt, ...i.data })),
    gesamtkosten: a.costs?.data ?? null,
    bildabgleich: a.imageMatch?.data ?? null,
    preisverlauf: a.snapshots.map((s) => ({ version: s.version, ...s.data })),
    kaufausgang: a.outcome?.data ?? null,
    beobachtung: a.watch ? { modus: a.watch.mode, intervallStunden: a.watch.intervalHours, aktiv: a.watch.active, zuletztGeprueft: a.watch.lastCheckedAt } : null,
  };
}
