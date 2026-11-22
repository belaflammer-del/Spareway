import Link from "next/link";
import QRCode from "qrcode";
import { Card, PageHeader, buttonClass } from "@/components/ui";
import { getContext } from "@/lib/auth";
import { formatEUR } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** QR-Code zur Kartenzahlung vor Ort – der Kunde zahlt mit dem eigenen Handy */
export default async function OnSiteQr({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ u?: string }> }) {
  const { id } = await params;
  const { u } = await searchParams;
  const ctx = await getContext();
  const { data: inv } = await ctx.supabase.from("invoices").select("number, status, total_gross, paid_amount").eq("id", id).maybeSingle();
  const valid = u && /^https:\/\/checkout\.stripe\.com\//.test(u);
  const paid = inv?.status === "paid";
  const svg = valid && !paid ? await QRCode.toString(u!, { type: "svg", margin: 1, width: 320, errorCorrectionLevel: "M" }) : null;
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title={paid ? "Bezahlt ✓" : "Vor Ort bezahlen"} description={inv ? `Rechnung ${inv.number} · offen ${formatEUR(Number(inv.total_gross) - Number(inv.paid_amount))}` : ""} />
      <Card className="flex flex-col items-center gap-4 p-6 text-center">
        {paid ? <p className="text-lg font-medium text-emerald-600">Die Zahlung ist eingegangen.</p>
          : svg ? <>
              <div className="w-full max-w-72 rounded-xl bg-white p-3" dangerouslySetInnerHTML={{ __html: svg }} />
              <p className="text-sm text-muted-foreground">Kunde scannt den Code mit der Handykamera und zahlt mit Karte, Apple Pay oder Google Pay.</p>
            </>
          : <p className="text-sm text-muted-foreground">Kein gültiger Zahlungslink. Bitte erneut erzeugen.</p>}
        <div className="flex gap-2">
          <Link href={`/app/rechnungen/${id}/qr?u=${encodeURIComponent(u ?? "")}`} className={buttonClass("secondary")}>Status prüfen</Link>
          <Link href={`/app/rechnungen/${id}`} className={buttonClass("ghost")}>Zur Rechnung</Link>
        </div>
      </Card>
    </div>
  );
}
