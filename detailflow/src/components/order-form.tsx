"use client";
import { useActionState } from "react";
import { updateOrder } from "@/app/actions/orders";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";

function toLocal(v: string | null) {
  if (!v) return "";
  const d = new Date(v);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function OrderForm({ order, members }: { order: { id: string; assigned_to: string | null; scheduled_start: string | null; scheduled_end: string | null; actual_minutes: number | null; internal_notes: string | null }; members: { id: string; name: string }[] }) {
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Beginn" name="scheduled_start"><Input id="scheduled_start" name="scheduled_start" type="datetime-local" defaultValue={toLocal(order.scheduled_start)} /></Field>
        <Field label="Ende" name="scheduled_end"><Input id="scheduled_end" name="scheduled_end" type="datetime-local" defaultValue={toLocal(order.scheduled_end)} /></Field>
      </div>
      <Field label="Tatsächlicher Zeitaufwand (Minuten)" name="actual_minutes"><Input id="actual_minutes" name="actual_minutes" inputMode="numeric" defaultValue={order.actual_minutes ?? ""} /></Field>
      <Field label="Interne Notizen" name="internal_notes"><Textarea id="internal_notes" name="internal_notes" defaultValue={order.internal_notes ?? ""} /></Field>
      <div className="flex flex-wrap items-center gap-3"><SubmitButton>Speichern</SubmitButton><FormMessage state={state} /></div>
    </form>
  );
}
