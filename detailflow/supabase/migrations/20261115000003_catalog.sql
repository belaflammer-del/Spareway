-- DetailFlow – Leistungskatalog-Vorlage, Firmenanlage, Standardpakete
-- Vorlagen enthalten bewusst KEINE Preise (Preis = 0): jede Firma legt eigene Preise fest.
-- Die Dauer ist nur ein Vorschlag und kann je Firma angepasst werden.

create table public.catalog_template (
  id serial primary key,
  category_key text not null,
  category_name text not null,
  category_sort int not null,
  name text not null,
  duration_minutes int not null,
  applies_soiling boolean not null,
  applies_vehicle_class boolean not null,
  sort int not null
);
alter table public.catalog_template enable row level security;
create policy catalog_template_read on public.catalog_template for select to authenticated using (true);

insert into public.catalog_template (category_key, category_name, category_sort, name, duration_minutes, applies_soiling, applies_vehicle_class, sort) values
('aussen','Außenreinigung',0,'Fahrzeugvorwäsche',15,true,true,0),
('aussen','Außenreinigung',0,'Hochdruckvorwäsche',15,true,true,1),
('aussen','Außenreinigung',0,'Handwäsche',45,true,true,2),
('aussen','Außenreinigung',0,'Zwei-Eimer-Wäsche',60,true,true,3),
('aussen','Außenreinigung',0,'Schaumwäsche / Snow Foam',20,true,true,4),
('aussen','Außenreinigung',0,'pH-neutrale Wäsche',45,true,true,5),
('aussen','Außenreinigung',0,'Insektenentfernung',20,true,true,6),
('aussen','Außenreinigung',0,'Flugrostentfernung',45,true,true,7),
('aussen','Außenreinigung',0,'Teerentfernung',30,true,true,8),
('aussen','Außenreinigung',0,'Harzentfernung',30,true,true,9),
('aussen','Außenreinigung',0,'Kalkfleckenentfernung',45,true,true,10),
('aussen','Außenreinigung',0,'Wasserfleckenentfernung',45,true,true,11),
('aussen','Außenreinigung',0,'Felgenreinigung',30,true,true,12),
('aussen','Außenreinigung',0,'Felgentiefenreinigung',60,true,true,13),
('aussen','Außenreinigung',0,'Reifenreinigung',15,true,true,14),
('aussen','Außenreinigung',0,'Reifenpflege',10,true,true,15),
('aussen','Außenreinigung',0,'Radhausreinigung',30,true,true,16),
('aussen','Außenreinigung',0,'Türfalzreinigung',20,true,true,17),
('aussen','Außenreinigung',0,'Motorraumreinigung',45,true,true,18),
('aussen','Außenreinigung',0,'Unterbodenreinigung',60,true,true,19),
('aussen','Außenreinigung',0,'Cabriodachreinigung',45,true,true,20),
('aussen','Außenreinigung',0,'Cabriodachimprägnierung (Außen)',30,true,true,21),
('aussen','Außenreinigung',0,'Scheibenreinigung außen',15,true,true,22),
('aussen','Außenreinigung',0,'Kunststoffpflege außen',20,true,true,23),
('aussen','Außenreinigung',0,'Chrompflege',20,true,true,24),
('aussen','Außenreinigung',0,'Endkontrolle Außen',10,false,true,25),
('innen','Innenraumaufbereitung',1,'Innenraum saugen',30,true,true,0),
('innen','Innenraumaufbereitung',1,'Kofferraum saugen',15,true,true,1),
('innen','Innenraumaufbereitung',1,'Fußmattenreinigung',20,true,true,2),
('innen','Innenraumaufbereitung',1,'Teppichreinigung',45,true,true,3),
('innen','Innenraumaufbereitung',1,'Polsterreinigung',60,true,true,4),
('innen','Innenraumaufbereitung',1,'Sitzreinigung',45,true,true,5),
('innen','Innenraumaufbereitung',1,'Dachhimmelreinigung',45,true,true,6),
('innen','Innenraumaufbereitung',1,'Armaturenbrettreinigung',20,true,true,7),
('innen','Innenraumaufbereitung',1,'Mittelkonsole reinigen',15,true,true,8),
('innen','Innenraumaufbereitung',1,'Türverkleidungen reinigen',30,true,true,9),
('innen','Innenraumaufbereitung',1,'Lüftungsdüsen reinigen',20,true,true,10),
('innen','Innenraumaufbereitung',1,'Innenraumkunststoffe reinigen',30,true,true,11),
('innen','Innenraumaufbereitung',1,'Kunststoffpflege innen',20,true,true,12),
('innen','Innenraumaufbereitung',1,'Scheibenreinigung innen',15,true,true,13),
('innen','Innenraumaufbereitung',1,'Tiefenreinigung Innenraum',180,true,true,14),
('innen','Innenraumaufbereitung',1,'Dampfreinigung',60,true,true,15),
('innen','Innenraumaufbereitung',1,'Sprühextraktion',90,true,true,16),
('innen','Innenraumaufbereitung',1,'Fleckenentfernung',30,true,true,17),
('innen','Innenraumaufbereitung',1,'Salzränder entfernen',30,true,true,18),
('innen','Innenraumaufbereitung',1,'Sandentfernung',30,true,true,19),
('innen','Innenraumaufbereitung',1,'Tierhaarentfernung',45,true,true,20),
('innen','Innenraumaufbereitung',1,'Hundehaarentfernung',60,true,true,21),
('innen','Innenraumaufbereitung',1,'Katzenhaarentfernung',60,true,true,22),
('innen','Innenraumaufbereitung',1,'Starke Tierhaarentfernung',120,true,true,23),
('innen','Innenraumaufbereitung',1,'Geruchsentfernung',60,true,true,24),
('innen','Innenraumaufbereitung',1,'Nikotingeruch-Behandlung',120,true,true,25),
('innen','Innenraumaufbereitung',1,'Raucherrückstände entfernen',90,true,true,26),
('innen','Innenraumaufbereitung',1,'Lebensmittelgerüche behandeln',60,true,true,27),
('innen','Innenraumaufbereitung',1,'Schimmelverdacht dokumentieren',15,false,false,28),
('innen','Innenraumaufbereitung',1,'Hygienereinigung',60,true,true,29),
('innen','Innenraumaufbereitung',1,'Desinfektionsleistung (fachlich/rechtlich prüfen)',30,true,true,30),
('innen','Innenraumaufbereitung',1,'Klimaanlagen-Geruchsbehandlung',30,true,true,31),
('innen','Innenraumaufbereitung',1,'Ozonbehandlung (nur mit Sicherheitsmaßnahmen)',60,true,true,32),
('leder','Lederpflege und Lederaufbereitung',2,'Lederreinigung',45,true,true,0),
('leder','Lederpflege und Lederaufbereitung',2,'Ledertiefenreinigung',90,true,true,1),
('leder','Lederpflege und Lederaufbereitung',2,'Lederpflege',30,true,true,2),
('leder','Lederpflege und Lederaufbereitung',2,'Lederkonditionierung',30,true,true,3),
('leder','Lederpflege und Lederaufbereitung',2,'Lederimprägnierung',30,true,true,4),
('leder','Lederpflege und Lederaufbereitung',2,'Lederauffrischung',60,true,true,5),
('leder','Lederpflege und Lederaufbereitung',2,'Lederfarbauffrischung',120,true,true,6),
('leder','Lederpflege und Lederaufbereitung',2,'Lederreparatur',90,true,true,7),
('leder','Lederpflege und Lederaufbereitung',2,'Kleine Risse behandeln',60,true,true,8),
('leder','Lederpflege und Lederaufbereitung',2,'Abriebstellen behandeln',60,true,true,9),
('leder','Lederpflege und Lederaufbereitung',2,'Lederlenkrad aufbereiten',45,true,false,10),
('leder','Lederpflege und Lederaufbereitung',2,'Ledersitze aufbereiten',120,true,true,11),
('leder','Lederpflege und Lederaufbereitung',2,'Lederarmlehnen aufbereiten',30,true,true,12),
('leder','Lederpflege und Lederaufbereitung',2,'Alcantara-Reinigung',45,true,true,13),
('leder','Lederpflege und Lederaufbereitung',2,'Kunstlederreinigung',30,true,true,14),
('leder','Lederpflege und Lederaufbereitung',2,'Empfindliche Materialien separat behandeln',30,true,true,15),
('lack','Lackaufbereitung',3,'Lackzustandsanalyse',20,false,false,0),
('lack','Lackaufbereitung',3,'Lackdickenmessung',20,false,false,1),
('lack','Lackaufbereitung',3,'Lackdekontamination',45,true,true,2),
('lack','Lackaufbereitung',3,'Reinigungsknete',45,true,true,3),
('lack','Lackaufbereitung',3,'Einstufige Politur',240,true,true,4),
('lack','Lackaufbereitung',3,'Zweistufige Politur',420,true,true,5),
('lack','Lackaufbereitung',3,'Dreistufige Politur',600,true,true,6),
('lack','Lackaufbereitung',3,'Mehrstufige Lackkorrektur',900,true,true,7),
('lack','Lackaufbereitung',3,'Hochglanzpolitur',240,true,true,8),
('lack','Lackaufbereitung',3,'Finish-Politur',180,true,true,9),
('lack','Lackaufbereitung',3,'Hologrammentfernung',180,true,true,10),
('lack','Lackaufbereitung',3,'Swirl-Entfernung',300,true,true,11),
('lack','Lackaufbereitung',3,'Leichte Kratzer reduzieren',60,true,true,12),
('lack','Lackaufbereitung',3,'Oxidation entfernen',180,true,true,13),
('lack','Lackaufbereitung',3,'Lackauffrischung',180,true,true,14),
('lack','Lackaufbereitung',3,'Spot-Politur',30,true,false,15),
('lack','Lackaufbereitung',3,'Scheinwerferaufbereitung',60,true,false,16),
('lack','Lackaufbereitung',3,'Rückleuchtenpolitur',30,true,false,17),
('lack','Lackaufbereitung',3,'Klavierlackpflege',30,true,true,18),
('lack','Lackaufbereitung',3,'Chrompolitur',30,true,true,19),
('lack','Lackaufbereitung',3,'Lackkontrolle mit Prüfbeleuchtung',20,false,true,20),
('schutz','Versiegelungen und Schutz',4,'Sprühversiegelung',20,true,true,0),
('schutz','Versiegelungen und Schutz',4,'Schnellversiegelung',30,true,true,1),
('schutz','Versiegelungen und Schutz',4,'Polymer-Versiegelung',60,true,true,2),
('schutz','Versiegelungen und Schutz',4,'Wachsversiegelung',60,true,true,3),
('schutz','Versiegelungen und Schutz',4,'Hartwachs',90,true,true,4),
('schutz','Versiegelungen und Schutz',4,'Keramikversiegelung',240,true,true,5),
('schutz','Versiegelungen und Schutz',4,'Mehrschicht-Keramikversiegelung',420,true,true,6),
('schutz','Versiegelungen und Schutz',4,'Graphenbasierte Beschichtung',300,true,true,7),
('schutz','Versiegelungen und Schutz',4,'Felgenversiegelung',60,true,true,8),
('schutz','Versiegelungen und Schutz',4,'Glasversiegelung',45,true,true,9),
('schutz','Versiegelungen und Schutz',4,'Scheibenversiegelung',30,true,true,10),
('schutz','Versiegelungen und Schutz',4,'Kunststoffversiegelung',45,true,true,11),
('schutz','Versiegelungen und Schutz',4,'Lederbeschichtung',60,true,true,12),
('schutz','Versiegelungen und Schutz',4,'Textilimprägnierung',45,true,true,13),
('schutz','Versiegelungen und Schutz',4,'Cabriodachimprägnierung',45,true,true,14),
('schutz','Versiegelungen und Schutz',4,'Keramikversiegelungs-Wartung',90,true,true,15),
('schutz','Versiegelungen und Schutz',4,'Versiegelungskontrolle',20,false,true,16),
('spezial','Spezialleistungen',5,'Verkaufsaufbereitung',300,true,true,0),
('spezial','Spezialleistungen',5,'Leasingrückgabe-Aufbereitung',300,true,true,1),
('spezial','Spezialleistungen',5,'Neuwagenaufbereitung',240,true,true,2),
('spezial','Spezialleistungen',5,'Oldtimeraufbereitung',480,true,true,3),
('spezial','Spezialleistungen',5,'Youngtimeraufbereitung',360,true,true,4),
('spezial','Spezialleistungen',5,'Luxusfahrzeugaufbereitung',480,true,true,5),
('spezial','Spezialleistungen',5,'Sportwagenaufbereitung',420,true,true,6),
('spezial','Spezialleistungen',5,'Wohnmobilaufbereitung',600,true,true,7),
('spezial','Spezialleistungen',5,'Motorradaufbereitung',180,true,true,8),
('spezial','Spezialleistungen',5,'Firmenflottenaufbereitung',180,true,true,9),
('spezial','Spezialleistungen',5,'Taxi-Aufbereitung',150,true,true,10),
('spezial','Spezialleistungen',5,'Transporteraufbereitung',240,true,true,11),
('spezial','Spezialleistungen',5,'Baustellenfahrzeug-Reinigung',180,true,true,12),
('spezial','Spezialleistungen',5,'Extremverschmutzungs-Aufbereitung',480,true,true,13),
('spezial','Spezialleistungen',5,'Tiertransportfahrzeug-Reinigung',240,true,true,14),
('spezial','Spezialleistungen',5,'Smart Repair',90,false,true,15),
('spezial','Spezialleistungen',5,'Dellenentfernung',60,false,true,16),
('spezial','Spezialleistungen',5,'Steinschlagbehandlung',30,false,false,17),
('spezial','Spezialleistungen',5,'PPF-Lackschutzfolie',960,false,true,18),
('spezial','Spezialleistungen',5,'Teilfolierung',480,false,true,19),
('spezial','Spezialleistungen',5,'Scheibentönung',240,false,true,20),
('spezial','Spezialleistungen',5,'Geruchsneutralisation',60,true,true,21),
('spezial','Spezialleistungen',5,'Individuelle Sonderleistung',60,true,true,22);

create table public.package_template (
  id serial primary key,
  name text not null,
  description text,
  discount_percent numeric(5,2) not null default 0,
  service_names text[] not null
);
alter table public.package_template enable row level security;
create policy package_template_read on public.package_template for select to authenticated using (true);

insert into public.package_template (name, description, discount_percent, service_names) values
('Basic Außen','Gründliche Handwäsche inklusive Felgen und Scheiben.',0,array['Fahrzeugvorwäsche','Handwäsche','Felgenreinigung','Scheibenreinigung außen','Reifenpflege']),
('Premium Außen','Schonende Wäsche mit Dekontamination und Schutzversiegelung.',5,array['Schaumwäsche / Snow Foam','Zwei-Eimer-Wäsche','Felgentiefenreinigung','Insektenentfernung','Flugrostentfernung','Reinigungsknete','Polymer-Versiegelung','Reifenpflege','Scheibenreinigung außen']),
('Basic Innen','Innenraum saugen, Kunststoffe und Scheiben reinigen.',0,array['Innenraum saugen','Kofferraum saugen','Fußmattenreinigung','Innenraumkunststoffe reinigen','Scheibenreinigung innen']),
('Premium Innen','Tiefenreinigung inklusive Polster und Pflege.',5,array['Innenraum saugen','Kofferraum saugen','Fußmattenreinigung','Sprühextraktion','Lüftungsdüsen reinigen','Innenraumkunststoffe reinigen','Kunststoffpflege innen','Scheibenreinigung innen']),
('Komplettaufbereitung','Innen und außen – das Rundum-Paket.',10,array['Schaumwäsche / Snow Foam','Handwäsche','Felgentiefenreinigung','Reinigungsknete','Einstufige Politur','Polymer-Versiegelung','Innenraum saugen','Sprühextraktion','Innenraumkunststoffe reinigen','Kunststoffpflege innen','Scheibenreinigung innen','Scheibenreinigung außen']),
('Verkaufsaufbereitung','Optimale Präsentation für den Fahrzeugverkauf.',5,array['Handwäsche','Felgenreinigung','Motorraumreinigung','Einstufige Politur','Innenraum saugen','Polsterreinigung','Innenraumkunststoffe reinigen','Geruchsentfernung']),
('Leasingrückgabe','Aufbereitung vor der Leasingrückgabe, inkl. Spot-Politur.',5,array['Handwäsche','Felgentiefenreinigung','Spot-Politur','Innenraum saugen','Fleckenentfernung','Innenraumkunststoffe reinigen','Scheibenreinigung innen']),
('Keramik Premium','Lackkorrektur und mehrschichtige Keramikversiegelung.',8,array['Lackzustandsanalyse','Lackdickenmessung','Lackdekontamination','Reinigungsknete','Zweistufige Politur','Mehrschicht-Keramikversiegelung','Felgenversiegelung','Glasversiegelung','Lackkontrolle mit Prüfbeleuchtung']);

-- Katalog einer Firma aus der Vorlage befüllen
create or replace function public.seed_company_catalog(cid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  pt record;
  pid uuid;
begin
  insert into service_categories(company_id, key, name, sort)
  select distinct cid, category_key, category_name, category_sort from catalog_template
  on conflict do nothing;

  insert into services(company_id, category_id, name, duration_minutes, applies_soiling, applies_vehicle_class, sort, active)
  select cid, sc.id, t.name, t.duration_minutes, t.applies_soiling, t.applies_vehicle_class, t.sort, true
  from catalog_template t join service_categories sc on sc.company_id = cid and sc.key = t.category_key;

  for pt in select * from package_template order by id loop
    insert into packages(company_id, name, description, price_mode, discount_percent)
    values (cid, pt.name, pt.description, 'discount', pt.discount_percent) returning id into pid;
    insert into package_items(package_id, service_id, company_id)
    select pid, s.id, cid from services s where s.company_id = cid and s.name = any(pt.service_names)
    on conflict do nothing;
  end loop;
end; $$;
revoke execute on function public.seed_company_catalog(uuid) from public, anon, authenticated;

-- Firma anlegen: legt Firma, Inhaber-Mitgliedschaft und Standardkatalog an
create or replace function public.create_company(company_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Nicht angemeldet'; end if;
  if company_name is null or char_length(trim(company_name)) < 2 then raise exception 'Firmenname zu kurz'; end if;
  if (select count(*) from memberships where user_id = uid and role = 'owner') >= 5 then
    raise exception 'Maximale Anzahl an Firmen erreicht';
  end if;
  insert into companies(name) values (trim(company_name)) returning id into cid;
  insert into memberships(company_id, user_id, role, can_edit_prices) values (cid, uid, 'owner', true);
  insert into profiles(user_id) values (uid) on conflict do nothing;
  perform public.seed_company_catalog(cid);
  return cid;
end; $$;
revoke execute on function public.create_company(text) from public, anon;
grant execute on function public.create_company(text) to authenticated;
