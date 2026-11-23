import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { MobileNav } from "./mobile-nav";

const NAV = [
  { href: "/demo", label: "Beispielanalysen" },
  { href: "/check", label: "Angebot prüfen" },
  { href: "/vergleich", label: "Vergleichen" },
  { href: "/preise", label: "Preise" },
];

export async function SiteHeader() {
  const user = await getCurrentUser();
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Hauptnavigation">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-surface-2 hover:text-foreground">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          {user ? (
            <Button asChild size="sm" variant="outline" className="hidden sm:inline-flex">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
                <Link href="/login">Anmelden</Link>
              </Button>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link href="/register">Kostenlos starten</Link>
              </Button>
            </>
          )}
          <MobileNav items={NAV} loggedIn={!!user} isAdmin={!!user?.isAdmin} />
        </div>
      </div>
    </header>
  );
}
