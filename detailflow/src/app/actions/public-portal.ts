"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { VEHICLE_CLASSES } from "@/lib/domain";

async function ip() {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function portalSend(form: FormData) {
  const token = z.string().regex(/^[a-f0-9]{48}$/).safeParse(form.get("token"));
  if (!token.success) redirect("/");
  if (!rateLimit(`portal:${await ip()}`, 10, 60_000)) redirect(`/portal/${token.data}?fehler=${encodeURIComponent("Zu viele Nachrichten. Bitte kurz warten.")}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_send_message", { token: token.data, body: String(form.get("body") ?? "") });
  redirect(`/portal/${token.data}?${error ? `fehler=${encodeURIComponent(error.message)}` : "gesendet=1"}#nachrichten`);
}

export async function submitBooking(form: FormData) {
  const slug = z.string().regex(/^[a-z0-9-]{3,50}$/).safeParse(form.get("slug"));
  if (!slug.success) redirect("/");
  if (form.get("website")) redirect(`/buchen/${slug.data}?fehler=1`); // Honeypot gegen Bots
  if (!rateLimit(`booking:${await ip()}`, 5, 60 * 60_000)) redirect(`/buchen/${slug.data}?fehler=${encodeURIComponent("Zu viele Anfragen von diesem Anschluss. Bitte rufen Sie uns an.")}`);
  if (form.get("consent") !== "on") redirect(`/buchen/${slug.data}?fehler=${encodeURIComponent("Bitte stimmen Sie der Datenverarbeitung zu.")}`);
  const vc = String(form.get("vehicle_class") ?? "");
  const req = {
    name: String(form.get("name") ?? "").slice(0, 100), email: String(form.get("email") ?? "").slice(0, 200), phone: String(form.get("phone") ?? "").slice(0, 60),
    make: String(form.get("make") ?? "").slice(0, 60), model: String(form.get("model") ?? "").slice(0, 80), plate: String(form.get("plate") ?? "").slice(0, 20),
    vehicle_class: (VEHICLE_CLASSES as readonly string[]).includes(vc) ? vc : "", package_id: String(form.get("package_id") ?? ""),
    wish_date: String(form.get("wish_date") ?? "").slice(0, 100), message: String(form.get("message") ?? "").slice(0, 2000),
  };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_booking_request", { p_slug: slug.data, req });
  if (error) redirect(`/buchen/${slug.data}?fehler=${encodeURIComponent(error.message)}`);
  redirect(`/portal/${data}?neu=1`);
}
