/**
 * PDF-Export des Prüfberichts (pdf-lib, ohne Headless-Browser).
 */
import { PDFDocument, rgb, StandardFonts, degrees, type PDFFont, type PDFPage } from "pdf-lib";
import {
  CATEGORY_LABELS,
  COMPLAINT_LABELS,
  EVIDENCE_LABELS,
  FIELD_LABELS,
  FIELD_SOURCE_LABELS,
  formatEur,
  PLATFORM_LABELS,
  PRICE_RATING_LABELS,
  RECOMMENDATION_LABELS,
  CLAIM_SOURCE_LABELS,
} from "../domain/labels";
import { LISTING_FIELDS, type AnalysisReport, type FieldSource, type ListingFieldKey } from "../domain/schemas";

const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
/** Ersetzt Zeichen, die die PDF-Standardschrift nicht darstellen kann. */
export function pdfSafe(s: string): string {
  return s
    .replace(/[→⇒]/g, "->")
    .replace(/[✓✔]/g, "OK")
    .replace(/−/g, "-")
    .replace(/ | /g, " ")
    .split("")
    .map((c) => {
      const code = c.charCodeAt(0);
      if (c === "\n" || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.includes(c)) return c;
      return "";
    })
    .join("");
}

const INK = rgb(0.11, 0.12, 0.15);
const MUTED = rgb(0.42, 0.44, 0.5);
const LINE = rgb(0.88, 0.89, 0.91);
const ACCENT = rgb(0.06, 0.45, 0.4);
const BAD = rgb(0.72, 0.2, 0.18);
const WARN = rgb(0.72, 0.5, 0.05);
const GOOD = rgb(0.13, 0.55, 0.32);

class Writer {
  page!: PDFPage;
  y = 0;
  readonly W = 595.28;
  readonly H = 841.89;
  readonly M = 48;
  pages: PDFPage[] = [];
  constructor(
    private doc: PDFDocument,
    private font: PDFFont,
    private bold: PDFFont,
    private demo: boolean,
  ) {
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage([this.W, this.H]);
    this.pages.push(this.page);
    this.y = this.H - this.M;
    if (this.demo) {
      this.page.drawText("DEMO - FIKTIVE DATEN", { x: 120, y: 300, size: 54, font: this.bold, color: rgb(0.6, 0.3, 0.85), opacity: 0.08, rotate: degrees(35) });
    }
  }
  ensure(h: number) {
    if (this.y - h < this.M + 20) this.newPage();
  }
  wrap(text: string, size: number, font: PDFFont, width: number): string[] {
    const out: string[] = [];
    for (const para of pdfSafe(text).split("\n")) {
      const words = para.split(/\s+/);
      let line = "";
      for (const w of words) {
        const t = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(t, size) > width && line) {
          out.push(line);
          line = w;
        } else line = t;
      }
      out.push(line);
    }
    return out;
  }
  text(s: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {}) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.font;
    const x = this.M + (opts.indent ?? 0);
    const lines = this.wrap(s, size, font, this.W - this.M - x);
    for (const l of lines) {
      this.ensure(size + 4);
      this.page.drawText(l, { x, y: this.y - size, size, font, color: opts.color ?? INK });
      this.y -= size * 1.42;
    }
    this.y -= opts.gap ?? 2;
  }
  bullet(s: string, color = INK) {
    this.ensure(14);
    this.page.drawCircle({ x: this.M + 4, y: this.y - 6.5, size: 1.6, color: MUTED });
    this.text(s, { indent: 12, color });
  }
  heading(s: string) {
    this.ensure(40);
    this.y -= 10;
    this.page.drawLine({ start: { x: this.M, y: this.y }, end: { x: this.W - this.M, y: this.y }, thickness: 0.6, color: LINE });
    this.y -= 8;
    this.text(s, { size: 13, bold: true, gap: 4 });
  }
  kv(k: string, v: string) {
    this.ensure(14);
    this.page.drawText(pdfSafe(k), { x: this.M, y: this.y - 10, size: 9.5, font: this.font, color: MUTED });
    const lines = this.wrap(v, 9.5, this.bold, this.W - this.M * 2 - 170);
    lines.forEach((l, i) => this.page.drawText(l, { x: this.M + 170, y: this.y - 10 - i * 13, size: 9.5, font: this.bold, color: INK }));
    this.y -= Math.max(1, lines.length) * 13 + 2;
  }
}

const sevColor = (s: string) => (s === "high" ? BAD : s === "medium" ? WARN : s === "low" ? ACCENT : MUTED);
const sevLabel = (s: string) => ({ high: "Hoch", medium: "Mittel", low: "Gering", info: "Hinweis" })[s] ?? s;

export async function renderReportPdf(report: AnalysisReport): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`DEAL-NIVO Prüfbericht – ${report.listing.title ?? "Angebot"}`));
  doc.setProducer("DEAL-NIVO");
  doc.setCreator("DEAL-NIVO");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, font, bold, report.isDemo);
  const { listing, market, score, dataQuality } = report;

  // Kopf
  w.page.drawRectangle({ x: w.M, y: w.y - 22, width: 22, height: 22, color: INK });
  w.page.drawText("DEAL-NIVO", { x: w.M + 30, y: w.y - 16, size: 13, font: bold, color: INK });
  w.page.drawText(pdfSafe(`Prüfbericht · ${new Date(report.createdAt).toLocaleDateString("de-DE")}`), { x: w.W - w.M - 160, y: w.y - 16, size: 9, font, color: MUTED });
  w.y -= 40;
  if (report.isDemo) w.text("DEMO-BERICHT: Alle Angaben, Preise, Bilder und Bewertungen sind fiktiv.", { bold: true, color: rgb(0.5, 0.25, 0.75) });
  w.text(listing.title ?? "Angebot", { size: 18, bold: true, gap: 4 });
  w.text(`${PLATFORM_LABELS[listing.platform]} · ${CATEGORY_LABELS[listing.category]} · ${report.mode === "live_ai" ? "KI-Analyse" : report.mode === "demo" ? "Beispiel" : "Regelanalyse"}`, { color: MUTED, gap: 10 });

  // Score-Box
  w.ensure(80);
  const top = w.y;
  w.page.drawRectangle({ x: w.M, y: top - 70, width: w.W - 2 * w.M, height: 70, borderColor: LINE, borderWidth: 1, color: rgb(0.985, 0.985, 0.98) });
  w.page.drawText(score.overall != null ? String(score.overall) : "-", { x: w.M + 18, y: top - 48, size: 34, font: bold, color: score.overall == null ? MUTED : score.overall >= 70 ? GOOD : score.overall >= 45 ? WARN : BAD });
  w.page.drawText("Deal-Score / 100", { x: w.M + 18, y: top - 62, size: 8, font, color: MUTED });
  w.page.drawText(pdfSafe(RECOMMENDATION_LABELS[score.recommendation]), { x: w.M + 120, y: top - 26, size: 12, font: bold, color: INK });
  w.page.drawText(pdfSafe(`Angebotspreis ${formatEur(listing.priceEur)} · ${PRICE_RATING_LABELS[market.rating]}`), { x: w.M + 120, y: top - 44, size: 10, font, color: INK });
  w.page.drawText(pdfSafe(`Datenqualität ${dataQuality.score}/100 – ${dataQuality.uncertainty}`).slice(0, 110), { x: w.M + 120, y: top - 60, size: 8.5, font, color: MUTED });
  w.y = top - 84;
  w.text(report.summary, { gap: 6 });

  w.heading("Teilbewertungen");
  for (const [label, sub] of [["Preis", score.price], ["Produkt", score.product], ["Verkäufer", score.seller], ["Plausibilität", score.plausibility]] as const)
    w.kv(label, `${sub.score ?? "nicht bewertbar"} · ${sub.label} – ${sub.reasons.slice(0, 2).join("; ")}`);
  if (score.caps.length) w.text(`Begrenzungen: ${score.caps.join(" · ")}`, { size: 8.5, color: MUTED });

  w.heading("Marktpreisanalyse");
  if (market.status === "ok" && market.range) {
    w.kv("Geschätzter Marktwert", `${formatEur(market.range.low)} – ${formatEur(market.range.high)} (Mittel ${formatEur(market.range.median)})`);
    w.kv("Bewertung", `${PRICE_RATING_LABELS[market.rating]}${market.deviationPct != null ? ` (${market.deviationPct > 0 ? "+" : ""}${market.deviationPct} %)` : ""}`);
    w.kv("Vergleichsbasis", `${market.comparables.used} Angebote, davon ${market.comparables.soldPrices} Verkaufspreise; Qualität: ${market.comparables.quality}`);
    w.text(market.explanation, { size: 9, color: MUTED });
  } else {
    w.text("Marktwert derzeit nicht verlässlich bestimmbar.", { bold: true });
    w.text(market.explanation, { size: 9, color: MUTED });
  }
  if (market.samples.length) {
    w.text("Vergleichsangebote", { bold: true, gap: 1 });
    for (const c of market.samples.slice(0, 8)) {
      const props = [c.year, c.mileageKm != null ? `${c.mileageKm.toLocaleString("de-DE")} km` : null].filter(Boolean).join(", ");
      w.bullet(`${formatEur(c.priceEur)} (${c.priceType === "sold" ? "verkauft" : "Angebot"}) – ${c.title ?? props ?? "Vergleich"}${c.title && props ? `, ${props}` : ""} · ${c.source}, ${new Date(c.collectedAt).toLocaleDateString("de-DE")}`);
    }
  }

  w.heading("Risiken & Plausibilität");
  if (report.risks.length === 0) w.text("Keine Auffälligkeiten durch die Regelprüfung (keine Garantie).", { color: MUTED });
  for (const r of report.risks) {
    w.text(`[${sevLabel(r.severity)}] ${r.title}`, { bold: true, color: sevColor(r.severity), gap: 0 });
    w.text(r.explanation, { size: 9 });
    for (const e of r.evidence) w.text(`Beleg: ${e}`, { size: 8.5, color: MUTED, indent: 10, gap: 0 });
    if (r.caveat) w.text(r.caveat, { size: 8.5, color: ACCENT, indent: 10 });
    w.y -= 3;
  }

  w.heading("Produkt & Bilder");
  if (report.product.conditionSummary) w.text(report.product.conditionSummary);
  for (const f of report.product.imageFindings) w.bullet(`${EVIDENCE_LABELS[f.evidenceLevel]}: ${f.title} – ${f.detail}`);
  if (report.product.missingViews.length) w.text(`Fehlende Ansichten: ${report.product.missingViews.join(", ")}`, { size: 9, color: MUTED });
  if (report.product.weaknesses.length) {
    w.text("Bekannte Schwachstellen", { bold: true });
    for (const k of report.product.weaknesses) w.bullet(`${k.title} (${k.appliesTo}) – ${k.detail} [Quelle: ${k.claim.source.type === "knowledge_base" ? k.claim.source.label : CLAIM_SOURCE_LABELS[k.claim.source.type]}]`);
  }
  if (report.product.authenticity?.applicable) w.text(report.product.authenticity.recommendation, { size: 9, color: WARN });

  if (report.seller) {
    const s = report.seller;
    w.heading("Verkäuferanalyse");
    w.kv("Erkannte Bewertungen", `${s.visibleReviewCount} (positiv ${s.positive}, neutral ${s.neutral}, negativ ${s.negative})`);
    w.text(s.coverageNote, { size: 9, color: MUTED });
    w.text(s.summary);
    for (const c of s.complaints) w.bullet(`${COMPLAINT_LABELS[c.category]}: ${c.count}×`);
    w.text(s.disclaimer, { size: 8, color: MUTED });
  }

  w.heading("Sichere Bezahlung & Übergabe");
  for (const p of report.payment) w.bullet(`${p.title}: ${p.detail}`, p.kind === "avoid" ? BAD : INK);

  w.heading("Checkliste");
  const groups = [
    ["Fragen an den Verkäufer", report.checklist.questionsForSeller],
    ["Bei der Besichtigung", report.checklist.inspection],
    ["Dokumente", report.checklist.documents],
    ["Teure Schäden", report.checklist.expensiveDamages],
  ] as const;
  for (const [t, items] of groups) {
    w.text(t, { bold: true, gap: 1 });
    for (const i of items) w.bullet(`[ ] ${i}`);
  }

  if (report.sellerMessage) {
    w.heading("Nachricht an den Verkäufer");
    w.text(report.sellerMessage, { size: 9.5 });
  }
  if (report.negotiation.possible && report.negotiation.message) {
    w.heading("Preisverhandlung");
    for (const a of report.negotiation.arguments) w.bullet(`${a.text} (${a.basis})`);
    w.text(report.negotiation.message, { size: 9.5 });
  }

  w.heading("Angaben & Herkunft");
  for (const f of LISTING_FIELDS) {
    if (f === "description") continue;
    const v = listing[f as ListingFieldKey];
    if (v == null || v === "") continue;
    const src = listing.provenance[f] as FieldSource | undefined;
    w.kv(FIELD_LABELS[f], `${typeof v === "number" && f === "priceEur" ? formatEur(v) : String(v)}${src ? `  (${FIELD_SOURCE_LABELS[src]})` : ""}`);
  }

  w.heading("Hinweis");
  w.text(report.disclaimer, { size: 8.5, color: MUTED });

  // Fußzeilen
  w.pages.forEach((p, i) => {
    p.drawText(pdfSafe(`DEAL-NIVO · Bericht ${report.id} · Seite ${i + 1}/${w.pages.length}`), { x: w.M, y: 24, size: 7.5, font, color: MUTED });
  });
  return doc.save();
}
