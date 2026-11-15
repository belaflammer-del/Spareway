import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, Calculator, Car, FileText, ShieldCheck, Users } from "lucide-react";
import { Logo } from "@/components/logo";
import { buttonClass } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/env";
import { getUser } from "@/lib/auth";

const features = [
  { icon: Users, title: "Kunden & Fahrzeuge", text: "Digitale Fahrzeugakte mit Historie, Vorschäden und Versiegelungen." },
  { icon: Calculator, title: "Kalkulation", text: "Transparente Preise nach Fahrzeugklasse, Verschmutzung und Paket." },
  { icon: FileText, title: "Angebote", text: "Professionelle Angebote mit Online-Annahme durch den Kunden." },
  { icon: Car, title: "Aufträge", text: "Vom Fahrzeugeingang bis zur Abholung – jederzeit im Blick." },
  { icon: CalendarDays, title: "Planung", text: "Termine und Zuständigkeiten für das ganze Team." },
  { icon: ShieldCheck, title: "Sicher", text: "Strikte Datentrennung je Betrieb, Server in der EU wählbar." },
];

export default async function Home() {
  if (isSupabaseConfigured() && (await getUser())) redirect("/app");
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6">
      <header className="flex h-16 items-center justify-between">
        <Logo />
        <nav className="flex gap-2">
          <Link href="/login" className={buttonClass("ghost", "sm")}>Anmelden</Link>
          <Link href="/registrieren" className={buttonClass("primary", "sm")}>Kostenlos testen</Link>
        </nav>
      </header>
      <section className="py-20 text-center sm:py-28 animate-in">
        <p className="mb-4 text-sm font-medium text-accent">Für Fahrzeugaufbereiter & Detailing-Studios</p>
        <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Dein ganzer Betrieb. Eine Software.</h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">Von der Anfrage über Kalkulation und Angebot bis zur Fahrzeugübergabe – einfach, übersichtlich und ohne Schulung.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/registrieren" className={buttonClass("primary")}>Jetzt starten</Link>
          <Link href="/login" className={buttonClass("secondary")}>Anmelden</Link>
        </div>
      </section>
      <section className="grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="rounded-2xl border border-border bg-card p-5">
            <f.icon className="size-5 text-accent" />
            <h3 className="mt-3 font-medium">{f.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
