"use client";
import { useActionState } from "react";
import { mergeCustomers } from "@/app/actions/customers";
import { Select } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";

export function MergeForm({ sourceId, candidates }: { sourceId: string; candidates: { id: string; name: string }[] }) {
  const [state, action] = useActionState(mergeCustomers, undefined);
  return (
    <form action={action} className="space-y-3" onSubmit={(e) => { if (!confirm("Diesen Kunden wirklich in den ausgewählten Kunden zusammenführen? Fahrzeuge, Angebote und Aufträge werden übertragen.")) e.preventDefault(); }}>
      <input type="hidden" name="source_id" value={sourceId} />
      <Select name="target_id" required defaultValue="">
        <option value="" disabled>Ziel-Kunde auswählen …</option>
        {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
      <FormMessage state={state} />
      <SubmitButton variant="secondary" pendingText="Wird zusammengeführt …">Zusammenführen</SubmitButton>
    </form>
  );
}
