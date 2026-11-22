-- DetailFlow – Entwicklungs-Beispieldaten (NUR lokal / Staging verwenden!)
-- Legt zwei Betriebe mit Inhabern, Katalog mit Beispielpreisen, Kunden, Fahrzeugen, Angeboten und Aufträgen an.
-- Logins:  inhaber@premium-detailing.test / DetailFlow!2026
--          chef@autocare-bonn.test       / DetailFlow!2026
--          mitarbeiter@premium-detailing.test / DetailFlow!2026 (Rolle Mitarbeiter)

do $$
declare
  u_a uuid := '11111111-1111-4111-8111-111111111111';
  u_b uuid := '22222222-2222-4222-8222-222222222222';
  u_s uuid := '33333333-3333-4333-8333-333333333333';
  c_a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  c_b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  y int := extract(year from now())::int;
  cu uuid; ve uuid; o uuid; q uuid;
  r record;
  i int := 0;
begin
  -- Benutzer (Supabase-Auth-Schema)
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
  values
    ('00000000-0000-0000-0000-000000000000', u_a, 'authenticated', 'authenticated', 'inhaber@premium-detailing.test', crypt('DetailFlow!2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Markus Weber"}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', u_b, 'authenticated', 'authenticated', 'chef@autocare-bonn.test', crypt('DetailFlow!2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Sabine Krüger"}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', u_s, 'authenticated', 'authenticated', 'mitarbeiter@premium-detailing.test', crypt('DetailFlow!2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Tim Özdemir"}', now(), now(), '', '', '', '')
  on conflict (id) do nothing;
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email), 'email', now(), now(), now()
  from auth.users where id in (u_a, u_b, u_s)
  on conflict do nothing;

  insert into profiles(user_id, full_name) values (u_a, 'Markus Weber'), (u_b, 'Sabine Krüger'), (u_s, 'Tim Özdemir') on conflict do nothing;

  insert into companies (id, name, street, zip, city, phone, email, website, tax_id, onboarding_completed, plan, opening_hours)
  values
    (c_a, 'Premium Detailing Köln', 'Industriestraße 42', '50735', 'Köln', '0221 123456-0', 'info@premium-detailing.test', 'premium-detailing.test', '217/5123/4567', true, 'professional',
     '{"mo":{"open":true,"from":"08:00","to":"18:00"},"di":{"open":true,"from":"08:00","to":"18:00"},"mi":{"open":true,"from":"08:00","to":"18:00"},"do":{"open":true,"from":"08:00","to":"18:00"},"fr":{"open":true,"from":"08:00","to":"17:00"},"sa":{"open":true,"from":"09:00","to":"14:00"},"so":{"open":false,"from":"08:00","to":"18:00"}}'),
    (c_b, 'AutoCare Bonn', 'Siemensstraße 7', '53121', 'Bonn', '0228 987654', 'kontakt@autocare-bonn.test', null, null, true, 'starter', '{}')
  on conflict (id) do nothing;
  insert into memberships(company_id, user_id, role, can_edit_prices) values (c_a, u_a, 'owner', true), (c_b, u_b, 'owner', true), (c_a, u_s, 'staff', false)
  on conflict do nothing;

  perform seed_company_catalog(c_a);
  perform seed_company_catalog(c_b);
  perform seed_company_operations(c_a);
  perform seed_company_operations(c_b);
  perform seed_message_templates(c_a);
  perform seed_message_templates(c_b);
  perform seed_dunning_templates(c_a);
  perform seed_dunning_templates(c_b);
  update companies set slug = 'premium-detailing-koeln', booking_enabled = true, contact_name = 'Markus Weber',
    iban = 'DE89370400440532013000', bic = 'COBADEFFXXX', bank_name = 'Commerzbank Köln' where id = c_a;

  -- Beispielpreise (nur Demo!). Grundregel ~1 €/Minute, gängige Leistungen individuell.
  update services set base_price = greatest(10, round(duration_minutes * 1.0 / 5) * 5), material_cost = round(duration_minutes * 0.08, 2)
  where company_id in (c_a, c_b);
  update services s set base_price = v.p from (values
    ('Handwäsche', 39), ('Felgenreinigung', 25), ('Innenraum saugen', 29), ('Einstufige Politur', 249), ('Zweistufige Politur', 449),
    ('Keramikversiegelung', 399), ('Mehrschicht-Keramikversiegelung', 799), ('Polymer-Versiegelung', 89), ('Sprühextraktion', 89),
    ('Tierhaarentfernung', 49), ('Starke Tierhaarentfernung', 119), ('Lederreinigung', 59), ('Lederpflege', 39), ('Scheinwerferaufbereitung', 79),
    ('Ozonbehandlung (nur mit Sicherheitsmaßnahmen)', 69), ('Lackzustandsanalyse', 0), ('Lackdickenmessung', 29)
  ) as v(n, p) where s.name = v.n and s.company_id in (c_a, c_b);
  update services set pricing_type = 'hourly', base_price = 0, hourly_rate = 75 where company_id = c_a and name = 'Mehrstufige Lackkorrektur';
  -- AutoCare Bonn ist günstiger
  update services set base_price = round(base_price * 0.85) where company_id = c_b;

  -- Kunden & Fahrzeuge Firma A
  for r in select * from (values
    ('private', 'Lena', 'Schmitz', null, 'lena.schmitz@example.com', '0176 1234567', 'Venloer Str. 210', '50823', 'Köln', 'BMW', 'M3', 'Competition', 'limousine', 'K-LS 330', 'Isle of Man Grün', 'Metallic', 'Leder'),
    ('private', 'Jonas', 'Becker', null, 'jonas.becker@example.com', '0151 2345678', 'Aachener Str. 45', '50674', 'Köln', 'Porsche', '911', 'Carrera S', 'sportwagen', 'K-JB 911', 'GT-Silber', 'Metallic', 'Leder'),
    ('business', null, null, 'Autohaus Rheinblick GmbH', 'service@rheinblick.example', '0221 555000', 'Rheinallee 1', '50996', 'Köln', 'Mercedes-Benz', 'GLC', '300e', 'suv', 'K-RB 1001', 'Obsidianschwarz', 'Metallic', 'Teilleder'),
    ('private', 'Aylin', 'Yilmaz', null, 'aylin.y@example.com', '0157 9876543', 'Neusser Str. 88', '50670', 'Köln', 'VW', 'Golf', 'GTI', 'kompaktwagen', 'K-AY 2024', 'Kings Red', 'Uni', 'Stoff'),
    ('private', 'Thomas', 'Hoffmann', null, null, '0173 4455667', 'Bonner Str. 12', '50677', 'Köln', 'Volvo', 'XC90', 'B5', 'suv', 'K-TH 90', 'Kristallweiß', 'Perleffekt', 'Leder'),
    ('business', null, null, 'Taxi Köln-Mitte eG', 'flotte@taxi-mitte.example', '0221 1940', 'Ehrenstr. 5', '50672', 'Köln', 'Toyota', 'Camry', 'Hybrid', 'limousine', 'K-TX 123', 'Hellelfenbein', 'Uni', 'Kunstleder')
  ) as t(typ, fn, ln, cn, em, ph, st, zp, ci, mk, md, vr, vc, lp, col, pt, im) loop
    insert into customers(company_id, type, first_name, last_name, company_name, contact_person, email, phone, street, zip, city)
    values (c_a, r.typ::customer_type, r.fn, r.ln, r.cn, case when r.typ = 'business' then 'Frau Neumann' end, r.em, r.ph, r.st, r.zp, r.ci) returning id into cu;
    insert into vehicles(company_id, customer_id, make, model, variant, vehicle_class, license_plate, color, paint_type, interior_material, year, mileage)
    values (c_a, cu, r.mk, r.md, r.vr, r.vc::vehicle_class, r.lp, r.col, r.pt, r.im, 2018 + (i % 6), 15000 + i * 21000) returning id into ve;

    i := i + 1;
    -- Aufträge in verschiedenen Status, heute und diese Woche
    insert into orders(company_id, number, customer_id, vehicle_id, status, title, scheduled_start, scheduled_end, estimated_minutes, total_net, total_gross, material_cost, created_by, completed_at)
    values (c_a, 'AU-' || y || '-' || lpad(i::text, 4, '0'), cu, ve,
      (array['in_bearbeitung','geplant','abholbereit','abgeschlossen','bestaetigt','qualitaetskontrolle'])[i]::order_status,
      (array['Innenraumaufbereitung','Keramik Premium','Komplettaufbereitung','Verkaufsaufbereitung','Leasingrückgabe','Basic Außen + Innen'])[i],
      date_trunc('day', now()) + make_interval(days => (i - 1) % 4, hours => 8 + (i * 2) % 8),
      date_trunc('day', now()) + make_interval(days => (i - 1) % 4, hours => 11 + (i * 2) % 8),
      180 + i * 30, 150 + i * 120, round((150 + i * 120) * 1.19, 2), 20 + i * 5, u_a,
      case when i = 4 then now() - interval '2 days' end)
    returning id into o;
    insert into order_items(company_id, order_id, title, quantity, unit_price_net, tax_rate, total_net, done, sort)
    values (c_a, o, 'Handwäsche', 1, 39, 19, 39, i > 2, 0), (c_a, o, 'Innenraum saugen', 1, 29, 19, 29, i > 3, 1), (c_a, o, 'Sonstige Leistungen', 1, 150 + i * 120 - 68, 19, 150 + i * 120 - 68, false, 2);
  end loop;
  -- Aufträge auf Boxen verteilen (keine Überschneidung: unterschiedliche Box je Zeitfenster)
  update orders o set workstation_id = (select id from workstations w where w.company_id = c_a order by sort offset ((right(o.number, 4)::int - 1) % 3) limit 1)
  where o.company_id = c_a;
  insert into document_counters(company_id, kind, year, last_value) values (c_a, 'order', y, i) on conflict (company_id, kind, year) do update set last_value = excluded.last_value;

  -- Zwei Angebote (Entwurf + versendet)
  select id into cu from customers where company_id = c_a and last_name = 'Becker';
  select id into ve from vehicles where customer_id = cu limit 1;
  insert into quotes(company_id, number, customer_id, vehicle_id, status, vehicle_class, soiling_level, subtotal_net, tax_total, total_gross, estimated_minutes, material_cost, valid_until, sent_at, terms, created_by)
  values (c_a, 'AN-' || y || '-0001', cu, ve, 'draft', 'sportwagen', 'normal', 1078.80, 204.97, 1283.77, 720, 60, current_date + 30, now(), (select quote_terms from companies where id = c_a), u_a)
  returning id into q;
  insert into quote_items(company_id, quote_id, title, description, quantity, unit_price_net, tax_rate, total_net, sort) values
    (c_a, q, 'Paket: Keramik Premium', 'Lackanalyse, Dekontamination, zweistufige Politur, Mehrschicht-Keramik', 1, 1078.80, 19, 1078.80, 0);
  update quotes set status = 'sent' where id = q;
  select id into cu from customers where company_id = c_a and last_name = 'Yilmaz';
  select id into ve from vehicles where customer_id = cu limit 1;
  insert into quotes(company_id, number, customer_id, vehicle_id, status, vehicle_class, soiling_level, subtotal_net, tax_total, total_gross, estimated_minutes, material_cost, valid_until, terms, created_by)
  values (c_a, 'AN-' || y || '-0002', cu, ve, 'draft', 'kompaktwagen', 'stark', 154.70, 29.39, 184.09, 165, 12, current_date + 30, (select quote_terms from companies where id = c_a), u_a)
  returning id into q;
  insert into quote_items(company_id, quote_id, title, quantity, unit_price_net, tax_rate, total_net, sort) values
    (c_a, q, 'Sprühextraktion', 1, 115.70, 19, 115.70, 0), (c_a, q, 'Tierhaarentfernung', 1, 63.70, 19, 63.70, 1);
  update quotes set subtotal_net = 179.40, tax_total = 34.09, total_gross = 213.49 where id = q;
  insert into document_counters(company_id, kind, year, last_value) values (c_a, 'quote', y, 2) on conflict (company_id, kind, year) do update set last_value = 2;

  -- Firma B: ein Kunde
  insert into customers(company_id, type, first_name, last_name, email, phone, city) values (c_b, 'private', 'Peter', 'Wagner', 'p.wagner@example.com', '0228 112233', 'Bonn') returning id into cu;
  insert into vehicles(company_id, customer_id, make, model, vehicle_class, license_plate, color) values (c_b, cu, 'Audi', 'A6 Avant', 'kombi', 'BN-PW 66', 'Daytonagrau');

  -- Nachrichten & eine finalisierte Rechnung (als Inhaber ausgeführt, damit Rechteprüfungen greifen)
  select id into cu from customers where company_id = c_a and last_name = 'Yilmaz';
  insert into messages(company_id, customer_id, direction, channel, body, created_at) values
    (c_a, cu, 'in', 'portal', 'Hallo, kann ich den Golf morgen schon um 16 Uhr abholen?', now() - interval '2 hours');
  select id into cu from customers where company_id = c_a and last_name = 'Becker';
  insert into messages(company_id, customer_id, direction, channel, body, created_at, read_at) values
    (c_a, cu, 'in', 'portal', 'Neue Online-Anfrage für „Keramik Premium“' || E'\n' || 'Fahrzeug: Porsche 911' || E'\n' || 'Wunschtermin: nächste Woche', now() - interval '3 days', now()),
    (c_a, cu, 'out', 'portal', 'Hallo Herr Becker, vielen Dank! Das Angebot finden Sie in Ihrem Kundenbereich.', now() - interval '3 days' + interval '1 hour', null);
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  perform finalize_invoice(create_invoice_from_order((select id from orders where company_id = c_a and status = 'abgeschlossen' limit 1)));
  perform set_config('request.jwt.claims', '', true);
end $$;
