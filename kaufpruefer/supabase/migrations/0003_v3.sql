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
