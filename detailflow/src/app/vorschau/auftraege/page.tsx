import { Plus } from "lucide-react";
import { LinkButton, PageHeader } from "@/components/ui";
import { ORDER_BOARD_COLUMNS, ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/domain";
import { formatEUR } from "@/lib/utils";
import { orders } from "../demo";

export default function PreviewOrders() {
  return (
    <>
      <PageHeader title="Aufträge" actions={<>
        <div className="inline-flex rounded-lg bg-muted p-1 text-sm"><span className="rounded-md bg-card px-3 py-1 font-medium shadow-sm">Board</span><span className="px-3 py-1 text-muted-foreground">Liste</span></div>
        <LinkButton href="/vorschau/kalkulator"><Plus className="size-4" />Neuer Auftrag</LinkButton>
      </>} />
      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
        <div className="flex gap-3">
          {ORDER_BOARD_COLUMNS.map((s) => {
            const col = orders.filter((o) => o.status === s);
            return (
              <div key={s} className="w-64 shrink-0">
                <div className="mb-2 flex items-center justify-between px-1 text-sm"><span className="font-medium">{ORDER_STATUS_LABELS[s as OrderStatus]}</span><span className="text-muted-foreground">{col.length}</span></div>
                <div className="min-h-24 space-y-2 rounded-xl bg-muted/60 p-2">
                  {col.map((o) => (
                    <div key={o.id} className="rounded-xl border border-border bg-card p-3 shadow-xs">
                      <p className="text-sm font-medium">{o.vehicle}</p><p className="truncate text-xs text-muted-foreground">{o.customer}</p>
                      <p className="mt-1 line-clamp-2 text-xs">{o.title}</p>
                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground"><span>{o.time ? `Heute ${o.time}` : o.number}</span><span className="tabular-nums">{o.total ? formatEUR(o.total) : "–"}</span></div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
