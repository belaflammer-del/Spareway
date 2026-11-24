import "server-only";
import { providerEnabled } from "../config/providers";
import { env } from "../config/env";
import { PLATFORM_LABELS } from "../domain/labels";
import type { Platform } from "../domain/schemas";
import { extractListingLink, resolveShortLink, SHORTENER_HOSTS } from "../import/share-text";
import { listingKeyFor } from "../pipeline/service";
import { getStore } from "../store";
import { makeSafeFetch } from "./safe-fetch";
import { normalizeListingUrl } from "./normalize";

/**
 * Einheitlicher Share-Import-Service.
 *
 * Verarbeitet alles, was über das Teilen-Menü (Web Share Target, iOS Share
 * Extension, Android-Sharesheet) oder per Einfügen ankommt: URL, geteilter
 * Text, Titel und bereits gespeicherte Bilder/Screenshots.
 *
 * Ablauf: Link finden → Kurzlink sicher auflösen → Plattform erkennen →
 * URL normalisieren → Importweg bestimmen → fehlende Angaben benennen →
 * bereits vorhandene Prüfung erkennen (keine doppelte Analyse).
 *
 * Es werden KEINE Inseratsseiten geladen. Ein geteilter Link ist keine
 * Berechtigung, Inhalte der Plattform auszulesen. Ohne offizielle Schnittstelle
 * bietet DEAL-NIVO direkt den Screenshot-Upload an.
 */

export interface ShareInput {
  url?: string;
  text?: string;
  title?: string;
  uploadIds?: string[];
}

export interface ShareImportResult {
  ok: boolean;
  kind: "listing_link" | "unsupported_link" | "files_only" | "nothing";
  platform: Platform;
  platformName?: string;
  url?: string;
  externalId?: string;
  listingKey?: string;
  titleHint?: string;
  /** Daten können über eine offizielle Schnittstelle übernommen werden */
  autoImport: boolean;
  importInfo?: string;
  /** Screenshot-Upload nötig bzw. empfohlen */
  needsScreenshots: boolean;
  missing: string[];
  uploadIds: string[];
  existing?: { id: string; createdAt: string; title: string; status: string };
  message: string;
}

/** Erlaubte Kurzlink-Hosts für die Weiterleitungsauflösung (SSRF-Allowlist). */
const SHORTENER_ALLOW = new RegExp(SHORTENER_HOSTS.source.replace("^(", "^(?:www\\.)?("), "i");

/** SSRF-geschützter fetch nur für Plattform-Kurzlinks. */
export function shortLinkFetch(fetchImpl?: typeof fetch): typeof fetch {
  return makeSafeFetch({ allowHosts: SHORTENER_ALLOW, maxRedirects: 0, timeoutMs: 5000, fetchImpl });
}

export async function processShare(input: ShareInput, userId?: string, opts: { fetchImpl?: typeof fetch } = {}): Promise<ShareImportResult> {
  const uploadIds = (input.uploadIds ?? []).slice(0, 12);
  const combined = [input.url, input.text, input.title].filter(Boolean).join(" \n ").slice(0, 4000);
  const extracted = extractListingLink(combined);
  // Titel aus dem Teilen-Text (ohne Link) – nur ein Hinweis, kein importiertes Datum
  const titleHint = extracted.titleHint ?? (input.title && input.title.length <= 140 ? input.title : undefined);

  if (!extracted.url) {
    if (uploadIds.length)
      return {
        ok: true,
        kind: "files_only",
        platform: "unknown",
        autoImport: false,
        needsScreenshots: false,
        missing: [],
        uploadIds,
        titleHint,
        message: `${uploadIds.length} Bild${uploadIds.length > 1 ? "er" : ""} übernommen. Die KI liest die Angaben daraus aus.`,
      };
    return {
      ok: false,
      kind: "nothing",
      platform: "unknown",
      autoImport: false,
      needsScreenshots: true,
      missing: [],
      uploadIds,
      message: "Wir haben keinen Inseratslink gefunden. Lade stattdessen Screenshots des Inserats hoch.",
    };
  }

  const safeFetch = shortLinkFetch(opts.fetchImpl);
  const resolved = extracted.shortLink ? await resolveShortLink(extracted.url, safeFetch).catch(() => extracted.url as string) : extracted.url;
  const norm = normalizeListingUrl(resolved);
  if (!norm)
    return {
      ok: false,
      kind: "nothing",
      platform: "unknown",
      autoImport: false,
      needsScreenshots: true,
      missing: [],
      uploadIds,
      message: "Der Link ist ungültig. Lade stattdessen Screenshots des Inserats hoch.",
    };

  if (!norm.adapter) {
    let host = "";
    try {
      host = new URL(norm.url).hostname.replace(/^www\./, "");
    } catch {
      /* ignorieren */
    }
    return {
      ok: true,
      kind: "unsupported_link",
      platform: "other",
      platformName: host,
      url: norm.url,
      titleHint,
      autoImport: false,
      needsScreenshots: uploadIds.length === 0,
      missing: ["Preis", "Beschreibung", "Fotos"],
      uploadIds,
      message: `${host || "Diese Plattform"} wird nicht automatisch unterstützt. Lade Screenshots des Inserats hoch – die Prüfung funktioniert trotzdem.`,
    };
  }

  const adapter = norm.adapter;
  const ebayOn = adapter.id === "ebay" && (await providerEnabled("ebay_api"));
  const autoImport =
    !!norm.externalId &&
    adapter.canAutoImport({ ebay: ebayOn ? { clientId: env.ebay.clientId, clientSecret: env.ebay.clientSecret, marketplaceId: env.ebay.marketplaceId } : undefined });
  const listingKey = listingKeyFor({ platform: adapter.id, externalId: norm.externalId, url: norm.url });

  let existing: ShareImportResult["existing"];
  if (userId && listingKey) {
    const prev = await getStore().findLatestByListingKey(userId, listingKey);
    if (prev) existing = { id: prev.id, createdAt: prev.createdAt, title: prev.title, status: prev.status };
  }

  const missing = autoImport ? [] : ["Preis", "Beschreibung", "Fotos", ...(adapter.defaultCategory === "vehicle" ? ["Kilometerstand", "Erstzulassung"] : [])];
  return {
    ok: true,
    kind: "listing_link",
    platform: adapter.id,
    platformName: PLATFORM_LABELS[adapter.id] ?? adapter.name,
    url: norm.url,
    externalId: norm.externalId,
    listingKey,
    titleHint,
    autoImport,
    importInfo: adapter.importInfo,
    needsScreenshots: !autoImport && uploadIds.length === 0,
    missing,
    uploadIds,
    existing,
    message: existing
      ? "Dieses Inserat hast du bereits geprüft. Öffne die vorhandene Kaufakte oder prüfe es erneut (z. B. nach einer Preisänderung)."
      : autoImport
        ? `Die Angaben werden über die offizielle ${adapter.name}-Schnittstelle übernommen.`
        : `${adapter.name} bietet keine freigegebene Schnittstelle. Lade Screenshots des Inserats hoch – so liest die KI Preis und Angaben aus.`,
  };
}
