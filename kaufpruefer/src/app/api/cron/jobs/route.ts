import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/config/env";
import { runJobsOnce } from "@/lib/jobs/queue";
import { getStore } from "@/lib/store";
import { nowIso } from "@/lib/utils";
import { scheduleDueWatches } from "@/lib/watch/service";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Hintergrundverarbeitung per Cron (z. B. alle 10 Minuten mit Bearer CRON_SECRET):
 * fällige Beobachtungen einreihen, Jobs abarbeiten, Löschfristen durchsetzen.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.cronSecret ?? ""}`;
  if (!env.cronSecret || auth.length !== expected.length || !timingSafeEqual(Buffer.from(auth), Buffer.from(expected)))
    return new Response("Unauthorized", { status: 401 });
  const store = getStore();
  const scheduled = await scheduleDueWatches();
  const { processed } = await runJobsOnce({ maxJobs: 25 });
  const now = nowIso();
  const [modules, hashes] = await Promise.all([store.deleteExpiredModules(now), store.deleteExpiredImageHashes(now)]);
  return Response.json({ scheduled, processed, deleted: { modules, imageHashes: hashes } });
}
