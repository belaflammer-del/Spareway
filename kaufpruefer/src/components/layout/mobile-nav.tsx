"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

export function MobileNav({ items, loggedIn, isAdmin }: { items: { href: string; label: string }[]; loggedIn: boolean; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  const all = [
    ...items,
    ...(loggedIn ? [{ href: "/dashboard", label: "Dashboard" }, { href: "/dashboard/wallet", label: "Token-Wallet" }] : [{ href: "/login", label: "Anmelden" }, { href: "/register", label: "Registrieren" }]),
    ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];
  return (
    <div className="md:hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex size-10 items-center justify-center rounded-xl hover:bg-surface-2" aria-expanded={open} aria-label="Menü">
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-x-0 top-16 border-b border-border bg-background px-4 pb-4 shadow-card"
            aria-label="Mobile Navigation"
          >
            {all.map((n) => (
              <Link key={n.href} href={n.href} className="block rounded-xl px-3 py-3 text-[15px] hover:bg-surface-2">
                {n.label}
              </Link>
            ))}
          </motion.nav>
        )}
      </AnimatePresence>
    </div>
  );
}
