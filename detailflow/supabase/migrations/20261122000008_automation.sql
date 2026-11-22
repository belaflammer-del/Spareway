-- DetailFlow – Erinnerungen, Mahnwesen, DATEV-Einstellungen, Angebote bearbeiten, Termine verschieben

alter table public.companies add column reminders_enabled boolean not null default true;
alter table public.companies add column dunning_enabled boolean not null default true;
alter table public.companies add column dunning_days int[] not null default array[3, 14, 28];   -- Tage nach Fälligkeit je Stufe
alter table public.companies add column accounting_config jsonb not null default
  '{"revenue19": "8400", "revenue7": "8300", "revenue0": "8195", "debitor": "10000", "consultant": "", "client": "", "fiscalYearStart": "01-01"}'::jsonb;

alter table public.orders add column reminder_sent_at timestamptz;

-- Mahnstufen je Rechnung (eigene Tabelle – die Rechnung selbst bleibt unverändert)
create table public.invoice_reminders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  level int not null check (level between 1 and 3),   -- 1 = Zahlungserinnerung, 2 = 1. Mahnung, 3 = 2. Mahnung
  channel text not null default 'email',
  sent_at timestamptz not null default now(),
  unique (invoice_id, level)
);
alter table public.invoice_reminders enable row level security;
create policy invoice_reminders_select on public.invoice_reminders for select using (public.is_member(company_id));
create policy invoice_reminders_insert on public.invoice_reminders for insert
  with check (public.has_role(company_id, array['owner','admin','office']::public.member_role[])
              and (select company_id from public.invoices where id = invoice_id) = company_id);

-- Fällige Terminerinnerungen: Termin morgen (Europe/Berlin), Kunde mit E-Mail, noch nicht erinnert
create or replace function public.due_appointment_reminders(now_ts timestamptz default now())
returns table (order_id uuid, company_id uuid, customer_id uuid) language sql stable security definer set search_path = public as $$
  select o.id, o.company_id, o.customer_id
  from orders o join companies c on c.id = o.company_id join customers cu on cu.id = o.customer_id
  where c.reminders_enabled and o.reminder_sent_at is null and cu.email is not null
    and o.status in ('bestaetigt', 'geplant')
    and (o.scheduled_start at time zone 'Europe/Berlin')::date = ((now_ts at time zone 'Europe/Berlin')::date + 1);
$$;

-- Fällige Mahnstufen: nächste noch nicht versendete Stufe, deren Frist erreicht ist
create or replace function public.due_dunning(now_ts timestamptz default now())
returns table (invoice_id uuid, company_id uuid, customer_id uuid, level int) language sql stable security definer set search_path = public as $$
  select i.id, i.company_id, i.customer_id, lvl.level
  from invoices i
  join companies c on c.id = i.company_id
  join customers cu on cu.id = i.customer_id
  cross join lateral (select coalesce(max(r.level), 0) + 1 as level from invoice_reminders r where r.invoice_id = i.id) lvl
  where c.dunning_enabled and i.kind = 'invoice' and i.status = 'finalized' and i.due_date is not null and cu.email is not null
    and lvl.level <= least(3, coalesce(array_length(c.dunning_days, 1), 0))
    and (now_ts at time zone 'Europe/Berlin')::date >= i.due_date + c.dunning_days[lvl.level];
$$;
revoke execute on function public.due_appointment_reminders(timestamptz), public.due_dunning(timestamptz) from public, anon, authenticated;

-- Standardvorlagen für Mahnwesen
create or replace function public.seed_dunning_templates(cid uuid)
returns void language sql security definer set search_path = public as $$
  insert into message_templates(company_id, key, name, body) values
  (cid, 'mahnung1', 'Zahlungserinnerung', E'Hallo {kunde},\nsicher ist es Ihnen entgangen: Die Rechnung {rechnung} über {betrag} war am {faellig} fällig. Bitte überweisen Sie den offenen Betrag in den nächsten Tagen. Online bezahlen: {portal}\n\nFalls Sie bereits gezahlt haben, betrachten Sie diese Nachricht bitte als gegenstandslos.\n\nViele Grüße\n{firma}'),
  (cid, 'mahnung2', '1. Mahnung', E'Hallo {kunde},\nleider konnten wir zur Rechnung {rechnung} über {betrag} (fällig am {faellig}) noch keinen Zahlungseingang feststellen. Bitte begleichen Sie den Betrag innerhalb von 7 Tagen: {portal}\n\nViele Grüße\n{firma}'),
  (cid, 'mahnung3', '2. Mahnung', E'Hallo {kunde},\ntrotz Erinnerung ist die Rechnung {rechnung} über {betrag} weiterhin offen. Bitte zahlen Sie den Betrag umgehend, spätestens innerhalb von 7 Tagen. Danach behalten wir uns weitere Schritte vor.\n{portal}\n\n{firma}')
  on conflict do nothing;
$$;
revoke execute on function public.seed_dunning_templates(uuid) from public, anon, authenticated;
select public.seed_dunning_templates(id) from public.companies;

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
  return cid;
end; $$;

-- Angebotsentwurf bearbeiten: Kopfdaten aktualisieren und Positionen ersetzen (nur Entwürfe; security invoker => RLS)
create or replace function public.update_quote_with_items(p_id uuid, q jsonb, items jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare cur quotes%rowtype; it jsonb; i int := 0;
begin
  select * into cur from quotes where id = p_id for update;
  if cur.id is null then raise exception 'Angebot nicht gefunden'; end if;
  if cur.status <> 'draft' then raise exception 'Nur Entwürfe können bearbeitet werden'; end if;
  update quotes set customer_id = (q->>'customer_id')::uuid, vehicle_id = nullif(q->>'vehicle_id','')::uuid,
    vehicle_class = (q->>'vehicle_class')::vehicle_class, soiling_level = (q->>'soiling_level')::soiling_level,
    discount_percent = coalesce((q->>'discount_percent')::numeric, 0), calculation = coalesce(q->'calculation', '{}'::jsonb),
    subtotal_net = (q->>'subtotal_net')::numeric, tax_total = (q->>'tax_total')::numeric, total_gross = (q->>'total_gross')::numeric,
    estimated_minutes = coalesce((q->>'estimated_minutes')::int, 0), material_cost = coalesce((q->>'material_cost')::numeric, 0),
    manual_override = coalesce((q->>'manual_override')::boolean, false), intro_text = q->>'intro_text', notes = q->>'notes'
  where id = p_id;
  delete from quote_items where quote_id = p_id;
  for it in select * from jsonb_array_elements(items) loop
    insert into quote_items(company_id, quote_id, service_id, package_id, title, description, quantity, unit_price_net, tax_rate, total_net, sort)
    values (cur.company_id, p_id, nullif(it->>'service_id','')::uuid, nullif(it->>'package_id','')::uuid, it->>'title', it->>'description',
            coalesce((it->>'quantity')::numeric, 1), (it->>'unit_price_net')::numeric, (it->>'tax_rate')::numeric, (it->>'total_net')::numeric, i);
    i := i + 1;
  end loop;
end; $$;
revoke execute on function public.update_quote_with_items(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.update_quote_with_items(uuid, jsonb, jsonb) to authenticated;

-- Nur der Server-Job (Service-Role) darf die Fälligkeitslisten abrufen
grant execute on function public.due_appointment_reminders(timestamptz), public.due_dunning(timestamptz) to service_role;
