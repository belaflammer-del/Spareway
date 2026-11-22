import type { z } from "zod";

export type AIPart =
  | { type: "text"; text: string }
  | { type: "image"; dataUrl: string; label: string };

export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface StructuredRequest<T> {
  /** Name für Logging/Kostenstatistik */
  task: string;
  system: string;
  parts: AIPart[];
  schema: z.ZodType<T>;
  schemaName: string;
  maxOutputTokens?: number;
}

/**
 * Austauschbare KI-Provider-Architektur: Jeder Provider muss strukturierte,
 * schema-validierte Ausgaben liefern. Weitere Provider (z. B. Anthropic,
 * Azure OpenAI, lokale Modelle) implementieren dieses Interface.
 */
export interface AIProvider {
  id: string;
  model: string;
  generate<T>(req: StructuredRequest<T>): Promise<{ data: T; usage: AIUsage }>;
}

export class AINotConfiguredError extends Error {
  constructor() {
    super("Kein KI-Provider konfiguriert");
  }
}

export class UsageMeter {
  readonly entries: (AIUsage & { task: string; model: string })[] = [];
  add(task: string, model: string, u: AIUsage) {
    this.entries.push({ task, model, ...u });
  }
  get total(): AIUsage {
    return this.entries.reduce(
      (a, e) => ({ inputTokens: a.inputTokens + e.inputTokens, outputTokens: a.outputTokens + e.outputTokens, costUsd: a.costUsd + e.costUsd }),
      { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    );
  }
}
