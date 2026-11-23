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
