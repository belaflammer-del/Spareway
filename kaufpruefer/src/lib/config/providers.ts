import "server-only";
import { getAIProvider } from "../ai/registry";
import { getStore } from "../store";
import { env, features } from "./env";

export type ProviderKey = "ai" | "market_licensed" | "ebay_api" | "vehicle_history";

export const PROVIDER_INFO: Record<ProviderKey, { label: string; configured: () => boolean; note: string }> = {
  ai: { label: `KI-Analyse (OpenAI, ${env.ai.openaiModel})`, configured: () => features.ai, note: "OPENAI_API_KEY" },
  market_licensed: { label: "Lizenzierter Marktdatenanbieter", configured: () => features.marketApi, note: "MARKET_DATA_API_URL / MARKET_DATA_API_KEY" },
  ebay_api: { label: "eBay Browse API (Import & Vergleichsangebote)", configured: () => features.ebayApi, note: "EBAY_CLIENT_ID / EBAY_CLIENT_SECRET" },
  vehicle_history: { label: "Fahrzeughistorie", configured: () => false, note: "Erfordert kommerzielle Vereinbarung – nur Demo-Implementierung" },
};

/** Provider können im Admin-Bereich deaktiviert werden (z. B. bei Kostenproblemen). */
export async function providerEnabled(key: ProviderKey): Promise<boolean> {
  if (!PROVIDER_INFO[key].configured()) return false;
  const cfg = await getStore().getConfig();
  return cfg.providers?.[key] !== false;
}

export async function getActiveAI() {
  if (!(await providerEnabled("ai"))) return null;
  const cfg = await getStore().getConfig();
  return getAIProvider(cfg.ai?.model);
}

/** Kategorie-Status (live = Komplettcheck, beta = nur Schnellcheck). */
export async function categoryStatus(category: string): Promise<"live" | "beta"> {
  const cfg = await getStore().getConfig();
  return cfg.categories?.[category] ?? DEFAULT_CATEGORY_STATUS[category] ?? "beta";
}

export const DEFAULT_CATEGORY_STATUS: Record<string, "live" | "beta"> = {
  vehicle: "live",
  electronics: "live",
  fashion: "live",
  watches_jewelry: "live",
  gaming_collectibles: "live",
  other: "live",
};
