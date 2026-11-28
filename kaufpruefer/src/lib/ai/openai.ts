import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { AIProvider, AIUsage, StructuredRequest } from "./provider";

export class OpenAIProvider implements AIProvider {
  id = "openai";
  private client: OpenAI;
  constructor(
    apiKey: string,
    public model: string,
    private pricing: { inputPerMTok: number; outputPerMTok: number },
  ) {
    this.client = new OpenAI({ apiKey, timeout: 120_000, maxRetries: 2 });
  }

  async generate<T>(req: StructuredRequest<T>): Promise<{ data: T; usage: AIUsage }> {
    const content = req.parts.map((p) =>
      p.type === "text"
        ? ({ type: "input_text", text: p.text } as const)
        : ({ type: "input_image", image_url: p.dataUrl, detail: "auto" } as const),
    );
    // Reasoning-Modelle (gpt-5, o-Serie): geringer Denkaufwand reicht für Extraktion/Prüfung,
    // spart Zeit und Kosten und verhindert, dass das Denken das Ausgabelimit aufbraucht.
    const reasoningModel = /^(gpt-5|o\d)/i.test(this.model);
    const effort = (process.env.OPENAI_REASONING_EFFORT?.trim() || "low") as "minimal" | "low" | "medium" | "high";
    const base = req.maxOutputTokens ?? 6000;
    const response = await this.client.responses.parse({
      model: this.model,
      input: [
        { role: "developer", content: req.system },
        { role: "user", content },
      ],
      text: { format: zodTextFormat(req.schema as never, req.schemaName) },
      max_output_tokens: reasoningModel ? base + 12000 : base,
      ...(reasoningModel ? { reasoning: { effort } } : {}),
      store: false,
    });
    if (response.status === "incomplete") throw new Error(`KI-Antwort unvollständig (incomplete: ${response.incomplete_details?.reason ?? "unbekannt"})`);
    const parsed = response.output_parsed;
    console.info(`[ai] ${req.task} model=${this.model} in=${response.usage?.input_tokens ?? 0} out=${response.usage?.output_tokens ?? 0}`);
    if (parsed == null) throw new Error("KI lieferte keine verwertbare strukturierte Antwort");
    // Zweite, unabhängige Validierung
    const data = req.schema.parse(parsed);
    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    return {
      data,
      usage: {
        inputTokens,
        outputTokens,
        costUsd: (inputTokens * this.pricing.inputPerMTok + outputTokens * this.pricing.outputPerMTok) / 1_000_000,
      },
    };
  }
}
