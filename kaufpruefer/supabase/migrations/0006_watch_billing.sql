-- DEAL-NIVO v6: Bezahlte Beobachtung (Token je Zeitraum), Erinnerungen
alter table public.watches add column if not exists paid_until timestamptz;
alter table public.watches add column if not exists periods_paid integer not null default 0;
alter table public.watches add column if not exists reminder_days integer;
alter table public.watches add column if not exists last_reminder_at timestamptz;
alter table public.watches add column if not exists expiry_notified_at timestamptz;
create index if not exists watches_active_idx on public.watches (active, paid_until);
