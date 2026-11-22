/**
 * Umsatzbeteiligung der Plattform an online bezahlten Rechnungen.
 * Gebühr = Betrag × Satz (Basispunkte, 50 = 0,5 %), kaufmännisch gerundet,
 * begrenzt durch die monatliche Obergrenze abzüglich bereits angefallener Gebühren.
 */
export function computeApplicationFee(amountCents: number, bps: number, capCents: number | null, chargedThisMonthCents: number): number {
  if (!Number.isFinite(amountCents) || amountCents <= 0 || bps <= 0) return 0;
  const raw = Math.round((amountCents * bps) / 10_000);
  if (capCents == null) return raw;
  return Math.max(0, Math.min(raw, capCents - Math.max(0, chargedThisMonthCents)));
}

export function formatShare(bps: number) {
  return `${(bps / 100).toLocaleString("de-DE", { maximumFractionDigits: 2 })} %`;
}
