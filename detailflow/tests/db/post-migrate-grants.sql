-- Supabase vergibt diese Tabellenrechte standardmäßig; RLS entscheidet über den tatsächlichen Zugriff.
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
