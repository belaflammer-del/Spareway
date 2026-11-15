-- DetailFlow – Kernschema (Phase 1/2)
-- Multi-Tenant: jede fachliche Tabelle trägt company_id; Zugriff ausschließlich über RLS.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.member_role as enum ('owner', 'admin', 'office', 'staff');
create type public.customer_type as enum ('private', 'business');
create type public.vehicle_class as enum (
  'kleinwagen','kompaktwagen','limousine','kombi','suv','gelaendewagen','coupe','cabrio',
  'sportwagen','supersportwagen','van','transporter','wohnmobil','motorrad'
);
create type public.soiling_level as enum ('leicht','normal','stark','extrem');
create type public.pricing_type as enum ('fixed','hourly');
create type public.quote_status as enum ('draft','sent','accepted','rejected','expired');
create type public.order_status as enum (
  'anfrage','angebot_erstellt','bestaetigt','geplant','fahrzeug_angenommen','in_bearbeitung',
  'qualitaetskontrolle','fertig','abholbereit','abgeschlossen','storniert'
);
create type public.plan_tier as enum ('starter','professional','business');

-- ---------------------------------------------------------------------------
-- Firmen & Mitgliedschaften
-- ---------------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  legal_form text,
  street text, zip text, city text, country text not null default 'DE',
  phone text, email text, website text,
  logo_path text,
  tax_id text,              -- Steuernummer
  vat_id text,              -- USt-IdNr.
  small_business boolean not null default false, -- Kleinunternehmer (§ 19 UStG)
  default_tax_rate numeric(5,2) not null default 19.00,
  currency text not null default 'EUR',
  bank_name text, iban text, bic text,
  opening_hours jsonb not null default '{}'::jsonb,
  -- Preislogik: Faktoren je Fahrzeugklasse / Verschmutzungsgrad, interner Stundensatz
  pricing_config jsonb not null default '{
    "hourlyRate": 60,
    "internalHourlyCost": 30,
    "vehicleClassFactors": {"kleinwagen":0.9,"kompaktwagen":1,"limousine":1.1,"kombi":1.15,"suv":1.25,"gelaendewagen":1.3,"coupe":1.05,"cabrio":1.1,"sportwagen":1.2,"supersportwagen":1.5,"van":1.3,"transporter":1.4,"wohnmobil":2,"motorrad":0.7},
    "soilingFactors": {"leicht":0.9,"normal":1,"stark":1.3,"extrem":1.6}
  }'::jsonb,
  quote_prefix text not null default 'AN-',
  order_prefix text not null default 'AU-',
  invoice_prefix text not null default 'RE-',
  quote_validity_days int not null default 30 check (quote_validity_days between 1 and 365),
  quote_terms text not null default 'Die Preise verstehen sich inklusive der gesetzlichen Mehrwertsteuer, sofern nicht anders angegeben. Der tatsächliche Aufwand kann je nach Fahrzeugzustand abweichen; größere Abweichungen werden vorab abgestimmt.',
  plan public.plan_tier not null default 'starter',
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'staff',
  can_edit_prices boolean not null default false,
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);
create index on public.memberships(user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  role public.member_role not null default 'staff' check (role <> 'owner'),
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by uuid references auth.users(id),
  accepted_at timestamptz,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now()
);

create table public.document_counters (
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in ('quote','order','invoice')),
  year int not null,
  last_value int not null default 0,
  primary key (company_id, kind, year)
);

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen für RLS (security definer, damit RLS auf memberships nicht rekursiv greift)
-- ---------------------------------------------------------------------------
create or replace function public.is_member(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m where m.company_id = cid and m.user_id = auth.uid());
$$;

create or replace function public.has_role(cid uuid, roles public.member_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m
                 where m.company_id = cid and m.user_id = auth.uid() and m.role = any(roles));
$$;

create or replace function public.can_edit_prices(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m
                 where m.company_id = cid and m.user_id = auth.uid()
                   and (m.role in ('owner','admin') or m.can_edit_prices));
$$;

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger companies_updated before update on public.companies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Kunden & Fahrzeuge
-- ---------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  type public.customer_type not null default 'private',
  first_name text, last_name text,
  company_name text, contact_person text,
  email text, phone text,
  street text, zip text, city text,
  billing_street text, billing_zip text, billing_city text,
  notes text,
  merged_into uuid references public.customers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_has_name check (
    coalesce(nullif(trim(company_name),''), nullif(trim(last_name),''), nullif(trim(first_name),'')) is not null
  )
);
create index on public.customers(company_id, last_name);
create trigger customers_updated before update on public.customers
  for each row execute function public.set_updated_at();

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  make text not null, model text not null, variant text,
  year int check (year between 1900 and 2100),
  license_plate text, vin text, mileage int check (mileage >= 0),
  color text, paint_type text, body_type text,
  vehicle_class public.vehicle_class not null default 'kompaktwagen',
  interior_material text, seats int check (seats between 1 and 60),
  condition text, special_notes text, known_damages text, coatings text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.vehicles(company_id, customer_id);
create trigger vehicles_updated before update on public.vehicles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Leistungskatalog
-- ---------------------------------------------------------------------------
create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  key text,
  name text not null,
  sort int not null default 0,
  unique (company_id, name)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  category_id uuid references public.service_categories(id) on delete set null,
  name text not null,
  description text,
  customer_description text,
  internal_notes text,
  pricing_type public.pricing_type not null default 'fixed',
  base_price numeric(10,2) not null default 0 check (base_price >= 0),
  hourly_rate numeric(10,2) check (hourly_rate >= 0),
  duration_minutes int not null default 30 check (duration_minutes >= 0),
  material_cost numeric(10,2) not null default 0 check (material_cost >= 0),
  min_price numeric(10,2) check (min_price >= 0),
  size_surcharges jsonb not null default '{}'::jsonb,  -- absoluter €-Zuschlag je Fahrzeugklasse (überschreibt Faktor)
  applies_vehicle_class boolean not null default true,
  applies_soiling boolean not null default true,
  tax_rate numeric(5,2),   -- null = Firmenstandard
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.services(company_id, category_id);
create trigger services_updated before update on public.services
  for each row execute function public.set_updated_at();

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  price_mode text not null default 'discount' check (price_mode in ('discount','fixed')),
  fixed_price numeric(10,2) check (fixed_price >= 0),
  discount_percent numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.package_items (
  package_id uuid not null references public.packages(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  primary key (package_id, service_id)
);

-- ---------------------------------------------------------------------------
-- Angebote & Aufträge
-- ---------------------------------------------------------------------------
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  number text not null,
  customer_id uuid not null references public.customers(id),
  vehicle_id uuid references public.vehicles(id) on delete set null,
  status public.quote_status not null default 'draft',
  vehicle_class public.vehicle_class not null,
  soiling_level public.soiling_level not null default 'normal',
  discount_percent numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  calculation jsonb not null default '{}'::jsonb,  -- vollständige Kalkulation (Nachvollziehbarkeit)
  subtotal_net numeric(12,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  total_gross numeric(12,2) not null default 0,
  estimated_minutes int not null default 0,
  material_cost numeric(12,2) not null default 0,
  manual_override boolean not null default false,
  intro_text text,
  terms text,
  notes text,
  valid_until date,
  sent_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  public_token text unique default encode(gen_random_bytes(24), 'hex'),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, number)
);
create index on public.quotes(company_id, status);
create trigger quotes_updated before update on public.quotes
  for each row execute function public.set_updated_at();

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  package_id uuid references public.packages(id) on delete set null,
  title text not null,
  description text,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  unit_price_net numeric(12,2) not null,
  tax_rate numeric(5,2) not null,
  total_net numeric(12,2) not null,
  sort int not null default 0
);
create index on public.quote_items(quote_id);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  number text not null,
  quote_id uuid references public.quotes(id) on delete set null,
  customer_id uuid not null references public.customers(id),
  vehicle_id uuid references public.vehicles(id) on delete set null,
  status public.order_status not null default 'bestaetigt',
  assigned_to uuid references auth.users(id) on delete set null,
  title text,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  estimated_minutes int not null default 0,
  actual_minutes int,
  total_net numeric(12,2) not null default 0,
  total_gross numeric(12,2) not null default 0,
  material_cost numeric(12,2) not null default 0,
  internal_notes text,
  completed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, number),
  check (scheduled_end is null or scheduled_start is null or scheduled_end >= scheduled_start)
);
create index on public.orders(company_id, status);
create index on public.orders(company_id, scheduled_start);
create trigger orders_updated before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  title text not null,
  quantity numeric(10,2) not null default 1,
  unit_price_net numeric(12,2) not null,
  tax_rate numeric(5,2) not null,
  total_net numeric(12,2) not null,
  done boolean not null default false,
  sort int not null default 0
);
create index on public.order_items(order_id);

create table public.order_status_history (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  company_id uuid references public.companies(id) on delete cascade,
  user_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_log(company_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Konsistenz: verknüpfte Datensätze müssen zur selben Firma gehören
-- (verhindert, dass ein Mitglied von Firma A eine fremde customer_id referenziert)
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
  -- Paare aus (Spalte, Zieltabelle), die zur selben Firma gehören müssen
  checks := case tg_table_name
    when 'vehicles' then array[['customer_id','customers']]
    when 'quotes' then array[['customer_id','customers'],['vehicle_id','vehicles']]
    when 'orders' then array[['customer_id','customers'],['vehicle_id','vehicles'],['quote_id','quotes']]
    when 'services' then array[['category_id','service_categories']]
    when 'quote_items' then array[['quote_id','quotes'],['service_id','services'],['package_id','packages']]
    when 'order_items' then array[['order_id','orders'],['service_id','services']]
    when 'package_items' then array[['package_id','packages'],['service_id','services']]
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

create trigger vehicles_same_company before insert or update on public.vehicles for each row execute function public.enforce_same_company();
create trigger quotes_same_company before insert or update on public.quotes for each row execute function public.enforce_same_company();
create trigger orders_same_company before insert or update on public.orders for each row execute function public.enforce_same_company();
create trigger services_same_company before insert or update on public.services for each row execute function public.enforce_same_company();
create trigger quote_items_same_company before insert or update on public.quote_items for each row execute function public.enforce_same_company();
create trigger order_items_same_company before insert or update on public.order_items for each row execute function public.enforce_same_company();
create trigger package_items_same_company before insert or update on public.package_items for each row execute function public.enforce_same_company();

-- Firmen-ID darf nachträglich nie geändert werden
create or replace function public.prevent_company_change() returns trigger language plpgsql as $$
begin
  if new.company_id is distinct from old.company_id then
    raise exception 'company_id ist unveränderlich';
  end if;
  return new;
end; $$;

do $$
declare t text;
begin
  foreach t in array array['memberships','invitations','customers','vehicles','service_categories','services','packages','package_items','quotes','quote_items','orders','order_items'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.prevent_company_change()', t || '_lock_company', t);
  end loop;
end $$;

-- Statusverlauf protokollieren
create or replace function public.log_order_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into order_status_history(company_id, order_id, from_status, to_status, changed_by)
    values (new.company_id, new.id, case when tg_op = 'UPDATE' then old.status end, new.status, auth.uid());
  end if;
  return new;
end; $$;
create trigger orders_status_log after insert or update of status on public.orders
  for each row execute function public.log_order_status();

create or replace function public.set_order_completed() returns trigger language plpgsql as $$
begin
  if new.status = 'abgeschlossen' and new.completed_at is null then new.completed_at = now(); end if;
  return new;
end; $$;
create trigger orders_completed before insert or update of status on public.orders
  for each row execute function public.set_order_completed();
