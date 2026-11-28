/**
 * Regelbasierter Vergleich zweier tatsächlich erfasster Inseratsstände.
 * Keine KI nötig. Es werden nur Unterschiede zwischen real erfassten Daten
 * gemeldet – fehlende Angaben in einem Screenshot gelten nicht als Änderung.
 */
import type { SnapshotData } from "../akte/schemas";
import type { Listing } from "../domain/schemas";

export const KEY_STATEMENTS: { id: string; label: string; re: RegExp }[] = [
  { id: "unfallfrei", label: "unfallfrei", re: /\bunfallfrei\b/i },
  { id: "scheckheft", label: "scheckheftgepflegt", re: /\bscheckheft\w*/i },
  { id: "tuev", label: "TÜV/HU neu", re: /\b(tüv|tuev|hu)\s*(neu|frisch|bis\s*\d)/i },
  { id: "garantie", label: "Garantie", re: /\bgarantie\b/i },
  { id: "rechnung", label: "Rechnung vorhanden", re: /\b(rechnung|kaufbeleg|quittung)\b/i },
  { id: "ovp", label: "Originalverpackung", re: /\b(ovp|originalverpackung|originalkarton)\b/i },
  { id: "nichtraucher", label: "Nichtraucher", re: /\bnichtraucher\w*/i },
  { id: "erste_hand", label: "aus erster Hand", re: /\b(1\.|erste)\s*hand\b/i },
  { id: "keine_maengel", label: "keine Mängel", re: /\b(keine\s*mängel|mängelfrei|ohne\s*mängel|keine\s*kratzer|unbeschädigt)\b/i },
  { id: "zahnriemen", label: "Zahnriemen neu", re: /\bzahnriemen\s*(neu|gewechselt|erneuert)\b/i },
  { id: "akku_neu", label: "Akku neu", re: /\b(akku|batterie)\s*(neu|getauscht)\b/i },
];
const NEGATIVE_ADDED = /\b(defekt|kaputt|unfall|bastler|ohne\s*tüv|motorschaden|getriebeschaden|wasserschaden|riss)\w*/i;

export const WATCHED_ATTRIBUTES: { key: keyof Listing; label: string; important: boolean }[] = [
  { key: "mileageKm", label: "Kilometerstand", important: true },
  { key: "accidentFree", label: "Unfallfreiheit", important: true },
  { key: "condition", label: "Zustand", important: true },
  { key: "serviceHistory", label: "Wartung", important: true },
  { key: "year", label: "Baujahr", important: true },
  { key: "firstRegistration", label: "Erstzulassung", important: true },
  { key: "previousOwners", label: "Vorbesitzer", important: true },
  { key: "batteryHealthPct", label: "Akkuzustand", important: true },
  { key: "storageGb", label: "Speicher", important: false },
  { key: "title", label: "Titel", important: false },
];

export function snapshotFromListing(l: Partial<Listing>, source: SnapshotData["source"], capturedAt: string, available: SnapshotData["available"] = "unknown"): SnapshotData {
  const attributes: Record<string, string> = {};
  for (const a of WATCHED_ATTRIBUTES) {
    const v = l[a.key];
    if (v != null && v !== "" && a.key !== "title") attributes[a.key] = String(v);
  }
  return { capturedAt, source, priceEur: l.priceEur, title: l.title, description: l.description?.slice(0, 8000), attributes, available, changes: [] };
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function sentences(t: string): string[] {
  return t
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
}

const fmtEur = (n: number) => `${n.toLocaleString("de-DE")} €`;

export function diffSnapshots(prev: SnapshotData, next: SnapshotData): SnapshotData["changes"] {
  const changes: SnapshotData["changes"] = [];
  if (prev.priceEur != null && next.priceEur != null && prev.priceEur !== next.priceEur) {
    const d = next.priceEur - prev.priceEur;
    const pct = Math.round((d / prev.priceEur) * 1000) / 10;
    changes.push({
      type: "price",
      field: "priceEur",
      before: fmtEur(prev.priceEur),
      after: fmtEur(next.priceEur),
      summary: `Preis ${d < 0 ? "gesenkt" : "erhöht"} um ${fmtEur(Math.abs(d))} (${d > 0 ? "+" : "−"}${Math.abs(pct).toLocaleString("de-DE")} %)`,
      important: true,
    });
  }
  for (const a of WATCHED_ATTRIBUTES.filter((x) => x.key !== "title")) {
    const b = prev.attributes[a.key as string];
    const n = next.attributes[a.key as string];
    if (b != null && n != null && norm(b) !== norm(n))
      changes.push({ type: "attribute", field: a.key as string, before: b, after: n, summary: `${a.label} geändert: „${b}“ → „${n}“`, important: a.important });
  }
  if (prev.description && next.description) {
    for (const k of KEY_STATEMENTS) {
      const was = k.re.test(prev.description);
      const is = k.re.test(next.description);
      if (was && !is) {
        const ev = sentences(prev.description).find((s) => k.re.test(s)) ?? k.label;
        changes.push({ type: "statement_removed", field: k.id, before: ev, summary: `Die Angabe „${k.label}“ wurde seit der vorherigen Erfassung entfernt.`, important: true });
      } else if (!was && is) {
        const ev = sentences(next.description).find((s) => k.re.test(s)) ?? k.label;
        changes.push({ type: "statement_added", field: k.id, after: ev, summary: `Neu hinzugekommen: „${k.label}“.`, important: false });
      }
    }
    const ps = sentences(prev.description).map(norm);
    const ns = sentences(next.description).map(norm);
    const removed = sentences(prev.description).filter((s, i) => !ns.includes(ps[i]));
    const added = sentences(next.description).filter((s, i) => !ps.includes(ns[i]));
    const negAdded = added.find((s) => NEGATIVE_ADDED.test(s) && !/\b(kein|keine|nicht|nie)\b/i.test(s));
    if (negAdded) changes.push({ type: "statement_added", field: "negative", after: negAdded, summary: "Neuer Hinweis auf einen Mangel in der Beschreibung.", important: true });
    if (removed.length || added.length)
      changes.push({
        type: "text_changed",
        before: removed.slice(0, 2).join(" ") || undefined,
        after: added.slice(0, 2).join(" ") || undefined,
        summary: `Beschreibung geändert (${removed.length} Satz/Sätze entfernt, ${added.length} hinzugefügt).`,
        important: false,
      });
  }
  if (prev.available !== "no" && next.available === "no")
    changes.push({ type: "availability", summary: "Das Angebot ist nicht mehr verfügbar (laut offizieller Schnittstelle).", important: true });
  return changes;
}

/** Nur tatsächlich erfasste Preise – keine Interpolation, keine Schätzung. */
export function priceHistory(snaps: SnapshotData[]): { at: string; priceEur: number; source: SnapshotData["source"] }[] {
  return snaps.filter((s) => s.priceEur != null).map((s) => ({ at: s.capturedAt, priceEur: s.priceEur as number, source: s.source }));
}
