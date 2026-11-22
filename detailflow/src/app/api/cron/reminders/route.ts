import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runDailyReminders } from "@/lib/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Täglicher Job (z. B. Vercel Cron). Geschützt durch CRON_SECRET (Authorization: Bearer …). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return new NextResponse("Nicht autorisiert", { status: 401 });
  }
  return NextResponse.json(await runDailyReminders());
}
