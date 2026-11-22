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
