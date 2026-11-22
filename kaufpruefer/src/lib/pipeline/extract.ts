/**
 * Entwurfsphase: Link importieren und/oder Screenshots auslesen.
 * Ergebnis ist ein Inseratsentwurf mit Herkunftsangaben je Feld, den der
 * Nutzer prüft und ergänzt, bevor die eigentliche Analyse startet.
 */
import type { AIProvider } from "../ai/provider";
import { UsageMeter } from "../ai/provider";
import type { Listing, MissingInfo, StepLog } from "../domain/schemas";
import { detectMissingInfo } from "../engine/missing-info";
import { importFromUrl, guessCategory, type ImportContext } from "../import/adapters";
import { sanitizeUntrustedText } from "../security/untrusted";
import { aiExtractListing } from "./ai-steps";
import { emptyListing, mergeListing } from "./merge";

export interface DraftResult {
  listing: Listing;
  missingInfo: MissingInfo[];
  notes: string[];
  lowConfidence: string[];
  log: StepLog[];
  aiCostUsd: number;
}

export async function buildDraft(
  input: { url?: string; imageRefs: string[]; pastedText?: string },
  deps: { ai: AIProvider | null; importCtx: ImportContext; loadImage: (ref: string) => Promise<string> },
): Promise<DraftResult> {
  const log: StepLog[] = [];
  const notes: string[] = [];
  const meter = new UsageMeter();
  let listing = emptyListing();
  let lowConfidence: string[] = [];

  if (input.url) {
    const t0 = Date.now();
    const r = await importFromUrl(input.url, deps.importCtx);
    if ("error" in r) {
      notes.push(r.error);
      log.push({ step: "import", label: "Inserat importieren", status: "failed", durationMs: Date.now() - t0, note: r.error });
    } else {
      listing = mergeListing({ ...listing, platform: r.platform, url: r.url, externalId: r.listing.externalId }, r.listing, r.method === "platform_api" ? "platform_api" : "url");
      listing.provenance = { ...listing.provenance, ...(r.listing.provenance ?? {}) };
      notes.push(...r.notes);
      log.push({ step: "import", label: "Inserat importieren", status: r.method === "platform_api" ? "ok" : "partial", durationMs: Date.now() - t0, note: r.method === "platform_api" ? "Offizielle Schnittstelle" : "Nur Linkinformationen" });
    }
  }

  const images = input.imageRefs.map((ref) => ({ ref, kind: "listing_screenshot" as const }));
  listing.images = images;

  if (input.pastedText && !deps.ai) {
    const text = sanitizeUntrustedText(input.pastedText, 8000);
    listing = mergeListing(listing, { description: text, category: listing.category === "other" ? guessCategory(text) : listing.category }, "user");
  }

  if (deps.ai && (images.length > 0 || input.pastedText)) {
    const t0 = Date.now();
    try {
      const loaded = [];
      for (const ref of input.imageRefs.slice(0, 10)) loaded.push({ ref, dataUrl: await deps.loadImage(ref) });
      const r = await aiExtractListing(deps.ai, meter, { images: loaded, pastedText: input.pastedText, hint: listing });
      const keepCategory = listing.provenance.category === "platform_api";
      listing = mergeListing(listing, keepCategory ? { ...r.patch, category: undefined } : r.patch, "ai_extraction");
      listing.images = listing.images.map((im) => ({ ...im, kind: r.imageKinds[im.ref] ?? im.kind }));
      lowConfidence = r.lowConfidence;
      if (r.issues.length) notes.push(...r.issues.map((i) => `Lesbarkeit: ${i}`));
      log.push({ step: "extract", label: "Daten extrahieren (KI)", status: "ok", durationMs: Date.now() - t0 });
    } catch (e) {
      notes.push("Die automatische Texterkennung ist fehlgeschlagen. Bitte ergänze die Angaben manuell.");
      log.push({ step: "extract", label: "Daten extrahieren (KI)", status: "failed", durationMs: Date.now() - t0, note: (e as Error).message.slice(0, 200) });
    }
  } else if (images.length > 0) {
    notes.push("Demo-/Regelmodus: Screenshots werden ohne KI-Schlüssel nicht automatisch ausgelesen. Bitte trage die wichtigsten Angaben selbst ein.");
    log.push({ step: "extract", label: "Daten extrahieren (KI)", status: "skipped", durationMs: 0, note: "Kein KI-Provider konfiguriert" });
  }

  if (listing.category === "other" && listing.title) listing.category = guessCategory(listing.title);
  return { listing, missingInfo: detectMissingInfo(listing), notes, lowConfidence, log, aiCostUsd: meter.total.costUsd };
}
