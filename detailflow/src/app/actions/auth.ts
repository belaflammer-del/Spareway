"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { env, isSupabaseConfigured } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import type { ActionState } from "@/lib/validation";

const email = z.string().trim().toLowerCase().email("Bitte eine gültige E-Mail-Adresse eingeben.");
const password = z.string().min(10, "Das Passwort muss mindestens 10 Zeichen lang sein.").max(128);

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function safeRedirect(target: FormDataEntryValue | null) {
  const t = typeof target === "string" ? target : "";
  return t.startsWith("/") && !t.startsWith("//") ? t : "/app";
}

export async function signIn(_: ActionState, form: FormData): Promise<ActionState> {
  if (!isSupabaseConfigured()) return { message: "Supabase ist noch nicht konfiguriert (siehe README)." };
  const parsed = z.object({ email, password: z.string().min(1, "Bitte das Passwort eingeben.") }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  if (!rateLimit(`login:${await clientIp()}`, 10, 60_000)) return { message: "Zu viele Versuche. Bitte warte eine Minute." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { message: "E-Mail oder Passwort ist nicht korrekt." };
  redirect(safeRedirect(form.get("weiter")));
}

export async function signUp(_: ActionState, form: FormData): Promise<ActionState> {
  if (!isSupabaseConfigured()) return { message: "Supabase ist noch nicht konfiguriert (siehe README)." };
  const parsed = z.object({
    full_name: z.string().trim().min(2, "Bitte deinen Namen angeben.").max(100),
    email, password,
    terms: z.literal("on", { message: "Bitte stimme den Nutzungsbedingungen und der Datenschutzerklärung zu." }),
  }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  if (!rateLimit(`signup:${await clientIp()}`, 5, 60 * 60_000)) return { message: "Zu viele Registrierungen. Bitte später erneut versuchen." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.full_name }, emailRedirectTo: `${env.appUrl}/auth/callback?next=/onboarding` },
  });
  if (error) return { message: error.message.includes("registered") ? "Diese E-Mail-Adresse ist bereits registriert." : "Registrierung fehlgeschlagen. Bitte erneut versuchen." };
  if (data.session) {
    await supabase.from("profiles").upsert({ user_id: data.user!.id, full_name: parsed.data.full_name });
    redirect("/onboarding");
  }
  return { ok: true, message: "Fast geschafft! Bitte bestätige deine E-Mail-Adresse über den Link, den wir dir gesendet haben." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = email.safeParse(form.get("email"));
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  if (!rateLimit(`reset:${await clientIp()}`, 5, 15 * 60_000)) return { message: "Zu viele Anfragen. Bitte später erneut versuchen." };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: `${env.appUrl}/auth/callback?next=/passwort-neu` });
  // Immer gleiche Antwort – verrät nicht, ob ein Konto existiert
  return { ok: true, message: "Falls ein Konto mit dieser E-Mail existiert, haben wir dir einen Link zum Zurücksetzen gesendet." };
}

export async function updatePassword(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z.object({ password, confirm: z.string() }).refine((d) => d.password === d.confirm, { message: "Die Passwörter stimmen nicht überein." })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { message: "Das Passwort konnte nicht geändert werden. Der Link ist evtl. abgelaufen." };
  redirect("/app");
}
