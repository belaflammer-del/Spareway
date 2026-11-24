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
