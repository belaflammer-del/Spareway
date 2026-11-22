"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

export async function respondToQuote(form: FormData) {
  const token = z.string().regex(/^[a-f0-9]{48}$/).safeParse(form.get("token"));
  if (!token.success) redirect("/");
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!rateLimit(`pubrespond:${ip}`, 10, 60_000)) redirect(`/angebot/${token.data}?fehler=${encodeURIComponent("Zu viele Anfragen.")}`);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("respond_public_quote", { token: token.data, accept: form.get("accept") === "true" });
  if (error) redirect(`/angebot/${token.data}?fehler=${encodeURIComponent(error.message)}`);
  redirect(`/angebot/${token.data}?ergebnis=${data}`);
}
