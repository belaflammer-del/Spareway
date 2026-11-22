import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kaufklar – KI-Kaufprüfer",
    short_name: "Kaufklar",
    description: "Prüfe Gebrauchtwaren-Angebote vor dem Kauf: Preis, Risiken, Verkäufer.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    background_color: "#fbfaf7",
    theme_color: "#fbfaf7",
    lang: "de",
    categories: ["shopping", "finance", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
