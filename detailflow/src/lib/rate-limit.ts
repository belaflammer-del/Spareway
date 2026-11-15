import "server-only";

/**
 * Einfaches Rate Limiting (Sliding Window, In-Memory).
 * Für mehrere Server-Instanzen durch einen zentralen Speicher (z. B. Redis/Upstash) ersetzen.
 * Supabase Auth hat zusätzlich eigene Limits für Login/Registrierung.
 */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (v.every((t) => now - t > windowMs)) buckets.delete(k);
  }
  return true;
}
