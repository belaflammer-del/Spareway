import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Providers } from "@/components/layout/providers";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ServiceWorker } from "@/components/layout/service-worker";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Kaufklar – Prüfe deinen Deal, bevor du kaufst", template: "%s · Kaufklar" },
  description: "Lass Angebote, Preise und Risiken von Gebrauchtwaren mit KI analysieren – bevor du dein Geld ausgibst.",
  applicationName: "Kaufklar",
  appleWebApp: { capable: true, title: "Kaufklar", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#16181d" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        <Providers>
          <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
            Zum Inhalt springen
          </a>
          <SiteHeader />
          <main id="main">{children}</main>
          <SiteFooter />
          <ServiceWorker />
        </Providers>
      </body>
    </html>
  );
}
