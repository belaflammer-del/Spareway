-- DetailFlow – Row-Level-Security, RPCs, Audit, Storage

-- ---------------------------------------------------------------------------
-- Tarife (konfigurierbar, nicht hart im Code)
-- ---------------------------------------------------------------------------
create table public.plans (
  id public.plan_tier primary key,
  name text not null,
  price_monthly_cents int not null,
  max_users int,               -- null = unbegrenzt
  features jsonb not null default '[]'::jsonb,
  stripe_price_id text
);
insert into public.plans (id, name, price_monthly_cents, max_users, features) values
 ('starter','Starter',4900,1,'["customers","vehicles","quotes","orders","calendar"]'),
 ('professional','Professional',9900,5,'["customers","vehicles","quotes","orders","calendar","analytics","checklists","photos","materials","automations"]'),
 ('business','Business',14900,25,'["customers","vehicles","quotes","orders","calendar","analytics","checklists","photos","materials","automations","advanced_analytics","advanced_permissions","priority_support"]');

-- ---------------------------------------------------------------------------
-- RLS aktivieren
-- ---------------------------------------------------------------------------
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.document_counters enable row level security;
alter table public.customers enable row level security;
alter table public.vehicles enable row level security;
alter table public.service_categories enable row level security;
alter table public.services enable row level security;
alter table public.packages enable row level security;
alter table public.package_items enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.audit_log enable row level security;
alter table public.plans enable row level security;

create policy plans_read on public.plans for select using (true);

-- Firmen: Lesen für Mitglieder, Ändern nur Inhaber/Admin. Anlegen nur per RPC create_company.
create policy companies_select on public.companies for select using (public.is_member(id));
create policy companies_update on public.companies for update
  using (public.has_role(id, array['owner','admin']::public.member_role[]))
  with check (public.has_role(id, array['owner','admin']::public.member_role[]));

-- Abo-Felder dürfen nur serverseitig (Service-Role / Webhook) geändert werden
create or replace function public.protect_billing_fields() returns trigger language plpgsql as $$
begin
  if current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'authenticated'
     and (new.plan is distinct from old.plan
          or new.stripe_customer_id is distinct from old.stripe_customer_id
          or new.stripe_subscription_id is distinct from old.stripe_subscription_id
          or new.subscription_status is distinct from old.subscription_status) then
    raise exception 'Tarifdaten können nur über die Abrechnung geändert werden';
  end if;
  return new;
end; $$;
create trigger companies_protect_billing before update on public.companies
  for each row execute function public.protect_billing_fields();

-- Profile
create policy profiles_select on public.profiles for select using (
  user_id = auth.uid() or exists (
    select 1 from public.memberships a join public.memberships b on a.company_id = b.company_id
    where a.user_id = auth.uid() and b.user_id = profiles.user_id));
create policy profiles_insert on public.profiles for insert with check (user_id = auth.uid());
create policy profiles_update on public.profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Mitgliedschaften
create policy memberships_select on public.memberships for select using (public.is_member(company_id));
create policy memberships_update on public.memberships for update
  using (public.has_role(company_id, array['owner']::public.member_role[]) and role <> 'owner')
  with check (public.has_role(company_id, array['owner']::public.member_role[]) and role <> 'owner');
create policy memberships_delete on public.memberships for delete
  using (public.has_role(company_id, array['owner']::public.member_role[]) and role <> 'owner');

-- Einladungen
create policy invitations_all on public.invitations for all
  using (public.has_role(company_id, array['owner','admin']::public.member_role[]))
  with check (public.has_role(company_id, array['owner','admin']::public.member_role[]));

-- Fachdaten: alle Mitglieder lesen/schreiben, Löschen nur Inhaber/Admin/Büro
do $$
declare t text;
begin
  foreach t in array array['customers','vehicles','quotes','quote_items','orders','order_items'] loop
    execute format('create policy %I on public.%I for select using (public.is_member(company_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert with check (public.is_member(company_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update using (public.is_member(company_id)) with check (public.is_member(company_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete using (public.has_role(company_id, array[''owner'',''admin'',''office'']::public.member_role[]))', t || '_delete', t);
  end loop;
  -- Katalog: lesen alle Mitglieder, schreiben nur mit Preisrecht
  foreach t in array array['service_categories','services','packages','package_items'] loop
    execute format('create policy %I on public.%I for select using (public.is_member(company_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert with check (public.can_edit_prices(company_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update using (public.can_edit_prices(company_id)) with check (public.can_edit_prices(company_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete using (public.can_edit_prices(company_id))', t || '_delete', t);
  end loop;
end $$;

create policy order_status_history_select on public.order_status_history for select using (public.is_member(company_id));
create policy audit_log_select on public.audit_log for select
  using (public.has_role(company_id, array['owner','admin']::public.member_role[]));
-- document_counters: keine Policies -> nur über security-definer-Funktion erreichbar

-- Positionen eines nicht mehr im Entwurf befindlichen Angebots sind unveränderlich
create or replace function public.lock_sent_quote_items() returns trigger
language plpgsql security definer set search_path = public as $$
declare st public.quote_status;
begin
  select status into st from quotes where id = coalesce(new.quote_id, old.quote_id);
  if st is not null and st <> 'draft' then
    raise exception 'Positionen eines versendeten Angebots können nicht mehr geändert werden';
  end if;
  return coalesce(new, old);
end; $$;
create trigger quote_items_lock before insert or update or delete on public.quote_items
  for each row execute function public.lock_sent_quote_items();

-- ---------------------------------------------------------------------------
-- Audit-Log für sensible Aktionen
-- ---------------------------------------------------------------------------
create or replace function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec jsonb;
  cid uuid;
begin
  rec := to_jsonb(coalesce(new, old));
  cid := case when tg_table_name = 'companies' then (rec->>'id')::uuid else (rec->>'company_id')::uuid end;
  insert into audit_log(company_id, user_id, action, entity, entity_id, details)
  values (cid, auth.uid(), lower(tg_op), tg_table_name, (rec->>'id')::uuid,
          case when tg_op = 'UPDATE' and tg_table_name in ('quotes','orders')
               then jsonb_build_object('status_from', to_jsonb(old)->>'status', 'status_to', to_jsonb(new)->>'status')
               when tg_op = 'DELETE' then rec else null end);
  return coalesce(new, old);
end; $$;

create trigger audit_customers after delete on public.customers for each row execute function public.audit_trigger();
create trigger audit_vehicles after delete on public.vehicles for each row execute function public.audit_trigger();
create trigger audit_quotes after update of status or delete on public.quotes for each row execute function public.audit_trigger();
create trigger audit_orders after delete on public.orders for each row execute function public.audit_trigger();
create trigger audit_memberships after insert or update or delete on public.memberships for each row execute function public.audit_trigger();
create trigger audit_companies after update on public.companies for each row execute function public.audit_trigger();
create trigger audit_services after update of base_price, hourly_rate, active or delete on public.services for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------------
-- Nummernkreise (fortlaufend, lückenlos je Firma/Jahr, transaktionssicher)
-- ---------------------------------------------------------------------------
create or replace function public.next_document_number(cid uuid, doc_kind text)
returns text language plpgsql security definer set search_path = public as $$
declare
  y int := extract(year from now())::int;
  v int;
  prefix text;
begin
  if not public.is_member(cid) then raise exception 'Kein Zugriff'; end if;
  insert into document_counters(company_id, kind, year, last_value) values (cid, doc_kind, y, 1)
  on conflict (company_id, kind, year) do update set last_value = document_counters.last_value + 1
  returning last_value into v;
  select case doc_kind when 'quote' then quote_prefix when 'order' then order_prefix else invoice_prefix end
    into prefix from companies where id = cid;
  return prefix || y || '-' || lpad(v::text, 4, '0');
end; $$;

-- ---------------------------------------------------------------------------
-- Angebot inkl. Positionen atomar anlegen (security invoker => RLS greift)
-- ---------------------------------------------------------------------------
create or replace function public.create_quote_with_items(q jsonb, items jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  qid uuid;
  cid uuid := (q->>'company_id')::uuid;
  it jsonb;
  i int := 0;
begin
  insert into quotes(company_id, number, customer_id, vehicle_id, vehicle_class, soiling_level, discount_percent,
                     calculation, subtotal_net, tax_total, total_gross, estimated_minutes, material_cost,
                     manual_override, intro_text, terms, notes, valid_until, created_by)
  values (cid, public.next_document_number(cid, 'quote'), (q->>'customer_id')::uuid, nullif(q->>'vehicle_id','')::uuid,
          (q->>'vehicle_class')::public.vehicle_class, (q->>'soiling_level')::public.soiling_level,
          coalesce((q->>'discount_percent')::numeric, 0), coalesce(q->'calculation','{}'::jsonb),
          (q->>'subtotal_net')::numeric, (q->>'tax_total')::numeric, (q->>'total_gross')::numeric,
          coalesce((q->>'estimated_minutes')::int, 0), coalesce((q->>'material_cost')::numeric, 0),
          coalesce((q->>'manual_override')::boolean, false), q->>'intro_text', q->>'terms', q->>'notes',
          (q->>'valid_until')::date, auth.uid())
  returning id into qid;

  for it in select * from jsonb_array_elements(items) loop
    insert into quote_items(company_id, quote_id, service_id, package_id, title, description, quantity,
                            unit_price_net, tax_rate, total_net, sort)
    values (cid, qid, nullif(it->>'service_id','')::uuid, nullif(it->>'package_id','')::uuid, it->>'title', it->>'description',
            coalesce((it->>'quantity')::numeric, 1), (it->>'unit_price_net')::numeric, (it->>'tax_rate')::numeric,
            (it->>'total_net')::numeric, i);
    i := i + 1;
  end loop;
  return qid;
end; $$;

-- Auftrag direkt (ohne Angebot) inkl. Positionen anlegen (security invoker => RLS greift)
create or replace function public.create_order_with_items(o jsonb, items jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  oid uuid;
  cid uuid := (o->>'company_id')::uuid;
  it jsonb;
  i int := 0;
begin
  insert into orders(company_id, number, customer_id, vehicle_id, status, title, scheduled_start, scheduled_end,
                     estimated_minutes, total_net, total_gross, material_cost, internal_notes, assigned_to, created_by)
  values (cid, public.next_document_number(cid, 'order'), (o->>'customer_id')::uuid, nullif(o->>'vehicle_id','')::uuid,
          coalesce(nullif(o->>'status','')::public.order_status, 'bestaetigt'), o->>'title',
          nullif(o->>'scheduled_start','')::timestamptz, nullif(o->>'scheduled_end','')::timestamptz,
          coalesce((o->>'estimated_minutes')::int, 0), coalesce((o->>'total_net')::numeric, 0),
          coalesce((o->>'total_gross')::numeric, 0), coalesce((o->>'material_cost')::numeric, 0),
          o->>'internal_notes', nullif(o->>'assigned_to','')::uuid, auth.uid())
  returning id into oid;
  for it in select * from jsonb_array_elements(items) loop
    insert into order_items(company_id, order_id, service_id, title, quantity, unit_price_net, tax_rate, total_net, sort)
    values (cid, oid, nullif(it->>'service_id','')::uuid, it->>'title', coalesce((it->>'quantity')::numeric, 1),
            (it->>'unit_price_net')::numeric, (it->>'tax_rate')::numeric, (it->>'total_net')::numeric, i);
    i := i + 1;
  end loop;
  return oid;
end; $$;

-- Angenommenes Angebot -> Auftrag (security invoker)
create or replace function public.convert_quote_to_order(qid uuid)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  q quotes%rowtype;
  oid uuid;
begin
  select * into q from quotes where id = qid;
  if not found then raise exception 'Angebot nicht gefunden'; end if;
  if q.status <> 'accepted' then raise exception 'Nur angenommene Angebote können in Aufträge umgewandelt werden'; end if;
  select id into oid from orders where quote_id = qid limit 1;
  if oid is not null then return oid; end if;

  insert into orders(company_id, number, quote_id, customer_id, vehicle_id, status, title, estimated_minutes,
                     total_net, total_gross, material_cost, created_by)
  values (q.company_id, public.next_document_number(q.company_id, 'order'), q.id, q.customer_id, q.vehicle_id,
          'bestaetigt', (select string_agg(title, ', ' order by sort) from (select title, sort from quote_items where quote_id = qid order by sort limit 3) t),
          q.estimated_minutes, q.subtotal_net, q.total_gross, q.material_cost, auth.uid())
  returning id into oid;

  insert into order_items(company_id, order_id, service_id, title, quantity, unit_price_net, tax_rate, total_net, sort)
  select company_id, oid, service_id, title, quantity, unit_price_net, tax_rate, total_net, sort
  from quote_items where quote_id = qid;
  return oid;
end; $$;

-- Dubletten zusammenführen (security invoker + Rollenprüfung)
create or replace function public.merge_customers(source_id uuid, target_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare
  s customers%rowtype;
  t customers%rowtype;
begin
  if source_id = target_id then raise exception 'Quelle und Ziel sind identisch'; end if;
  select * into s from customers where id = source_id;
  select * into t from customers where id = target_id;
  if s.id is null or t.id is null then raise exception 'Kunde nicht gefunden'; end if;
  if s.company_id <> t.company_id then raise exception 'Kunden gehören zu verschiedenen Firmen'; end if;
  if not public.has_role(s.company_id, array['owner','admin','office']::public.member_role[]) then
    raise exception 'Keine Berechtigung zum Zusammenführen';
  end if;
  update vehicles set customer_id = target_id where customer_id = source_id;
  update quotes set customer_id = target_id where customer_id = source_id;
  update orders set customer_id = target_id where customer_id = source_id;
  update customers set
    email = coalesce(t.email, s.email), phone = coalesce(t.phone, s.phone),
    street = coalesce(t.street, s.street), zip = coalesce(t.zip, s.zip), city = coalesce(t.city, s.city),
    notes = nullif(concat_ws(E'\n', t.notes, s.notes), '')
  where id = target_id;
  update customers set merged_into = target_id where id = source_id;
  insert into audit_log(company_id, user_id, action, entity, entity_id, details)
  values (s.company_id, auth.uid(), 'merge', 'customers', target_id, jsonb_build_object('source', source_id));
end; $$;

-- ---------------------------------------------------------------------------
-- Öffentlicher Angebotslink (anon): nur per geheimem Token, nur freigegebene Felder
-- ---------------------------------------------------------------------------
create or replace function public.get_public_quote(token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  q quotes%rowtype;
  result jsonb;
begin
  if token is null or length(token) < 32 then return null; end if;
  select * into q from quotes where public_token = token and status in ('sent','accepted','rejected','expired');
  if not found then return null; end if;
  select jsonb_build_object(
    'number', q.number, 'status', q.status, 'valid_until', q.valid_until, 'created_at', q.created_at,
    'subtotal_net', q.subtotal_net, 'tax_total', q.tax_total, 'total_gross', q.total_gross,
    'discount_percent', q.discount_percent, 'intro_text', q.intro_text, 'terms', q.terms,
    'company', (select jsonb_build_object('name', name, 'street', street, 'zip', zip, 'city', city, 'phone', phone,
                'email', email, 'small_business', small_business) from companies where id = q.company_id),
    'customer', (select jsonb_build_object('name', coalesce(company_name, concat_ws(' ', first_name, last_name)))
                 from customers where id = q.customer_id),
    'vehicle', (select jsonb_build_object('make', make, 'model', model, 'license_plate', license_plate)
                from vehicles where id = q.vehicle_id),
    'items', coalesce((select jsonb_agg(jsonb_build_object('title', title, 'description', description, 'quantity', quantity,
                 'unit_price_net', unit_price_net, 'tax_rate', tax_rate, 'total_net', total_net) order by sort)
                 from quote_items where quote_id = q.id), '[]'::jsonb)
  ) into result;
  return result;
end; $$;

create or replace function public.respond_public_quote(token text, accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  q quotes%rowtype;
begin
  if token is null or length(token) < 32 then raise exception 'Ungültiger Link'; end if;
  select * into q from quotes where public_token = token for update;
  if not found then raise exception 'Ungültiger Link'; end if;
  if q.status <> 'sent' then raise exception 'Dieses Angebot kann nicht mehr beantwortet werden'; end if;
  if q.valid_until is not null and q.valid_until < current_date then
    update quotes set status = 'expired' where id = q.id;
    return 'expired';
  end if;
  if accept then
    update quotes set status = 'accepted', accepted_at = now() where id = q.id;
    return 'accepted';
  else
    update quotes set status = 'rejected', rejected_at = now() where id = q.id;
    return 'rejected';
  end if;
end; $$;

-- ---------------------------------------------------------------------------
-- Einladung annehmen (prüft E-Mail und Benutzerlimit des Tarifs)
-- ---------------------------------------------------------------------------
create or replace function public.accept_invitation(invite_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  inv invitations%rowtype;
  max_u int;
  cnt int;
begin
  select * into inv from invitations where token = invite_token and accepted_at is null and expires_at > now() for update;
  if not found then raise exception 'Einladung ungültig oder abgelaufen'; end if;
  if lower(inv.email) <> lower(coalesce(auth.jwt()->>'email','')) then
    raise exception 'Diese Einladung gilt für eine andere E-Mail-Adresse';
  end if;
  select p.max_users into max_u from companies c join plans p on p.id = c.plan where c.id = inv.company_id;
  select count(*) into cnt from memberships where company_id = inv.company_id;
  if max_u is not null and cnt >= max_u then raise exception 'Benutzerlimit des Tarifs erreicht'; end if;
  insert into memberships(company_id, user_id, role) values (inv.company_id, auth.uid(), inv.role)
  on conflict (company_id, user_id) do nothing;
  update invitations set accepted_at = now() where id = inv.id;
  return inv.company_id;
end; $$;

-- ---------------------------------------------------------------------------
-- Rechte auf Funktionen
-- ---------------------------------------------------------------------------
revoke execute on function public.next_document_number(uuid, text) from public, anon;
revoke execute on function public.create_quote_with_items(jsonb, jsonb) from public, anon;
revoke execute on function public.convert_quote_to_order(uuid) from public, anon;
revoke execute on function public.create_order_with_items(jsonb, jsonb) from public, anon;
grant execute on function public.create_order_with_items(jsonb, jsonb) to authenticated;
revoke execute on function public.merge_customers(uuid, uuid) from public, anon;
revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.next_document_number(uuid, text) to authenticated;
grant execute on function public.create_quote_with_items(jsonb, jsonb) to authenticated;
grant execute on function public.convert_quote_to_order(uuid) to authenticated;
grant execute on function public.merge_customers(uuid, uuid) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.get_public_quote(text) to anon, authenticated;
grant execute on function public.respond_public_quote(text, boolean) to anon, authenticated;

create or replace function public.try_uuid(v text) returns uuid language plpgsql immutable as $$
begin return v::uuid; exception when others then return null; end; $$;

-- ---------------------------------------------------------------------------
-- Storage: privater Bucket, Pfad beginnt mit company_id/…
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('company-files', 'company-files', false)
    on conflict (id) do nothing;

    create policy company_files_select on storage.objects for select to authenticated
      using (bucket_id = 'company-files' and public.is_member(public.try_uuid((storage.foldername(name))[1])));
    create policy company_files_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'company-files' and public.is_member(public.try_uuid((storage.foldername(name))[1])));
    create policy company_files_update on storage.objects for update to authenticated
      using (bucket_id = 'company-files' and public.is_member(public.try_uuid((storage.foldername(name))[1])));
    create policy company_files_delete on storage.objects for delete to authenticated
      using (bucket_id = 'company-files' and public.has_role(public.try_uuid((storage.foldername(name))[1]), array['owner','admin']::public.member_role[]));
  end if;
end $$;
