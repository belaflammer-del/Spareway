import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/config/env";
import { cleanupExpiredUploads } from "@/lib/uploads/service";

export const runtime = "nodejs";

/** Löscht abgelaufene Uploads (z. B. stündlich per Cron mit Bearer-Token aufrufen). */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.cronSecret ?? ""}`;
  if (!env.cronSecret || auth.length !== expected.length || !timingSafeEqual(Buffer.from(auth), Buffer.from(expected)))
    return new Response("Unauthorized", { status: 401 });
  const deleted = await cleanupExpiredUploads();
  return Response.json({ deleted });
}
