-- DetailFlow – Umsatzbeteiligung: Grundgebühr + 0,5 % der online bezahlten Rechnungen (Stripe Connect)

-- Tarife: Umsatzbeteiligung konfigurierbar (Basispunkte: 50 = 0,5 %), Obergrenze je Monat
alter table public.plans add column revenue_share_bps int not null default 50 check (revenue_share_bps between 0 and 1000);
alter table public.plans add column revenue_share_cap_cents int check (revenue_share_cap_cents >= 0); -- null = keine Obergrenze
update public.plans set price_monthly_cents = case id when 'starter' then 1900 when 'professional' then 2900 else 4900 end,
                        revenue_share_bps = 50, revenue_share_cap_cents = 15000;

-- Stripe Connect je Firma (nur serverseitig per Webhook/Service-Role änderbar)
alter table public.companies add column stripe_account_id text unique;
alter table public.companies add column stripe_charges_enabled boolean not null default false;

create or replace function public.protect_billing_fields() returns trigger language plpgsql as $$
begin
  if current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'authenticated'
     and (new.plan is distinct from old.plan
          or new.stripe_customer_id is distinct from old.stripe_customer_id
          or new.stripe_subscription_id is distinct from old.stripe_subscription_id
          or new.subscription_status is distinct from old.subscription_status
          or new.stripe_account_id is distinct from old.stripe_account_id
          or new.stripe_charges_enabled is distinct from old.stripe_charges_enabled) then
    raise exception 'Tarif- und Zahlungsdaten können nur über die Abrechnung geändert werden';
  end if;
  return new;
end; $$;

-- Online-Zahlungen: externe Referenz verhindert doppelte Buchung bei wiederholten Webhooks
alter table public.invoice_payments add column external_id text;
create unique index invoice_payments_external_id on public.invoice_payments(external_id) where external_id is not null;

-- Plattformgebühren (Umsatzbeteiligung) – Protokoll, nur lesbar für Inhaber/Admin, nur serverseitig schreibbar
create table public.platform_fees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  invoice_id uuid references public.invoices(id) on delete set null,
  payment_external_id text not null unique,
  gross_cents int not null,          -- vom Endkunden bezahlter Betrag
  fee_cents int not null check (fee_cents >= 0),
  month date not null,               -- erster Tag des Abrechnungsmonats (Europe/Berlin)
  created_at timestamptz not null default now()
);
create index on public.platform_fees(company_id, month);
alter table public.platform_fees enable row level security;
create policy platform_fees_select on public.platform_fees for select
  using (public.has_role(company_id, array['owner','admin']::public.member_role[]));
-- keine insert/update/delete-Policies: nur Service-Role (Stripe-Webhook) schreibt

-- Bereits angefallene Gebühren im laufenden Monat (für die Obergrenze)
create or replace function public.platform_fees_this_month(cid uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(fee_cents), 0)::int from platform_fees
  where company_id = cid and month = date_trunc('month', now() at time zone 'Europe/Berlin')::date;
$$;
revoke execute on function public.platform_fees_this_month(uuid) from public, anon, authenticated;

-- Online-Zahlung im Portal möglich? (ohne interne Stripe-IDs preiszugeben)
create or replace function public.get_portal_invoice(token text, p_invoice uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare cu customers%rowtype; inv invoices%rowtype; c companies%rowtype;
begin
  if token is null or length(token) <> 48 then return null; end if;
  select * into cu from customers where portal_token = token and merged_into is null;
  if cu.id is null then return null; end if;
  select * into inv from invoices where id = p_invoice and customer_id = cu.id and status <> 'draft';
  if inv.id is null then return null; end if;
  select * into c from companies where id = inv.company_id;
  return to_jsonb(inv) - array['company_id','customer_id','order_id','created_by','finalized_by','content_hash']
    || jsonb_build_object('cancels_number', (select number from invoices where id = inv.cancels_invoice_id),
       'online_payment', (c.stripe_account_id is not null and c.stripe_charges_enabled and inv.kind = 'invoice' and inv.status = 'finalized'),
       'open_amount', inv.total_gross - inv.paid_amount,
       'items', (select jsonb_agg(to_jsonb(i) - array['id','company_id','invoice_id'] order by sort) from invoice_items i where invoice_id = inv.id));
end; $$;
