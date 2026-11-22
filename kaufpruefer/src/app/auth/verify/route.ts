import { NextResponse } from "next/server";
import { sha256 } from "@/lib/auth/crypto";
import { env, features } from "@/lib/config/env";
import { getLocalStore, getStore } from "@/lib/store";

/** E-Mail-Bestätigung im Lokalmodus. */
export async function GET(req: Request) {
  if (features.supabase) return NextResponse.redirect(new URL("/login", env.appUrl));
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const t = token ? await getLocalStore().consumeToken(sha256(token), "verify_email") : null;
  if (t) await getStore().updateUser(t.userId, { emailVerified: true });
  return NextResponse.redirect(new URL(t ? "/dashboard?verified=1" : "/login?verify=invalid", env.appUrl));
}
