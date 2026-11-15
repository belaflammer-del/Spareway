import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// E-Mail-Bestätigung / Passwort-Reset: tauscht den Code gegen eine Sitzung
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/app";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/app";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?fehler=link`);
}
