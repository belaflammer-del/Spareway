/**
 * Erkennt Inseratslinks in beliebigem Text – insbesondere in Texten, die die
 * Teilen-Funktion der Marktplatz-Apps erzeugt, z. B.:
 *   „Schau mal, was ich auf Kleinanzeigen gefunden habe: BMW 320d Touring
 *    https://www.kleinanzeigen.de/s-anzeige/…?utm_source=sharesheet&…“
 *
 * Läuft im Browser und auf dem Server (keine Node-Abhängigkeiten).
 */

const KNOWN_HOSTS = /(^|\.)(kleinanzeigen\.de|ebay-kleinanzeigen\.de|mobile\.de|autoscout24\.[a-z.]+|ebay\.[a-z.]+|ebay\.us|ebay\.to|vinted\.[a-z.]+)$/i;

/** Plattform-Kurzlinks, deren Weiterleitungsziel aufgelöst werden darf. */
export const SHORTENER_HOSTS = /^(ebay\.us|ebay\.to|www\.ebay\.us|r\.kleinanzeigen\.de|link\.kleinanzeigen\.de|share\.vinted\.[a-z.]+)$/i;

const TRACKING_PARAMS = /^(utm_\w+|fbclid|gclid|mc_\w+|ref|referrer|campaign|source|share_\w*|_trksid|_trkparms|mkevt|mkcid|mkrid|campid|toolid|customid|siteid|ul_noapp|amdata|sharesheet)$/i;

const BOILERPLATE = [
  /\b(hey|hi|hallo|moin)\b[,!]?/gi,
  /\b(schau|guck|sieh)\s*(dir)?\s*(mal|doch mal)?\b/gi,
  /\b(was|das)\s+ich\s+(gerade\s+)?(auf|bei)\s+[\w.-]+\s+gefunden\s+habe\b/gi,
  /\b(ich\s+habe|hab)\s+(das|dies|diese anzeige)?\s*(gerade\s+)?(auf|bei)\s+[\w.-]+\s+gefunden\b/gi,
  /\b(diese|die)\s+anzeige\s+(auf|bei)\s+[\w.-]+(\s+an)?\b/gi,
  /\b(auf|bei)\s+(kleinanzeigen|ebay|mobile\.de|autoscout24|vinted)(\s+an)?\b/gi,
  /\bwie\s+findest\s+du\s+(das|den|die)\??/gi,
  /\b(check this out|look at this)\b/gi,
  /\b(gefunden|entdeckt)\b/gi,
];

export interface ExtractedLink {
  url?: string;
  titleHint?: string;
  shortLink: boolean;
}

function trimTrailing(u: string): string {
  return u.replace(/[)\]}>.,;:!?"'»«“”‘’…]+$/u, "");
}

/** Entfernt Tracking-Parameter, behält inhaltliche (z. B. mobile.de ?id=). */
export function cleanUrl(raw: string): string {
  try {
    const u = new URL(raw);
    for (const k of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(k)) u.searchParams.delete(k);
    u.hash = "";
    return u.toString().replace(/\?$/, "");
  } catch {
    return raw;
  }
}

export function extractListingLink(input: string): ExtractedLink {
  const text = (input ?? "").replace(/​| /g, " ").trim();
  if (!text) return { shortLink: false };

  const candidates: { raw: string; url: URL }[] = [];
  const withScheme = text.match(/https?:\/\/[^\s<>"'`]+/gi) ?? [];
  for (const m of withScheme) {
    try {
      candidates.push({ raw: m, url: new URL(trimTrailing(m)) });
    } catch {
      /* ignorieren */
    }
  }
  if (candidates.length === 0) {
    const bare = text.match(/(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:de|com|at|ch|us|to|fr|it|es|nl|co\.uk)(?:\/[^\s<>"'`]*)?/gi) ?? [];
    for (const m of bare) {
      try {
        candidates.push({ raw: m, url: new URL(`https://${trimTrailing(m)}`) });
      } catch {
        /* ignorieren */
      }
    }
  }
  if (candidates.length === 0) return { shortLink: false };

  const pick = candidates.find((c) => KNOWN_HOSTS.test(c.url.hostname)) ?? candidates[0];
  const host = pick.url.hostname.toLowerCase();

  let rest = text.replace(pick.raw, " ");
  for (const re of BOILERPLATE) rest = rest.replace(re, " ");
  rest = rest
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^[\s:,.\-–—!|]+|[\s:,.\-–—!|]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const titleHint = rest.length >= 3 && rest.length <= 140 && /\p{L}{2}/u.test(rest) ? rest : undefined;

  return { url: cleanUrl(pick.url.toString()), titleHint, shortLink: SHORTENER_HOSTS.test(host) };
}

/**
 * Löst bekannte Plattform-Kurzlinks auf, indem nur das Weiterleitungsziel
 * (Location-Header) gelesen wird – es wird kein Seiteninhalt geladen.
 */
export async function resolveShortLink(url: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  let current = url;
  for (let i = 0; i < 4; i++) {
    let host: string;
    try {
      host = new URL(current).hostname;
    } catch {
      return url;
    }
    if (!SHORTENER_HOSTS.test(host)) return cleanUrl(current);
    try {
      const res = await fetchImpl(current, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(5000) });
      const loc = res.headers.get("location");
      if (!loc) return cleanUrl(current);
      current = new URL(loc, current).toString();
    } catch {
      return cleanUrl(current);
    }
  }
  return cleanUrl(current);
}
