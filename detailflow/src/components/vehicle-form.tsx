"use client";
import { useActionState } from "react";
import { createVehicle, updateVehicle } from "@/app/actions/vehicles";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";
import { VEHICLE_CLASSES, VEHICLE_CLASS_LABELS } from "@/lib/domain";

type V = Record<string, string | number | null>;
const PAINT = ["Uni", "Metallic", "Perleffekt", "Matt", "Folie", "Sonderlack"];
const INTERIOR = ["Stoff", "Leder", "Teilleder", "Alcantara", "Kunstleder", "Gemischt"];

export function VehicleForm({ vehicle, customers, defaultCustomerId, onboarding }: { vehicle?: V; customers: { id: string; name: string }[]; defaultCustomerId?: string; onboarding?: boolean }) {
  const [state, action] = useActionState(vehicle ? updateVehicle : createVehicle, undefined);
  const e = state?.errors ?? {};
  const v = (k: string) => (vehicle?.[k] ?? "") as string;
  return (
    <form action={action} className="space-y-6">
      {vehicle && <input type="hidden" name="id" value={String(vehicle.id)} />}
      {onboarding && <input type="hidden" name="einrichtung" value="1" />}
      <Field label="Kunde" name="customer_id">
        <Select id="customer_id" name="customer_id" defaultValue={(vehicle?.customer_id as string) ?? defaultCustomerId ?? ""}>
          <option value="">– ohne Kunde –</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Hersteller *" name="make" error={e.make}><Input id="make" name="make" placeholder="z. B. BMW" defaultValue={v("make")} required /></Field>
        <Field label="Modell *" name="model" error={e.model}><Input id="model" name="model" placeholder="z. B. M3" defaultValue={v("model")} required /></Field>
        <Field label="Variante" name="variant"><Input id="variant" name="variant" placeholder="z. B. Competition" defaultValue={v("variant")} /></Field>
        <Field label="Fahrzeugklasse *" name="vehicle_class" hint="Grundlage für die Preisberechnung">
          <Select id="vehicle_class" name="vehicle_class" defaultValue={v("vehicle_class") || "kompaktwagen"}>
            {VEHICLE_CLASSES.map((c) => <option key={c} value={c}>{VEHICLE_CLASS_LABELS[c]}</option>)}
          </Select>
        </Field>
        <Field label="Kennzeichen" name="license_plate"><Input id="license_plate" name="license_plate" placeholder="K-AB 1234" defaultValue={v("license_plate")} /></Field>
        <Field label="Baujahr" name="year" error={e.year}><Input id="year" name="year" inputMode="numeric" defaultValue={v("year")} /></Field>
        <Field label="Kilometerstand" name="mileage" error={e.mileage}><Input id="mileage" name="mileage" inputMode="numeric" defaultValue={v("mileage")} /></Field>
        <Field label="Farbe" name="color"><Input id="color" name="color" defaultValue={v("color")} /></Field>
        <Field label="Lackart" name="paint_type">
          <Select id="paint_type" name="paint_type" defaultValue={v("paint_type")}><option value="">–</option>{PAINT.map((p) => <option key={p}>{p}</option>)}</Select>
        </Field>
        <Field label="Innenraum" name="interior_material">
          <Select id="interior_material" name="interior_material" defaultValue={v("interior_material")}><option value="">–</option>{INTERIOR.map((p) => <option key={p}>{p}</option>)}</Select>
        </Field>
        <Field label="Sitzplätze" name="seats" error={e.seats}><Input id="seats" name="seats" inputMode="numeric" defaultValue={v("seats")} /></Field>
        <Field label="Karosserieform" name="body_type"><Input id="body_type" name="body_type" defaultValue={v("body_type")} /></Field>
        <Field label="FIN (optional)" name="vin" error={e.vin} className="sm:col-span-3"><Input id="vin" name="vin" maxLength={17} className="font-mono uppercase" defaultValue={v("vin")} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fahrzeugzustand" name="condition"><Textarea id="condition" name="condition" defaultValue={v("condition")} /></Field>
        <Field label="Bekannte Vorschäden" name="known_damages"><Textarea id="known_damages" name="known_damages" defaultValue={v("known_damages")} /></Field>
        <Field label="Vorhandene Versiegelungen" name="coatings"><Textarea id="coatings" name="coatings" placeholder="z. B. Keramik 2024, 3 Schichten" defaultValue={v("coatings")} /></Field>
        <Field label="Besonderheiten" name="special_notes"><Textarea id="special_notes" name="special_notes" defaultValue={v("special_notes")} /></Field>
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton>{vehicle ? "Änderungen speichern" : onboarding ? "Fahrzeug anlegen & Auftrag erstellen" : "Fahrzeug anlegen"}</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
