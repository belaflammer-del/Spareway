import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { extractListingLink } from "@/lib/import/share-text";

/** Startet den Vergleichsablauf für neue Inserate (Weiterleitung in den Prüfablauf). */
export function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const valid = (s: string | null) => (s && extractListingLink(s).url ? s.slice(0, 2000) : null);
  const url1 = valid(p.get("url1"));
  const url2 = valid(p.get("url2"));
  const withId = p.get("with");
  const base = env.appUrl;
  if (withId && url2) return NextResponse.redirect(new URL(`/check?url=${encodeURIComponent(url2)}&compareWith=${encodeURIComponent(withId)}`, base));
  if (url1 && url2) return NextResponse.redirect(new URL(`/check?url=${encodeURIComponent(url1)}&compareNext=${encodeURIComponent(url2)}`, base));
  return NextResponse.redirect(new URL("/vergleich?error=links", base));
}
