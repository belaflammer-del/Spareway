"use client";
import { useActionState } from "react";
import { updatePricingConfig } from "@/app/actions/company";
import { Field, Input } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";
import { SOILING_LABELS, SOILING_LEVELS, VEHICLE_CLASSES, VEHICLE_CLASS_LABELS, type PricingConfig } from "@/lib/domain";

export function PricingRulesForm({ config, readOnly }: { config: PricingConfig; readOnly?: boolean }) {
  const [state, action] = useActionState(updatePricingConfig, undefined);
  const pct = (n: number) => Math.round(n * 1000) / 10;
  return (
    <form action={action} className="space-y-5">
      <fieldset disabled={readOnly} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Stundensatz für Kunden (€ netto)" name="hourlyRate" hint="Für Sonderaufwand und Stundenleistungen"><Input name="hourlyRate" inputMode="decimal" defaultValue={config.hourlyRate} /></Field>
          <Field label="Interne Kosten je Stunde (€)" name="internalHourlyCost" hint="Für die geschätzte Gewinnmarge"><Input name="internalHourlyCost" inputMode="decimal" defaultValue={config.internalHourlyCost} /></Field>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Preisfaktor je Fahrzeugklasse <span className="font-normal text-muted-foreground">(100 % = Basispreis)</span></p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {VEHICLE_CLASSES.map((c) => (
              <Field key={c} label={VEHICLE_CLASS_LABELS[c]} name={`class_${c}`}>
                <div className="relative"><Input name={`class_${c}`} inputMode="decimal" className="h-9 pr-7" defaultValue={pct(config.vehicleClassFactors[c])} /><span className="absolute right-2 top-2 text-xs text-muted-foreground">%</span></div>
              </Field>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Preisfaktor je Verschmutzungsgrad</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SOILING_LEVELS.map((s) => (
              <Field key={s} label={SOILING_LABELS[s]} name={`soil_${s}`}>
                <div className="relative"><Input name={`soil_${s}`} inputMode="decimal" className="h-9 pr-7" defaultValue={pct(config.soilingFactors[s])} /><span className="absolute right-2 top-2 text-xs text-muted-foreground">%</span></div>
              </Field>
            ))}
          </div>
        </div>
      </fieldset>
      {!readOnly && <div className="flex items-center gap-3"><SubmitButton>Preisregeln speichern</SubmitButton><FormMessage state={state} /></div>}
    </form>
  );
}
