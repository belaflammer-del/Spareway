"use client";
import { useActionState } from "react";
import { sellVoucherOnSite } from "@/app/actions/vouchers";
import { Input } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";

export function SellVoucherForm() {
  const [state, action] = useActionState(sellVoucherOnSite, undefined);
  return (
    <form action={action} className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Input name="amount" inputMode="decimal" placeholder="Betrag in €" className="w-32" required aria-label="Betrag" />
        <Input name="recipient" placeholder="Für (optional)" className="min-w-0 flex-1" aria-label="Empfänger" />
        <SubmitButton pendingText="…">Gutschein anlegen</SubmitButton>
      </div>
      {state?.message && <p className={`text-sm ${state.ok ? "font-medium" : "text-danger"}`}>{state.message}</p>}
      <FormMessage state={undefined} />
    </form>
  );
}
