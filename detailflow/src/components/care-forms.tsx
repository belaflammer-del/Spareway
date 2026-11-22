"use client";
import { useActionState } from "react";
import { saveCarePlan } from "@/app/actions/care";
import { Input, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";

export function CarePlanForm() {
  const [state, action] = useActionState(saveCarePlan, undefined);
  return (
    <form action={action} className="space-y-2">
      <div className="flex flex-wrap gap-2"><Input name="name" placeholder="z. B. Pflege-Abo Premium" className="min-w-0 flex-1" required /><Input name="price" placeholder="€ / Monat" inputMode="decimal" className="w-32" required /></div>
      <Textarea name="description" placeholder={"Was ist enthalten? z. B.\n• 1× im Monat Handwäsche\n• alle 3 Monate Innenraum"} className="min-h-20" />
      <div className="flex items-center gap-3"><SubmitButton>Abo anbieten</SubmitButton><FormMessage state={state} /></div>
    </form>
  );
}
