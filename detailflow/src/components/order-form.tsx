"use client";
import { useActionState } from "react";
import { updateOrder } from "@/app/actions/orders";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";

import { isoToBerlinLocal as toLocal } from "@/lib/time";

export function OrderForm({ order, members, workstations }: { order: { id: string; workstation_id: string | null; assigned_to: string | null; scheduled_start: string | null; scheduled_end: string | null; actual_minutes: number | null; internal_notes: string | null }; members: { id: string; name: string }[]; workstations: { id: string; name: string }[] }) {
  const [state, action] = useActionState(updateOrder, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={order.id} />
      <Field label="Verantwortlich" name="assigned_to">
        <Select id="assigned_to" name="assigned_to" defaultValue={order.assigned_to ?? ""}>
          <option value="">– niemand –</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
      </Field>
      <Field label="Arbeitsplatz / Box" name="workstation_id" hint="Eine Box kann nicht doppelt belegt werden.">
        <Select id="workstation_id" name="workstation_id" defaultValue={order.workstation_id ?? ""}>
          <option value="">– keine –</option>
          {workstations.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Beginn" name="scheduled_start"><Input id="scheduled_start" name="scheduled_start" type="datetime-local" defaultValue={toLocal(order.scheduled_start)} /></Field>
        <Field label="Ende" name="scheduled_end" hint="Leer = Beginn + geschätzte Dauer"><Input id="scheduled_end" name="scheduled_end" type="datetime-local" defaultValue={toLocal(order.scheduled_end)} /></Field>
      </div>
      <Field label="Tatsächlicher Zeitaufwand (Minuten)" name="actual_minutes"><Input id="actual_minutes" name="actual_minutes" inputMode="numeric" defaultValue={order.actual_minutes ?? ""} /></Field>
      <Field label="Interne Notizen" name="internal_notes"><Textarea id="internal_notes" name="internal_notes" defaultValue={order.internal_notes ?? ""} /></Field>
      <div className="flex flex-wrap items-center gap-3"><SubmitButton>Speichern</SubmitButton><FormMessage state={state} /></div>
    </form>
  );
}
