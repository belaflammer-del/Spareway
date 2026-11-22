import Link from "next/link";
import { features } from "@/lib/config/env";
import { LogoMark } from "./logo";

export function SiteFooter() {
  const modes = [
    features.ai ? "KI: aktiv" : "KI: Demo-/Regelmodus",
    features.supabase ? "Datenbank: Supabase" : "Datenbank: lokal (Entwicklung)",
    features.stripe ? (features.stripeTestMode ? "Zahlungen: Stripe-Testmodus" : "Zahlungen: Stripe live") : "Zahlungen: nicht konfiguriert",
  ];
  return (
    <footer className="mt-24 border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5 font-semibold">
            <LogoMark className="size-6" /> DEAL-NIVO
          </div>
          <p className="mt-3 max-w-sm text-sm text-muted">
            KI-gestützte Kaufprüfung für Gebrauchtwaren. Eine Orientierungshilfe – keine Garantie für Zustand, Echtheit oder Betrugsfreiheit.
          </p>
          <p className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
            {modes.map((m) => (
              <span key={m} className="rounded-full border border-border px-2 py-0.5">
                {m}
              </span>
            ))}
          </p>
        </div>
        <div className="text-sm">
          <p className="mb-3 font-medium">Produkt</p>
          <ul className="space-y-2 text-muted">
            <li><Link className="hover:text-foreground" href="/check">Angebot prüfen</Link></li>
            <li><Link className="hover:text-foreground" href="/demo">Beispielanalysen</Link></li>
            <li><Link className="hover:text-foreground" href="/preise">Preise</Link></li>
            <li><Link className="hover:text-foreground" href="/methodik">So bewerten wir</Link></li>
          </ul>
        </div>
        <div className="text-sm">
          <p className="mb-3 font-medium">Rechtliches</p>
          <ul className="space-y-2 text-muted">
            <li><Link className="hover:text-foreground" href="/rechtliches/impressum">Impressum</Link></li>
            <li><Link className="hover:text-foreground" href="/rechtliches/datenschutz">Datenschutz</Link></li>
            <li><Link className="hover:text-foreground" href="/rechtliches/agb">AGB</Link></li>
            <li><Link className="hover:text-foreground" href="/rechtliches/widerruf">Widerrufsbelehrung</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
