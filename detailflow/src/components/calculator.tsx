"use client";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Info, Plus, Search, Trash2 } from "lucide-react";
import { saveCalculation } from "@/app/actions/quotes";
import { Card, Field, Input, Select, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";
import { calculate, formatMinutes, type PricedPackage, type PricedService } from "@/lib/pricing";
import { SOILING_LABELS, SOILING_LEVELS, VEHICLE_CLASSES, VEHICLE_CLASS_LABELS, type PricingConfig, type SoilingLevel, type VehicleClass } from "@/lib/domain";
import { cn, formatEUR } from "@/lib/utils";

type Svc = PricedService & { category: string };
type Props = {
  customers: { id: string; name: string }[];
  vehicles: { id: string; customer_id: string | null; name: string; vehicle_class: VehicleClass }[];
  services: Svc[];
  packages: PricedPackage[];
  config: PricingConfig;
  tax: { default_tax_rate: number; small_business: boolean };
  canEditPrices: boolean;
  defaults: { customerId?: string; vehicleId?: string; target?: "quote" | "order" };
};

export function Calculator(p: Props) {
  const [state, action] = useActionState(saveCalculation, undefined);
  const initialVehicle = p.vehicles.find((v) => v.id === p.defaults.vehicleId);
  const [customerId, setCustomerId] = useState(p.defaults.customerId ?? initialVehicle?.customer_id ?? "");
  const [vehicleId, setVehicleId] = useState(initialVehicle?.id ?? "");
  const [vehicleClass, setVehicleClass] = useState<VehicleClass>(initialVehicle?.vehicle_class ?? "kompaktwagen");
  const [soiling, setSoiling] = useState<SoilingLevel>("normal");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [packageIds, setPackageIds] = useState<string[]>([]);
  const [extras, setExtras] = useState<{ title: string; priceNet: number }[]>([]);
  const [effort, setEffort] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [override, setOverride] = useState("");
  const [intro, setIntro] = useState("");
  const [notes, setNotes] = useState("");
  const [target, setTarget] = useState<"quote" | "order">(p.defaults.target ?? "quote");
  const [scheduled, setScheduled] = useState("");
  const [search, setSearch] = useState("");
  const [openCat, setOpenCat] = useState<string | null>(null);

  const customerVehicles = p.vehicles.filter((v) => !customerId || v.customer_id === customerId);
  const overrideNet = override.trim() === "" ? null : Number(override.replace(",", "."));
  const calc = { vehicleClass, soiling, serviceIds, packageIds, extras, specialEffortMinutes: effort, discountPercent: discount, overrideNet: Number.isFinite(overrideNet) ? overrideNet : null };
  const result = useMemo(() => calculate(calc, { services: p.services, packages: p.packages }, p.config, p.tax), [JSON.stringify(calc)]); // eslint-disable-line react-hooks/exhaustive-deps

  const covered = useMemo(() => new Set(packageIds.flatMap((id) => p.packages.find((x) => x.id === id)?.service_ids ?? [])), [packageIds, p.packages]);
  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const m = new Map<string, Svc[]>();
    for (const s of p.services) if (!term || s.name.toLowerCase().includes(term)) m.set(s.category, [...(m.get(s.category) ?? []), s]);
    return m;
  }, [search, p.services]);

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const pickVehicle = (id: string) => {
    setVehicleId(id);
    const v = p.vehicles.find((x) => x.id === id);
    if (v) { setVehicleClass(v.vehicle_class); if (v.customer_id) setCustomerId(v.customer_id); }
  };

  const payload = JSON.stringify({ target, customer_id: customerId, vehicle_id: vehicleId || null, calc, intro_text: intro, notes, scheduled_start: scheduled || null });

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_24rem]">
      <input type="hidden" name="payload" value={payload} />
      <div className="space-y-5">
        <Step n={1} title="Kunde & Fahrzeug">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kunde" name="customer">
              <Select id="customer" value={customerId} onChange={(e) => { setCustomerId(e.target.value); setVehicleId(""); }}>
                <option value="">Kunde auswählen …</option>
                {p.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Fahrzeug" name="vehicle" hint={customerId && !customerVehicles.length ? "Für diesen Kunden ist noch kein Fahrzeug hinterlegt." : undefined}>
              <Select id="vehicle" value={vehicleId} onChange={(e) => pickVehicle(e.target.value)}>
                <option value="">{customerVehicles.length ? "Fahrzeug auswählen …" : "– ohne Fahrzeug –"}</option>
                {customerVehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </Select>
            </Field>
          </div>
          <p className="mt-2 text-xs text-muted-foreground"><Link href="/app/kunden/neu" className="text-accent">+ Neuer Kunde</Link>{customerId && <> · <Link href={`/app/fahrzeuge/neu?kunde=${customerId}`} className="text-accent">+ Neues Fahrzeug</Link></>}</p>
        </Step>

        <Step n={2} title="Fahrzeuggröße & Verschmutzung">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fahrzeugklasse" name="vc">
              <Select id="vc" value={vehicleClass} onChange={(e) => setVehicleClass(e.target.value as VehicleClass)}>
                {VEHICLE_CLASSES.map((c) => <option key={c} value={c}>{VEHICLE_CLASS_LABELS[c]} ({Math.round(p.config.vehicleClassFactors[c] * 100)} %)</option>)}
              </Select>
            </Field>
            <div>
              <p className="mb-1.5 text-sm font-medium">Verschmutzungsgrad</p>
              <div className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1">
                {SOILING_LEVELS.map((s) => (
                  <button key={s} type="button" onClick={() => setSoiling(s)} className={cn("rounded-md py-1.5 text-sm transition", soiling === s ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}>{SOILING_LABELS[s]}</button>
                ))}
              </div>
            </div>
          </div>
        </Step>

        {p.packages.length > 0 && (
          <Step n={3} title="Pakete">
            <div className="grid gap-2 sm:grid-cols-2">
              {p.packages.map((pk) => {
                const on = packageIds.includes(pk.id);
                return (
                  <button key={pk.id} type="button" onClick={() => toggle(packageIds, setPackageIds, pk.id)} className={cn("rounded-xl border p-3 text-left transition", on ? "border-accent bg-accent-soft/40 ring-1 ring-accent" : "border-border hover:border-foreground/20")}>
                    <p className="text-sm font-medium">{pk.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{pk.service_ids.length} Leistungen{pk.price_mode === "discount" && pk.discount_percent > 0 ? ` · ${pk.discount_percent} % Paketrabatt` : pk.price_mode === "fixed" ? " · Festpreis" : ""}</p>
                  </button>
                );
              })}
            </div>
          </Step>
        )}

        <Step n={4} title="Einzelleistungen">
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Leistung suchen, z. B. „Tierhaar“ …" className="pl-9" />
          </div>
          <div className="space-y-2">
            {[...groups.entries()].map(([cat, list]) => {
              const open = Boolean(search) || openCat === cat;
              const count = list.filter((s) => serviceIds.includes(s.id)).length;
              return (
                <div key={cat} className="rounded-xl border border-border">
                  <button type="button" onClick={() => setOpenCat(open && !search ? null : cat)} className="flex w-full items-center justify-between px-4 py-2.5 text-sm">
                    <span className="font-medium">{cat}</span>
                    <span className="flex items-center gap-2 text-muted-foreground">{count > 0 && <span className="rounded-full bg-foreground px-2 text-xs text-background">{count}</span>}<ChevronDown className={cn("size-4 transition", open && "rotate-180")} /></span>
                  </button>
                  {open && (
                    <div className="grid gap-0.5 border-t border-border p-2 sm:grid-cols-2">
                      {list.map((s) => {
                        const inPkg = covered.has(s.id);
                        return (
                          <label key={s.id} className={cn("flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted", inPkg && "opacity-50")}>
                            <span className="flex items-center gap-2"><input type="checkbox" checked={serviceIds.includes(s.id) || inPkg} disabled={inPkg} onChange={() => toggle(serviceIds, setServiceIds, s.id)} />{s.name}</span>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{inPkg ? "im Paket" : s.pricing_type === "hourly" ? "Std." : s.base_price ? formatEUR(s.base_price) : "–"}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Step>

        <Step n={5} title="Sonderaufwand & Zusatzpositionen">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sonderaufwand (Minuten)" name="effort" hint={`Wird mit ${formatEUR(p.config.hourlyRate)}/Std. berechnet`}>
              <Input id="effort" inputMode="numeric" value={effort || ""} onChange={(e) => setEffort(Math.max(0, Number(e.target.value) || 0))} placeholder="0" />
            </Field>
          </div>
          <div className="mt-4 space-y-2">
            {extras.map((x, i) => (
              <div key={i} className="flex gap-2">
                <Input value={x.title} placeholder="Bezeichnung" onChange={(e) => setExtras(extras.map((y, j) => (j === i ? { ...y, title: e.target.value } : y)))} />
                <Input value={x.priceNet || ""} inputMode="decimal" placeholder="€ netto" className="w-28 text-right" onChange={(e) => setExtras(extras.map((y, j) => (j === i ? { ...y, priceNet: Math.max(0, Number(e.target.value.replace(",", ".")) || 0) } : y)))} />
                <button type="button" onClick={() => setExtras(extras.filter((_, j) => j !== i))} className="px-2 text-muted-foreground hover:text-danger" aria-label="Entfernen"><Trash2 className="size-4" /></button>
              </div>
            ))}
            <button type="button" onClick={() => setExtras([...extras, { title: "", priceNet: 0 }])} className="flex items-center gap-1 text-sm font-medium text-accent"><Plus className="size-4" />Freie Position hinzufügen</button>
          </div>
        </Step>

        <Step n={6} title="Abschluss">
          <div className="grid gap-4 sm:grid-cols-2">
            {p.canEditPrices ? (
              <>
                <Field label="Rabatt (%)" name="discount"><Input id="discount" inputMode="decimal" value={discount || ""} placeholder="0" disabled={overrideNet != null} onChange={(e) => setDiscount(Math.min(100, Math.max(0, Number(e.target.value.replace(",", ".")) || 0)))} /></Field>
                <Field label="Endpreis manuell (€ netto)" name="override" hint="Überschreibt die Berechnung"><Input id="override" inputMode="decimal" value={override} placeholder="automatisch" onChange={(e) => setOverride(e.target.value)} /></Field>
              </>
            ) : <p className="text-sm text-muted-foreground sm:col-span-2">Rabatte und manuelle Preise kann nur ein Mitarbeiter mit Preisrecht vergeben.</p>}
            <div className="sm:col-span-2">
              <p className="mb-1.5 text-sm font-medium">Was möchtest du erstellen?</p>
              <div className="inline-flex rounded-lg bg-muted p-1 text-sm">
                {([["quote", "Angebot"], ["order", "Direkt Auftrag"]] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setTarget(k)} className={cn("rounded-md px-3 py-1.5", target === k ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}>{l}</button>
                ))}
              </div>
            </div>
            {target === "quote" ? (
              <Field label="Einleitungstext (optional)" name="intro" className="sm:col-span-2"><Textarea id="intro" value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="Vielen Dank für Ihre Anfrage. Gerne bieten wir Ihnen an:" className="min-h-16" /></Field>
            ) : (
              <Field label="Termin (optional)" name="scheduled"><Input id="scheduled" type="datetime-local" value={scheduled} onChange={(e) => setScheduled(e.target.value)} /></Field>
            )}
            <Field label="Interne Notiz" name="notes" className="sm:col-span-2"><Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-16" /></Field>
          </div>
        </Step>
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-semibold">Zusammenfassung</h2>
            <p className="text-xs text-muted-foreground">{VEHICLE_CLASS_LABELS[vehicleClass]} · Verschmutzung {SOILING_LABELS[soiling].toLowerCase()}</p>
          </div>
          {result.lines.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">Wähle Pakete oder Leistungen aus – der Preis wird sofort berechnet.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-border overflow-y-auto">
              {result.lines.map((l, i) => (
                <li key={i} className="px-5 py-2.5 text-sm">
                  <div className="flex justify-between gap-3"><span>{l.title}</span><span className="tabular-nums">{formatEUR(l.totalNet)}</span></div>
                  {l.breakdown && (l.breakdown.classSurcharge !== 0 || l.breakdown.soilingSurcharge !== 0 || l.breakdown.minimumApplied) && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Basis {formatEUR(l.breakdown.base)}
                      {l.breakdown.classSurcharge !== 0 && ` · Größe ${l.breakdown.classSurcharge > 0 ? "+" : ""}${formatEUR(l.breakdown.classSurcharge)}`}
                      {l.breakdown.soilingSurcharge !== 0 && ` · Verschm. ${l.breakdown.soilingSurcharge > 0 ? "+" : ""}${formatEUR(l.breakdown.soilingSurcharge)}`}
                      {l.breakdown.minimumApplied && " · Mindestpreis"}
                    </p>
                  )}
                  {l.includes && <p className="mt-0.5 text-xs text-muted-foreground">{l.includes.join(", ")}</p>}
                </li>
              ))}
            </ul>
          )}
          <dl className="space-y-1.5 border-t border-border px-5 py-4 text-sm">
            <Row label="Zwischensumme netto" value={formatEUR(result.subtotalNet)} />
            {result.discountAmount !== 0 && <Row label={result.manualOverride ? "Manuelle Anpassung" : `Rabatt ${result.discountPercent} %`} value={`−${formatEUR(result.discountAmount)}`} />}
            <Row label="Netto" value={formatEUR(result.netTotal)} />
            {result.taxes.map((t) => <Row key={t.rate} label={`USt. ${t.rate} %`} value={formatEUR(t.tax)} />)}
            {p.tax.small_business && <p className="text-xs text-muted-foreground">Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.</p>}
            <div className="flex justify-between border-t border-border pt-2 text-base font-semibold"><dt>Gesamt</dt><dd className="tabular-nums">{formatEUR(result.grossTotal)}</dd></div>
          </dl>
          <div className="space-y-1 border-t border-border bg-muted/50 px-5 py-3 text-xs text-muted-foreground">
            <p className="flex items-center gap-1 font-medium text-foreground"><Info className="size-3.5" />Intern (nicht im Angebot)</p>
            <Row label="Geschätzte Dauer" value={formatMinutes(result.minutes)} />
            <Row label="Materialkosten" value={formatEUR(result.materialCost)} />
            <Row label="Arbeitskosten" value={formatEUR(result.laborCost)} />
            <Row label="Geschätzter Gewinn" value={`${formatEUR(result.estimatedProfit)} (${result.marginPercent} %)`} />
          </div>
          {result.warnings.length > 0 && (
            <ul className="space-y-1 border-t border-border px-5 py-3 text-xs text-amber-700 dark:text-amber-300">
              {result.warnings.map((w, i) => <li key={i} className="flex gap-1.5"><AlertTriangle className="mt-0.5 size-3 shrink-0" />{w}</li>)}
            </ul>
          )}
          <div className="space-y-2 border-t border-border p-4">
            <SubmitButton className="w-full" pendingText="Wird gespeichert …">{target === "quote" ? "Angebot erstellen" : "Auftrag anlegen"}</SubmitButton>
            {!customerId && <p className="text-center text-xs text-muted-foreground">Bitte zuerst einen Kunden auswählen.</p>}
            <FormMessage state={state} />
          </div>
        </Card>
      </div>
    </form>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="mb-4 flex items-center gap-2 font-semibold"><span className="flex size-6 items-center justify-center rounded-full bg-foreground text-xs text-background">{n}</span>{title}</h2>
      {children}
    </Card>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3"><dt>{label}</dt><dd className="tabular-nums">{value}</dd></div>;
}
