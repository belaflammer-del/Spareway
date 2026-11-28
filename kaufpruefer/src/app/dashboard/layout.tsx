import { CreditCard, FileClock, LayoutDashboard, LogOut, Settings, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { signOutAction } from "@/lib/auth/actions";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/dashboard");
  const nav = [
    { href: "/dashboard", label: "Übersicht", icon: LayoutDashboard },
    { href: "/dashboard/analyses", label: "Analysen", icon: FileClock },
    { href: "/dashboard/wallet", label: "Token-Wallet", icon: CreditCard },
    { href: "/dashboard/settings", label: "Konto & Datenschutz", icon: Settings },
    ...(user.isAdmin ? [{ href: "/admin", label: "Admin", icon: ShieldCheck }] : []),
  ];
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:grid lg:grid-cols-[220px_1fr] lg:gap-10">
      <aside className="mb-6 lg:mb-0">
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-sm lg:hidden">
          <span className="min-w-0 truncate text-muted">Angemeldet als <span className="text-foreground">{user.email}</span>{user.isAdmin ? " · Admin" : ""}</span>
          <form action={signOutAction}>
            <button className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 font-medium text-bad hover:bg-surface-2">
              <LogOut className="size-4" /> Abmelden
            </button>
          </form>
        </div>
        {/* Kein seitliches Wischen: auf dem Handy als Raster */}
        <nav className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:sticky lg:top-24 lg:flex lg:flex-col" aria-label="Dashboard">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm text-muted transition hover:bg-surface-2 hover:text-foreground">
              <n.icon className="size-4" /> {n.label}
            </Link>
          ))}
          <form action={signOutAction} className="hidden lg:mt-4 lg:block">
            <button className="w-full whitespace-nowrap rounded-xl px-3 py-2.5 text-left text-sm text-muted hover:bg-surface-2 hover:text-foreground">Abmelden</button>
          </form>
        </nav>
        <p className="mt-4 hidden truncate px-3 text-xs text-muted lg:block">{user.email}</p>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
