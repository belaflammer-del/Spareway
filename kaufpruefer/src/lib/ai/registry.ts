import "server-only";
import { env, features } from "../config/env";
import { OpenAIProvider } from "./openai";
import type { AIProvider } from "./provider";

let cached: AIProvider | null | undefined;

/** Liefert den konfigurierten KI-Provider oder null (→ Regelmodus). */
export function getAIProvider(): AIProvider | null {
  if (cached !== undefined) return cached;
  if (features.ai) {
    cached = new OpenAIProvider(env.ai.openaiKey as string, env.ai.openaiModel, {
      inputPerMTok: env.ai.costInputPerMTok,
      outputPerMTok: env.ai.costOutputPerMTok,
    });
  } else cached = null;
  return cached;
}
