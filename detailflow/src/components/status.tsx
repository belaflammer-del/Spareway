import { Badge, type Tone } from "./ui";
import { ORDER_STATUS_LABELS, QUOTE_STATUS_LABELS, type OrderStatus, type QuoteStatus } from "@/lib/domain";

const quoteTone: Record<QuoteStatus, Tone> = { draft: "gray", sent: "blue", accepted: "green", rejected: "red", expired: "amber" };
const orderTone: Record<OrderStatus, Tone> = {
  anfrage: "gray", angebot_erstellt: "gray", bestaetigt: "blue", geplant: "blue", fahrzeug_angenommen: "violet",
  in_bearbeitung: "amber", qualitaetskontrolle: "amber", fertig: "teal", abholbereit: "green", abgeschlossen: "gray", storniert: "red",
};

export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  return <Badge tone={quoteTone[status]}>{QUOTE_STATUS_LABELS[status]}</Badge>;
}
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={orderTone[status]}>{ORDER_STATUS_LABELS[status]}</Badge>;
}
