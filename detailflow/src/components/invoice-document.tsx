import { formatDate, formatEUR } from "@/lib/utils";
import { computeTotals, type XInvoice } from "@/lib/xrechnung";

/** Druckoptimierte Rechnung mit Pflichtangaben nach § 14 UStG */
export function InvoiceDocument({ inv, logoUrl, draft }: { inv: XInvoice & { intro_text?: string | null }; logoUrl?: string | null; draft?: boolean }) {
  const t = computeTotals(inv);
  const s = inv.seller, b = inv.buyer;
  const title = inv.kind === "cancellation" ? "Stornorechnung" : "Rechnung";
  return (
    <article className="print-sheet relative mx-auto max-w-[210mm] overflow-hidden rounded-2xl border border-border bg-white p-8 text-[13px] text-zinc-900 shadow-sm sm:p-12">
      {draft && <div className="pointer-events-none absolute right-6 top-6 rotate-6 rounded border-2 border-amber-500 px-3 py-1 text-sm font-bold tracking-widest text-amber-600">ENTWURF</div>}
      <header className="flex items-start justify-between gap-6">
        {logoUrl ? <img src={logoUrl} alt={s.name} className="max-h-14 max-w-48 object-contain" /> : <p className="text-lg font-semibold">{s.name}</p>}
        <div className="text-right text-xs text-zinc-500">
          <p className="font-medium text-zinc-900">{s.name}</p><p>{s.street}</p><p>{s.zip} {s.city}</p>{s.phone && <p>{s.phone}</p>}{s.email && <p>{s.email}</p>}
        </div>
      </header>
      <div className="mt-10 grid grid-cols-2 gap-6">
        <div>
          <p className="text-[10px] text-zinc-500">{[s.name, s.street, `${s.zip ?? ""} ${s.city ?? ""}`].join(" · ")}</p>
          <p className="mt-2 font-medium">{b.name}</p><p>{b.street}</p><p>{b.zip} {b.city}</p>
          {b.vat_id && <p className="text-xs text-zinc-500">USt-IdNr. {b.vat_id}</p>}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 self-end text-right text-xs">
          <dt className="text-zinc-500">{title}snummer</dt><dd>{inv.number || "wird beim Finalisieren vergeben"}</dd>
          <dt className="text-zinc-500">Rechnungsdatum</dt><dd>{inv.issue_date ? formatDate(inv.issue_date) : "–"}</dd>
          <dt className="text-zinc-500">Leistungsdatum</dt><dd>{formatDate(inv.service_date)}</dd>
          {inv.due_date && <><dt className="text-zinc-500">Fällig am</dt><dd>{formatDate(inv.due_date)}</dd></>}
          {inv.cancels_number && <><dt className="text-zinc-500">Storno zu</dt><dd>{inv.cancels_number}</dd></>}
        </dl>
      </div>
      <h1 className="mt-10 text-xl font-semibold">{title} {inv.number}</h1>
      {inv.intro_text && <p className="mt-3 whitespace-pre-line">{inv.intro_text}</p>}
      <table className="mt-6 w-full border-collapse">
        <thead><tr className="border-b border-zinc-300 text-left text-xs text-zinc-500">
          <th className="py-2 pr-2 font-medium">Pos.</th><th className="py-2 pr-2 font-medium">Leistung</th><th className="py-2 pr-2 text-right font-medium">Menge</th>
          <th className="py-2 pr-2 text-right font-medium">Einzelpreis</th>{t.subtotals.length > 1 && <th className="py-2 pr-2 text-right font-medium">USt.</th>}<th className="py-2 text-right font-medium">Gesamt</th>
        </tr></thead>
        <tbody>
          {inv.items.map((it, i) => (
            <tr key={i} className="border-b border-zinc-100 align-top">
              <td className="py-2 pr-2 text-zinc-500">{i + 1}</td>
              <td className="py-2 pr-2"><p className="font-medium">{it.title}</p>{it.description && <p className="text-xs text-zinc-500">{it.description}</p>}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{it.quantity.toLocaleString("de-DE")}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{formatEUR(it.unit_price_net)}</td>
              {t.subtotals.length > 1 && <td className="py-2 pr-2 text-right tabular-nums">{it.tax_rate} %</td>}
              <td className="py-2 text-right tabular-nums">{formatEUR(it.total_net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="ml-auto mt-4 w-full max-w-72 space-y-1 text-sm">
        <div className="flex justify-between"><dt>Summe netto</dt><dd className="tabular-nums">{formatEUR(t.net)}</dd></div>
        {!inv.small_business && t.subtotals.map((g) => <div key={g.rate} className="flex justify-between"><dt>USt. {g.rate} % auf {formatEUR(g.net)}</dt><dd className="tabular-nums">{formatEUR(g.tax)}</dd></div>)}
        <div className="flex justify-between border-t border-zinc-300 pt-1.5 font-semibold"><dt>Rechnungsbetrag</dt><dd className="tabular-nums">{formatEUR(t.gross)}</dd></div>
      </dl>
      {inv.small_business && <p className="mt-4 text-xs text-zinc-500">Kein Ausweis von Umsatzsteuer, da Kleinunternehmer gemäß § 19 UStG.</p>}
      {inv.payment_terms && <p className="mt-6">{inv.payment_terms}{s.iban ? ` Bitte überweisen Sie den Betrag unter Angabe der Rechnungsnummer auf das unten genannte Konto.` : ""}</p>}
      <footer className="mt-10 grid gap-1 border-t border-zinc-200 pt-3 text-[10px] text-zinc-500 sm:grid-cols-3">
        <p>{s.name}<br />{s.street}, {s.zip} {s.city}</p>
        <p>{s.tax_id && <>Steuernummer {s.tax_id}<br /></>}{s.vat_id && <>USt-IdNr. {s.vat_id}</>}</p>
        <p>{s.bank_name && <>{s.bank_name}<br /></>}{s.iban && <>IBAN {s.iban}<br /></>}{s.bic && <>BIC {s.bic}</>}</p>
      </footer>
    </article>
  );
}
