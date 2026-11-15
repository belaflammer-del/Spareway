"use client";
import { useActionState, useRef } from "react";
import { sendMessage } from "@/app/actions/messages";
import { Select, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";
import { fillTemplate } from "@/lib/invoice";

export function MessageComposer({ customerId, templates, vars, mailReady, orders }: {
  customerId: string; templates: { key: string; name: string; body: string }[]; vars: Record<string, string>; mailReady: boolean; orders: { id: string; label: string }[];
}) {
  const [state, action] = useActionState(sendMessage, undefined);
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="customer_id" value={customerId} />
      <div className="flex flex-wrap gap-2">
        <Select aria-label="Vorlage einfügen" defaultValue="" className="h-9 w-auto text-sm" onChange={(e) => { const t = templates.find((x) => x.key === e.target.value); if (t && ref.current) ref.current.value = fillTemplate(t.body, vars); e.target.value = ""; }}>
          <option value="">Vorlage einfügen …</option>
          {templates.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
        </Select>
        {orders.length > 0 && (
          <Select name="order_id" aria-label="Zu Auftrag" defaultValue={orders[0]?.id ?? ""} className="h-9 w-auto text-sm">
            <option value="">– kein Auftrag –</option>
            {orders.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </Select>
        )}
      </div>
      <Textarea ref={ref} name="body" required placeholder="Nachricht an den Kunden …" className="min-h-28" />
      <div className="flex flex-wrap items-center gap-2">
        <Select name="channel" defaultValue={mailReady ? "email" : "portal"} className="h-10 w-auto" aria-label="Versandweg">
          <option value="portal">Im Kundenportal</option>
          <option value="email">Per E-Mail {mailReady ? "" : "(nicht eingerichtet)"}</option>
          <option value="telefon">Telefonat notieren</option>
          <option value="notiz">Interne Notiz</option>
        </Select>
        <SubmitButton pendingText="Wird gesendet …">Senden</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
