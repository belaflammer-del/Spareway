-- DEAL-NIVO: komplette Einrichtung (0001–0006 in einer Datei). Wiederholbar, löscht keine Daten.

-- ===== migrations/0001_init.sql =====
-- ─────────────────────────────────────────────────────────────
-- DEAL-NIVO – Initiales Schema (Supabase / PostgreSQL)
-- Alle Tabellen mit Row Level Security. Schreibende Wallet-Operationen
-- laufen ausschließlich über SECURITY DEFINER-Funktionen, die nur der
-- service_role zugänglich sind.
-- ─────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

-- Profile (1:1 zu auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, lower(new.email)) on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Analysen
create table if not exists public.analyses (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('running','completed','failed')),
  tier text not null check (tier in ('full','quick')),
  category text not null,
  platform text not null,
  title text not null default '',
  mode text not null,
  report jsonb,
  error_code text,
  reservation_id text,
  ai_cost_usd numeric(12,6) not null default 0,
  ai_input_tokens integer not null default 0,
  ai_output_tokens integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists analyses_user_idx on public.analyses (user_id, created_at desc);

-- Wallet: Transaktionsprotokoll (append-only)
create table if not exists public.wallet_transactions (
  id text primary key default ('tx_' || replace(gen_random_uuid()::text, '-', '')),
  user_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('purchase','reserve','release','purchase_refund','admin_adjust','test_credit')),
  amount integer not null,
  balance_after integer not null,
  ref_id text,
  idempotency_key text not null unique,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists wallet_tx_user_idx on public.wallet_transactions (user_id, created_at desc);

-- Kontostand (Cache, nur über Funktionen geändert)
create table if not exists public.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.token_reservations (
  id text primary key default ('res_' || replace(gen_random_uuid()::text, '-', '')),
  user_id uuid not null references auth.users(id) on delete cascade,
  analysis_id text not null,
  amount integer not null check (amount > 0),
  status text not null check (status in ('reserved','captured','released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchases (
  id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  package_id text not null,
  tokens integer not null check (tokens > 0),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'eur',
  status text not null check (status in ('pending','paid','refunded','failed')),
  provider text not null check (provider in ('stripe','test')),
  provider_ref text unique,
  payment_intent text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists purchases_user_idx on public.purchases (user_id, created_at desc);
create index if not exists purchases_pi_idx on public.purchases (payment_intent);

create table if not exists public.uploads (
  id text primary key,
  owner_key text not null,
  kind text not null check (kind in ('image','video','frame')),
  mime text not null,
  size integer not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists uploads_expiry_idx on public.uploads (expires_at);
create index if not exists uploads_owner_idx on public.uploads (owner_key);

create table if not exists public.rate_limits (
  key text primary key,
  count integer not null,
  reset_at timestamptz not null
);

create table if not exists public.app_config (
  id integer primary key default 1 check (id = 1),
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.app_config (id) values (1) on conflict do nothing;

create table if not exists public.counters (
  name text primary key,
  value bigint not null default 0
);

-- ── Row Level Security ──────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.analyses enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.wallets enable row level security;
alter table public.token_reservations enable row level security;
alter table public.purchases enable row level security;
alter table public.uploads enable row level security;
alter table public.rate_limits enable row level security;
alter table public.app_config enable row level security;
alter table public.counters enable row level security;

-- Lesend: nur eigene Daten. Schreibend: nur der Server (service_role umgeht RLS).
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for select using (auth.uid() = id);
drop policy if exists "own analyses" on public.analyses;
create policy "own analyses" on public.analyses for select using (auth.uid() = user_id);
drop policy if exists "delete own analyses" on public.analyses;
create policy "delete own analyses" on public.analyses for delete using (auth.uid() = user_id);
drop policy if exists "own tx" on public.wallet_transactions;
create policy "own tx" on public.wallet_transactions for select using (auth.uid() = user_id);
drop policy if exists "own wallet" on public.wallets;
create policy "own wallet" on public.wallets for select using (auth.uid() = user_id);
drop policy if exists "own reservations" on public.token_reservations;
create policy "own reservations" on public.token_reservations for select using (auth.uid() = user_id);
drop policy if exists "own purchases" on public.purchases;
create policy "own purchases" on public.purchases for select using (auth.uid() = user_id);
-- uploads, rate_limits, app_config, counters: kein Client-Zugriff (keine Policy)

-- ── Wallet-Funktionen (atomar, idempotent) ──────────────────
create or replace function public._wallet_apply(p_user uuid, p_type text, p_amount integer, p_ref text, p_key text, p_note text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_balance integer;
begin
  insert into public.wallets (user_id, balance) values (p_user, 0) on conflict (user_id) do nothing;
  select balance into v_balance from public.wallets where user_id = p_user for update;
  if v_balance + p_amount < 0 then
    raise exception 'insufficient_balance' using errcode = 'P0001';
  end if;
  update public.wallets set balance = v_balance + p_amount, updated_at = now() where user_id = p_user;
  insert into public.wallet_transactions (user_id, type, amount, balance_after, ref_id, idempotency_key, note)
    values (p_user, p_type, p_amount, v_balance + p_amount, p_ref, p_key, p_note);
  return v_balance + p_amount;
end $$;

create or replace function public.wallet_reserve(p_user uuid, p_analysis text, p_amount integer, p_key text)
returns public.token_reservations language plpgsql security definer set search_path = public as $$
declare v_res public.token_reservations; v_existing text;
begin
  perform pg_advisory_xact_lock(hashtext('wallet:' || p_user::text));
  select ref_id into v_existing from public.wallet_transactions where idempotency_key = p_key;
  if v_existing is not null then
    select * into v_res from public.token_reservations where id = v_existing;
    return v_res;
  end if;
  insert into public.token_reservations (user_id, analysis_id, amount, status)
    values (p_user, p_analysis, p_amount, 'reserved') returning * into v_res;
  perform public._wallet_apply(p_user, 'reserve', -p_amount, v_res.id, p_key, 'Analyse ' || p_analysis);
  return v_res;
end $$;

create or replace function public.wallet_capture(p_reservation text)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  select status into v_status from public.token_reservations where id = p_reservation for update;
  if v_status is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_status = 'captured' then return; end if;
  if v_status <> 'reserved' then raise exception 'invalid_state' using errcode = 'P0003'; end if;
  update public.token_reservations set status = 'captured', updated_at = now() where id = p_reservation;
end $$;

create or replace function public.wallet_release(p_reservation text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_res public.token_reservations;
begin
  select * into v_res from public.token_reservations where id = p_reservation for update;
  if v_res.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_res.status = 'released' then return; end if;
  if v_res.status = 'captured' then raise exception 'invalid_state' using errcode = 'P0003'; end if;
  perform pg_advisory_xact_lock(hashtext('wallet:' || v_res.user_id::text));
  update public.token_reservations set status = 'released', updated_at = now() where id = p_reservation;
  perform public._wallet_apply(v_res.user_id, 'release', v_res.amount, v_res.id, 'release:' || v_res.id, p_note);
end $$;

create or replace function public.wallet_credit(p_user uuid, p_amount integer, p_type text, p_key text, p_ref text default null, p_note text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if p_type not in ('purchase','admin_adjust','test_credit') then raise exception 'invalid_type'; end if;
  perform pg_advisory_xact_lock(hashtext('wallet:' || p_user::text));
  if exists (select 1 from public.wallet_transactions where idempotency_key = p_key) then return false; end if;
  perform public._wallet_apply(p_user, p_type, p_amount, p_ref, p_key, p_note);
  return true;
end $$;

create or replace function public.wallet_refund_debit(p_user uuid, p_amount integer, p_key text, p_ref text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare v_balance integer; v_debit integer;
begin
  perform pg_advisory_xact_lock(hashtext('wallet:' || p_user::text));
  if exists (select 1 from public.wallet_transactions where idempotency_key = p_key) then return -1; end if;
  insert into public.wallets (user_id, balance) values (p_user, 0) on conflict (user_id) do nothing;
  select balance into v_balance from public.wallets where user_id = p_user for update;
  v_debit := least(p_amount, greatest(v_balance, 0));
  perform public._wallet_apply(p_user, 'purchase_refund', -v_debit, p_ref, p_key,
    'Erstattung (' || p_amount || ' Token, ' || v_debit || ' abgebucht)');
  return v_debit;
end $$;

create or replace function public.rate_limit_hit(p_key text, p_window_seconds integer, p_limit integer)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_count integer; v_reset timestamptz;
begin
  insert into public.rate_limits as r (key, count, reset_at)
    values (p_key, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (key) do update set
    count = case when r.reset_at <= now() then 1 else r.count + 1 end,
    reset_at = case when r.reset_at <= now() then now() + make_interval(secs => p_window_seconds) else r.reset_at end
  returning r.count, r.reset_at into v_count, v_reset;
  return query select v_count <= p_limit, greatest(p_limit - v_count, 0), v_reset;
end $$;

create or replace function public.counter_inc(p_name text) returns void
language sql security definer set search_path = public as $$
  insert into public.counters (name, value) values (p_name, 1)
  on conflict (name) do update set value = public.counters.value + 1;
$$;

-- Nur der Server darf diese Funktionen ausführen
revoke all on function public._wallet_apply(uuid, text, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.wallet_reserve(uuid, text, integer, text) from public, anon, authenticated;
revoke all on function public.wallet_capture(text) from public, anon, authenticated;
revoke all on function public.wallet_release(text, text) from public, anon, authenticated;
revoke all on function public.wallet_credit(uuid, integer, text, text, text, text) from public, anon, authenticated;
revoke all on function public.wallet_refund_debit(uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.counter_inc(text) from public, anon, authenticated;
grant execute on function public.wallet_reserve(uuid, text, integer, text) to service_role;
grant execute on function public.wallet_capture(text) to service_role;
grant execute on function public.wallet_release(text, text) to service_role;
grant execute on function public.wallet_credit(uuid, integer, text, text, text, text) to service_role;
grant execute on function public.wallet_refund_debit(uuid, integer, text, text) to service_role;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
grant execute on function public.counter_inc(text) to service_role;

-- Storage-Bucket für Uploads (privat)
insert into storage.buckets (id, name, public) values ('uploads', 'uploads', false) on conflict (id) do nothing;

-- ===== migrations/0002_v2.sql =====
-- DEAL-NIVO v2: Wiederverwendung identischer Analysen, Kennzahlen, Zähler mit Schrittweite
alter table public.analyses add column if not exists fingerprint text;
alter table public.analyses add column if not exists ai_model text;
alter table public.analyses add column if not exists duration_ms integer;
create index if not exists analyses_fingerprint_idx on public.analyses (user_id, fingerprint, created_at desc);

create or replace function public.counter_add(p_name text, p_by bigint) returns void
language sql security definer set search_path = public as $$
  insert into public.counters (name, value) values (p_name, p_by)
  on conflict (name) do update set value = public.counters.value + excluded.value;
$$;
revoke all on function public.counter_add(text, bigint) from public, anon, authenticated;
grant execute on function public.counter_add(text, bigint) to service_role;

-- ===== migrations/0003_v3.sql =====
-- DEAL-NIVO v3: Versionierung, Historie (Filter/Sortierung/Vorschaubild), KI-Rückfragen
alter table public.analyses add column if not exists listing_key text;
alter table public.analyses add column if not exists previous_id text;
alter table public.analyses add column if not exists analysis_version integer;
alter table public.analyses add column if not exists price_eur numeric(12,2);
alter table public.analyses add column if not exists recommendation text;
alter table public.analyses add column if not exists price_rating text;
alter table public.analyses add column if not exists thumbnail text;
alter table public.analyses add column if not exists chat jsonb;
create index if not exists analyses_listing_key_idx on public.analyses (user_id, listing_key, created_at desc);
create index if not exists analyses_user_price_idx on public.analyses (user_id, price_eur);

-- Bestehende Analysen nachträglich befüllen (keine Daten gehen verloren)
update public.analyses
set price_eur = nullif(report->'listing'->>'priceEur', '')::numeric,
    recommendation = report->'score'->>'recommendation',
    price_rating = report->'market'->>'rating'
where report is not null and recommendation is null;

-- ===== migrations/0004_v4_kaufakte.sql =====
-- DEAL-NIVO v4: Gemeinsame Kaufakte, Hintergrundjobs, Angebotsbeobachtung,
-- Benachrichtigungen, Bildabgleich, Teilen-Eingang.
-- Rein additiv: keine bestehende Tabelle oder Spalte wird verändert oder gelöscht.

-- ── Kaufakte-Module (versioniert) ─────────────────────────────
create table if not exists public.kaufakte_modules (
  id text primary key,
  analysis_id text not null references public.analyses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('chat_check','inspection','costs','image_match','snapshot')),
  version integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  input_hash text,
  expires_at timestamptz,
  data jsonb not null,
  unique (analysis_id, kind, version)
);
create index if not exists kaufakte_modules_lookup_idx on public.kaufakte_modules (analysis_id, user_id, kind, version);
create index if not exists kaufakte_modules_expiry_idx on public.kaufakte_modules (expires_at) where expires_at is not null;

-- Atomare Versionsvergabe
create or replace function public.kaufakte_add_module(
  p_id text, p_analysis text, p_user uuid, p_kind text, p_created timestamptz,
  p_input_hash text, p_expires timestamptz, p_data jsonb
) returns integer language plpgsql security definer set search_path = public as $$
declare v_version integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_analysis || ':' || p_kind));
  select coalesce(max(version), 0) + 1 into v_version from public.kaufakte_modules where analysis_id = p_analysis and kind = p_kind;
  insert into public.kaufakte_modules (id, analysis_id, user_id, kind, version, created_at, input_hash, expires_at, data)
  values (p_id, p_analysis, p_user, p_kind, v_version, p_created, p_input_hash, p_expires, p_data);
  return v_version;
end $$;

-- ── Hintergrundjobs (persistente Queue) ──────────────────────
create table if not exists public.jobs (
  id text primary key,
  type text not null,
  user_id uuid references auth.users(id) on delete cascade,
  analysis_id text references public.analyses(id) on delete cascade,
  idempotency_key text not null,
  status text not null check (status in ('queued','running','done','failed','cancelled')),
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  run_after timestamptz not null default now(),
  lease_until timestamptz,
  progress integer not null default 0,
  message text,
  input jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  cancel_requested boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Pro Idempotenzschlüssel höchstens ein aktiver bzw. erfolgreicher Job
create unique index if not exists jobs_idem_active_idx on public.jobs (idempotency_key) where status in ('queued','running','done');
create index if not exists jobs_claim_idx on public.jobs (status, run_after);
create index if not exists jobs_user_idx on public.jobs (user_id, created_at desc);

-- Job beanspruchen: FOR UPDATE SKIP LOCKED – sicher bei mehreren Instanzen
create or replace function public.jobs_claim(p_now timestamptz, p_lease_seconds integer, p_types text[])
returns setof public.jobs language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  select id into v_id from public.jobs
  where (p_types is null or type = any(p_types))
    and ((status = 'queued' and run_after <= p_now) or (status = 'running' and lease_until < p_now))
  order by run_after
  for update skip locked
  limit 1;
  if v_id is null then return; end if;
  return query
    update public.jobs set status = 'running', attempts = attempts + 1,
      lease_until = p_now + make_interval(secs => p_lease_seconds), updated_at = p_now
    where id = v_id returning *;
end $$;

-- ── Angebotsbeobachtung ──────────────────────────────────────
create table if not exists public.watches (
  id text primary key,
  analysis_id text not null references public.analyses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  url text,
  external_id text,
  mode text not null check (mode in ('auto','manual')),
  interval_hours integer not null default 24 check (interval_hours >= 1),
  active boolean not null default true,
  notify jsonb not null default '{"inApp":true,"email":false,"push":false}'::jsonb,
  created_at timestamptz not null default now(),
  last_checked_at timestamptz,
  next_check_at timestamptz,
  last_error text,
  unique (analysis_id, user_id)
);
create index if not exists watches_due_idx on public.watches (next_check_at) where active and mode = 'auto';
create index if not exists watches_user_idx on public.watches (user_id, created_at desc);

-- ── Benachrichtigungen ───────────────────────────────────────
create table if not exists public.notifications (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  link text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  keys jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ── Bildabgleich (nur Hashes, keine Bilddaten) ───────────────
create table if not exists public.image_hashes (
  id text primary key,
  analysis_id text not null references public.analyses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_key text,
  platform text not null,
  listing_url text,
  image_ref text,
  dhash text not null,
  phash text not null,
  band0 text not null,
  band1 text not null,
  band2 text not null,
  band3 text not null,
  sha256 text not null,
  width integer not null,
  height integer not null,
  captured_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists image_hashes_b0 on public.image_hashes (band0);
create index if not exists image_hashes_b1 on public.image_hashes (band1);
create index if not exists image_hashes_b2 on public.image_hashes (band2);
create index if not exists image_hashes_b3 on public.image_hashes (band3);
create index if not exists image_hashes_analysis_idx on public.image_hashes (analysis_id);
create index if not exists image_hashes_expiry_idx on public.image_hashes (expires_at);

-- ── Teilen-Eingang (kurzlebig, einmalig abholbar) ────────────
create table if not exists public.share_inbox (
  id text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  title text,
  text text,
  url text,
  upload_ids text[] not null default '{}',
  claimed_by uuid references auth.users(id) on delete cascade
);
create index if not exists share_inbox_expiry_idx on public.share_inbox (expires_at);

create or replace function public.share_inbox_take(p_id text, p_user uuid, p_now timestamptz)
returns setof public.share_inbox language plpgsql security definer set search_path = public as $$
begin
  return query
    update public.share_inbox set claimed_by = p_user
    where id = p_id and expires_at > p_now and (claimed_by is null or claimed_by = p_user)
    returning *;
end $$;

-- ── Zeilenbasierte Sicherheit ────────────────────────────────
-- Schreibzugriffe ausschließlich serverseitig (Service-Role). Nutzer dürfen
-- über den Anon-Schlüssel höchstens ihre eigenen Datensätze lesen.
alter table public.kaufakte_modules enable row level security;
alter table public.jobs enable row level security;
alter table public.watches enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.image_hashes enable row level security;
alter table public.share_inbox enable row level security;

drop policy if exists "own modules" on public.kaufakte_modules;
create policy "own modules" on public.kaufakte_modules for select using (auth.uid() = user_id);
drop policy if exists "own jobs" on public.jobs;
create policy "own jobs" on public.jobs for select using (auth.uid() = user_id);
drop policy if exists "own watches" on public.watches;
create policy "own watches" on public.watches for select using (auth.uid() = user_id);
drop policy if exists "own notifications" on public.notifications;
create policy "own notifications" on public.notifications for select using (auth.uid() = user_id);
-- image_hashes, push_subscriptions, share_inbox: kein Lesezugriff für Nutzer (enthält fremde Inseratsbezüge)

revoke all on function public.kaufakte_add_module(text, text, uuid, text, timestamptz, text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.jobs_claim(timestamptz, integer, text[]) from public, anon, authenticated;
revoke all on function public.share_inbox_take(text, uuid, timestamptz) from public, anon, authenticated;

-- ===== migrations/0005_service_role_grants.sql =====
-- DEAL-NIVO v5: Rechte für die Server-Rolle.
-- Neue Supabase-Projekte vergeben keine Standardrechte mehr auf Tabellen im
-- Schema public. Der App-Server arbeitet ausschließlich mit der service_role;
-- anon/authenticated erhalten bewusst keine Tabellenrechte.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

-- Trigger-Funktion nicht per API aufrufbar machen (der Trigger läuft weiterhin)
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ===== migrations/0006_watch_billing.sql =====
-- DEAL-NIVO v6: Bezahlte Beobachtung (Token je Zeitraum), Erinnerungen
alter table public.watches add column if not exists paid_until timestamptz;
alter table public.watches add column if not exists periods_paid integer not null default 0;
alter table public.watches add column if not exists reminder_days integer;
alter table public.watches add column if not exists last_reminder_at timestamptz;
alter table public.watches add column if not exists expiry_notified_at timestamptz;
create index if not exists watches_active_idx on public.watches (active, paid_until);
