# DetailFlow

Betriebssoftware (B2B-SaaS) für professionelle Fahrzeugaufbereiter, Detailing-Studios und Keramikversiegelungs-Spezialisten.
Von der Anfrage über Kalkulation, Angebot und Auftrag bis zur Fahrzeugübergabe.

> Stand: **Phasen 1–3** sowie aus Phase 4 **Rechnungen inkl. E-Rechnung, Kundenportal, Online-Anfrage und Nachrichten** sind umgesetzt.
> Offen: Material/Lager, automatische Erinnerungen, Stripe-Abos – siehe [Status](#status).
>
> **Klickbare Demo ohne Konto:** `demo/detailflow-demo.html` (eigenständige Seite mit Beispieldaten und derselben Preislogik).

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
│  │  ├─ …0003_catalog.sql       Leistungskatalog-Vorlage (136 Leistungen, 8 Pakete), create_company()
│  │  ├─ …0004_operations.sql    Boxen + Belegungsschutz, Fotos, Checklisten, Auswertungs-Views
│  │  ├─ …0005_invoices_portal.sql Rechnungen (GoBD-Schutz, Storno, Hash), Kundenportal, Online-Anfrage, Nachrichten
│  │  ├─ …0006_revenue_share.sql  Umsatzbeteiligung: Tarifwerte, Stripe Connect, Plattformgebühren
│  │  ├─ …0007_no_fee_cap.sql     Umsatzbeteiligung ohne Obergrenze
│  │  ├─ …0008_automation.sql     Erinnerungen, Mahnstufen, DATEV-Einstellungen, Angebote bearbeiten
│  │  └─ …0009_growth.sql         Anzahlungen, Gutscheine, Pflege-Abos, Bewertungen, Empfehlungen, neue Zielgruppen
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
   ├─ unit/time.test.ts           7 Tests Zeitzone Europe/Berlin (Sommer-/Winterzeit)
   └─ db/tenant-isolation.test.ts 27 Tests Mandantentrennung & Geschäftsregeln gegen echtes PostgreSQL
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
- **Diagrammbibliothek:** Bewusst keine. Die Auswertungen nutzen schlanke, serverseitig gerenderte SVG-Diagramme (eine Datenreihe, Tooltips, Tabellenansicht) – kein zusätzliches JavaScript im Browser.
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
| **Umsatzbeteiligung:** Endkunden bezahlen Rechnungen online im Portal (Stripe Connect, Destination Charge); Plattform behält 0,5 % (konfigurierbar in `plans.revenue_share_bps`; optionale Monats-Obergrenze `revenue_share_cap_cents`, standardmäßig keine) | ✅ (Gebührenlogik, DB-Rechte, Doppelbuchungsschutz – Tests) / 🟢 (Stripe-Aufrufe) | **nicht gegen Stripe getestet** – vor Start im Stripe-Testmodus durchspielen |
| Grundgebühr als Stripe-Abo (Checkout + Kundenportal), Webhook setzt Tarif/Status | 🟢 | benötigt Stripe-Preise je Tarif |
| Kalender Tag (Spalten je Box) / Woche / Monat, „Noch nicht eingeplant“ | 🟢 | Zeiten konsequent in Europe/Berlin (7 Unit-Tests) |
| Arbeitsplätze/Boxen, Doppelbelegung in der DB ausgeschlossen (Exclusion Constraint) | ✅ | getestet |
| Mitarbeiter-Überschneidungswarnung | 🟢 | |
| Fotodokumentation (6 Kategorien, Kamera-Upload, Vorher/Nachher-Schieberegler, signierte URLs) | ✅ (DB/Storage-Rechte) / 🟢 (UI) | Pfad- und Firmenprüfung getestet |
| Checklisten (7 Standardvorlagen, abhaken mit Person/Zeit, Problem melden, eigene Vorlagen) | ✅ (DB) / 🟢 (UI) | Protokollierung getestet |
| Auswertungen (Umsatz/Monat, nach Leistung, Ø-Wert, Gewinn, Annahmequote, Wiederkehrer, Arbeitszeit, Material, Auslastung) | ✅ (Views/RLS) / 🟢 (UI) | Tarifabhängig ab Professional |
| Rechnungen: Entwurf aus Auftrag, lückenlose Nummer erst beim Finalisieren, Leistungsdatum, eingefrorene Firmen-/Kundendaten, SHA-256-Prüfsumme | ✅ (DB) / 🟢 (UI) | getestet |
| Finalisierte Rechnungen unveränderbar & nicht löschbar, Korrektur nur per Stornorechnung | ✅ | getestet |
| Zahlungen erfassen (Teilzahlungen, Status „bezahlt“), Zahlungen unveränderbar | ✅ | getestet |
| E-Rechnung XRechnung 3.0 (UBL 2.1) als XML-Download, Kleinunternehmer, Storno (Typ 384) | ✅ (Generator, 7 Tests) | ⚖️ vor Produktivbetrieb mit KoSIT-Validator prüfen; ZUGFeRD (PDF/A-3) offen |
| Kundenportal per persönlichem Link: Status-Fortschritt, Termin, Vorher/Nachher, Angebote, Rechnungen, Nachrichten | ✅ (DB) / 🟢 (UI) | Fotos im Portal benötigen `SUPABASE_SERVICE_ROLE_KEY` |
| Online-Anfrage `/buchen/<adresse>`: legt Kunde, Fahrzeug, Anfrage und Nachricht an | ✅ (DB) / 🟢 (UI) | Honeypot, Rate-Limit, Einwilligung |
| Nachrichten-Postfach mit Vorlagen (Termin, Erinnerung, Abholbereit, Pflegehinweise, Rechnung) | 🟢 | E-Mail-Versand vorbereitet (Resend), ohne Schlüssel nur Portal |
| Automatische Terminerinnerung (Vortag) und Mahnwesen in 3 Stufen (Fristen je Betrieb), täglicher Job `/api/cron/reminders` | ✅ (Fälligkeitslogik, Rechte – Tests) / 🟢 (Versand) | benötigt E-Mail-Versand + `CRON_SECRET`; Vercel Cron in `vercel.json` |
| DATEV-Export (EXTF-Buchungsstapel, Windows-1252) und Rechnungsausgangsbuch (Excel) | ✅ (Format – 6 Tests) | ⚖️ ersten Import mit Steuerberatung testen; Konten in Einstellungen |
| Angebotsentwürfe bearbeiten (Kalkulator mit gespeicherter Eingabe) | ✅ (DB) / 🟢 (UI) | |
| Kalender: Termine per Drag & Drop verschieben (Tag/Zeit/Box), Box-Doppelbelegung wird abgelehnt | 🟢 | Desktop; auf Touch-Geräten über den Auftrag |
| **Bezahlen vor Ort per QR-Code** (Kunde zahlt mit eigenem Handy; 0,5 % Gebühr) | 🟢 | Tap to Pay am Handy erfordert eine native App (offen) |
| **Anzahlung** bei Online-Anfrage (fester Betrag, automatische Anrechnung auf die Rechnung) | ✅ (DB) / 🟢 (Stripe) | ⚖️ USt. auf Anzahlungen mit Steuerberatung klären |
| **Gutscheine**: Online-Shop `/gutschein/<adresse>`, Verkauf vor Ort, Einlösung auf Rechnungen (Teil-/Resteinlösung, 3 Jahre gültig) | ✅ (DB – Tests) / 🟢 (Stripe/UI) | Mehrzweck-Gutschein: USt. erst bei Einlösung |
| **Pflege-Abos** für Endkunden (Stripe-Abo auf dem Konto des Betriebs, 0,5 % Plattformanteil) | ✅ (DB-Rechte) / 🟢 (Stripe) | benötigt Connect-Webhook |
| **Google-Bewertungen** automatisch 1–3 Tage nach Abschluss anfragen + Button im Auftrag | ✅ (Fälligkeit – Tests) / 🟢 (Versand) | |
| **Mobiler Service**: Anfahrtskosten je km im Kalkulator | ✅ (Unit-Test) | |
| **WhatsApp**: Nachricht mit Vorlage per WhatsApp öffnen (wa.me) | 🟢 | WhatsApp-Business-API (automatisch) offen |
| **Installierbare App** (Web-App-Manifest, Icons, Kurzbefehle) | 🟢 | |
| **Empfehlungsprogramm**: Link je Betrieb, 30 Tage Test für Geworbene, 1 Monat Guthaben für Werbende | ✅ (Missbrauchsschutz – Tests) / 🟢 (Stripe-Gutschrift) | |
| Zielgruppen Folierung & Smart Repair (12 zusätzliche Leistungsvorlagen) | ✅ | |
| Material/Lager | ⚪ | |
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

**Letzter Lauf (in dieser Entwicklungsumgebung):** 91/91 Tests bestanden (48 DB, 43 Unit), `tsc` fehlerfrei, `next build` erfolgreich.
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

## Abrechnungsmodell & Stripe einrichten

Modell: **Grundgebühr je Tarif + 0,5 % der online bezahlten Rechnungen, ohne Obergrenze** (Werte in Tabelle `plans`, ohne Codeänderung anpassbar). Bar- und Überweisungszahlungen sind gebührenfrei.

1. Stripe-Konto der Plattform anlegen, **Connect** aktivieren (Express-Konten, Land DE).
2. Je Tarif ein Produkt mit monatlichem Preis anlegen → IDs in `STRIPE_PRICE_STARTER/PROFESSIONAL/BUSINESS`.
3. Webhook-Endpunkt `<APP_URL>/api/stripe/webhook` (zusätzlich als **Connect-Webhook** für Pflege-Abos) mit den Ereignissen `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.updated`, `customer.subscription.deleted`, `account.updated` (für Connect-Konten „Events on Connected accounts“ aktivieren) → Signing Secret in `STRIPE_WEBHOOK_SECRET`.
4. `STRIPE_SECRET_KEY` und `SUPABASE_SERVICE_ROLE_KEY` setzen (beide nur serverseitig).
5. Alles im **Testmodus** durchspielen: Betrieb verbindet Stripe → Rechnung finalisieren → im Kundenportal bezahlen (Testkarte 4242 …) → Zahlung und Gebühr erscheinen in der App.

⚖️ Vor dem Start: Gebührenmodell in AGB/Vertrag aufnehmen, Rechnungsstellung der Plattformgebühren an die Betriebe (eigene Buchhaltung bzw. Stripe-Rechnungen) mit Steuerberatung klären; Rückerstattungen (Refund inkl. Gebühr) sind noch nicht in der App abgebildet.

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
- ⚖️ **E-Rechnung (B2B):** Empfangspflicht seit 2025, Ausstellungspflicht gestaffelt ab 2027/2028 (nur B2B, nicht für Privatkunden). XRechnung-Export ist implementiert; vor Produktivbetrieb mit dem KoSIT-Validator prüfen und mit Steuerberatung abstimmen.
- ⚖️ **Kleinunternehmerregelung § 19 UStG** (Hinweistext und Grenzen) und Steuersätze – fachlich prüfen.
- ⚖️ **DSGVO:** Auftragsverarbeitungsvertrag (AVV) mit Kunden-Betrieben, AVV mit Supabase/Vercel, Hosting in der EU, Löschkonzept,
  Verzeichnis der Verarbeitungstätigkeiten, Datenschutzerklärung, Impressum. Fahrzeugfotos (Kennzeichen, Personen) sind personenbezogen.
- ⚖️ **Kundenkommunikation:** Keine Werbung ohne Einwilligung (UWG § 7); Transaktionsnachrichten getrennt halten.
- ⚖️ **Leistungen wie „Desinfektion“ und „Ozonbehandlung“** sind im Katalog entsprechend gekennzeichnet – Zulässigkeit/Arbeitsschutz prüfen.
- ⚖️ **AGB / Nutzungsbedingungen** der SaaS sowie Standard-Angebotsbedingungen.
- ⚖️ **Online-Annahme von Angeboten** – Beweiswert und ggf. Widerrufsbelehrung bei Verbrauchern (Fernabsatz) prüfen.

---

## Implementierungsplan (nächste Phasen)

**Phase 3 – Betriebsverwaltung** ✔ umgesetzt (offen: Drag & Drop im Kalender, Bildverkleinerung vor Upload, Fotos im Kundenlink)

**Phase 4 – Erweiterungen**
5. Rechnungen: `invoices`/`invoice_items` mit Status *Entwurf → finalisiert* (danach unveränderlich, Trigger), Storno als eigene Rechnung, Hash-Kette für Revisionssicherheit, XRechnung/ZUGFeRD-Export.
6. Material & Lager: `materials`, `stock_movements`, Verbrauch je Auftrag, Mindestbestand-Hinweise.
7. Kommunikation: Vorlagen + Versand über einen EU-Mailanbieter (z. B. Postmark/Brevo), immer mit Vorschau und manueller Freigabe.
8. Stripe: Checkout-Session, Customer-Portal, Webhook (`/api/stripe/webhook`, Signaturprüfung, Service-Role nur dort), Feature-Gates aus `plans.features`.

**Phase 5 – Qualitätssicherung**
9. Playwright-E2E gegen `supabase start` (Registrierung → Onboarding → Angebot → Annahme → Auftrag), mobile Viewports.
10. Generierte Supabase-Typen (`supabase gen types`) für vollständige Typsicherheit, Lasttests, Lighthouse.
