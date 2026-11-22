import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { features, isAdminEmail } from "../config/env";
import { getLocalStore, getStore } from "../store";
import { nowIso } from "../utils";
import { randomToken, sha256 } from "./crypto";
import { supabaseServer } from "./supabase-server";

export const LOCAL_SESSION_COOKIE = "kk_session";
const SESSION_DAYS = 30;

export interface SessionUser {
  id: string;
  email: string;
  emailVerified: boolean;
  isAdmin: boolean;
}

/** Ermittelt den angemeldeten Nutzer serverseitig (pro Request gecacht). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  if (features.supabase) {
    const sb = await supabaseServer();
    const { data } = await sb.auth.getUser();
    const u = data.user;
    if (!u) return null;
    return { id: u.id, email: u.email ?? "", emailVerified: !!u.email_confirmed_at, isAdmin: isAdminEmail(u.email) };
  }
  const token = (await cookies()).get(LOCAL_SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await getLocalStore().getSession(sha256(token));
  if (!s) return null;
  const u = await getStore().getUser(s.userId);
  if (!u) return null;
  return { id: u.id, email: u.email, emailVerified: u.emailVerified, isAdmin: isAdminEmail(u.email) };
});

export async function requireUser(next = "/dashboard"): Promise<SessionUser> {
  const u = await getCurrentUser();
  if (!u) redirect(`/login?next=${encodeURIComponent(next)}`);
  return u;
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser("/admin");
  if (!u.isAdmin) redirect("/dashboard");
  return u;
}

export async function createLocalSession(userId: string) {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await getLocalStore().createSession({ tokenHash: sha256(token), userId, createdAt: nowIso(), expiresAt: expires.toISOString() });
  (await cookies()).set(LOCAL_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function destroyLocalSession() {
  const jar = await cookies();
  const token = jar.get(LOCAL_SESSION_COOKIE)?.value;
  if (token) await getLocalStore().deleteSession(sha256(token));
  jar.set(LOCAL_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
}
