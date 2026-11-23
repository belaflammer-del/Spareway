import "server-only";
import { getAIProvider } from "../ai/registry";
import { getStore } from "../store";
import { env, features } from "./env";

export type ProviderKey = "ai" | "market_licensed" | "ebay_api" | "ebay_insights" | "vehicle_history";

export const PROVIDER_INFO: Record<ProviderKey, { label: string; configured: () => boolean; note: string }> = {
  ai: { label: `KI-Analyse (OpenAI, ${env.ai.openaiModel})`, configured: () => features.ai, note: "OPENAI_API_KEY" },
  market_licensed: { label: "Lizenzierter Marktdatenanbieter", configured: () => features.marketApi, note: "MARKET_DATA_API_URL / MARKET_DATA_API_KEY" },
  ebay_api: { label: "eBay Browse API (Import & aktive Vergleichsangebote)", configured: () => features.ebayApi, note: "EBAY_CLIENT_ID / EBAY_CLIENT_SECRET" },
  ebay_insights: {
    label: "eBay Marketplace Insights (Verkaufspreise)",
    configured: () => features.ebayApi && env.ebay.insightsEnabled,
    note: "Freischaltung durch eBay nötig, dann EBAY_INSIGHTS_ENABLED=true",
  },
  vehicle_history: { label: "Fahrzeughistorie", configured: () => false, note: "Erfordert kommerzielle Vereinbarung – nur Demo-Implementierung" },
};

/** Provider können im Admin-Bereich deaktiviert werden (z. B. bei Kostenproblemen). */
export async function providerEnabled(key: ProviderKey): Promise<boolean> {
  if (!PROVIDER_INFO[key].configured()) return false;
  const cfg = await getStore().getConfig();
  return cfg.providers?.[key] !== false;
}

/**
 * Modellwahl: „main“ für die anspruchsvolle Produkt-/Bildanalyse,
 * „fast“ (günstigeres Modell) für Extraktion, OCR, Texte und Rückfragen.
 */
export async function getActiveAI(kind: "main" | "fast" = "main") {
  if (!(await providerEnabled("ai"))) return null;
  const cfg = await getStore().getConfig();
  const fast = cfg.ai?.fastModel || env.ai.openaiFastModel;
  return getAIProvider(kind === "fast" && fast ? fast : cfg.ai?.model);
}

/** Kategorie-Status (live = Komplettcheck, beta = nur Schnellcheck). */
export async function categoryStatus(category: string): Promise<"live" | "beta" | "off"> {
  const cfg = await getStore().getConfig();
  return cfg.categories?.[category] ?? DEFAULT_CATEGORY_STATUS[category] ?? "beta";
}

/** Fahrzeuge und Elektronik sind vollständig unterstützt, der Rest ist Beta. */
export const DEFAULT_CATEGORY_STATUS: Record<string, "live" | "beta" | "off"> = {
  vehicle: "live",
  electronics: "live",
  fashion: "beta",
  watches_jewelry: "beta",
  gaming_collectibles: "beta",
  other: "beta",
};

export const BETA_NOTICE = "Diese Produktkategorie befindet sich noch in der Entwicklung. Einzelne Prüfungen können eingeschränkt sein.";
