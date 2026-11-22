"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { env, features } from "../config/env";
import { clientIpHash, rateLimit } from "../http";
import { getLocalStore, getStore } from "../store";
import { newId, nowIso } from "../utils";
import { hashPassword, randomToken, sha256, verifyPassword } from "./crypto";
import { createLocalSession, destroyLocalSession, getCurrentUser } from "./session";
import { supabaseServer } from "./supabase-server";

export interface FormState {
  ok?: boolean;
  error?: string;
  message?: string;
  devLink?: string;
}

const Email = z.string().trim().toLowerCase().email("Bitte gib eine gültige E-Mail-Adresse ein.").max(254);
const Password = z
  .string()
  .min(10, "Das Passwort muss mindestens 10 Zeichen lang sein.")
  .max(200)
  .regex(/[a-zA-Z]/, "Das Passwort muss Buchstaben enthalten.")
  .regex(/[0-9]/, "Das Passwort muss mindestens eine Ziffer enthalten.");

function safeNext(next: FormDataEntryValue | null): string {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard";
}

async function limited(kind: string): Promise<boolean> {
  const ip = await clientIpHash();
  const r = await rateLimit(`auth:${kind}:${ip}`, 15 * 60, 10);
  return !r.allowed;
}

export async function signUpAction(_: FormState, fd: FormData): Promise<FormState> {
  if (await limited("signup")) return { error: "Zu viele Versuche. Bitte warte einige Minuten." };
  const email = Email.safeParse(fd.get("email"));
  const password = Password.safeParse(fd.get("password"));
  if (!email.success) return { error: email.error.issues[0].message };
  if (!password.success) return { error: password.error.issues[0].message };
  if (fd.get("terms") !== "on") return { error: "Bitte akzeptiere die Nutzungsbedingungen und die Datenschutzhinweise." };

  if (features.supabase) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.signUp({
      email: email.data,
      password: password.data,
      options: { emailRedirectTo: `${env.appUrl}/auth/confirm?next=/dashboard` },
    });
    // Keine Aussage darüber, ob die Adresse bereits existiert (Enumeration-Schutz)
    if (error && !/registered|exists/i.test(error.message)) return { error: "Registrierung fehlgeschlagen. Bitte versuche es später erneut." };
    return { ok: true, message: "Fast geschafft! Wir haben dir eine E-Mail zur Bestätigung deiner Adresse geschickt." };
  }

  // Lokalmodus
  const store = getStore();
  if (await store.findUserByEmail(email.data)) return { ok: true, message: "Falls die Adresse neu ist, wurde das Konto angelegt. Bitte melde dich an." };
  const id = newId("usr");
  await store.createUser({ id, email: email.data, emailVerified: false, createdAt: nowIso(), passwordHash: await hashPassword(password.data) });
  const token = randomToken();
  await getLocalStore().createToken({ tokenHash: sha256(token), userId: id, purpose: "verify_email", expiresAt: new Date(Date.now() + 48 * 3600e3).toISOString() });
  const link = `${env.appUrl}/auth/verify?token=${token}`;
  console.info(`[Lokalmodus] E-Mail-Bestätigungslink für ${email.data}: ${link}`);
  await createLocalSession(id);
  return {
    ok: true,
    message: "Konto angelegt. Lokalmodus: Es wird keine E-Mail versendet – bestätige deine Adresse über den folgenden Link.",
    devLink: env.isProduction ? undefined : link,
  };
}

export async function signInAction(_: FormState, fd: FormData): Promise<FormState> {
  if (await limited("signin")) return { error: "Zu viele Anmeldeversuche. Bitte warte einige Minuten." };
  const email = Email.safeParse(fd.get("email"));
  const password = z.string().min(1).max(200).safeParse(fd.get("password"));
  if (!email.success || !password.success) return { error: "E-Mail oder Passwort ist falsch." };
  const next = safeNext(fd.get("next"));

  if (features.supabase) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.signInWithPassword({ email: email.data, password: password.data });
    if (error) return { error: /confirm/i.test(error.message) ? "Bitte bestätige zuerst deine E-Mail-Adresse." : "E-Mail oder Passwort ist falsch." };
    redirect(next);
  }
  const u = await getStore().findUserByEmail(email.data);
  if (!u?.passwordHash || !(await verifyPassword(password.data, u.passwordHash))) return { error: "E-Mail oder Passwort ist falsch." };
  await createLocalSession(u.id);
  redirect(next);
}

export async function signOutAction() {
  if (features.supabase) await (await supabaseServer()).auth.signOut();
  else await destroyLocalSession();
  redirect("/");
}

export async function requestResetAction(_: FormState, fd: FormData): Promise<FormState> {
  if (await limited("reset")) return { error: "Zu viele Anfragen. Bitte warte einige Minuten." };
  const email = Email.safeParse(fd.get("email"));
  if (!email.success) return { error: email.error.issues[0].message };
  const generic = "Falls ein Konto mit dieser Adresse existiert, haben wir dir einen Link zum Zurücksetzen geschickt.";
  if (features.supabase) {
    const sb = await supabaseServer();
    await sb.auth.resetPasswordForEmail(email.data, { redirectTo: `${env.appUrl}/auth/confirm?next=/reset-password/update` });
    return { ok: true, message: generic };
  }
  const u = await getStore().findUserByEmail(email.data);
  if (!u) return { ok: true, message: generic };
  const token = randomToken();
  await getLocalStore().createToken({ tokenHash: sha256(token), userId: u.id, purpose: "reset_password", expiresAt: new Date(Date.now() + 3600e3).toISOString() });
  const link = `${env.appUrl}/reset-password/update?token=${token}`;
  console.info(`[Lokalmodus] Passwort-Reset-Link für ${u.email}: ${link}`);
  return { ok: true, message: `${generic} (Lokalmodus: kein E-Mail-Versand)`, devLink: env.isProduction ? undefined : link };
}

export async function updatePasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const password = Password.safeParse(fd.get("password"));
  if (!password.success) return { error: password.error.issues[0].message };
  if (features.supabase) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.updateUser({ password: password.data });
    if (error) return { error: "Der Link ist abgelaufen oder ungültig. Bitte fordere einen neuen an." };
    redirect("/dashboard?pw=updated");
  }
  const token = String(fd.get("token") ?? "");
  let userId: string | undefined;
  if (token) {
    const t = await getLocalStore().consumeToken(sha256(token), "reset_password");
    userId = t?.userId;
  } else userId = (await getCurrentUser())?.id;
  if (!userId) return { error: "Der Link ist abgelaufen oder ungültig. Bitte fordere einen neuen an." };
  await getStore().updateUser(userId, { passwordHash: await hashPassword(password.data) });
  await createLocalSession(userId);
  redirect("/dashboard?pw=updated");
}
