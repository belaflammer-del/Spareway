-- DetailFlow – Phase 4: Rechnungen (inkl. E-Rechnung), Kundenportal, Online-Anfragen, Nachrichten

-- ---------------------------------------------------------------------------
-- Firmen: öffentliche Buchungsseite
-- ---------------------------------------------------------------------------
alter table public.companies add column slug text unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$');
alter table public.companies add column booking_enabled boolean not null default false;
alter table public.companies add column payment_terms_days int not null default 14 check (payment_terms_days between 0 and 120);
alter table public.companies add column contact_name text;
alter table public.customers add column vat_id text;
alter table public.customers add column buyer_reference text; -- z. B. Leitweg-ID bei öffentlichen Auftraggebern

-- ---------------------------------------------------------------------------
-- Rechnungen
-- ---------------------------------------------------------------------------
create type public.invoice_status as enum ('draft', 'finalized', 'paid', 'cancelled');
create type public.invoice_kind as enum ('invoice', 'cancellation');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  number text,                       -- wird erst beim Finalisieren vergeben (lückenlos)
  kind public.invoice_kind not null default 'invoice',
  status public.invoice_status not null default 'draft',
  customer_id uuid not null references public.customers(id),
  order_id uuid references public.orders(id) on delete set null,
  cancels_invoice_id uuid references public.invoices(id),
  issue_date date,
  service_date date not null default current_date,   -- Leistungsdatum (§ 14 UStG)
  due_date date,
  intro_text text,
  payment_terms text,
  subtotal_net numeric(12,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  total_gross numeric(12,2) not null default 0,
  paid_amount numeric(12,2) not null default 0,
  paid_at timestamptz,
  seller_snapshot jsonb,             -- Firmendaten zum Zeitpunkt der Finalisierung
  buyer_snapshot jsonb,              -- Kundendaten zum Zeitpunkt der Finalisierung
  content_hash text,                 -- SHA-256 über den finalisierten Inhalt (Manipulationsnachweis)
  finalized_at timestamptz,
  finalized_by uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, number)
);
create index on public.invoices(company_id, status);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  description text,
  quantity numeric(10,2) not null default 1 check (quantity <> 0),
  unit text not null default 'C62',   -- UN/ECE Rec 20: C62 = Stück
  unit_price_net numeric(12,2) not null,
  tax_rate numeric(5,2) not null check (tax_rate between 0 and 100),
  total_net numeric(12,2) not null,
  sort int not null default 0
);
create index on public.invoice_items(invoice_id);

create table public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  amount numeric(12,2) not null check (amount <> 0),
  paid_on date not null default current_date,
  method text not null default 'Überweisung',
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create trigger invoices_updated before update on public.invoices for each row execute function public.set_updated_at();

-- Finalisierte Rechnungen sind unveränderbar (GoBD). Erlaubt bleiben nur Zahlungs- und Stornostatus.
create or replace function public.protect_finalized_invoice() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'Finalisierte Rechnungen können nicht gelöscht werden (Storno verwenden)'; end if;
    return old;
  end if;
  if old.status <> 'draft' then
    if (to_jsonb(new) - array['status','paid_amount','paid_at','updated_at']) is distinct from (to_jsonb(old) - array['status','paid_amount','paid_at','updated_at']) then
      raise exception 'Finalisierte Rechnungen sind unveränderbar. Bitte eine Stornorechnung erstellen.';
    end if;
    if new.status = 'draft' then raise exception 'Eine finalisierte Rechnung kann nicht zurück in den Entwurf'; end if;
  end if;
  return new;
end; $$;
create trigger invoices_protect before update or delete on public.invoices for each row execute function public.protect_finalized_invoice();

create or replace function public.protect_finalized_invoice_items() returns trigger
language plpgsql security definer set search_path = public as $$
declare st public.invoice_status;
begin
  select status into st from invoices where id = coalesce(new.invoice_id, old.invoice_id);
  if st is not null and st <> 'draft' then raise exception 'Positionen einer finalisierten Rechnung sind unveränderbar'; end if;
  return coalesce(new, old);
end; $$;
create trigger invoice_items_protect before insert or update or delete on public.invoice_items for each row execute function public.protect_finalized_invoice_items();

-- Zahlungen sind nicht änderbar, nur durch Gegenbuchung korrigierbar
create or replace function public.protect_payments() returns trigger language plpgsql as $$
begin raise exception 'Zahlungen können nicht geändert oder gelöscht werden (Gegenbuchung erfassen)'; end; $$;
create trigger invoice_payments_protect before update or delete on public.invoice_payments for each row execute function public.protect_payments();

-- Zahlungsstand automatisch pflegen
create or replace function public.apply_payment() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv invoices%rowtype; total numeric;
begin
  select * into inv from invoices where id = new.invoice_id for update;
  if inv.status not in ('finalized', 'paid') then raise exception 'Zahlungen nur für finalisierte Rechnungen'; end if;
  select coalesce(sum(amount), 0) into total from invoice_payments where invoice_id = new.invoice_id;
  update invoices set paid_amount = total,
    status = case when total >= total_gross then 'paid'::invoice_status else 'finalized'::invoice_status end,
    paid_at = case when total >= total_gross then now() else null end
  where id = new.invoice_id;
  return new;
end; $$;
create trigger invoice_payments_apply after insert on public.invoice_payments for each row execute function public.apply_payment();

-- Summen eines Entwurfs aus den Positionen berechnen (Steuer je Steuersatz gerundet)
create or replace function public.recalc_invoice(p_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare net numeric; tax numeric;
begin
  select coalesce(sum(total_net), 0) into net from invoice_items where invoice_id = p_id;
  select coalesce(sum(round(s * r / 100, 2)), 0) into tax from (select sum(total_net) s, tax_rate r from invoice_items where invoice_id = p_id group by tax_rate) t;
  update invoices set subtotal_net = net, tax_total = tax, total_gross = net + tax where id = p_id and status = 'draft';
end; $$;

-- Rechnungsentwurf aus Auftrag
create or replace function public.create_invoice_from_order(p_order uuid)
returns uuid language plpgsql security invoker set search_path = public as $$
declare o orders%rowtype; inv uuid; c companies%rowtype;
begin
  select * into o from orders where id = p_order;
  if o.id is null then raise exception 'Auftrag nicht gefunden'; end if;
  select id into inv from invoices where order_id = p_order and kind = 'invoice' and status <> 'cancelled' limit 1;
  if inv is not null then return inv; end if;
  select * into c from companies where id = o.company_id;
  insert into invoices(company_id, customer_id, order_id, service_date, payment_terms, created_by)
  values (o.company_id, o.customer_id, o.id, coalesce((o.completed_at at time zone 'Europe/Berlin')::date, (o.scheduled_start at time zone 'Europe/Berlin')::date, current_date),
          format('Zahlbar innerhalb von %s Tagen ohne Abzug.', c.payment_terms_days), auth.uid())
  returning id into inv;
  insert into invoice_items(company_id, invoice_id, title, quantity, unit_price_net, tax_rate, total_net, sort)
  select company_id, inv, title, quantity, unit_price_net, case when c.small_business then 0 else tax_rate end, total_net, sort
  from order_items where order_id = p_order;
  perform public.recalc_invoice(inv);
  return inv;
end; $$;

-- Finalisieren: Nummer vergeben, Daten einfrieren, Hash bilden
create or replace function public.finalize_invoice(p_id uuid)
returns text language plpgsql security invoker set search_path = public as $$
declare inv invoices%rowtype; c companies%rowtype; cu customers%rowtype; num text;
begin
  select * into inv from invoices where id = p_id for update;
  if inv.id is null then raise exception 'Rechnung nicht gefunden'; end if;
  if inv.status <> 'draft' then raise exception 'Rechnung ist bereits finalisiert'; end if;
  if not exists (select 1 from invoice_items where invoice_id = p_id) then raise exception 'Die Rechnung hat keine Positionen'; end if;
  if not public.has_role(inv.company_id, array['owner','admin','office']::member_role[]) then raise exception 'Keine Berechtigung zum Finalisieren'; end if;
  select * into c from companies where id = inv.company_id;
  if c.street is null or c.zip is null or c.city is null then raise exception 'Bitte zuerst die Firmenadresse in den Einstellungen hinterlegen'; end if;
  if c.tax_id is null and c.vat_id is null then raise exception 'Bitte zuerst Steuernummer oder USt-IdNr. in den Einstellungen hinterlegen'; end if;
  select * into cu from customers where id = inv.customer_id;
  perform public.recalc_invoice(p_id);
  select * into inv from invoices where id = p_id;
  num := public.next_document_number(inv.company_id, 'invoice');
  update invoices set
    number = num, status = 'finalized', issue_date = current_date,
    due_date = coalesce(inv.due_date, current_date + c.payment_terms_days),
    seller_snapshot = jsonb_build_object('name', c.name, 'legal_form', c.legal_form, 'street', c.street, 'zip', c.zip, 'city', c.city, 'country', c.country,
      'phone', c.phone, 'email', c.email, 'contact_name', c.contact_name, 'tax_id', c.tax_id, 'vat_id', c.vat_id, 'small_business', c.small_business,
      'bank_name', c.bank_name, 'iban', c.iban, 'bic', c.bic),
    buyer_snapshot = jsonb_build_object('type', cu.type, 'name', coalesce(nullif(cu.company_name, ''), concat_ws(' ', cu.first_name, cu.last_name)),
      'contact', cu.contact_person, 'street', coalesce(cu.billing_street, cu.street), 'zip', coalesce(cu.billing_zip, cu.zip),
      'city', coalesce(cu.billing_city, cu.city), 'country', 'DE', 'email', cu.email, 'vat_id', cu.vat_id, 'buyer_reference', cu.buyer_reference),
    finalized_at = now(), finalized_by = auth.uid()
  where id = p_id;
  return num;
end; $$;

-- Hash direkt beim Statuswechsel auf finalized setzen (vor dem Unveränderbarkeits-Trigger)
create or replace function public.hash_invoice() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare items jsonb;
begin
  if new.status = 'finalized' and old.status = 'draft' then
    select jsonb_agg(to_jsonb(i) - array['id','company_id','invoice_id'] order by sort) into items from invoice_items i where invoice_id = new.id;
    new.content_hash := encode(digest(concat_ws('|', new.number, new.company_id, new.issue_date, new.service_date, new.subtotal_net, new.tax_total,
      new.total_gross, new.seller_snapshot::text, new.buyer_snapshot::text, items::text), 'sha256'), 'hex');
  end if;
  return new;
end; $$;
create trigger invoices_a_hash before update on public.invoices for each row execute function public.hash_invoice();

-- Stornorechnung: vollständige Gegenbuchung, Original wird „storniert“
create or replace function public.cancel_invoice(p_id uuid)
returns uuid language plpgsql security invoker set search_path = public as $$
declare inv invoices%rowtype; st uuid;
begin
  select * into inv from invoices where id = p_id for update;
  if inv.id is null then raise exception 'Rechnung nicht gefunden'; end if;
  if inv.kind <> 'invoice' or inv.status not in ('finalized', 'paid') then raise exception 'Nur finalisierte Rechnungen können storniert werden'; end if;
  insert into invoices(company_id, kind, customer_id, order_id, cancels_invoice_id, service_date, intro_text, payment_terms, created_by)
  values (inv.company_id, 'cancellation', inv.customer_id, inv.order_id, inv.id, inv.service_date,
          format('Stornorechnung zu Rechnung %s vom %s.', inv.number, to_char(inv.issue_date, 'DD.MM.YYYY')), null, auth.uid())
  returning id into st;
  insert into invoice_items(company_id, invoice_id, title, description, quantity, unit, unit_price_net, tax_rate, total_net, sort)
  select company_id, st, title, description, -quantity, unit, unit_price_net, tax_rate, -total_net, sort from invoice_items where invoice_id = p_id;
  perform public.finalize_invoice(st);
  update invoices set status = 'cancelled' where id = p_id;
  return st;
end; $$;

-- Protokoll
create trigger audit_invoices after update of status or delete on public.invoices for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------------
-- Nachrichten & Kundenportal
-- ---------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  direction text not null check (direction in ('in', 'out')),
  channel text not null default 'portal' check (channel in ('portal', 'email', 'telefon', 'notiz')),
  body text not null check (char_length(body) between 1 and 5000),
  author_id uuid references auth.users(id) on delete set null,
  read_at timestamptz,
  email_status text,       -- null = nicht per E-Mail versendet; 'sent' / 'failed'
  created_at timestamptz not null default now()
);
create index on public.messages(company_id, customer_id, created_at desc);

-- Persönlicher Portal-Link je Kunde (geheim, widerrufbar)
alter table public.customers add column portal_token text unique default encode(gen_random_bytes(24), 'hex');

create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  key text not null,
  name text not null,
  body text not null,
  unique (company_id, key)
);

-- Gleiche-Firma-Prüfung
create or replace function public.check_message_company() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select company_id from customers where id = new.customer_id) is distinct from new.company_id then raise exception 'Kunde gehört nicht zu dieser Firma'; end if;
  if new.order_id is not null and (select company_id from orders where id = new.order_id) is distinct from new.company_id then raise exception 'Auftrag gehört nicht zu dieser Firma'; end if;
  return new;
end; $$;
create trigger messages_same_company before insert or update on public.messages for each row execute function public.check_message_company();

create or replace function public.check_invoice_company() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'invoices' then
    if (select company_id from customers where id = new.customer_id) is distinct from new.company_id then raise exception 'Kunde gehört nicht zu dieser Firma'; end if;
    if new.order_id is not null and (select company_id from orders where id = new.order_id) is distinct from new.company_id then raise exception 'Auftrag gehört nicht zu dieser Firma'; end if;
  else
    if (select company_id from invoices where id = new.invoice_id) is distinct from new.company_id then raise exception 'Rechnung gehört nicht zu dieser Firma'; end if;
  end if;
  return new;
end; $$;
create trigger invoices_same_company before insert on public.invoices for each row execute function public.check_invoice_company();
create trigger invoice_items_same_company before insert or update on public.invoice_items for each row execute function public.check_invoice_company();
create trigger invoice_payments_same_company before insert on public.invoice_payments for each row execute function public.check_invoice_company();

-- RLS
do $$
declare t text;
begin
  foreach t in array array['invoices','invoice_items','invoice_payments','messages','message_templates'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.prevent_company_change()', t || '_lock_company', t);
    execute format('create policy %I on public.%I for select using (public.is_member(company_id))', t || '_select', t);
  end loop;
  -- Rechnungen: Entwürfe anlegen/bearbeiten alle Mitglieder; Finalisieren/Storno nur Inhaber/Admin/Büro (in den Funktionen geprüft)
  foreach t in array array['invoices','invoice_items','messages'] loop
    execute format('create policy %I on public.%I for insert with check (public.is_member(company_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update using (public.is_member(company_id)) with check (public.is_member(company_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete using (public.has_role(company_id, array[''owner'',''admin'',''office'']::public.member_role[]))', t || '_delete', t);
  end loop;
  execute 'create policy invoice_payments_insert on public.invoice_payments for insert with check (public.has_role(company_id, array[''owner'',''admin'',''office'']::public.member_role[]))';
  execute 'create policy message_templates_write on public.message_templates for all using (public.has_role(company_id, array[''owner'',''admin'',''office'']::public.member_role[])) with check (public.has_role(company_id, array[''owner'',''admin'',''office'']::public.member_role[]))';
end $$;

-- Statuswechsel auf finalized/cancelled nur Inhaber/Admin/Büro (auch per direktem UPDATE)
create or replace function public.guard_invoice_status() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status and new.status in ('finalized','cancelled')
     and current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'authenticated'
     and not public.has_role(new.company_id, array['owner','admin','office']::public.member_role[]) then
    raise exception 'Keine Berechtigung';
  end if;
  return new;
end; $$;
create trigger invoices_0_guard before update on public.invoices for each row execute function public.guard_invoice_status();

revoke execute on function public.create_invoice_from_order(uuid) from public, anon;
revoke execute on function public.finalize_invoice(uuid) from public, anon;
revoke execute on function public.cancel_invoice(uuid) from public, anon;
revoke execute on function public.recalc_invoice(uuid) from public, anon;
grant execute on function public.create_invoice_from_order(uuid), public.finalize_invoice(uuid), public.cancel_invoice(uuid), public.recalc_invoice(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Öffentlicher Zugang (anon) – nur über geheime Tokens bzw. Buchungsseite
-- ---------------------------------------------------------------------------
create or replace function public.get_portal(token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare cu customers%rowtype; c companies%rowtype;
begin
  if token is null or length(token) <> 48 then return null; end if;
  select * into cu from customers where portal_token = token and merged_into is null;
  if cu.id is null then return null; end if;
  select * into c from companies where id = cu.company_id;
  return jsonb_build_object(
    'company', jsonb_build_object('name', c.name, 'phone', c.phone, 'email', c.email, 'street', c.street, 'zip', c.zip, 'city', c.city),
    'customer', jsonb_build_object('name', coalesce(nullif(cu.company_name, ''), concat_ws(' ', cu.first_name, cu.last_name))),
    'orders', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'number', o.number, 'status', o.status, 'title', o.title,
        'scheduled_start', o.scheduled_start, 'total_gross', o.total_gross,
        'vehicle', (select concat_ws(' ', v.make, v.model) from vehicles v where v.id = o.vehicle_id),
        'photos', coalesce((select jsonb_agg(p.storage_path order by p.created_at) from order_photos p where p.order_id = o.id and p.category in ('vorher','nachher')), '[]'::jsonb))
        order by o.created_at desc) from orders o where o.customer_id = cu.id and o.status <> 'storniert'), '[]'::jsonb),
    'quotes', coalesce((select jsonb_agg(jsonb_build_object('number', q.number, 'status', q.status, 'total_gross', q.total_gross, 'token', q.public_token) order by q.created_at desc)
        from quotes q where q.customer_id = cu.id and q.status in ('sent','accepted')), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'number', i.number, 'kind', i.kind, 'status', i.status, 'total_gross', i.total_gross, 'issue_date', i.issue_date, 'due_date', i.due_date) order by i.issue_date desc)
        from invoices i where i.customer_id = cu.id and i.status <> 'draft'), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('direction', m.direction, 'body', m.body, 'created_at', m.created_at) order by m.created_at)
        from messages m where m.customer_id = cu.id and m.channel in ('portal','email')), '[]'::jsonb)
  );
end; $$;

create or replace function public.portal_send_message(token text, body text)
returns void language plpgsql security definer set search_path = public as $$
declare cu customers%rowtype;
begin
  if token is null or length(token) <> 48 then raise exception 'Ungültiger Link'; end if;
  if body is null or char_length(trim(body)) < 1 or char_length(body) > 2000 then raise exception 'Bitte eine Nachricht (max. 2000 Zeichen) eingeben'; end if;
  select * into cu from customers where portal_token = token and merged_into is null;
  if cu.id is null then raise exception 'Ungültiger Link'; end if;
  if (select count(*) from messages where customer_id = cu.id and direction = 'in' and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Zu viele Nachrichten. Bitte später erneut versuchen.';
  end if;
  insert into messages(company_id, customer_id, direction, channel, body) values (cu.company_id, cu.id, 'in', 'portal', trim(body));
end; $$;

-- Online-Anfrage über die Buchungsseite: legt Kunde (oder findet ihn per E-Mail), Fahrzeug, Anfrage-Auftrag und Nachricht an
create or replace function public.get_booking_page(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', c.name, 'city', c.city, 'phone', c.phone, 'opening_hours', c.opening_hours,
    'packages', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'description', p.description) order by p.created_at) from packages p where p.company_id = c.id and p.active), '[]'::jsonb))
  from companies c where c.slug = p_slug and c.booking_enabled;
$$;

create or replace function public.submit_booking_request(p_slug text, req jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; cu uuid; v uuid; o uuid; v_email text := lower(trim(req->>'email')); tok text; pkg text;
begin
  select * into c from companies where slug = p_slug and booking_enabled;
  if c.id is null then raise exception 'Buchungsseite nicht gefunden'; end if;
  if coalesce(char_length(trim(req->>'name')), 0) < 2 then raise exception 'Bitte deinen Namen angeben'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Bitte eine gültige E-Mail-Adresse angeben'; end if;
  if coalesce(char_length(req->>'message'), 0) > 2000 then raise exception 'Nachricht zu lang'; end if;
  if (select count(*) from orders where company_id = c.id and status = 'anfrage' and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Gerade gehen sehr viele Anfragen ein. Bitte später erneut versuchen oder anrufen.';
  end if;
  select id, portal_token into cu, tok from customers where company_id = c.id and lower(customers.email) = v_email and merged_into is null limit 1;
  if cu is null then
    insert into customers(company_id, type, last_name, email, phone, notes)
    values (c.id, 'private', left(trim(req->>'name'), 80), v_email, left(req->>'phone', 60), 'Über die Online-Anfrage angelegt.')
    returning id, portal_token into cu, tok;
  end if;
  if coalesce(trim(req->>'make'), '') <> '' then
    insert into vehicles(company_id, customer_id, make, model, license_plate, vehicle_class)
    values (c.id, cu, left(trim(req->>'make'), 60), left(coalesce(nullif(trim(req->>'model'), ''), '–'), 80), left(req->>'plate', 20),
            coalesce(nullif(req->>'vehicle_class', '')::vehicle_class, 'kompaktwagen'))
    returning id into v;
  end if;
  select name into pkg from packages where id = nullif(req->>'package_id', '')::uuid and company_id = c.id;
  insert into orders(company_id, number, customer_id, vehicle_id, status, title, internal_notes)
  values (c.id, 'ANF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)), cu, v, 'anfrage',
          coalesce('Anfrage: ' || pkg, 'Online-Anfrage'), nullif(concat_ws(E'\n', 'Wunschtermin: ' || nullif(req->>'wish_date', ''), req->>'message'), ''))
  returning id into o;
  insert into messages(company_id, customer_id, order_id, direction, channel, body)
  values (c.id, cu, o, 'in', 'portal', concat_ws(E'\n', 'Neue Online-Anfrage' || coalesce(' für „' || pkg || '“', ''),
          'Fahrzeug: ' || nullif(concat_ws(' ', req->>'make', req->>'model', req->>'plate'), ''),
          'Wunschtermin: ' || nullif(req->>'wish_date', ''), nullif(req->>'message', '')));
  return tok;
end; $$;

grant execute on function public.get_portal(text), public.portal_send_message(text, text), public.get_booking_page(text), public.submit_booking_request(text, jsonb) to anon, authenticated;

-- Standard-Nachrichtenvorlagen (Platzhalter: {kunde} {fahrzeug} {termin} {firma} {betrag} {portal})
create or replace function public.seed_message_templates(cid uuid)
returns void language sql security definer set search_path = public as $$
  insert into message_templates(company_id, key, name, body) values
  (cid, 'termin', 'Terminbestätigung', E'Hallo {kunde},\nwir bestätigen Ihren Termin am {termin} für Ihren {fahrzeug}.\nBitte bringen Sie den Schlüssel und ggf. Felgenschlosschlüssel mit.\n\nViele Grüße\n{firma}'),
  (cid, 'erinnerung', 'Terminerinnerung', E'Hallo {kunde},\nkurze Erinnerung an Ihren Termin morgen ({termin}) für Ihren {fahrzeug}.\n\nViele Grüße\n{firma}'),
  (cid, 'fertig', 'Fahrzeug abholbereit', E'Hallo {kunde},\nIhr {fahrzeug} ist fertig und kann abgeholt werden. Vorher/Nachher-Fotos finden Sie in Ihrem Kundenbereich: {portal}\n\nViele Grüße\n{firma}'),
  (cid, 'pflege', 'Pflegehinweise nach Versiegelung', E'Hallo {kunde},\ndamit die Versiegelung lange hält:\n• 7 Tage keine Waschanlage und keine Reinigungsmittel\n• Vogelkot und Insekten zeitnah mit Wasser entfernen\n• Handwäsche mit pH-neutralem Shampoo\n\nViele Grüße\n{firma}'),
  (cid, 'rechnung', 'Rechnung versendet', E'Hallo {kunde},\nanbei bzw. in Ihrem Kundenbereich finden Sie Ihre Rechnung über {betrag}: {portal}\n\nVielen Dank für Ihren Auftrag!\n{firma}'),
  (cid, 'antwort', 'Antwort auf Anfrage', E'Hallo {kunde},\nvielen Dank für Ihre Anfrage. Gerne erstellen wir Ihnen ein Angebot. Passt Ihnen ein Termin am …?\n\nViele Grüße\n{firma}')
  on conflict do nothing;
$$;
revoke execute on function public.seed_message_templates(uuid) from public, anon, authenticated;

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
  return cid;
end; $$;
select public.seed_message_templates(id) from public.companies;

-- Rechnung im Kundenportal ansehen (nur eigene, finalisierte Rechnungen des Token-Inhabers)
create or replace function public.get_portal_invoice(token text, p_invoice uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare cu customers%rowtype; inv invoices%rowtype;
begin
  if token is null or length(token) <> 48 then return null; end if;
  select * into cu from customers where portal_token = token and merged_into is null;
  if cu.id is null then return null; end if;
  select * into inv from invoices where id = p_invoice and customer_id = cu.id and status <> 'draft';
  if inv.id is null then return null; end if;
  return to_jsonb(inv) - array['company_id','customer_id','order_id','created_by','finalized_by','content_hash']
    || jsonb_build_object('cancels_number', (select number from invoices where id = inv.cancels_invoice_id),
       'items', (select jsonb_agg(to_jsonb(i) - array['id','company_id','invoice_id'] order by sort) from invoice_items i where invoice_id = inv.id));
end; $$;
grant execute on function public.get_portal_invoice(text, uuid) to anon, authenticated;
