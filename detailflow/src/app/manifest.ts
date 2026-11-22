import type { MetadataRoute } from "next";

/** Installierbar als App auf Handy und Desktop („Zum Home-Bildschirm“) */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DetailFlow",
    short_name: "DetailFlow",
    description: "Die Betriebssoftware für Fahrzeugaufbereiter",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fafafa",
    theme_color: "#18181b",
    lang: "de",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Neuer Auftrag", url: "/app/angebote/neu?ziel=order" },
      { name: "Kalender", url: "/app/kalender" },
      { name: "Nachrichten", url: "/app/nachrichten" },
    ],
  };
}
