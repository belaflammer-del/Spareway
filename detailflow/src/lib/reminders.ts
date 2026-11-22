import "server-only";
import { createAdminClient } from "./supabase/admin";
import { isMailConfigured, sendMail } from "./mailer";
import { env } from "./env";
import { fillTemplate } from "./invoice";
import { customerDisplayName, vehicleDisplayName } from "./domain";
import { formatDate, formatDateTime, formatEUR } from "./utils";

type Admin = ReturnType<typeof createAdminClient>;
const LEVEL_NAME = { 1: "Zahlungserinnerung", 2: "1. Mahnung", 3: "2. Mahnung" } as Record<number, string>;

async function template(db: Admin, companyId: string, key: string) {
  const { data } = await db.from("message_templates").select("body").eq("company_id", companyId).eq("key", key).maybeSingle();
  return data?.body ?? null;
}

/** Terminerinnerung für einen Auftrag per E-Mail senden und im Verlauf speichern */
export async function sendAppointmentReminder(db: Admin, orderId: string) {
  const { data: o } = await db.from("orders").select("id, company_id, customer_id, scheduled_start, companies(name, email), customers(*), vehicles(make, model, variant)").eq("id", orderId).single();
  if (!o) return false;
  const cu = o.customers as unknown as { type: string | null; company_name: string | null; first_name: string | null; last_name: string | null; email: string | null; portal_token: string };
  const co = o.companies as unknown as { name: string; email: string | null };
  const tpl = await template(db, o.company_id, "erinnerung");
  if (!tpl || !cu.email) return false;
  const body = fillTemplate(tpl, {
    kunde: customerDisplayName(cu), firma: co.name, termin: `${formatDateTime(o.scheduled_start)} Uhr`, portal: `${env.appUrl}/portal/${cu.portal_token}`,
    fahrzeug: o.vehicles ? vehicleDisplayName(o.vehicles as unknown as Parameters<typeof vehicleDisplayName>[0]) : "Fahrzeug",
  });
  const r = await sendMail({ to: cu.email, subject: `Terminerinnerung – ${co.name}`, text: body, replyTo: co.email });
  if (!r.ok) return false;
  await db.from("messages").insert({ company_id: o.company_id, customer_id: o.customer_id, order_id: o.id, direction: "out", channel: "email", body, email_status: "sent" });
  await db.from("orders").update({ reminder_sent_at: new Date().toISOString() }).eq("id", o.id);
  return true;
}

/** Mahnstufe für eine Rechnung senden; die Stufe wird nur bei erfolgreichem Versand protokolliert */
export async function sendDunning(db: Admin, invoiceId: string, level: number) {
  const { data: inv } = await db.from("invoices").select("id, number, company_id, customer_id, total_gross, paid_amount, due_date, status, companies(name, email), customers(*)").eq("id", invoiceId).single();
  if (!inv || inv.status !== "finalized") return false;
  const cu = inv.customers as unknown as { type: string | null; company_name: string | null; first_name: string | null; last_name: string | null; email: string | null; portal_token: string };
  const co = inv.companies as unknown as { name: string; email: string | null };
  const tpl = await template(db, inv.company_id, `mahnung${level}`);
  if (!tpl || !cu.email) return false;
  const body = fillTemplate(tpl, {
    kunde: customerDisplayName(cu), firma: co.name, rechnung: inv.number, betrag: formatEUR(Number(inv.total_gross) - Number(inv.paid_amount)),
    faellig: formatDate(inv.due_date), portal: `${env.appUrl}/portal/${cu.portal_token}`,
  });
  const r = await sendMail({ to: cu.email, subject: `${LEVEL_NAME[level]} zu Rechnung ${inv.number} – ${co.name}`, text: body, replyTo: co.email });
  if (!r.ok) return false;
  const { error } = await db.from("invoice_reminders").insert({ company_id: inv.company_id, invoice_id: inv.id, level });
  if (error) return false; // Stufe bereits versendet (parallel)
  await db.from("messages").insert({ company_id: inv.company_id, customer_id: inv.customer_id, direction: "out", channel: "email", body, email_status: "sent" });
  return true;
}

/** Bitte um Google-Bewertung nach abgeschlossenem Auftrag */
export async function sendReviewRequest(db: Admin, orderId: string) {
  const { data: o } = await db.from("orders").select("id, company_id, customer_id, review_requested_at, companies(name, email, google_review_url), customers(*), vehicles(make, model, variant)").eq("id", orderId).single();
  const co = o?.companies as unknown as { name: string; email: string | null; google_review_url: string | null } | undefined;
  if (!o || o.review_requested_at || !co?.google_review_url) return false;
  const cu = o.customers as unknown as { type: string | null; company_name: string | null; first_name: string | null; last_name: string | null; email: string | null };
  const tpl = await template(db, o.company_id, "bewertung");
  if (!tpl || !cu.email) return false;
  const body = fillTemplate(tpl, { kunde: customerDisplayName(cu), firma: co.name, bewertung: co.google_review_url,
    fahrzeug: o.vehicles ? vehicleDisplayName(o.vehicles as unknown as Parameters<typeof vehicleDisplayName>[0]) : "Fahrzeug" });
  const r = await sendMail({ to: cu.email, subject: `Wie zufrieden waren Sie? – ${co.name}`, text: body, replyTo: co.email });
  if (!r.ok) return false;
  await db.from("messages").insert({ company_id: o.company_id, customer_id: o.customer_id, order_id: o.id, direction: "out", channel: "email", body, email_status: "sent" });
  await db.from("orders").update({ review_requested_at: new Date().toISOString() }).eq("id", o.id);
  return true;
}

/** Täglicher Lauf: alle fälligen Erinnerungen, Mahnungen und Bewertungsanfragen senden */
export async function runDailyReminders() {
  if (!isMailConfigured()) return { skipped: "E-Mail-Versand nicht eingerichtet", reminders: 0, dunning: 0, reviewRequests: 0 };
  const db = createAdminClient();
  const [{ data: appts }, { data: dun }, { data: reviews }] = await Promise.all([db.rpc("due_appointment_reminders"), db.rpc("due_dunning"), db.rpc("due_review_requests")]);
  let reminders = 0, dunning = 0, reviewRequests = 0;
  for (const r of (reviews ?? []) as { order_id: string }[]) if (await sendReviewRequest(db, r.order_id)) reviewRequests++;
  for (const a of (appts ?? []) as { order_id: string }[]) if (await sendAppointmentReminder(db, a.order_id)) reminders++;
  for (const d of (dun ?? []) as { invoice_id: string; level: number }[]) if (await sendDunning(db, d.invoice_id, d.level)) dunning++;
  return { reminders, dunning, reviewRequests };
}
