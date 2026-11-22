"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { moveOrder } from "@/app/actions/orders";
import { cn } from "@/lib/utils";

const MIME = "application/x-detailflow-order";

/** Ziehbarer Termin (Desktop: Maus; auf Touch-Geräten bleibt er ein normaler Link) */
export function CalendarEvent({ id, href, className, style, children }: { id: string; href: string; className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <Link href={href} draggable className={cn("cursor-grab active:cursor-grabbing", className)} style={style}
      onDragStart={(e) => { e.dataTransfer.setData(MIME, id); e.dataTransfer.effectAllowed = "move"; }}>
      {children}
    </Link>
  );
}

/**
 * Ablagefläche: Tagesspalte (mode "time": Uhrzeit aus der Position, 15-Minuten-Raster)
 * oder Monatszelle (mode "day": Uhrzeit bleibt). workstation: undefined = Box unverändert.
 */
export function DropZone({ day, mode, hourFrom = 0, pxPerHour = 52, workstation, className, style, children }: {
  day: string; mode: "time" | "day"; hourFrom?: number; pxPerHour?: number; workstation?: string | null; className?: string; style?: React.CSSProperties; children?: React.ReactNode;
}) {
  const router = useRouter();
  const [over, setOver] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className={cn(className, over && "bg-accent-soft/50", pending && "opacity-60")} style={style}
      onDragOver={(e) => { if (e.dataTransfer.types.includes(MIME)) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setOver(false);
        const id = e.dataTransfer.getData(MIME);
        if (!id) return;
        let minutes: number | undefined;
        if (mode === "time") {
          const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
          minutes = Math.max(0, Math.min(24 * 60 - 15, Math.round(((hourFrom + y / pxPerHour) * 60) / 15) * 15));
        }
        start(async () => {
          const r = await moveOrder({ id, day, minutes, workstation });
          if (!r.ok) { setMsg(r.message ?? "Verschieben fehlgeschlagen."); setTimeout(() => setMsg(null), 4000); }
          router.refresh();
        });
      }}>
      {children}
      {msg && <div role="alert" className="absolute inset-x-1 top-1 z-10 rounded-md bg-danger px-2 py-1 text-[11px] text-white shadow">{msg}</div>}
    </div>
  );
}
