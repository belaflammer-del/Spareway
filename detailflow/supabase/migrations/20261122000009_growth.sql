-- DetailFlow – Wachstum: Anzahlungen, Gutscheine, Pflege-Abos, Bewertungen, Anfahrt, WhatsApp, Empfehlungsprogramm

alter table public.companies add column google_review_url text check (google_review_url ~ '^https://');
alter table public.companies add column reviews_enabled boolean not null default true;
alter table public.companies add column deposit_cents int not null default 0 check (deposit_cents between 0 and 100000);
alter table public.companies add column vouchers_enabled boolean not null default false;
alter table public.companies add column travel_cost_per_km numeric(6,2) not null default 0 check (travel_cost_per_km >= 0);
alter table public.companies add column referral_code text unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
alter table public.companies add column referred_by uuid references public.companies(id) on delete set null;
update public.companies set referral_code = upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)) where referral_code is null;

alter table public.orders add column review_requested_at timestamptz;

alter table public.messages drop constraint messages_channel_check;
alter table public.messages add constraint messages_channel_check check (channel in ('portal', 'email', 'telefon', 'notiz', 'whatsapp'));

-- ---------------------------------------------------------------------------
-- Anzahlungen (online bei Buchung) – werden später als Zahlung auf die Rechnung angerechnet
-- ---------------------------------------------------------------------------
create table public.order_deposits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  external_id text not null unique,
  applied_invoice_id uuid references public.invoices(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Gutscheine (Mehrzweck-Gutscheine: Umsatzsteuer erst bei Einlösung)
-- ---------------------------------------------------------------------------
create table public.vouchers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  code text not null,
  initial_amount numeric(12,2) not null check (initial_amount > 0 and initial_amount <= 5000),
  balance numeric(12,2) not null check (balance >= 0),
  buyer_name text, buyer_email text, recipient_name text, message text check (char_length(message) <= 300),
  source text not null default 'online' check (source in ('online', 'vor_ort')),
  external_id text unique,
  expires_on date not null default (date_trunc('year', current_date) + interval '4 years' - interval '1 day')::date, -- 3 Jahre zum Jahresende (§ 195 BGB)
  created_at timestamptz not null default now(),
  unique (company_id, code)
);

create table public.voucher_redemptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  voucher_id uuid not null references public.vouchers(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Gutschein vor Ort verkaufen (Inhaber/Admin/Büro)
create or replace function public.create_voucher(p_company uuid, p_amount numeric, p_recipient text)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not public.has_role(p_company, array['owner','admin','office']::member_role[]) then raise exception 'Keine Berechtigung'; end if;
  v_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 4) || '-' || substr(encode(gen_random_bytes(8), 'hex'), 1, 4));
  insert into vouchers(company_id, code, initial_amount, balance, recipient_name, source) values (p_company, v_code, p_amount, p_amount, nullif(trim(p_recipient), ''), 'vor_ort');
  return v_code;
end; $$;

-- Gutschein auf eine finalisierte Rechnung einlösen: Zahlung buchen, Restguthaben reduzieren
create or replace function public.redeem_voucher(p_invoice uuid, p_code text, p_amount numeric default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare inv invoices%rowtype; v vouchers%rowtype; amt numeric; rid uuid;
begin
  select * into inv from invoices where id = p_invoice for update;
  if inv.id is null or not public.has_role(inv.company_id, array['owner','admin','office']::member_role[]) then raise exception 'Rechnung nicht gefunden'; end if;
  if inv.status <> 'finalized' or inv.kind <> 'invoice' then raise exception 'Gutscheine können nur auf offene Rechnungen angerechnet werden'; end if;
  select * into v from vouchers where company_id = inv.company_id and code = upper(trim(p_code)) for update;
  if v.id is null then raise exception 'Gutschein nicht gefunden'; end if;
  if v.expires_on < current_date then raise exception 'Gutschein ist abgelaufen'; end if;
  if v.balance <= 0 then raise exception 'Gutschein ist bereits vollständig eingelöst'; end if;
  amt := least(v.balance, inv.total_gross - inv.paid_amount, coalesce(p_amount, v.balance));
  if amt <= 0 then raise exception 'Kein offener Betrag'; end if;
  insert into voucher_redemptions(company_id, voucher_id, invoice_id, amount, created_by) values (inv.company_id, v.id, inv.id, amt, auth.uid()) returning id into rid;
  update vouchers set balance = balance - amt where id = v.id;
  insert into invoice_payments(company_id, invoice_id, amount, method, external_id, note, created_by)
  values (inv.company_id, inv.id, amt, 'Gutschein', 'voucher:' || rid, 'Gutschein ' || v.code, auth.uid());
  return amt;
end; $$;

-- ---------------------------------------------------------------------------
-- Pflege-Abos, die Betriebe an Endkunden verkaufen (Stripe-Abo auf dem Konto des Betriebs)
-- ---------------------------------------------------------------------------
create table public.care_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  description text check (char_length(description) <= 1000),
  price_cents int not null check (price_cents between 100 and 100000),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.care_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  plan_id uuid references public.care_plans(id) on delete set null,
  stripe_subscription_id text not null unique,
  status text not null,
  customer_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Empfehlungsprogramm
-- ---------------------------------------------------------------------------
create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_company_id uuid not null references public.companies(id) on delete cascade,
  referred_company_id uuid not null unique references public.companies(id) on delete cascade,
  rewarded_at timestamptz,
  created_at timestamptz not null default now(),
  check (referrer_company_id <> referred_company_id)
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['order_deposits','vouchers','voucher_redemptions','care_plans','care_subscriptions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (public.is_member(company_id))', t || '_select', t);
  end loop;
end $$;
-- Pflege-Abo-Angebote pflegen Inhaber/Admin; Gutscheine/Einlösungen/Anzahlungen/Abos nur über Funktionen bzw. Server
create policy care_plans_write on public.care_plans for all
  using (public.has_role(company_id, array['owner','admin']::public.member_role[]))
  with check (public.has_role(company_id, array['owner','admin']::public.member_role[]));
alter table public.referrals enable row level security;
create policy referrals_select on public.referrals for select using (public.has_role(referrer_company_id, array['owner','admin']::public.member_role[]));

-- referral_code / referred_by nicht vom Client änderbar
create or replace function public.protect_referral_fields() returns trigger language plpgsql as $$
begin
  if current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'authenticated'
     and (new.referral_code is distinct from old.referral_code or new.referred_by is distinct from old.referred_by)
     and current_setting('detailflow.internal', true) is distinct from 'on' then
    raise exception 'Empfehlungsdaten können nicht geändert werden';
  end if;
  return new;
end; $$;
create trigger companies_protect_referral before update on public.companies for each row execute function public.protect_referral_fields();
-- Empfehlungscode beim Anlegen einer Firma hinterlegen (nur einmal, nur für die eigene, neue Firma)
create or replace function public.apply_referral(p_company uuid, p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare ref uuid;
begin
  if not public.has_role(p_company, array['owner']::member_role[]) then return false; end if;
  if exists (select 1 from referrals where referred_company_id = p_company) then return false; end if;
  if (select created_at from companies where id = p_company) < now() - interval '1 day' then return false; end if;
  select id into ref from companies where referral_code = upper(trim(p_code)) and id <> p_company;
  if ref is null then return false; end if;
  insert into referrals(referrer_company_id, referred_company_id) values (ref, p_company);
  perform set_config('detailflow.internal', 'on', true);
  update companies set referred_by = ref where id = p_company;
  perform set_config('detailflow.internal', 'off', true);
  return true;
end; $$;

revoke execute on function public.create_voucher(uuid, numeric, text), public.redeem_voucher(uuid, text, numeric), public.apply_referral(uuid, text) from public, anon;
grant execute on function public.create_voucher(uuid, numeric, text), public.redeem_voucher(uuid, text, numeric), public.apply_referral(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Bewertungsanfragen: 1–3 Tage nach Abschluss, einmalig
-- ---------------------------------------------------------------------------
create or replace function public.due_review_requests(now_ts timestamptz default now())
returns table (order_id uuid) language sql stable security definer set search_path = public as $$
  select o.id from orders o join companies c on c.id = o.company_id join customers cu on cu.id = o.customer_id
  where c.reviews_enabled and c.google_review_url is not null and cu.email is not null and o.review_requested_at is null
    and o.status = 'abgeschlossen' and o.completed_at between now_ts - interval '3 days' and now_ts - interval '1 day';
$$;
revoke execute on function public.due_review_requests(timestamptz) from public, anon, authenticated;
grant execute on function public.due_review_requests(timestamptz) to service_role;

create or replace function public.seed_growth_templates(cid uuid)
returns void language sql security definer set search_path = public as $$
  insert into message_templates(company_id, key, name, body) values
  (cid, 'bewertung', 'Bitte um Bewertung', E'Hallo {kunde},\nvielen Dank, dass Sie Ihren {fahrzeug} bei uns haben aufbereiten lassen! Wenn Sie zufrieden waren, freuen wir uns sehr über eine kurze Google-Bewertung:\n{bewertung}\n\nViele Grüße\n{firma}'),
  (cid, 'gutschein', 'Gutschein', E'Hallo {kunde},\nhier ist Ihr Gutschein über {betrag} bei {firma}.\nGutscheincode: {code}\nGültig bis {gueltig}. Einfach bei der Terminanfrage angeben.\n\nViele Grüße\n{firma}')
  on conflict do nothing;
$$;
revoke execute on function public.seed_growth_templates(uuid) from public, anon, authenticated;
select public.seed_growth_templates(id) from public.companies;

create or replace function public.create_company(company_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Nicht angemeldet'; end if;
  if company_name is null or char_length(trim(company_name)) < 2 then raise exception 'Firmenname zu kurz'; end if;
  if (select count(*) from memberships where user_id = uid and role = 'owner') >= 5 then raise exception 'Maximale Anzahl an Firmen erreicht'; end if;
  insert into companies(name) values (trim(company_name)) returning id into cid;
  insert into memberships(company_id, user_id, role, can_edit_prices) values (cid, uid, 'owner', true);
  insert into profiles(user_id) values (uid) on conflict do nothing;
  perform public.seed_company_catalog(cid);
  perform public.seed_company_operations(cid);
  perform public.seed_message_templates(cid);
  perform public.seed_dunning_templates(cid);
  perform public.seed_growth_templates(cid);
  return cid;
end; $$;

-- ---------------------------------------------------------------------------
-- Öffentlich: Buchungsseite mit Anzahlung & Pflege-Abos, Gutscheinseite
-- ---------------------------------------------------------------------------
create or replace function public.get_booking_page(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', c.name, 'city', c.city, 'phone', c.phone, 'opening_hours', c.opening_hours,
    'booking_enabled', c.booking_enabled, 'online_payment', c.stripe_charges_enabled, 'deposit_cents', case when c.stripe_charges_enabled then c.deposit_cents else 0 end,
    'vouchers_enabled', c.vouchers_enabled and c.stripe_charges_enabled,
    'packages', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'description', p.description) order by p.created_at) from packages p where p.company_id = c.id and p.active), '[]'::jsonb),
    'care_plans', case when c.stripe_charges_enabled then coalesce((select jsonb_agg(jsonb_build_object('id', cp.id, 'name', cp.name, 'description', cp.description, 'price_cents', cp.price_cents) order by cp.price_cents) from care_plans cp where cp.company_id = c.id and cp.active), '[]'::jsonb) else '[]'::jsonb end)
  from companies c where c.slug = p_slug and (c.booking_enabled or (c.vouchers_enabled and c.stripe_charges_enabled));
$$;

-- Online-Anfrage, gibt zusätzlich die Auftrags-ID für eine Anzahlung zurück
create or replace function public.submit_booking(p_slug text, req jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare tok text; oid uuid; cid uuid;
begin
  tok := public.submit_booking_request(p_slug, req);
  select id into cid from companies where slug = p_slug;
  select o.id into oid from orders o join customers cu on cu.id = o.customer_id
  where o.company_id = cid and cu.portal_token = tok and o.status = 'anfrage' order by o.created_at desc limit 1;
  return jsonb_build_object('token', tok, 'order_id', oid);
end; $$;
grant execute on function public.submit_booking(text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Zielgruppen-Erweiterung: Folierung & Smart Repair (bei bestehenden Firmen zunächst deaktiviert)
-- ---------------------------------------------------------------------------
insert into public.catalog_template (category_key, category_name, category_sort, name, duration_minutes, applies_soiling, applies_vehicle_class, sort) values
('folie','Folierung & Lackschutz',6,'Vollfolierung (Farbwechsel)',1920,false,true,0),
('folie','Folierung & Lackschutz',6,'PPF Frontpaket (Haube, Stoßfänger, Spiegel)',600,false,true,1),
('folie','Folierung & Lackschutz',6,'PPF Vollfolierung',2400,false,true,2),
('folie','Folierung & Lackschutz',6,'Chrome Delete',300,false,true,3),
('folie','Folierung & Lackschutz',6,'Dachfolierung',240,false,true,4),
('folie','Folierung & Lackschutz',6,'Folie entfernen',240,false,true,5),
('smart','Smart Repair',7,'Kratzer im Lack (Smart Repair)',120,false,false,0),
('smart','Smart Repair',7,'Stoßfänger-Reparatur',180,false,false,1),
('smart','Smart Repair',7,'Felgenreparatur (Bordsteinschaden)',120,false,false,2),
('smart','Smart Repair',7,'Steinschlagreparatur Windschutzscheibe',45,false,false,3),
('smart','Smart Repair',7,'Ausbeulen ohne Lackieren (PDR)',90,false,false,4),
('smart','Smart Repair',7,'Innenraum-Reparatur (Kunststoff/Leder)',90,false,false,5);

insert into public.service_categories(company_id, key, name, sort)
select c.id, t.category_key, t.category_name, t.category_sort from public.companies c
cross join (select distinct category_key, category_name, category_sort from public.catalog_template where category_key in ('folie','smart')) t
on conflict do nothing;
insert into public.services(company_id, category_id, name, duration_minutes, applies_soiling, applies_vehicle_class, sort, active)
select c.id, sc.id, t.name, t.duration_minutes, t.applies_soiling, t.applies_vehicle_class, t.sort, false
from public.companies c join public.catalog_template t on t.category_key in ('folie','smart')
join public.service_categories sc on sc.company_id = c.id and sc.key = t.category_key;
