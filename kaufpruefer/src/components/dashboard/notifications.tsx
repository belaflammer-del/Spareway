"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/client/jobs";
import { cn } from "@/lib/utils";

export function NotificationsPanel({ items }: { items: { id: string; title: string; body: string; link?: string; createdAt: string; readAt?: string }[] }) {
  const router = useRouter();
  const unread = items.filter((n) => !n.readAt).length;
  if (!items.length) return null;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold">
          <Bell className="size-4" /> Benachrichtigungen {unread > 0 && <span className="rounded-full bg-accent px-2 text-xs text-accent-fg">{unread}</span>}
        </h2>
        {unread > 0 && (
          <button className="text-sm text-muted hover:text-foreground" onClick={async () => { await postJson("/api/notifications", {}); router.refresh(); }}>
            Alle gelesen
          </button>
        )}
      </div>
      <ul className="space-y-2">
        {items.slice(0, 6).map((n) => (
          <li key={n.id}>
            <Link href={n.link ?? "/dashboard"} className={cn("block rounded-xl border p-3 text-sm", n.readAt ? "border-border bg-surface" : "border-accent/50 bg-accent-soft/30")}>
              <p className="font-medium">{n.title}</p>
              <p className="text-muted">{n.body}</p>
              <p className="mt-1 text-xs text-muted">{new Date(n.createdAt).toLocaleString("de-DE")}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
