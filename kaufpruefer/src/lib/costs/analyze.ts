/**
 * Gesamtkostenanalyse: „Was kostet mich dieser Kauf wirklich?“
 *
 * Drei streng getrennte Arten von Positionen:
 *  - documented: belegt (Nutzereingabe aus Beleg/Kostenvoranschlag)
 *  - estimated:  wahrscheinlich nötig, Betrag aus gepflegter Kostentabelle (mit Quelle)
 *                oder „Betrag unbekannt“
 *  - risk:       mögliches Risiko – nur beziffert, wenn eine belegte Quelle existiert
 * Es wird nie ein Betrag erfunden.
 */
import type { ChatCheckData, CostAnalysisData, CostLine, InspectionData, UserCostInput } from "../akte/schemas";
import type { AnalysisReport } from "../domain/schemas";
import { COST_ITEMS, findCostEntry, type CostItemKey, type CostTableEntry } from "./table";

interface Need {
  item: CostItemKey;
  kind: "estimated" | "risk";
  reason: string;
  optional?: boolean;
  label?: string;
}

const TEXT_NEEDS: { re: RegExp; item: CostItemKey; reason: string }[] = [
  { re: /\b(tüv|tuev|hu|hauptuntersuchung)\s*(ist\s*)?(fällig|faellig|abgelaufen|neu\s*machen|muss\s*neu)/i, item: "hu_au", reason: "Laut Inserat ist die Hauptuntersuchung fällig" },
  { re: /\b(inspektion|service|wartung|ölwechsel|oelwechsel)\s*(ist\s*)?(fällig|faellig|überfällig|steht\s*an|muss\s*gemacht)/i, item: "inspection_service", reason: "Laut Inserat steht eine Wartung an" },
  { re: /\b(reifen|sommerreifen|winterreifen)\s*(sind\s*|ist\s*)?(abgefahren|runter|müssen\s*neu|muessen\s*neu|fällig|alt|porös|poroes)/i, item: "tires", reason: "Laut Inserat sind die Reifen verschlissen" },
  { re: /\b(bremsen|bremsscheiben|bremsbeläge|bremsbelaege)\s*(sind\s*|müssen\s*|muessen\s*)?(fällig|faellig|neu|verschlissen|runter)/i, item: "brakes", reason: "Laut Inserat sind die Bremsen fällig" },
  { re: /\b(akku|batterie)\s*(ist\s*)?(schwach|verschlissen|muss\s*getauscht|hält\s*nicht|haelt\s*nicht)/i, item: "battery_replacement", reason: "Laut Inserat ist der Akku schwach" },
  { re: /\b(display|bildschirm)\s*(hat\s*(einen\s*)?)?(riss|gesprungen|kaputt|defekt|sprung)/i, item: "screen_repair", reason: "Laut Inserat ist das Display beschädigt" },
  { re: /\b(ohne|kein\w*)\s*(controller|kontroller)/i, item: "controller", reason: "Laut Inserat ohne Controller" },
  { re: /\b(ohne|kein\w*)\s*(ladekabel|ladegerät|netzteil|ladegeraet)/i, item: "accessories", reason: "Laut Inserat ohne Ladegerät bzw. Netzteil" },
  { re: /\b(ohne|keine)\s*(papiere|box\s*und\s*papiere|zertifikat)/i, item: "documents", reason: "Laut Inserat ohne Papiere" },
];

const INSPECTION_GROUP_ITEMS: { re: RegExp; item: CostItemKey }[] = [
  { re: /reifen|profil|dot/i, item: "tires" },
  { re: /brems/i, item: "brakes" },
  { re: /wartung|inspektion|scheckheft/i, item: "inspection_service" },
  { re: /akku/i, item: "battery_replacement" },
  { re: /display/i, item: "screen_repair" },
  { re: /controller/i, item: "controller" },
];

function collectNeeds(report: AnalysisReport, inspection?: InspectionData, chats: ChatCheckData[] = []): Need[] {
  const l = report.listing;
  const text = [l.description, l.condition, l.serviceHistory, l.accessories, l.boxAndPapers].filter(Boolean).join(" \n ");
  const needs: Need[] = [];
  const add = (n: Need) => {
    if (!needs.some((x) => x.item === n.item && x.kind === n.kind)) needs.push(n);
  };

  for (const t of TEXT_NEEDS) if (t.re.test(text)) add({ item: t.item, kind: "estimated", reason: t.reason });
  for (const f of report.product.imageFindings.filter((x) => x.evidenceLevel === "visible")) {
    const t = `${f.title} ${f.detail}`;
    if (/reifen.*(abgefahren|profil\s*gering|porös)/i.test(t)) add({ item: "tires", kind: "estimated", reason: `Bildbefund: ${f.title}` });
    if (/display.*(riss|sprung)|riss.*display/i.test(t)) add({ item: "screen_repair", kind: "estimated", reason: `Bildbefund: ${f.title}` });
  }
  if (l.category === "electronics" && l.batteryHealthPct != null && l.batteryHealthPct < 80)
    add({ item: "battery_replacement", kind: "estimated", reason: `Akkukapazität laut Inserat ${l.batteryHealthPct} % – unter 80 % ist ein Tausch häufig sinnvoll` });

  // Auffälligkeiten aus der Besichtigung
  for (const i of inspection?.items.filter((x) => x.status === "conspicuous") ?? []) {
    const hit = INSPECTION_GROUP_ITEMS.find((g) => g.re.test(`${i.group} ${i.title}`));
    if (hit) add({ item: hit.item, kind: "estimated", reason: `Bei der Besichtigung auffällig: ${i.title}` });
    else add({ item: "repair_other", kind: "risk", reason: `Bei der Besichtigung auffällig: ${i.title}`, label: `Mögliche Reparatur: ${i.title.slice(0, 60)}` });
  }

  // Kategorie-typische Nebenkosten
  if (l.category === "vehicle") {
    add({ item: "registration", kind: "estimated", reason: "Ummeldung auf dich" });
    add({ item: "transfer", kind: "estimated", reason: "Abholung bzw. Überführung", optional: true });
    add({ item: "insurance", kind: "estimated", reason: "Individuell – abhängig von Typklasse, Region und Schadenfreiheitsklasse", optional: true });
    add({ item: "vehicle_tax", kind: "estimated", reason: "Abhängig von Hubraum, CO₂-Wert und Erstzulassung", optional: true });
  }
  if (l.category === "watches_jewelry") {
    add({ item: "authentication", kind: "estimated", reason: "Empfohlene professionelle Echtheitsprüfung" });
    if (!/revision|service|wartung/i.test(text)) add({ item: "watch_service", kind: "risk", reason: "Keine Revision im Inserat erwähnt" });
  }
  if (l.category === "fashion" && (l.priceEur ?? 0) >= 300) add({ item: "authentication", kind: "estimated", reason: "Bei hochpreisigen Stücken empfohlen", optional: true });

  // Modelltypische Risiken (nur hohe Schwere) – ohne Betrag, sofern keine belegte Quelle
  for (const w of report.product.weaknesses.filter((x) => x.severity === "high").slice(0, 3))
    add({ item: "repair_other", kind: "risk", reason: `${w.claim.verified ? "Geprüfte" : "Nicht verifizierte"} Schwachstelle: ${w.title}`, label: `Mögliches Risiko: ${w.title.slice(0, 60)}` });
  // Nicht offengelegte Schäden laut Chat
  for (const c of chats.flatMap((x) => x.contradictions).filter((x) => x.kind === "documented").slice(0, 2))
    add({ item: "repair_other", kind: "risk", reason: `Chat-Widerspruch: ${c.explanation}`, label: "Mögliche nicht offengelegte Mängel" });
  return needs;
}

export function computeCosts(
  report: AnalysisReport,
  opts: { table: CostTableEntry[]; userInputs?: UserCostInput[]; inspection?: InspectionData; chats?: ChatCheckData[]; now: string; usesDemoTable?: boolean },
): CostAnalysisData {
  const l = report.listing;
  const userInputs = opts.userInputs ?? [];
  const lines: CostLine[] = [];

  for (const n of collectNeeds(report, opts.inspection, opts.chats)) {
    if (n.item !== "repair_other" && userInputs.some((u) => u.item === n.item)) continue; // Nutzerangabe hat Vorrang
    const entry = n.item === "repair_other" ? undefined : findCostEntry(opts.table, l.category, n.item, l.brand, l.model);
    lines.push({
      id: `${n.kind}-${n.item}-${lines.length}`,
      item: n.item,
      label: n.label ?? COST_ITEMS[n.item],
      kind: n.kind,
      lowEur: entry?.lowEur,
      highEur: entry?.highEur,
      amountUnknown: !entry,
      source: entry ? entry.source : n.kind === "risk" ? "Nicht bezifferbar – keine belegte Kostenquelle" : "Betrag unbekannt – keine belegte Kostenquelle",
      sourceDate: entry?.reviewedAt,
      reason: n.reason,
      optional: !!n.optional,
    });
  }
  for (const u of userInputs)
    lines.push({
      id: `user-${u.id}`,
      item: u.item,
      label: u.label,
      kind: u.kind,
      lowEur: Math.min(u.lowEur, u.highEur),
      highEur: Math.max(u.lowEur, u.highEur),
      amountUnknown: false,
      source: u.kind === "documented" ? "Deine Angabe (Beleg / Kostenvoranschlag)" : "Deine Schätzung",
      reason: u.note ?? "Von dir eingetragen",
      optional: false,
    });

  const sum = (kind: CostLine["kind"], k: "lowEur" | "highEur") =>
    lines.filter((x) => x.kind === kind && !x.amountUnknown && !x.optional).reduce((a, x) => a + (x[k] ?? 0), 0);
  const documentedLow = sum("documented", "lowEur");
  const documentedHigh = sum("documented", "highEur");
  const estimatedLow = sum("estimated", "lowEur");
  const estimatedHigh = sum("estimated", "highEur");
  const riskLow = sum("risk", "lowEur");
  const riskHigh = sum("risk", "highEur");
  const price = l.priceEur;
  const required = lines.filter((x) => !x.optional);
  const unknownCount = required.filter((x) => x.amountUnknown).length;
  const known = required.length - unknownCount;
  const score = required.length === 0 ? (price != null ? 100 : 0) : Math.round((known / required.length) * 100) - (price == null ? 40 : 0);
  const label = score >= 80 ? "gut" : score >= 50 ? "eingeschränkt" : "gering";

  return {
    offerPriceEur: price,
    lines,
    userInputs,
    totals: {
      documentedLow,
      documentedHigh,
      estimatedLow,
      estimatedHigh,
      riskLow,
      riskHigh,
      expectedLow: price != null ? price + documentedLow + estimatedLow : undefined,
      expectedHigh: price != null ? price + documentedHigh + estimatedHigh : undefined,
      withRiskHigh: price != null ? price + documentedHigh + estimatedHigh + riskHigh : undefined,
      unknownCount,
    },
    dataQuality: {
      score: Math.max(0, score),
      label,
      note:
        unknownCount > 0
          ? `${unknownCount} Position${unknownCount > 1 ? "en" : ""} ohne belegten Betrag – die Gesamtkosten können höher liegen. Trage Kostenvoranschläge ein, um die Rechnung zu vervollständigen.`
          : "Alle notwendigen Positionen sind beziffert.",
    },
    computedAt: opts.now,
    usesDemoTable: !!opts.usesDemoTable,
    disclaimer:
      "Belegte Kosten stammen aus deinen Angaben, geschätzte aus einer gepflegten Kostentabelle mit Quelle. Mögliche Risiken sind kein sicherer Kostenpunkt. Fehlt eine belegte Quelle, nennen wir keinen Betrag.",
  };
}

/** Vergleich zweier Angebote nach Gesamtkosten – mit nachvollziehbarer Begründung. */
export function compareTotalCosts(a: { title: string; costs: CostAnalysisData }, b: { title: string; costs: CostAnalysisData }): { verdict: "a" | "b" | "unclear"; text: string; points: string[] } {
  const pa = a.costs.offerPriceEur;
  const pb = b.costs.offerPriceEur;
  const points: string[] = [];
  if (pa == null || pb == null) return { verdict: "unclear", text: "Für mindestens ein Angebot fehlt der Preis – ein Gesamtkostenvergleich ist nicht möglich.", points };
  const fmt = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;
  const ea = { low: a.costs.totals.expectedLow!, high: a.costs.totals.expectedHigh! };
  const eb = { low: b.costs.totals.expectedLow!, high: b.costs.totals.expectedHigh! };
  points.push(`Kaufpreis: ${a.title} ${fmt(pa)} · ${b.title} ${fmt(pb)}`);
  const extraA = a.costs.totals.documentedHigh + a.costs.totals.estimatedHigh;
  const extraB = b.costs.totals.documentedHigh + b.costs.totals.estimatedHigh;
  if (extraA || extraB) points.push(`Bezifferte Zusatzkosten (bis): ${a.title} ${fmt(extraA)} · ${b.title} ${fmt(extraB)}`);
  points.push(`Erwartete Gesamtkosten: ${a.title} ${fmt(ea.low)}–${fmt(ea.high)} · ${b.title} ${fmt(eb.low)}–${fmt(eb.high)}`);
  const ua = a.costs.totals.unknownCount;
  const ub = b.costs.totals.unknownCount;
  if (ua || ub) points.push(`Positionen ohne Betrag: ${a.title} ${ua} · ${b.title} ${ub}`);

  let verdict: "a" | "b" | "unclear" = "unclear";
  if (ea.high < eb.low && ua <= ub) verdict = "a";
  else if (eb.high < ea.low && ub <= ua) verdict = "b";
  const cheaperPrice = pa < pb ? a.title : pb < pa ? b.title : null;
  let text: string;
  if (verdict === "unclear")
    text =
      ua || ub
        ? "Die Gesamtkosten lassen sich noch nicht eindeutig vergleichen, weil Beträge fehlen bzw. sich die Bereiche überschneiden. Kostenvoranschläge einholen."
        : "Die erwarteten Gesamtkosten liegen nah beieinander – entscheide nach Zustand und Risiko.";
  else {
    const win = verdict === "a" ? a.title : b.title;
    text =
      cheaperPrice && cheaperPrice !== win
        ? `${cheaperPrice} ist im Kaufpreis günstiger, aber ${win} erscheint nach den bezifferten Zusatzkosten wirtschaftlich sinnvoller.`
        : `${win} erscheint auch nach den bezifferten Zusatzkosten günstiger.`;
  }
  return { verdict, text, points };
}
