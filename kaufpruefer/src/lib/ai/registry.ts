import "server-only";
import { env, features } from "../config/env";
import { OpenAIProvider } from "./openai";
import type { AIProvider } from "./provider";

const cache = new Map<string, AIProvider>();

/** Liefert den konfigurierten KI-Provider oder null (→ Regelmodus). Modell optional überschreibbar (Admin). */
export function getAIProvider(modelOverride?: string): AIProvider | null {
  if (!features.ai) return null;
  const model = modelOverride?.trim() || env.ai.openaiModel;
  let p = cache.get(model);
  if (!p) {
    p = new OpenAIProvider(env.ai.openaiKey as string, model, { inputPerMTok: env.ai.costInputPerMTok, outputPerMTok: env.ai.costOutputPerMTok });
    cache.set(model, p);
  }
  return p;
}
