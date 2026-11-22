/**
 * Zeitzonen-Hilfen für Europe/Berlin – unabhängig von der Zeitzone des Servers (z. B. UTC bei Vercel).
 */
export const TZ = "Europe/Berlin";

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
});
const WD: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export type BerlinParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

export function berlinParts(d: Date | string): BerlinParts {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(d)).map((x) => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, weekday: WD[p.weekday] };
}

/** Wandelt eine Berliner Ortszeit in einen UTC-Zeitpunkt um (berücksichtigt Sommer-/Winterzeit). */
export function berlinToDate(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // Offset an diesem Zeitpunkt bestimmen und zweimal korrigieren (Umstellungstage)
  let ts = guess;
  for (let i = 0; i < 2; i++) {
    const p = berlinParts(new Date(ts));
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    ts = guess - (asUtc - ts);
  }
  return new Date(ts);
}

/** "2026-12-01T09:30" (Eingabe eines datetime-local-Feldes, Berliner Zeit) -> ISO-String in UTC */
export function berlinLocalToISO(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  return berlinToDate(+m[1], +m[2], +m[3], +m[4], +m[5]).toISOString();
}

/** UTC-Zeitpunkt -> Wert für ein datetime-local-Feld in Berliner Zeit */
export function isoToBerlinLocal(v: string | null | undefined): string {
  if (!v) return "";
  const p = berlinParts(v);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Kalendertag (YYYY-MM-DD) in Berlin */
export function berlinDay(d: Date | string): string {
  const p = berlinParts(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Tage addieren auf einem reinen Datum (YYYY-MM-DD) */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Montag der Woche zu einem Datum (YYYY-MM-DD) */
export function weekStart(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
  return addDays(day, 1 - wd);
}

/** Beginn (00:00 Berlin) eines Tages als Date */
export function dayStart(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return berlinToDate(y, m, d);
}

export function isValidDay(v: string | undefined): v is string {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}
