import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Providers } from "@/components/layout/providers";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { ServiceWorker } from "@/components/layout/service-worker";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "DEAL-NIVO – Prüfe deinen Deal, bevor du kaufst", template: "%s · DEAL-NIVO" },
  description: "Lass Angebote, Preise und Risiken von Gebrauchtwaren mit KI analysieren – bevor du dein Geld ausgibst.",
  applicationName: "DEAL-NIVO",
  appleWebApp: { capable: true, title: "DEAL-NIVO", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f0e" },
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
          <main id="main" className="pb-24 md:pb-0">{children}</main>
          <SiteFooter />
          <BottomNav />
          <ServiceWorker />
        </Providers>
      </body>
    </html>
  );
}
