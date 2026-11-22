import { notFound } from "next/navigation";
import { Card, Field, Input, Notice, Select, Textarea, buttonClass } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { DAYS, VEHICLE_CLASSES, VEHICLE_CLASS_LABELS } from "@/lib/domain";
import { submitBooking, subscribeCare } from "@/app/actions/public-portal";
import { formatEUR } from "@/lib/utils";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Termin anfragen" };

type Booking = { booking_enabled: boolean; deposit_cents: number; vouchers_enabled: boolean; care_plans: { id: string; name: string; description: string | null; price_cents: number }[]; name: string; city: string | null; phone: string | null; opening_hours: Record<string, { open: boolean; from: string; to: string }>; packages: { id: string; name: string; description: string | null }[] };

export default async function BookingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ fehler?: string; abo?: string }> }) {
  const { slug } = await params;
  const { fehler, abo } = await searchParams;
  if (!/^[a-z0-9-]{3,50}$/.test(slug)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_booking_page", { p_slug: slug });
  if (!data) notFound();
  const b = data as Booking;
  return (
    <div className="min-h-dvh bg-muted/40 px-4 py-10">
      <div className="mx-auto max-w-xl space-y-6">
        <header className="text-center">
          <p className="text-sm text-muted-foreground">{b.city}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{b.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Fahrzeugaufbereitung anfragen – wir melden uns mit Angebot und Terminvorschlag.</p>
        </header>
        {fehler && <Notice tone="red">{fehler === "1" ? "Die Anfrage konnte nicht gesendet werden." : fehler}</Notice>}
        {abo && <Notice tone="green">Vielen Dank! Ihr Pflege-Abo ist abgeschlossen. Wir melden uns zur Terminabsprache.</Notice>}
        {b.booking_enabled && <Card className="p-6">
          <form action={submitBooking} className="space-y-4">
            <input type="hidden" name="slug" value={slug} />
            <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name *" name="name"><Input id="name" name="name" required autoComplete="name" /></Field>
              <Field label="Telefon" name="phone"><Input id="phone" name="phone" type="tel" autoComplete="tel" /></Field>
              <Field label="E-Mail *" name="email" className="sm:col-span-2" hint="Hierüber erhalten Sie Antworten und Ihren persönlichen Kundenbereich."><Input id="email" name="email" type="email" required autoComplete="email" /></Field>
              <Field label="Hersteller" name="make"><Input id="make" name="make" placeholder="z. B. BMW" /></Field>
              <Field label="Modell" name="model"><Input id="model" name="model" placeholder="z. B. X5" /></Field>
              <Field label="Fahrzeugart" name="vehicle_class">
                <Select id="vehicle_class" name="vehicle_class" defaultValue=""><option value="">Bitte wählen</option>{VEHICLE_CLASSES.map((c) => <option key={c} value={c}>{VEHICLE_CLASS_LABELS[c]}</option>)}</Select>
              </Field>
              <Field label="Kennzeichen" name="plate"><Input id="plate" name="plate" /></Field>
              {b.packages.length > 0 && (
                <Field label="Gewünschte Leistung" name="package_id" className="sm:col-span-2">
                  <Select id="package_id" name="package_id" defaultValue=""><option value="">Weiß ich noch nicht / Beratung</option>{b.packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
                </Field>
              )}
              <Field label="Wunschtermin" name="wish_date" className="sm:col-span-2"><Input id="wish_date" name="wish_date" placeholder="z. B. nächste Woche vormittags" /></Field>
              <Field label="Ihre Nachricht" name="message" className="sm:col-span-2"><Textarea id="message" name="message" maxLength={2000} placeholder="Zustand, Besonderheiten, Fragen …" /></Field>
            </div>
            <label className="flex items-start gap-2 text-sm text-muted-foreground">
              <input type="checkbox" name="consent" required className="mt-0.5" />
              <span>Ich bin einverstanden, dass {b.name} meine Angaben zur Bearbeitung der Anfrage speichert und mich kontaktiert.</span>
            </label>
            {b.deposit_cents > 0 && <p className="text-sm text-muted-foreground">Zur Reservierung bitten wir um eine Anzahlung von <strong>{formatEUR(b.deposit_cents / 100)}</strong>. Sie wird mit der Rechnung verrechnet.</p>}
            <button className={buttonClass("primary", "md", "w-full")}>{b.deposit_cents > 0 ? `Anfrage senden & ${formatEUR(b.deposit_cents / 100)} anzahlen` : "Anfrage senden"}</button>
          </form>
        </Card>}
        {b.care_plans.length > 0 && (
          <Card className="p-6">
            <h2 className="font-semibold">Pflege-Abos</h2>
            <p className="mt-1 text-sm text-muted-foreground">Regelmäßig glänzend – monatlich kündbar.</p>
            <div className="mt-4 space-y-3">
              {b.care_plans.map((p) => (
                <form key={p.id} action={subscribeCare} className="rounded-xl border border-border p-4">
                  <input type="hidden" name="slug" value={slug} /><input type="hidden" name="plan_id" value={p.id} />
                  <div className="flex items-start justify-between gap-3"><div><p className="font-medium">{p.name}</p>{p.description && <p className="mt-0.5 whitespace-pre-line text-sm text-muted-foreground">{p.description}</p>}</div>
                    <p className="shrink-0 font-semibold tabular-nums">{formatEUR(p.price_cents / 100)}<span className="text-xs font-normal text-muted-foreground"> / Monat</span></p></div>
                  <div className="mt-3 flex gap-2"><Input name="email" type="email" placeholder="Ihre E-Mail" className="h-9" aria-label="E-Mail" /><button className={buttonClass("primary", "sm", "h-9")}>Abonnieren</button></div>
                </form>
              ))}
            </div>
          </Card>
        )}
        {b.vouchers_enabled && <p className="text-center text-sm"><Link href={`/gutschein/${slug}`} className="text-accent">🎁 Gutschein verschenken</Link></p>}
        {Object.keys(b.opening_hours ?? {}).length > 0 && (
          <Card className="p-5 text-sm">
            <p className="mb-2 font-medium">Öffnungszeiten</p>
            <dl className="grid grid-cols-2 gap-y-1">
              {DAYS.map(([k, l]) => <div key={k} className="contents"><dt className="text-muted-foreground">{l}</dt><dd>{b.opening_hours[k]?.open ? `${b.opening_hours[k].from} – ${b.opening_hours[k].to}` : "geschlossen"}</dd></div>)}
            </dl>
            {b.phone && <p className="mt-3 text-muted-foreground">Telefon: {b.phone}</p>}
          </Card>
        )}
      </div>
    </div>
  );
}
