"use client";
import { useActionState } from "react";
import { saveChecklistTemplate, saveWorkstation } from "@/app/actions/operations";
import { Input, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";

export function WorkstationForm() {
  const [state, action] = useActionState(saveWorkstation, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <Input name="name" placeholder="z. B. Box 3 oder Polierkabine" className="max-w-xs" required />
      <SubmitButton pendingText="…">Hinzufügen</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function ChecklistTemplateForm({ template }: { template?: { id: string; name: string; items: string[] } }) {
  const [state, action] = useActionState(saveChecklistTemplate, undefined);
  return (
    <form action={action} className="space-y-2">
      {template && <input type="hidden" name="id" value={template.id} />}
      <Input name="name" defaultValue={template?.name} placeholder="Name der Checkliste" required />
      <Textarea name="items" defaultValue={template?.items.join("\n")} placeholder={"Ein Schritt pro Zeile\nz. B. Kilometerstand notiert"} className="min-h-32" required />
      <div className="flex items-center gap-3"><SubmitButton>{template ? "Speichern" : "Vorlage anlegen"}</SubmitButton><FormMessage state={state} /></div>
    </form>
  );
}
