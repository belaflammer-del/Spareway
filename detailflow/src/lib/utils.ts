import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
export function formatEUR(v: number | string | null | undefined) {
  return eur.format(Number(v ?? 0));
}

export function formatDate(v: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  if (!v) return "–";
  return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", ...opts }).format(new Date(v));
}

export function formatDateTime(v: string | Date | null | undefined) {
  return formatDate(v, { dateStyle: "medium", timeStyle: "short" });
}

export function formatTime(v: string | Date | null | undefined) {
  return formatDate(v, { hour: "2-digit", minute: "2-digit" });
}

/** Leere Strings aus FormData in null umwandeln */
export function emptyToNull<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) out[k] = typeof v === "string" && v.trim() === "" ? null : v;
  return out as T;
}
