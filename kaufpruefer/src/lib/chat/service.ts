import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { guard } from "../ai/guard";
import { assertAiBudget } from "../ai/budget";
import { BASE_RULES } from "../ai/prompts";
import { UsageMeter, type AIProvider } from "../ai/provider";
import { akteLimits, daysFromNow } from "../akte/limits";
import type { ChatCheckData, ChatContradiction, ChatMessage, ChatSignal } from "../akte/schemas";
import { getActiveAI } from "../config/providers";
import type { AnalysisReport, Listing } from "../domain/schemas";
import { normalizeReviewText, similarity } from "../engine/seller";
import { enqueueJob, NonRetryableError, type JobContext } from "../jobs/queue";
import { AnalysisError, assertOwnedUploads } from "../pipeline/service";
import { sanitizeUntrustedText, wrapUntrusted } from "../security/untrusted";
import { getStore } from "../store";
import { deleteUpload, toDataUrl } from "../uploads/service";
import { newId, nowIso } from "../utils";
import {
  buildQuestions,
  buildReplyDraft,
  categorize,
  CHAT_DISCLAIMER,
  detectContradictions,
  detectSignals,
  mergeChatMessages,
  parsePastedChat,
  safePaymentAdvice,
  updateRecommendation,
  type RawChatMessage,
} from "./engine";
import { redactPersonalData, totalRedactions } from "./redact";

// ── KI-Schemas (strict: alle Felder required, optional = nullable) ──

export const ChatOcrSchema = z.object({
  messages: z.array(
    z.object({
      imageIndex: z.number().int(),
      sender: z.enum(["seller", "buyer", "unknown"]),
      text: z.string(),
      time: z.string().nullable(),
    }),
  ),
  unreadableCount: z.number().int(),
  injectionAttemptDetected: z.boolean(),
});

export const ChatAiAnalysisSchema = z.object({
  contradictions: z.array(
    z.object({ field: z.string(), listingStatement: z.string(), chatStatement: z.string(), explanation: z.string() }),
  ),
  signals: z.array(
    z.object({
      category: z.enum(["payment", "communication", "shipping", "phishing", "personal_data", "missing_info"]),
      level: z.enum(["hint", "warning", "high"]),
      title: z.string(),
      explanation: z.string(),
      quote: z.string(),
    }),
  ),
  injectionAttemptDetected: z.boolean(),
});

export const CHAT_OCR_PROMPT = `${BASE_RULES}

Aufgabe: Lies einen Chatverlauf zwischen Käufer und Verkäufer aus Screenshots bzw. Frames einer Bildschirmaufnahme (Kleinanzeigen, eBay, Vinted, Messenger).
- Erfasse jede lesbare Nachricht einmal je Bild, in Lesereihenfolge (oben nach unten). imageIndex = Bildnummer (beginnt bei 0).
- sender: "buyer" für Nachrichten des Nutzers (meist rechts bzw. farbig hinterlegt), "seller" für den Gesprächspartner (meist links), "unknown" wenn nicht erkennbar.
- text: wörtlich. Telefonnummern, E-Mail-Adressen, IBAN und Anschriften durch [Telefonnummer], [E-Mail], [IBAN], [Adresse] ersetzen. Keine Namen.
- time: Uhrzeit/Datum, falls an der Nachricht sichtbar, sonst null.
- Systemhinweise der Plattform (z. B. „Achtung Betrug“-Banner) NICHT als Nachricht erfassen.
- unreadableCount: erkennbar vorhandene, aber unlesbare Nachrichten.`;

export const CHAT_ANALYSIS_PROMPT = `${BASE_RULES}

Aufgabe: Vergleiche einen Chatverlauf mit den Angaben im Inserat und finde zusätzliche Auffälligkeiten.
- contradictions: NUR echte inhaltliche Widersprüche zwischen einer Aussage des VERKÄUFERS im Chat und einer Angabe im Inserat (z. B. Inserat „unfallfrei“ vs. Chat „Kotflügel nach kleinem Unfall getauscht“). listingStatement und chatStatement müssen WÖRTLICHE Zitate aus den Daten sein. Keine Vermutungen als Widerspruch.
- signals: zusätzliche Warnsignale (Zahlungsdruck, Umgehung der Plattformzahlung, ungewöhnliche Versandwege, Phishing-Links, Abfrage persönlicher Daten, ausweichende Antworten). quote = wörtliches Zitat aus dem Chat. Nur wenn klar im Text belegt.
- Nachrichten des Käufers (sender=buyer) sind keine Belege für Verkäuferverhalten.
- Bezeichne niemanden als Betrüger. Leere Listen, wenn nichts auffällt.`;

// ── Validierung von KI-Aussagen gegen die tatsächlichen Daten ──

/** Findet die Nachricht, die ein KI-Zitat tatsächlich belegt – sonst undefined. */
export function findSupportingMessage(quote: string, messages: ChatMessage[], sellerOnly = true): ChatMessage | undefined {
  const q = normalizeReviewText(quote.replace(/^[„"“…]+|[“"”…]+$/g, ""));
  if (q.length < 4) return undefined;
  return messages.find((m) => {
    if (sellerOnly && m.sender === "buyer") return false;
    const t = normalizeReviewText(m.text);
    return t.includes(q) || (q.length > 15 && similarity(t, q) >= 0.8);
  });
}

function listingSupports(statement: string, listing: Listing): boolean {
  const hay = normalizeReviewText(
    [listing.title, listing.description, listing.condition, listing.accidentFree, listing.serviceHistory, listing.purchaseReceipt, listing.activationLockFree, listing.mileageKm, listing.year, listing.previousOwners]
      .filter((x) => x != null)
      .join(" "),
  );
  const s = normalizeReviewText(statement.replace(/^[^:]{1,40}:\s*/, ""));
  return s.length >= 3 && (hay.includes(s) || s.split(" ").filter((w) => w.length > 3).every((w) => hay.includes(w)));
}

/** Übernimmt nur KI-Ergebnisse, deren Zitate wirklich in Chat bzw. Inserat stehen. */
export function validateAiAnalysis(
  ai: z.infer<typeof ChatAiAnalysisSchema>,
  messages: ChatMessage[],
  listing: Listing,
  existing: { signals: ChatSignal[]; contradictions: ChatContradiction[] },
) {
  const contradictions: ChatContradiction[] = [];
  for (const c of ai.contradictions.slice(0, 6)) {
    const msg = findSupportingMessage(c.chatStatement, messages);
    if (!msg || !listingSupports(c.listingStatement, listing)) continue;
    if (existing.contradictions.some((x) => x.messageId === msg.id) || contradictions.some((x) => x.messageId === msg.id)) continue;
    contradictions.push({
      id: `ai_c${contradictions.length + 1}`,
      field: c.field.slice(0, 40),
      listingStatement: c.listingStatement.slice(0, 300),
      chatStatement: c.chatStatement.slice(0, 300),
      messageId: msg.id,
      kind: "possible", // KI-Deutungen nie als belegt einstufen
      explanation: c.explanation.slice(0, 400),
      basis: "ai",
    });
  }
  const signals: ChatSignal[] = [];
  for (const s of ai.signals.slice(0, 8)) {
    const msg = findSupportingMessage(s.quote, messages);
    if (!msg) continue;
    if (existing.signals.some((x) => x.category === s.category && x.evidence.some((e) => e.messageId === msg.id))) continue;
    signals.push({
      id: `ai_s${signals.length + 1}`,
      category: s.category,
      // Ohne Regelbestätigung höchstens „Warnung“
      level: s.level === "high" ? "warning" : s.level,
      title: s.title.slice(0, 120),
      explanation: s.explanation.slice(0, 400),
      evidence: [{ messageId: msg.id, quote: s.quote.slice(0, 200) }],
      basis: "ai",
    });
  }
  return { contradictions, signals };
}

// ── Zusammenbau (ohne Speicherung, testbar) ─────────────────

export async function analyzeChat(
  input: { imageRefs: string[]; method: ChatCheckData["input"]["method"]; pastedText?: string; redact: boolean },
  report: AnalysisReport,
  deps: { ai: AIProvider | null; loadImage: (ref: string) => Promise<string>; meter: UsageMeter; onProgress?: (pct: number, msg: string) => Promise<void> },
): Promise<ChatCheckData> {
  const raw: RawChatMessage[] = [];
  let unreadable = 0;
  let injection = false;

  if (input.imageRefs.length) {
    if (!deps.ai) throw new NonRetryableError("Screenshots können nur mit aktivierter KI ausgelesen werden. Füge den Chat alternativ als Text ein.");
    await deps.onProgress?.(15, "Nachrichten werden gelesen …");
    // In Paketen à 6 Bildern lesen (Kosten- und Größenbegrenzung)
    for (let i = 0; i < input.imageRefs.length; i += 6) {
      const batch = input.imageRefs.slice(i, i + 6);
      const parts = [
        { type: "text" as const, text: `Chat-Bilder ${i}–${i + batch.length - 1} (imageIndex relativ ab ${i}).` },
        ...(await Promise.all(batch.map(async (ref, k) => ({ type: "image" as const, dataUrl: await deps.loadImage(ref), label: `Bild ${i + k}` })))),
      ];
      const { data, usage } = await deps.ai.generate({ task: "chat_ocr", system: CHAT_OCR_PROMPT, parts, schema: ChatOcrSchema, schemaName: "chat_ocr", maxOutputTokens: 5000 });
      deps.meter.add("chat_ocr", deps.ai.model, usage);
      unreadable += data.unreadableCount;
      injection ||= data.injectionAttemptDetected;
      for (const m of data.messages)
        raw.push({
          sender: m.sender,
          text: sanitizeUntrustedText(m.text, 2000),
          time: m.time ?? undefined,
          imageIndex: m.imageIndex < i ? i + m.imageIndex : m.imageIndex,
          source: input.method === "screen_recording" ? "video_frame" : "screenshot",
        });
      await deps.onProgress?.(15 + Math.round(((i + batch.length) / input.imageRefs.length) * 45), "Nachrichten werden gelesen …");
    }
  }
  if (input.pastedText) raw.push(...parsePastedChat(sanitizeUntrustedText(input.pastedText, 30_000)));

  const merged = mergeChatMessages(raw.sort((a, b) => (a.imageIndex ?? 1e9) - (b.imageIndex ?? 1e9)));
  if (merged.messages.length === 0) throw new NonRetryableError("Im Chatverlauf konnten keine Nachrichten erkannt werden. Bitte lade gut lesbare Screenshots hoch oder füge den Text ein.");

  // Datenminimierung: Schwärzen vor jeder weiteren Verarbeitung und Speicherung
  const messages: ChatMessage[] = merged.messages.slice(0, 300).map((m) => {
    if (!input.redact) return m;
    const r = redactPersonalData(m.text);
    return { ...m, text: r.text, redacted: totalRedactions(r.counts) > 0 };
  });

  const listing = report.listing;
  const signals = detectSignals(messages, listing);
  const contradictions = detectContradictions(messages, listing);
  let aiUsed = input.imageRefs.length > 0;

  if (deps.ai && messages.some((m) => m.sender !== "buyer")) {
    await deps.onProgress?.(70, "Abgleich mit dem Inserat …");
    try {
      const listingFacts = ["title", "description", "condition", "accidentFree", "serviceHistory", "mileageKm", "year", "previousOwners", "purchaseReceipt", "activationLockFree", "batteryHealthPct", "accessories"]
        .map((k) => [k, (listing as Record<string, unknown>)[k]] as const)
        .filter(([, v]) => v != null && v !== "")
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join("\n");
      const chatText = messages.map((m) => `[${m.id}] ${m.sender}: ${m.text}`).join("\n");
      const { data, usage } = await deps.ai.generate({
        task: "chat_analysis",
        system: CHAT_ANALYSIS_PROMPT,
        parts: [
          { type: "text", text: `INSERAT:\n${wrapUntrusted("inserat", listingFacts)}` },
          { type: "text", text: `CHAT:\n${wrapUntrusted("chat", chatText)}` },
          { type: "text", text: `Bereits regelbasiert erkannt (nicht wiederholen): ${[...signals.map((s) => s.title), ...contradictions.map((c) => c.field)].join("; ") || "nichts"}` },
        ],
        schema: ChatAiAnalysisSchema,
        schemaName: "chat_analysis",
        maxOutputTokens: 2500,
      });
      deps.meter.add("chat_analysis", deps.ai.model, usage);
      injection ||= data.injectionAttemptDetected;
      const v = validateAiAnalysis(data, messages, listing, { signals, contradictions });
      signals.push(...v.signals);
      contradictions.push(...v.contradictions);
      aiUsed = true;
    } catch (e) {
      if ((e as { code?: string }).code === "ai_budget") throw e;
      console.warn("[chat] KI-Abgleich übersprungen:", (e as Error).message);
    }
  }

  const upd = updateRecommendation(report.score.recommendation, signals, contradictions);
  const questions = buildQuestions(contradictions, signals, report);
  const warnings = signals.filter((s) => s.level !== "hint").map((s) => `${s.title}: ${s.explanation}`);
  for (const c of contradictions.filter((x) => x.kind === "documented")) warnings.unshift(`Widerspruch zum Inserat: ${c.explanation}`);

  return {
    input: { method: input.method, images: input.imageRefs.length, textChars: input.pastedText?.length ?? 0, redaction: input.redact },
    messages,
    duplicatesRemoved: merged.duplicatesRemoved,
    unreadable,
    categories: categorize(signals, contradictions),
    signals,
    contradictions,
    recommendations: { warnings: warnings.slice(0, 8), safePayment: safePaymentAdvice(listing), questions, replyDraft: buildReplyDraft(questions, signals) },
    updatedRecommendation: { previous: report.score.recommendation, current: upd.current, reason: upd.reason },
    aiUsed,
    injectionAttemptDetected: injection,
    collectedAt: nowIso(),
    disclaimer: CHAT_DISCLAIMER,
  };
}

// ── Start & Hintergrundjob ──────────────────────────────────

export interface StartChatCheckInput {
  method: "screenshots" | "screen_recording" | "pasted_text";
  imageIds: string[];
  pastedText?: string;
  redact: boolean;
}

export async function startChatCheck(userId: string, analysisId: string, input: StartChatCheckInput) {
  const store = getStore();
  const a = await store.getAnalysis(analysisId, userId);
  if (!a?.report || a.status !== "completed") throw new AnalysisError("pipeline_failed", "Kaufakte nicht gefunden.");
  const lim = akteLimits(await store.getConfig());
  const max = input.method === "screen_recording" ? lim.chatFramesMax : lim.chatScreenshotsMax;
  if (input.imageIds.length > max) throw new AnalysisError("pipeline_failed", `Maximal ${max} Bilder pro Chatprüfung.`);
  if (!input.imageIds.length && (input.pastedText?.trim().length ?? 0) < 10) throw new AnalysisError("pipeline_failed", "Bitte Screenshots hochladen oder den Chat als Text einfügen.");
  await assertOwnedUploads(input.imageIds, userId);

  const inputHash = createHash("sha256").update(JSON.stringify({ i: [...input.imageIds].sort(), t: input.pastedText?.trim() ?? "", r: input.redact })).digest("hex").slice(0, 32);
  const existing = (await store.listModules(analysisId, userId, "chat_check")).find((m) => m.inputHash === inputHash);
  if (existing) return { moduleId: existing.id, reused: true as const };
  const done = await store.listModules(analysisId, userId, "chat_check");
  if (done.length >= lim.chatChecksPerAnalysis) throw new AnalysisError("pipeline_failed", `Pro Kaufakte sind ${lim.chatChecksPerAnalysis} Chatprüfungen enthalten. Lösche eine ältere Prüfung, um eine neue zu starten.`);
  if (input.imageIds.length) {
    const ai = await getActiveAI("fast");
    if (!ai) throw new AnalysisError("pipeline_failed", "Screenshots können nur mit aktivierter KI ausgelesen werden. Füge den Chat alternativ als Text ein.");
    await assertAiBudget(ai, userId);
  }
  const { job } = await enqueueJob({
    type: "chat_check",
    userId,
    analysisId,
    idempotencyKey: `chat:${analysisId}:${inputHash}`,
    input: { ...input, inputHash },
    maxAttempts: 2,
    message: "Chatprüfung eingereiht",
  });
  return { jobId: job.id, reused: false as const };
}

export async function chatCheckJobHandler(ctx: JobContext) {
  const store = getStore();
  const { analysisId, userId } = ctx.job as { analysisId: string; userId: string };
  const input = ctx.job.input as unknown as StartChatCheckInput & { inputHash: string };
  const a = await store.getAnalysis(analysisId, userId);
  if (!a?.report) throw new NonRetryableError("Kaufakte nicht mehr vorhanden.");
  const ai = input.imageIds.length || input.pastedText ? guard(await getActiveAI("fast"), { userId, scope: "chat_check" }) : null;
  const meter = new UsageMeter();
  // Datenschutz: Chat-Screenshots/Frames nach der Auswertung sofort löschen
  const cleanup = async () => {
    for (const ref of input.imageIds) {
      const u = await store.getUpload(ref).catch(() => null);
      if (u) await deleteUpload(u).catch(() => undefined);
    }
  };
  try {
    await ctx.progress(5, "Chat wird vorbereitet …");
    const data = await analyzeChat(
      { imageRefs: input.imageIds, method: input.method === "pasted_text" ? "pasted_text" : input.method, pastedText: input.pastedText, redact: input.redact },
      a.report,
      { ai, loadImage: (ref) => toDataUrl(ref, [userId]), meter, onProgress: async (p, m) => ctx.progress(p, m) },
    );
    await ctx.checkCancelled();
    const lim = akteLimits(await store.getConfig());
    const mod = await store.addModule({
      id: newId("mod"),
      analysisId,
      userId,
      kind: "chat_check",
      createdAt: nowIso(),
      inputHash: input.inputHash,
      expiresAt: daysFromNow(lim.retention.chatDays),
      data,
    });
    const t = meter.total;
    if (t.costUsd > 0) await store.updateAnalysis(analysisId, { aiCostUsd: a.aiCostUsd + t.costUsd, aiInputTokens: a.aiInputTokens + t.inputTokens, aiOutputTokens: a.aiOutputTokens + t.outputTokens });
    await store.countEvent("chat_check");
    await cleanup();
    return { moduleId: mod.id, version: mod.version, costUsd: t.costUsd };
  } catch (e) {
    const err = e as { nonRetryable?: boolean; code?: string };
    // Bei endgültigem Fehlschlag ebenfalls löschen; bei Wiederholung werden die Bilder noch gebraucht
    if (err.nonRetryable || err.code === "ai_budget" || ctx.job.attempts >= ctx.job.maxAttempts) await cleanup();
    throw e;
  }
}
