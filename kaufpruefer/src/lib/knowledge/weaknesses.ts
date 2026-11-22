/**
 * Geprüfte Wissensdatenbank für modellspezifische Schwachstellen (RAG-Quelle).
 *
 * Regeln für Einträge:
 *  - Jeder Eintrag MUSS eine überprüfbare Quelle (URL) und ein Prüfdatum haben.
 *  - Einträge gelten nur für die angegebene Variante (Motor, Generation, Baujahre).
 *  - Nur Einträge mit `verified: true` erscheinen in echten Berichten als
 *    „Geprüfte Wissensdatenbank“. Alles andere wird nicht angezeigt.
 *
 * Die Datenbank wird redaktionell gepflegt (siehe docs/WISSENSDATENBANK.md).
 * Sie ist bewusst leer ausgeliefert: Es werden keine ungeprüften Angaben als
 * Fakten ausgegeben. Modellwissen der KI erscheint separat und ist als
 * „KI-Hinweis (nicht verifiziert)“ gekennzeichnet.
 */
import type { Category, Listing } from "../domain/schemas";

export interface KnowledgeEntry {
  id: string;
  category: Category;
  brand: string;
  /** Regulärer Ausdruck für das Modell, z. B. "^(3er|320d)" */
  modelPattern: string;
  /** Optionale Einschränkung auf Motor/Variante */
  variantPattern?: string;
  yearFrom?: number;
  yearTo?: number;
  title: string;
  detail: string;
  appliesTo: string;
  severity: "low" | "medium" | "high";
  checkAdvice?: string;
  repairCostHint?: string;
  sourceUrl: string;
  sourceLabel: string;
  reviewedAt: string;
  verified: boolean;
}

export const KNOWLEDGE_BASE: KnowledgeEntry[] = [];

/** Einfache, deterministische Retrieval-Logik (später durch Vektorsuche ergänzbar). */
export function retrieveKnowledge(listing: Listing, kb: KnowledgeEntry[] = KNOWLEDGE_BASE): KnowledgeEntry[] {
  if (!listing.brand || !listing.model) return [];
  const brand = listing.brand.toLowerCase();
  const variantText = [listing.variant, listing.engine, listing.title].filter(Boolean).join(" ");
  return kb.filter((e) => {
    if (!e.verified || e.category !== listing.category) return false;
    if (e.brand.toLowerCase() !== brand) return false;
    if (!new RegExp(e.modelPattern, "i").test(listing.model as string)) return false;
    if (e.variantPattern && !new RegExp(e.variantPattern, "i").test(variantText)) return false;
    if (listing.year != null) {
      if (e.yearFrom != null && listing.year < e.yearFrom) return false;
      if (e.yearTo != null && listing.year > e.yearTo) return false;
    } else if (e.yearFrom != null || e.yearTo != null) {
      return false; // ohne Baujahr keine baujahresabhängige Aussage
    }
    return true;
  });
}
