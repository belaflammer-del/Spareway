/**
 * KI-Qualitätsmessung gegen Referenzdaten. Läuft NUR mit echtem Schlüssel:
 *   OPENAI_API_KEY=… npm run eval
 * Misst Extraktionsgenauigkeit und erfundene Angaben (Halluzinationen).
 */
import { describe, expect, it } from "vitest";
import { OpenAIProvider } from "@/lib/ai/openai";
import { UsageMeter } from "@/lib/ai/provider";
import { aiExtractListing } from "@/lib/pipeline/ai-steps";
import { FIXTURES } from "./fixtures";

const enabled = process.env.RUN_AI_EVAL === "1" && !!process.env.OPENAI_API_KEY;

function same(a: unknown, b: unknown): boolean {
  if (typeof b === "number") return Number(a) === b;
  return String(a ?? "").toLowerCase().includes(String(b).toLowerCase());
}

describe.skipIf(!enabled)("AI extraction eval", () => {
  it("meets accuracy and hallucination thresholds", async () => {
    const ai = new OpenAIProvider(process.env.OPENAI_API_KEY as string, process.env.OPENAI_MODEL ?? "gpt-5", { inputPerMTok: 1.25, outputPerMTok: 10 });
    let correct = 0;
    let total = 0;
    let hallucinated = 0;
    let absentChecked = 0;
    const meter = new UsageMeter();
    for (const f of FIXTURES) {
      const r = await aiExtractListing(ai, meter, { images: [], pastedText: f.text });
      const got = r.patch as Record<string, unknown>;
      for (const [k, v] of Object.entries(f.expected)) {
        total++;
        if (same(got[k], v)) correct++;
        else console.warn(`[eval] ${f.name}: ${k} erwartet ${v}, erhalten ${String(got[k])}`);
      }
      for (const k of f.absent) {
        absentChecked++;
        if (got[k] != null) {
          hallucinated++;
          console.warn(`[eval] ${f.name}: erfundenes Feld ${k}=${String(got[k])}`);
        }
      }
    }
    const accuracy = correct / total;
    const hallucinationRate = hallucinated / absentChecked;
    console.info(`[eval] Genauigkeit ${(accuracy * 100).toFixed(1)} %, Halluzinationsrate ${(hallucinationRate * 100).toFixed(1)} %, Kosten $${meter.total.costUsd.toFixed(4)}`);
    expect(accuracy).toBeGreaterThanOrEqual(0.9);
    expect(hallucinationRate).toBeLessThanOrEqual(0.05);
  }, 300_000);
});
