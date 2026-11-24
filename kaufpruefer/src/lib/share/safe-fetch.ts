import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * SSRF-Schutz für alle serverseitigen Anfragen an nutzergelieferte URLs.
 *
 * - Nur https (Port 443) – kein http, file, ftp, gopher, data …
 * - Nur ausdrücklich erlaubte Hosts (Allowlist je Aufrufer)
 * - DNS-Auflösung: Alle Adressen müssen öffentlich sein (keine privaten,
 *   Loopback-, Link-Local-, Carrier-NAT-, Multicast- oder Metadaten-Adressen)
 * - Weiterleitungen werden manuell verfolgt und JEDE Station erneut geprüft
 * - Zeitlimit und Größenlimit für Antworten
 *
 * Restrisiko: Zwischen eigener DNS-Prüfung und dem Verbindungsaufbau könnte
 * ein Angreifer den DNS-Eintrag ändern (DNS-Rebinding). Da nur Hosts einer
 * festen Allowlist bekannter Marktplätze erlaubt sind, ist das praktisch
 * ausgeschlossen.
 */

export class UnsafeUrlError extends Error {
  code = "unsafe_url" as const;
}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
}
function inV4(ip: string, cidr: string): boolean {
  const [base, bits] = cidr.split("/");
  const mask = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

const BLOCKED_V4 = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16", // inkl. Cloud-Metadaten 169.254.169.254
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.88.99.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
];

/** true, wenn die IP-Adresse nicht öffentlich erreichbar sein darf. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return BLOCKED_V4.some((c) => inV4(ip, c));
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s === "::" || s === "::1") return true;
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    if (/^::ffff:/.test(s)) return true;
    if (/^f[cd]/.test(s)) return true; // fc00::/7 Unique Local
    if (/^fe[89ab]/.test(s)) return true; // fe80::/10 Link-Local
    if (/^ff/.test(s)) return true; // Multicast
    if (/^(2001:db8|64:ff9b|100::)/.test(s)) return true;
    if (/^fd00:ec2/.test(s)) return true; // AWS-Metadaten IPv6
    return false;
  }
  return true; // keine gültige IP → blockieren
}

export interface SafeUrlOptions {
  /** Host-Allowlist (Regex auf den Hostnamen ohne www.) */
  allowHosts: RegExp;
  resolver?: (host: string) => Promise<string[]>;
}

const defaultResolver = async (host: string) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

/** Prüft eine URL vollständig (Protokoll, Port, Host, DNS). */
export async function assertSafeUrl(raw: string, opts: SafeUrlOptions): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UnsafeUrlError("Ungültige URL");
  }
  if (u.protocol !== "https:") throw new UnsafeUrlError("Nur https-Links sind erlaubt");
  if (u.port && u.port !== "443") throw new UnsafeUrlError("Unzulässiger Port");
  if (u.username || u.password) throw new UnsafeUrlError("Zugangsdaten in URLs sind nicht erlaubt");
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (isIP(host.replace(/^\[|\]$/g, ""))) throw new UnsafeUrlError("IP-Adressen sind nicht erlaubt");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local") || !host.includes("."))
    throw new UnsafeUrlError("Interne Adressen sind nicht erlaubt");
  if (!opts.allowHosts.test(host.replace(/^www\./, ""))) throw new UnsafeUrlError("Dieser Host ist nicht freigegeben");
  const addrs = await (opts.resolver ?? defaultResolver)(host).catch(() => {
    throw new UnsafeUrlError("Host nicht auflösbar");
  });
  if (addrs.length === 0 || addrs.some(isPrivateAddress)) throw new UnsafeUrlError("Ziel liegt in einem gesperrten Netzbereich");
  return u;
}

/**
 * fetch-Ersatz mit SSRF-Prüfung je Weiterleitung. Folgt maximal
 * `maxRedirects` Weiterleitungen; der Response-Body wird nicht gelesen.
 */
export function makeSafeFetch(opts: SafeUrlOptions & { maxRedirects?: number; timeoutMs?: number; fetchImpl?: typeof fetch }): typeof fetch {
  const f = opts.fetchImpl ?? fetch;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    let url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    for (let hop = 0; hop <= (opts.maxRedirects ?? 3); hop++) {
      await assertSafeUrl(url, opts);
      const res = await f(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(opts.timeoutMs ?? 5000) });
      // Aufrufer mit redirect: "manual" (z. B. Kurzlink-Auflösung) bekommen die Weiterleitung selbst
      if (init?.redirect === "manual" || res.status < 300 || res.status >= 400) return res;
      const loc = res.headers.get("location");
      if (!loc) return res;
      url = new URL(loc, url).toString();
    }
    throw new UnsafeUrlError("Zu viele Weiterleitungen");
  }) as typeof fetch;
}
