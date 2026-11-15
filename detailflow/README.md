# DetailFlow

Betriebssoftware (B2B-SaaS) für professionelle Fahrzeugaufbereiter, Detailing-Studios und Keramikversiegelungs-Spezialisten.
Von der Anfrage über Kalkulation, Angebot und Auftrag bis zur Fahrzeugübergabe.

> Stand: **Phase 1 (Architektur) und Phase 2 (funktionsfähiger Kern)** sind umgesetzt.
> Phasen 3–5 sind architektonisch vorbereitet, aber noch nicht gebaut – siehe [Status](#status).

---

## Inhalt

1. [Architekturüberblick](#architekturüberblick)
2. [Status](#status) – was implementiert, getestet, vorbereitet oder offen ist
3. [Lokale Entwicklung](#lokale-entwicklung)
4. [Tests](#tests)
5. [Deployment](#deployment)
6. [Sicherheit & Mandantentrennung](#sicherheit--mandantentrennung)
7. [Rechtlich/steuerlich zu prüfen](#vor-dem-produktivbetrieb-rechtlich--steuerlich-zu-prüfen)
8. [Implementierungsplan (nächste Phasen)](#implementierungsplan-nächste-phasen)

---

## Architekturüberblick

```
Browser ──► Next.js 15 (App Router, Server Components, Server Actions)
              │   • Middleware: Sitzungs-Refresh, Schutz aller /app-Routen
              │   • Server Actions: Zod-Validierung → Supabase mit Benutzer-JWT
              │   • Preislogik (src/lib/pricing.ts) läuft im Browser (Live-Vorschau)
              │     UND serverseitig (verbindliche Neuberechnung beim Speichern)
              ▼
         Supabase
              • Auth (E-Mail/Passwort, Bestätigung, Passwort-Reset)
              • PostgreSQL mit Row-Level Security auf JEDER Fachtabelle
              • RPC-Funktionen für atomare Vorgänge (Nummernkreise, Angebot→Auftrag, Zusammenführen)
              • Storage-Bucket „company-files“ (privat, Pfad = <company_id>/…)
```

**Mandantenmodell:** Jede fachliche Tabelle hat `company_id`. Benutzer gehören über `memberships` (mit Rolle) zu einer oder mehreren Firmen.
Die App verwendet **nie** den Service-Role-Key für Benutzeraktionen – jede Abfrage läuft mit dem JWT des Benutzers, die Datenbank erzwingt die Trennung.

**Rollen:** `owner` (Inhaber), `admin` (Administrator), `office` (Büro/Verwaltung), `staff` (Mitarbeiter) + Einzelrecht `can_edit_prices`.

| Aktion | Inhaber | Admin | Büro | Mitarbeiter |
|---|---|---|---|---|
| Kunden/Fahrzeuge/Angebote/Aufträge lesen & anlegen | ✔ | ✔ | ✔ | ✔ |
| … löschen | ✔ | ✔ | ✔ | ✖ |
| Leistungen & Preise ändern, Rabatte geben | ✔ | ✔ | nur mit Preisrecht | nur mit Preisrecht |
| Firmendaten ändern, Mitarbeiter einladen | ✔ | ✔ | ✖ | ✖ |
| Rollen ändern / Mitarbeiter entfernen | ✔ | ✖ | ✖ | ✖ |
| Audit-Log lesen | ✔ | ✔ | ✖ | ✖ |

### Projektstruktur

```
detailflow/
├─ supabase/
│  ├─ migrations/
│  │  ├─ …0001_core.sql          Tabellen, Enums, Konsistenz-Trigger (gleiche Firma), Statusverlauf
│  │  ├─ …0002_security_rpc.sql  RLS-Policies, Tarife, Audit-Log, Nummernkreise, RPCs, Storage-Policies
│  │  └─ …0003_catalog.sql       Leistungskatalog-Vorlage (136 Leistungen, 8 Pakete), create_company()
│  └─ seed.sql                   Beispieldaten (2 Betriebe, Kunden, Fahrzeuge, Angebote, Aufträge)
├─ src/
│  ├─ middleware.ts              Auth-Schutz & Session-Refresh
│  ├─ lib/
│  │  ├─ pricing.ts              Preiskalkulation (rein, getestet)
│  │  ├─ domain.ts               Fachliche Konstanten, deutsche Labels
│  │  ├─ validation.ts           Zod-Schemas
│  │  ├─ auth.ts                 Benutzer-/Firmenkontext (aktive Firma wird gegen Mitgliedschaft geprüft)
│  │  ├─ catalog.ts              Katalog laden
│  │  ├─ rate-limit.ts           Rate Limiting (In-Memory)
│  │  └─ supabase/               Server- und Admin-Client
│  ├─ app/
│  │  ├─ actions/                Server Actions je Modul
│  │  ├─ (auth)/                 Login, Registrierung, Passwort vergessen
│  │  ├─ onboarding/             7-Schritt-Einrichtungsassistent
│  │  ├─ app/                    Geschützter Bereich (Dashboard, Kunden, Fahrzeuge, Leistungen, Angebote, Aufträge, Einstellungen)
│  │  ├─ angebot/[token]         Öffentliche Angebotsansicht mit Annahme/Ablehnung
│  │  └─ einladung/[token]       Team-Einladung annehmen
│  └─ components/                UI-Bausteine & Formulare
└─ tests/
   ├─ unit/pricing.test.ts       15 Tests Preislogik
   └─ db/tenant-isolation.test.ts 19 Tests Mandantentrennung & Geschäftsregeln gegen echtes PostgreSQL
```

### Tatsächlich verwendete Versionen

| Paket | Version |
|---|---|
| Next.js | 15.5.29 |
| React / React DOM | 19.1.1 |
| TypeScript | 5.9.3 |
| Tailwind CSS (+ @tailwindcss/postcss) | 4.1.18 |
| @supabase/supabase-js | 2.119.0 |
| @supabase/ssr | 0.12.7 |
| Zod | 4.3.5 |
| lucide-react | 1.73.0 |
| Vitest | 3.2.7 |
| pg (nur Tests) | 8.23.1 |
| PostgreSQL (lokal getestet) | 16 |
| Node.js | 22 |

**Abweichungen vom Wunsch-Stack (bewusst):**
- **shadcn/ui:** Nicht per CLI installiert. Die UI-Bausteine (`src/components/ui`) folgen demselben Muster (Tailwind + `cn()`), ohne Radix-Abhängigkeit. Können später 1:1 durch shadcn-Komponenten ersetzt werden.
- **React Hook Form:** Noch nicht verwendet. Formulare nutzen Server Actions + `useActionState` mit serverseitiger Zod-Validierung (funktioniert auch ohne JavaScript). RHF lohnt sich für die komplexeren Formulare der Phasen 3/4.
- **Diagrammbibliothek:** Kommt mit dem Auswertungsmodul (Phase 3, Empfehlung: Recharts).
- **Next.js 16** ist inzwischen verfügbar; 15.5 wurde als gut erprobte Linie gewählt. Upgrade (u. a. `middleware` → `proxy`) ist überschaubar.

---

## Status

Legende: ✅ implementiert & getestet · 🟢 implementiert (Build/Typecheck ok, **nicht** end-to-end gegen eine laufende Supabase-Instanz getestet) · 🟡 vorbereitet (Datenmodell/Integration/Umgebungsvariablen) · ⚪ offen

| Bereich | Status | Anmerkung |
|---|---|---|
| Multi-Tenant-Datenmodell + RLS | ✅ | 19 automatische Tests gegen PostgreSQL 16 mit den Produktionsmigrationen |
| Konsistenz-Trigger (keine fremden IDs verknüpfbar) | ✅ | getestet |
| Nummernkreise (fortlaufend je Firma/Jahr) | ✅ | getestet |
| Preiskalkulation (Klasse, Verschmutzung, Pakete, Doppelberechnung, Mindestpreis, Rabatt, Override, Kleinunternehmer, Marge) | ✅ | 15 Unit-Tests |
| Öffentlicher Angebotslink + Annahme | ✅ (DB) / 🟢 (UI) | Token-RPC getestet |
| Angebot → Auftrag | ✅ (DB) / 🟢 (UI) | idempotent, getestet |
| Kunden zusammenführen | ✅ (DB-Berechtigung) / 🟢 (UI) | |
| Registrierung, Login, Passwort-Reset, E-Mail-Bestätigung | 🟢 | über Supabase Auth |
| Onboarding-Assistent (7 Schritte inkl. Logo-Upload) | 🟢 | |
| Dashboard (Heute, Woche, laufend, abholbereit, offene Angebote, Monatsumsatz) | 🟢 | |
| Kundenverwaltung (CRUD, Suche, Filter, Historie, Rechnungsanschrift) | 🟢 | |
| Fahrzeugakte (alle Felder, Klassen, Pflegehistorie) | 🟢 | |
| Leistungskatalog (136 Vorlagen, editierbar, deaktivierbar, Schnellpreis, Größenzuschläge) | 🟢 | Vorlage ohne Preise – jede Firma setzt eigene |
| Pakete (Rabatt- oder Festpreis) | 🟢 | |
| Kalkulator mit transparenter Preiszusammensetzung | 🟢 | Server rechnet beim Speichern neu |
| Angebote (Status, Druck/PDF über Browser, Logo, Steuer) | 🟢 | |
| Aufträge (11 Status, Kanban + Liste, Zuweisung, Termin, Überschneidungswarnung, Leistungen abhaken, Verlauf) | 🟢 | |
| Team: Einladung per Link, Rollen, Preisrecht, Benutzerlimit je Tarif | 🟢 | Einladungs-E-Mail nicht angebunden – Link wird angezeigt |
| Firmeneinstellungen, Preisregeln, Öffnungszeiten, Nummernkreis-Präfixe | 🟢 | |
| Dark Mode, responsive (Sidebar Desktop / Bottom-Nav Mobile) | 🟢 | |
| Audit-Log (Löschungen, Statuswechsel, Preisänderungen, Mitgliedschaften) | ✅ | |
| Security-Header, Rate Limiting (Login, Registrierung, Reset, öffentliche Links) | 🟢 | In-Memory → für mehrere Instanzen Redis nötig |
| Tarife Starter/Professional/Business | 🟡 | Tabelle `plans` (Preise/Limits änderbar ohne Code); Benutzerlimit wird erzwungen |
| Stripe-Abonnements | 🟡 | Env-Variablen + Felder + Schutz vor Client-Änderung; Checkout/Webhook **nicht** implementiert |
| Storage für Fotos | 🟡 | Bucket + RLS-Policies + Tests; Foto-UI offen |
| Angebote bearbeiten (Entwurf) | ⚪ | aktuell: neu kalkulieren |
| Kalender (Tag/Woche/Monat), Arbeitsplätze/Boxen | ⚪ | Phase 3 (Termine sind bereits an Aufträgen) |
| Checklisten, Fotodokumentation, Auswertungen | ⚪ | Phase 3 |
| Rechnungen, E-Rechnung (XRechnung/ZUGFeRD), Storno | ⚪ | Phase 4 – Nummernkreis & Präfix vorhanden |
| Material/Lager, Kundenkommunikation (E-Mail), Automatisierungen | ⚪ | Phase 4 |
| Serverseitige PDF-Erzeugung | ⚪ | derzeit Browser-Druck „Als PDF speichern“ |
| E2E-Tests (Playwright) gegen laufende Supabase | ⚪ | |

---

## Lokale Entwicklung

Voraussetzungen: Node.js 22, Docker (für Supabase lokal) oder ein Supabase-Cloud-Projekt.

```bash
cd detailflow
npm install
cp .env.example .env.local

# Variante A: Supabase lokal (empfohlen)
npx supabase init          # legt supabase/config.toml an, bestehende migrations/ bleiben erhalten
npx supabase start         # gibt API-URL und anon key aus → in .env.local eintragen
npx supabase db reset      # spielt Migrationen + seed.sql ein

# Variante B: Supabase Cloud
npx supabase link --project-ref <ref>
npx supabase db push       # Migrationen einspielen (seed.sql NICHT in Produktion!)

npm run dev                # http://localhost:3000
```

Demo-Logins nach `db reset` (nur lokal):

| E-Mail | Passwort | Rolle |
|---|---|---|
| inhaber@premium-detailing.test | DetailFlow!2026 | Inhaber „Premium Detailing Köln“ |
| mitarbeiter@premium-detailing.test | DetailFlow!2026 | Mitarbeiter (ohne Preisrecht) |
| chef@autocare-bonn.test | DetailFlow!2026 | Inhaber „AutoCare Bonn“ |

Supabase-Auth-Einstellungen: *Site URL* = `NEXT_PUBLIC_APP_URL`, *Redirect URLs* += `<APP_URL>/auth/callback`.

---

## Tests

```bash
npm run typecheck
npm run test:unit                               # Preislogik, ohne Datenbank
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/detailflow_test npm run test:db
npm test                                        # alles (DB-Tests werden ohne TEST_DATABASE_URL übersprungen)
```

Die DB-Tests erstellen die Testdatenbank **bei jedem Lauf neu**, spielen eine minimale Supabase-Nachbildung
(`tests/db/supabase-shim.sql`: Rollen `anon`/`authenticated`, `auth.uid()` aus JWT-Claims, `storage.objects`) und danach die
echten Migrationen ein. Jede Abfrage läuft als Rolle `authenticated` mit gesetzten JWT-Claims – genau wie bei Supabase.

Geprüft wird u. a.: Firma A sieht/ändert/löscht keine Kunden, Fahrzeuge, Angebote, Positionen, Leistungen, Pakete, Mitgliedschaften
oder **Dateien** von Firma B; kann keine Datensätze in B anlegen, keine fremden IDs verknüpfen, `company_id` nicht verschieben,
keine fremden Angebote umwandeln, keine fremden Nummernkreise nutzen; Mitarbeiter können keine Preise ändern, nicht löschen und
ihre Rolle nicht erhöhen; Tarifdaten sind clientseitig unveränderlich; anonyme Nutzer sehen nur per gültigem Token ein Angebot ohne
interne Kalkulationsdaten.

**Letzter Lauf (in dieser Entwicklungsumgebung):** 34/34 Tests bestanden (19 DB, 15 Unit), `tsc` fehlerfrei, `next build` erfolgreich.
Die Oberfläche wurde **nicht** gegen eine laufende Supabase-Instanz durchgeklickt.

CI: `.github/workflows/detailflow-ci.yml` (Typecheck, alle Tests mit PostgreSQL-Service, Build).

---

## Deployment

**Empfohlen: Vercel (Region `fra1`) + Supabase (Region Frankfurt `eu-central-1`).**

1. Supabase-Projekt anlegen (EU-Region), `npx supabase link` + `npx supabase db push`.
2. Auth: E-Mail-Bestätigung aktivieren, eigene SMTP-Zugangsdaten hinterlegen (Supabase-Standard-SMTP ist stark limitiert),
   Site-URL/Redirect-URLs setzen, Passwort-Mindestlänge ≥ 10.
3. Vercel-Projekt mit Root Directory `detailflow`, Umgebungsvariablen aus `.env.example` setzen
   (`SUPABASE_SERVICE_ROLE_KEY` nur als *Server*-Variable, nie `NEXT_PUBLIC_`).
4. Domain + HTTPS (HSTS-Header ist gesetzt).
5. **Backups:** Supabase Pro → tägliche Backups + Point-in-Time-Recovery aktivieren. Zusätzlich wöchentlicher
   `pg_dump` in einen separaten EU-Speicher; Wiederherstellung quartalsweise testen. Storage-Bucket separat sichern.
6. Monitoring: Fehler-Tracking (z. B. Sentry, EU-Hosting) und Supabase-Log-Alerts einrichten.
7. Mehrere Instanzen: `src/lib/rate-limit.ts` auf Redis/Upstash umstellen.

---

## Sicherheit & Mandantentrennung

- **RLS auf allen Tabellen**; Hilfsfunktionen `is_member`, `has_role`, `can_edit_prices` (security definer, fester `search_path`).
- **Konsistenz-Trigger:** Verknüpfte Datensätze (Kunde, Fahrzeug, Angebot, Leistung, Paket) müssen zur selben Firma gehören.
- **`company_id` unveränderlich** (Trigger).
- **Server Actions** validieren jede Eingabe mit Zod; Preise werden serverseitig neu berechnet; Rabatte/Override nur mit Preisrecht.
- **Aktive Firma** (Cookie) ist nur eine Auswahl und wird gegen die Mitgliedschaften geprüft – Berechtigung entscheidet allein die DB.
- **Öffentliche Angebotslinks:** 48-stelliger Zufallstoken, eigene RPC liefert nur freigegebene Felder, Rate Limit.
- **Angebote:** Positionen nach Versand gesperrt (Trigger) – nachträgliches „stilles“ Ändern ist nicht möglich.
- **Tarif-/Stripe-Felder** können nicht vom Client geändert werden (Trigger).
- **Audit-Log** (nur lesbar für Inhaber/Admin, für Clients nicht schreibbar).
- **Storage:** privater Bucket, Zugriff nur auf `<eigene company_id>/…`, Upload-Typ- und Größenprüfung, Auslieferung über signierte URLs.
- **Header:** HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy. Offene Redirects in Login/Callback verhindert.
- **Login-Antworten** verraten nicht, ob ein Konto existiert (Passwort-Reset).

---

## Vor dem Produktivbetrieb rechtlich / steuerlich zu prüfen

- ⚖️ **Rechnungen / GoBD:** Unveränderbarkeit, Aufbewahrung (8–10 Jahre), Verfahrensdokumentation. Das Rechnungsmodul ist noch nicht gebaut.
- ⚖️ **E-Rechnung (B2B):** Empfangspflicht seit 2025, Ausstellungspflicht gestaffelt ab 2027/2028 – XRechnung/ZUGFeRD mit Steuerberater abstimmen.
- ⚖️ **Kleinunternehmerregelung § 19 UStG** (Hinweistext und Grenzen) und Steuersätze – fachlich prüfen.
- ⚖️ **DSGVO:** Auftragsverarbeitungsvertrag (AVV) mit Kunden-Betrieben, AVV mit Supabase/Vercel, Hosting in der EU, Löschkonzept,
  Verzeichnis der Verarbeitungstätigkeiten, Datenschutzerklärung, Impressum. Fahrzeugfotos (Kennzeichen, Personen) sind personenbezogen.
- ⚖️ **Kundenkommunikation:** Keine Werbung ohne Einwilligung (UWG § 7); Transaktionsnachrichten getrennt halten.
- ⚖️ **Leistungen wie „Desinfektion“ und „Ozonbehandlung“** sind im Katalog entsprechend gekennzeichnet – Zulässigkeit/Arbeitsschutz prüfen.
- ⚖️ **AGB / Nutzungsbedingungen** der SaaS sowie Standard-Angebotsbedingungen.
- ⚖️ **Online-Annahme von Angeboten** – Beweiswert und ggf. Widerrufsbelehrung bei Verbrauchern (Fernabsatz) prüfen.

---

## Implementierungsplan (nächste Phasen)

**Phase 3 – Betriebsverwaltung**
1. Kalender (Tag/Woche/Monat) auf Basis `orders.scheduled_*`, Tabelle `workstations` (Boxen), Drag & Drop, Überschneidungsprüfung in der DB (Exclusion Constraint).
2. Fotodokumentation: Tabelle `order_photos` (Kategorie Vorher/Während/Nachher/Schaden/…), Upload in `company-files/<company>/orders/<order>/…`, Vorher-Nachher-Slider.
3. Checklisten: `checklist_templates` + `order_checklists` (abhaken, Zeit, verantwortliche Person, Problem melden).
4. Auswertungen mit Recharts (Umsatz/Monat, nach Leistung/Paket, Annahmequote, Auslastung, Wiederkehrer) über SQL-Views.

**Phase 4 – Erweiterungen**
5. Rechnungen: `invoices`/`invoice_items` mit Status *Entwurf → finalisiert* (danach unveränderlich, Trigger), Storno als eigene Rechnung, Hash-Kette für Revisionssicherheit, XRechnung/ZUGFeRD-Export.
6. Material & Lager: `materials`, `stock_movements`, Verbrauch je Auftrag, Mindestbestand-Hinweise.
7. Kommunikation: Vorlagen + Versand über einen EU-Mailanbieter (z. B. Postmark/Brevo), immer mit Vorschau und manueller Freigabe.
8. Stripe: Checkout-Session, Customer-Portal, Webhook (`/api/stripe/webhook`, Signaturprüfung, Service-Role nur dort), Feature-Gates aus `plans.features`.

**Phase 5 – Qualitätssicherung**
9. Playwright-E2E gegen `supabase start` (Registrierung → Onboarding → Angebot → Annahme → Auftrag), mobile Viewports.
10. Generierte Supabase-Typen (`supabase gen types`) für vollständige Typsicherheit, Lasttests, Lighthouse.
