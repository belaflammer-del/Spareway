"use client";

import { FileClock, Home, LayoutGrid, ScanSearch, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "Start", icon: Home, match: (p: string) => p === "/" },
  { href: "/demo", label: "Beispiele", icon: LayoutGrid, match: (p: string) => p.startsWith("/demo") },
  { href: "/check", label: "Prüfen", icon: ScanSearch, match: (p: string) => p.startsWith("/check"), primary: true },
  { href: "/dashboard/analyses", label: "Berichte", icon: FileClock, match: (p: string) => p.startsWith("/dashboard/analyses") || p.startsWith("/analysis") },
  { href: "/dashboard", label: "Konto", icon: User, match: (p: string) => p === "/dashboard" || p.startsWith("/dashboard/wallet") || p.startsWith("/dashboard/settings") || p.startsWith("/login") || p.startsWith("/register") },
];

/** App-artige Tab-Leiste auf dem Handy. */
export function BottomNav() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;
  return (
    <nav
      aria-label="App-Navigation"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {ITEMS.map((it) => {
          const active = it.match(pathname);
          return (
            <li key={it.href}>
              <Link href={it.href} className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium active:scale-95 transition">
                {it.primary ? (
                  <span className="-mt-5 flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-fg shadow-lg shadow-accent/30">
                    <it.icon className="size-6" />
                  </span>
                ) : (
                  <it.icon className={cn("size-[22px]", active ? "text-accent" : "text-muted")} />
                )}
                <span className={cn(active ? "text-foreground" : "text-muted")}>{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
