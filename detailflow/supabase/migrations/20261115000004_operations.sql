-- DetailFlow – Phase 3: Arbeitsplätze, Kalender, Fotodokumentation, Checklisten, Auswertungen

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- Arbeitsplätze / Aufbereitungsboxen
-- ---------------------------------------------------------------------------
create table public.workstations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  color text not null default 'teal',
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

alter table public.orders add column workstation_id uuid references public.workstations(id) on delete set null;

-- Doppelbelegung derselben Box im selben Zeitraum ist in der Datenbank ausgeschlossen
alter table public.orders add constraint orders_no_workstation_overlap
  exclude using gist (
    workstation_id with =,
    tstzrange(scheduled_start, scheduled_end, '[)') with &&
  ) where (workstation_id is not null and scheduled_start is not null and scheduled_end is not null and status not in ('storniert', 'abgeschlossen'));

-- ---------------------------------------------------------------------------
-- Fotodokumentation
-- ---------------------------------------------------------------------------
create type public.photo_category as enum ('vorher', 'waehrend', 'nachher', 'schaden', 'verschmutzung', 'endkontrolle');

create table public.order_photos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  category public.photo_category not null,
  storage_path text not null unique,
  caption text check (char_length(caption) <= 300),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Pfad muss im Ordner der eigenen Firma und des Auftrags liegen
  check (storage_path like company_id::text || '/orders/' || order_id::text || '/%')
);
create index on public.order_photos(order_id, category);

-- ---------------------------------------------------------------------------
-- Checklisten
-- ---------------------------------------------------------------------------
create table public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  items text[] not null check (array_length(items, 1) between 1 and 100),
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

create table public.order_checklists (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  template_id uuid references public.checklist_templates(id) on delete set null,
  name text not null,
  created_at timestamptz not null default now()
);
create index on public.order_checklists(order_id);

create table public.order_checklist_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  checklist_id uuid not null references public.order_checklists(id) on delete cascade,
  label text not null,
  sort int not null default 0,
  done boolean not null default false,
  done_by uuid references auth.users(id) on delete set null,
  done_at timestamptz,
  problem text check (char_length(problem) <= 1000),
  minutes int check (minutes between 0 and 10000)
);
create index on public.order_checklist_items(checklist_id);

-- Abhaken protokolliert automatisch wer und wann
create or replace function public.stamp_checklist_item() returns trigger language plpgsql as $$
begin
  if new.done and (tg_op = 'INSERT' or not old.done) then
    new.done_by := auth.uid(); new.done_at := now();
  elsif not new.done then
    new.done_by := null; new.done_at := null;
  end if;
  return new;
end; $$;
create trigger order_checklist_items_stamp before insert or update of done on public.order_checklist_items
  for each row execute function public.stamp_checklist_item();

-- ---------------------------------------------------------------------------
-- Gleiche-Firma-Prüfung auf die neuen Tabellen erweitern
-- ---------------------------------------------------------------------------
create or replace function public.enforce_same_company() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r jsonb := to_jsonb(new);
  cid uuid := (to_jsonb(new)->>'company_id')::uuid;
  checks text[][];
  i int;
  ref_company uuid;
begin
  checks := case tg_table_name
    when 'vehicles' then array[['customer_id','customers']]
    when 'quotes' then array[['customer_id','customers'],['vehicle_id','vehicles']]
    when 'orders' then array[['customer_id','customers'],['vehicle_id','vehicles'],['quote_id','quotes'],['workstation_id','workstations']]
    when 'services' then array[['category_id','service_categories']]
    when 'quote_items' then array[['quote_id','quotes'],['service_id','services'],['package_id','packages']]
    when 'order_items' then array[['order_id','orders'],['service_id','services']]
    when 'package_items' then array[['package_id','packages'],['service_id','services']]
    when 'order_photos' then array[['order_id','orders'],['vehicle_id','vehicles']]
    when 'order_checklists' then array[['order_id','orders'],['template_id','checklist_templates']]
    when 'order_checklist_items' then array[['checklist_id','order_checklists']]
  end;
  for i in 1 .. coalesce(array_length(checks, 1), 0) loop
    if r->>checks[i][1] is not null then
      execute format('select company_id from public.%I where id = $1', checks[i][2])
        into ref_company using (r->>checks[i][1])::uuid;
      if ref_company is distinct from cid then
        raise exception 'Verknüpfter Datensatz (%) gehört nicht zu dieser Firma', checks[i][2];
      end if;
    end if;
  end loop;
  return new;
end; $$;

create trigger order_photos_same_company before insert or update on public.order_photos for each row execute function public.enforce_same_company();
create trigger order_checklists_same_company before insert or update on public.order_checklists for each row execute function public.enforce_same_company();
create trigger order_checklist_items_same_company before insert or update on public.order_checklist_items for each row execute function public.enforce_same_company();

do $$
declare t text;
begin
  foreach t in array array['workstations','order_photos','checklist_templates','order_checklists','order_checklist_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.prevent_company_change()', t || '_lock_company', t);
    execute format('create policy %I on public.%I for select using (public.is_member(company_id))', t || '_select', t);
  end loop;
  -- Arbeitsalltag: alle Mitglieder dürfen Fotos und Checklisten am Auftrag pflegen
  foreach t in array array['order_photos','order_checklists','order_checklist_items'] loop
    execute format('create policy %I on public.%I for insert with check (public.is_member(company_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update using (public.is_member(company_id)) with check (public.is_member(company_id))', t || '_update', t);
  end loop;
  -- Löschen von Fotos/Checklisten und Stammdaten (Boxen, Vorlagen) nur Inhaber/Admin/Büro
  foreach t in array array['order_photos','order_checklists','order_checklist_items'] loop
    execute format('create policy %I on public.%I for delete using (public.has_role(company_id, array[''owner'',''admin'',''office'']::public.member_role[]))', t || '_delete', t);
  end loop;
  foreach t in array array['workstations','checklist_templates'] loop
    execute format('create policy %I on public.%I for insert with check (public.has_role(company_id, array[''owner'',''admin'',''office'']::public.member_role[]))', t || '_insert', t);
    execute format('create policy %I on public.%I for update using (public.has_role(company_id, array[''owner'',''admin'',''office'']::public.member_role[])) with check (public.has_role(company_id, array[''owner'',''admin'',''office'']::public.member_role[]))', t || '_update', t);
    execute format('create policy %I on public.%I for delete using (public.has_role(company_id, array[''owner'',''admin'',''office'']::public.member_role[]))', t || '_delete', t);
  end loop;
end $$;

create trigger audit_order_photos after delete on public.order_photos for each row execute function public.audit_trigger();

-- Checkliste aus Vorlage an einen Auftrag hängen (security invoker => RLS greift)
create or replace function public.add_checklist_to_order(p_order uuid, p_template uuid)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  t checklist_templates%rowtype;
  o orders%rowtype;
  cl uuid;
begin
  select * into o from orders where id = p_order;
  select * into t from checklist_templates where id = p_template;
  if o.id is null or t.id is null then raise exception 'Auftrag oder Vorlage nicht gefunden'; end if;
  insert into order_checklists(company_id, order_id, template_id, name) values (o.company_id, o.id, t.id, t.name) returning id into cl;
  insert into order_checklist_items(company_id, checklist_id, label, sort)
  select o.company_id, cl, label, ord::int from unnest(t.items) with ordinality as x(label, ord);
  return cl;
end; $$;
revoke execute on function public.add_checklist_to_order(uuid, uuid) from public, anon;
grant execute on function public.add_checklist_to_order(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Standardvorlagen für neue und bestehende Firmen
-- ---------------------------------------------------------------------------
create or replace function public.seed_company_operations(cid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into workstations(company_id, name, sort) values (cid, 'Box 1', 1), (cid, 'Box 2', 2), (cid, 'Waschplatz', 3)
  on conflict do nothing;
  insert into checklist_templates(company_id, name, sort, items) values
    (cid, 'Fahrzeugannahme', 1, array['Kilometerstand notiert','Tankstand / Ladestand notiert','Rundgang mit Kunde – Vorschäden fotografiert','Wertgegenstände im Fahrzeug geprüft','Schlüssel beschriftet und verwahrt','Sonderwünsche des Kunden notiert']),
    (cid, 'Außenwäsche', 2, array['Felgen und Reifen vorgereinigt','Insekten und Vogelkot eingeweicht','Snow Foam aufgetragen und einwirken lassen','Zwei-Eimer-Handwäsche','Türfalze gereinigt','Gründlich gespült und getrocknet']),
    (cid, 'Innenraumreinigung', 3, array['Fußmatten entnommen','Innenraum und Kofferraum gesaugt','Kunststoffe gereinigt','Lüftungsdüsen gereinigt','Scheiben innen gereinigt','Fußmatten gereinigt und zurückgelegt']),
    (cid, 'Politur', 4, array['Lackdicke gemessen und dokumentiert','Empfindliche Teile abgeklebt','Testfläche poliert und abgenommen','Schleif-/Polierschritte durchgeführt','Polierrückstände entfernt','Kontrolle mit Prüfbeleuchtung']),
    (cid, 'Keramikversiegelung', 5, array['Lack entfettet (IPA/Panel Wipe)','Raumtemperatur und Luftfeuchte geprüft','Schicht 1 aufgetragen und abgenommen','Ablüftzeit eingehalten','Weitere Schichten aufgetragen','Aushärtung dokumentiert','Pflegehinweise für Kunden vorbereitet']),
    (cid, 'Qualitätskontrolle', 6, array['Außen bei Tageslicht geprüft','Innenraum geprüft (Sitze, Fugen, Scheiben)','Keine Rückstände in Spalten und Emblemen','Nachher-Fotos aufgenommen']),
    (cid, 'Fahrzeugübergabe', 7, array['Fahrzeug an Abholplatz gestellt','Ergebnis mit Kunde besprochen','Pflegehinweise übergeben','Schlüssel übergeben','Bezahlung geklärt'])
  on conflict do nothing;
end; $$;
revoke execute on function public.seed_company_operations(uuid) from public, anon, authenticated;

-- create_company erweitert: legt auch Boxen und Checklisten-Vorlagen an
create or replace function public.create_company(company_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Nicht angemeldet'; end if;
  if company_name is null or char_length(trim(company_name)) < 2 then raise exception 'Firmenname zu kurz'; end if;
  if (select count(*) from memberships where user_id = uid and role = 'owner') >= 5 then
    raise exception 'Maximale Anzahl an Firmen erreicht';
  end if;
  insert into companies(name) values (trim(company_name)) returning id into cid;
  insert into memberships(company_id, user_id, role, can_edit_prices) values (cid, uid, 'owner', true);
  insert into profiles(user_id) values (uid) on conflict do nothing;
  perform public.seed_company_catalog(cid);
  perform public.seed_company_operations(cid);
  return cid;
end; $$;

-- Bestehende Firmen nachrüsten
select public.seed_company_operations(id) from public.companies;

-- Auftragszeitraum ohne Ende: Ende aus geschätzter Dauer ableiten (für Kalender & Überschneidungsprüfung)
create or replace function public.default_order_end() returns trigger language plpgsql as $$
begin
  if new.scheduled_start is not null and new.scheduled_end is null then
    new.scheduled_end := new.scheduled_start + make_interval(mins => greatest(coalesce(new.estimated_minutes, 0), 60));
  end if;
  return new;
end; $$;
create trigger orders_default_end before insert or update of scheduled_start, scheduled_end, estimated_minutes on public.orders
  for each row execute function public.default_order_end();

-- ---------------------------------------------------------------------------
-- Auswertungen (security_invoker => RLS der Basistabellen greift)
-- ---------------------------------------------------------------------------
create view public.v_revenue_monthly with (security_invoker = true) as
  select company_id, date_trunc('month', coalesce(completed_at, scheduled_start, created_at))::date as month,
         count(*)::int as orders, sum(total_net)::numeric(12,2) as net, sum(total_gross)::numeric(12,2) as gross,
         sum(material_cost)::numeric(12,2) as material, sum(coalesce(actual_minutes, estimated_minutes))::int as minutes
  from public.orders where status = 'abgeschlossen'
  group by 1, 2;

create view public.v_service_revenue with (security_invoker = true) as
  select o.company_id, oi.title, count(*)::int as times, sum(oi.total_net)::numeric(12,2) as net,
         max(coalesce(o.completed_at, o.created_at)) as last_used
  from public.order_items oi join public.orders o on o.id = oi.order_id
  where o.status = 'abgeschlossen' and oi.total_net > 0
  group by 1, 2;

create view public.v_quote_stats with (security_invoker = true) as
  select company_id,
         count(*) filter (where status in ('sent','accepted','rejected','expired'))::int as sent,
         count(*) filter (where status = 'accepted')::int as accepted,
         count(*) filter (where status = 'sent')::int as open
  from public.quotes group by 1;

grant select on public.v_revenue_monthly, public.v_service_revenue, public.v_quote_stats to authenticated;
