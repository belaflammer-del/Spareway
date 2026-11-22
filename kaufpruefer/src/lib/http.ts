import "server-only";
import { headers } from "next/headers";
import { sha256 } from "./auth/crypto";
import { env } from "./config/env";
import { getStore } from "./store";

/** IP-Adresse – nur gehasht verwenden (datensparsame Protokollierung). */
export async function clientIpHash(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return sha256(`${env.appSecret}:${ip}`).slice(0, 32);
}

export async function rateLimit(key: string, windowSeconds: number, limit: number) {
  return getStore().hitRateLimit(key, windowSeconds, limit);
}

export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

export function errorJson(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}
