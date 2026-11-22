"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, CalendarDays, Car, ClipboardList, Gift, MessageSquare, Receipt, FileText, Home, LogOut, Menu, Moon, Settings, Sparkles, Sun, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";

const NAV = [
  { href: "/app", label: "Übersicht", icon: Home, exact: true },
  { href: "/app/kalender", label: "Kalender", icon: CalendarDays },
  { href: "/app/auftraege", label: "Aufträge", icon: ClipboardList },
  { href: "/app/nachrichten", label: "Nachrichten", icon: MessageSquare },
  { href: "/app/angebote", label: "Angebote", icon: FileText },
  { href: "/app/rechnungen", label: "Rechnungen", icon: Receipt },
  { href: "/app/gutscheine", label: "Gutscheine", icon: Gift },
  { href: "/app/kunden", label: "Kunden", icon: Users },
  { href: "/app/fahrzeuge", label: "Fahrzeuge", icon: Car },
  { href: "/app/leistungen", label: "Leistungen & Preise", icon: Sparkles },
  { href: "/app/auswertungen", label: "Auswertungen", icon: BarChart3 },
  { href: "/app/einstellungen", label: "Einstellungen", icon: Settings },
];
const MOBILE = [NAV[0], NAV[1], NAV[2], NAV[3]];

function useActive() {
  const path = usePathname();
  return (href: string, exact?: boolean) => (exact ? path === href : path === href || path.startsWith(href + "/"));
}

export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("df-theme", next ? "dark" : "light"); } catch {}
  };
  return (
    <button onClick={toggle} className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground", className)} aria-label="Darstellung wechseln">
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      {dark ? "Helles Design" : "Dunkles Design"}
    </button>
  );
}

export function Sidebar({ companyName, userName, signOut, companySwitcher }: { companyName: string; userName: string; signOut: () => Promise<void>; companySwitcher?: React.ReactNode }) {
  const isActive = useActive();
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href="/app"><Logo /></Link>
        <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Menü schließen"><X className="size-5" /></button>
      </div>
      <div className="px-4 pb-3">
        <p className="truncate text-xs font-medium text-muted-foreground">{companyName}</p>
        {companySwitcher}
      </div>
      <nav className="flex-1 space-y-0.5 px-2">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition", isActive(n.href, n.exact) ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>
            <n.icon className="size-4" />{n.label}
          </Link>
        ))}
      </nav>
      <div className="space-y-0.5 border-t border-border p-2">
        <ThemeToggle className="w-full" />
        <form action={signOut}>
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"><LogOut className="size-4" />Abmelden</button>
        </form>
        <p className="truncate px-3 pt-1 text-xs text-muted-foreground">{userName}</p>
      </div>
    </div>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-border bg-card lg:block">{content}</aside>
      <header className="no-print sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur lg:hidden">
        <Link href="/app"><Logo /></Link>
        <button onClick={() => setOpen(true)} aria-label="Menü öffnen"><Menu className="size-5" /></button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-card shadow-xl animate-in">{content}</aside>
        </div>
      )}
      <nav className="no-print fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {MOBILE.map((n) => (
          <Link key={n.href} href={n.href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px]", isActive(n.href, n.exact) ? "text-foreground" : "text-muted-foreground")}>
            <n.icon className="size-5" />{n.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
