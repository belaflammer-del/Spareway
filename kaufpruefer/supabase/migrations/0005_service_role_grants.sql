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
