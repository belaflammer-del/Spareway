import { formatDate, formatEUR } from "@/lib/utils";

export type QuoteDoc = {
  number: string;
  created_at: string;
  valid_until: string | null;
  intro_text: string | null;
  terms: string | null;
  subtotal_net: number;
  tax_total: number;
  total_gross: number;
  company: { name: string; street?: string | null; zip?: string | null; city?: string | null; phone?: string | null; email?: string | null; small_business?: boolean; tax_id?: string | null; vat_id?: string | null };
  logoUrl?: string | null;
  customer: { name: string; lines?: string[] };
  vehicle?: { make: string; model: string; license_plate?: string | null } | null;
  items: { title: string; description?: string | null; quantity: number; unit_price_net: number; tax_rate: number; total_net: number }[];
};

/** Druckoptimiertes Angebotsdokument (PDF über die Druckfunktion des Browsers) */
export function QuoteDocument({ q }: { q: QuoteDoc }) {
  const itemsSum = q.items.reduce((a, i) => a + Number(i.total_net), 0);
  const discount = Math.round((itemsSum - Number(q.subtotal_net)) * 100) / 100;
  const rates = [...new Set(q.items.map((i) => Number(i.tax_rate)))];
  return (
    <article className="print-sheet mx-auto max-w-[210mm] rounded-2xl border border-border bg-white p-8 text-[13px] text-zinc-900 shadow-sm sm:p-12">
      <header className="flex items-start justify-between gap-6">
        <div>
          {q.logoUrl ? <img src={q.logoUrl} alt={q.company.name} className="mb-3 max-h-14 max-w-48 object-contain" /> : <p className="text-lg font-semibold">{q.company.name}</p>}
        </div>
        <div className="text-right text-xs text-zinc-500">
          <p className="font-medium text-zinc-900">{q.company.name}</p>
          {q.company.street && <p>{q.company.street}</p>}
          {(q.company.zip || q.company.city) && <p>{q.company.zip} {q.company.city}</p>}
          {q.company.phone && <p>{q.company.phone}</p>}
          {q.company.email && <p>{q.company.email}</p>}
        </div>
      </header>
      <div className="mt-10 grid grid-cols-2 gap-6">
        <div>
          <p className="text-[10px] text-zinc-500">{[q.company.name, q.company.street, [q.company.zip, q.company.city].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}</p>
          <p className="mt-2 font-medium">{q.customer.name}</p>
          {q.customer.lines?.map((l, i) => <p key={i}>{l}</p>)}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 self-end text-right text-xs">
          <dt className="text-zinc-500">Angebotsnummer</dt><dd>{q.number}</dd>
          <dt className="text-zinc-500">Datum</dt><dd>{formatDate(q.created_at)}</dd>
          {q.valid_until && <><dt className="text-zinc-500">Gültig bis</dt><dd>{formatDate(q.valid_until)}</dd></>}
          {q.vehicle && <><dt className="text-zinc-500">Fahrzeug</dt><dd>{q.vehicle.make} {q.vehicle.model}{q.vehicle.license_plate ? ` · ${q.vehicle.license_plate}` : ""}</dd></>}
        </dl>
      </div>
      <h1 className="mt-10 text-xl font-semibold">Angebot {q.number}</h1>
      <p className="mt-3 whitespace-pre-line">{q.intro_text || "Vielen Dank für Ihre Anfrage. Gerne bieten wir Ihnen folgende Leistungen an:"}</p>
      <table className="mt-6 w-full border-collapse">
        <thead>
          <tr className="border-b border-zinc-300 text-left text-xs text-zinc-500">
            <th className="py-2 pr-2 font-medium">Pos.</th><th className="py-2 pr-2 font-medium">Leistung</th>
            <th className="py-2 pr-2 text-right font-medium">Menge</th><th className="py-2 pr-2 text-right font-medium">Einzelpreis</th><th className="py-2 text-right font-medium">Gesamt</th>
          </tr>
        </thead>
        <tbody>
          {q.items.map((it, i) => (
            <tr key={i} className="border-b border-zinc-100 align-top">
              <td className="py-2 pr-2 text-zinc-500">{i + 1}</td>
              <td className="py-2 pr-2"><p className="font-medium">{it.title}</p>{it.description && <p className="text-xs text-zinc-500">{it.description}</p>}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{Number(it.quantity).toLocaleString("de-DE")}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{formatEUR(it.unit_price_net)}</td>
              <td className="py-2 text-right tabular-nums">{formatEUR(it.total_net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="ml-auto mt-4 w-full max-w-64 space-y-1 text-sm">
        <div className="flex justify-between"><dt>Summe netto</dt><dd className="tabular-nums">{formatEUR(itemsSum)}</dd></div>
        {discount !== 0 && <div className="flex justify-between"><dt>Nachlass</dt><dd className="tabular-nums">−{formatEUR(discount)}</dd></div>}
        {discount !== 0 && <div className="flex justify-between"><dt>Netto</dt><dd className="tabular-nums">{formatEUR(q.subtotal_net)}</dd></div>}
        {!q.company.small_business && <div className="flex justify-between"><dt>USt. {rates.join(" / ")} %</dt><dd className="tabular-nums">{formatEUR(q.tax_total)}</dd></div>}
        <div className="flex justify-between border-t border-zinc-300 pt-1.5 font-semibold"><dt>Gesamtbetrag</dt><dd className="tabular-nums">{formatEUR(q.total_gross)}</dd></div>
      </dl>
      {q.company.small_business && <p className="mt-4 text-xs text-zinc-500">Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.</p>}
      {q.terms && <p className="mt-8 whitespace-pre-line text-xs text-zinc-500">{q.terms}</p>}
      <footer className="mt-10 border-t border-zinc-200 pt-3 text-[10px] text-zinc-400">
        {q.company.name}{q.company.tax_id && ` · Steuernummer ${q.company.tax_id}`}{q.company.vat_id && ` · USt-IdNr. ${q.company.vat_id}`}
      </footer>
    </article>
  );
}
