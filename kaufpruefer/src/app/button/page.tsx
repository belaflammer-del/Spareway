import type { Metadata } from "next";
import { headers } from "next/headers";
import { BookmarkletSetup } from "@/components/share/bookmarklet-setup";
import { env } from "@/lib/config/env";
import { bookmarkletHref } from "@/lib/share/bookmarklet";

export const metadata: Metadata = {
  title: "„→ DEAL-NIVO“-Button einrichten",
  description: "Inserate von Kleinanzeigen, mobile.de, AutoScout24, eBay und Vinted mit einem Tipp an DEAL-NIVO übergeben.",
};

export default async function ButtonPage() {
  let origin = env.appUrl.replace(/\/$/, "");
  // Ohne konfigurierte Adresse die tatsächlich aufgerufene verwenden (nur eigene Domain, https)
  if (/localhost:3000$/.test(origin)) {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host && /^[a-z0-9.-]+(:\d+)?$/i.test(host)) origin = `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
  }
  return <BookmarkletSetup href={bookmarkletHref(origin)} />;
}
