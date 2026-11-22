import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "DetailFlow", template: "%s · DetailFlow" },
  description: "Die Betriebssoftware für professionelle Fahrzeugaufbereitung.",
  applicationName: "DetailFlow",
  appleWebApp: { capable: true, title: "DetailFlow", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#fafafa" };

// Setzt den Dark Mode vor dem ersten Rendern (verhindert Flackern)
const themeScript = `try{var t=localStorage.getItem('df-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
