# DEAL-NIVO V4 – Abschlussbericht „Kaufbegleiter“

Stand: 24.11.2026 · Branch `claude/ki-kaufpruefer-gebrauchtwaren-6suttz`

## 1. Bestandsaufnahme (vor V4)

| Bereich | Befund |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, PWA mit Service Worker |
| Datenbank | `DataStore`-Schnittstelle: Supabase (Postgres + RLS) oder lokale JSON-Datei (Demo/Render) |
| Auth | Supabase Auth bzw. lokale Sitzungen (scrypt) |
| KI | OpenAI Responses API mit Zod-Schemas, zentraler Kostenwächter (`guard.ts`) |
| Analyse-Pipeline | vorhanden und funktionsfähig (Extraktion, Marktwert, Risiken, Score, Verkäufer, Rückfragen) |
| Uploads | EXIF-freie Neukodierung, Löschfristen, Video → Frames per FFmpeg |
| Token/Zahlung | Wallet mit Reservierung, Stripe vorbereitet (inaktiv, Testmodus) |
| Hintergrundjobs | **nur im Arbeitsspeicher** (Video) → in V4 ersetzt |
| Mobile | PWA ohne Share Target, keine native App |

## 2. Status je Funktion

Legende: ✅ vollständig implementiert und getestet · 🟡 implementiert, aber noch nicht produktiv getestet · 🔧 technisch vorbereitet · ❌ nicht implementiert

### Funktion 1 – Teilen-Menü
| Bestandteil | Status |
|---|---|
| Zentraler Share-Import-Service (URL, Text, Titel, Bilder) | ✅ |
| Plattformerkennung + URL-Normalisierung (eBay, Kleinanzeigen, mobile.de, AutoScout24, Vinted) | ✅ |
| Erkennung bereits geprüfter Inserate (keine doppelte Analyse) | ✅ |
| SSRF-Schutz (https, Allowlist, DNS-Prüfung privater Netze, jede Weiterleitung geprüft) | ✅ |
| Web Share Target (PWA, Android/Chrome) `POST /share-target` → `/teilen` | ✅ serverseitig getestet, 🟡 auf echtem Android-Gerät nicht getestet |
| Screenshot-Fallback | ✅ |
| iOS Share Extension (Swift, App Group, kein Schlüssel) | 🔧 Quellcode in `mobile/ios`, **nicht gebaut** (kein macOS/Xcode) |
| Android-Sharesheet (`ACTION_SEND`, `ACTION_SEND_MULTIPLE`) | 🔧 Quellcode in `mobile/android`, **nicht gebaut** |

Hinweis: Eine installierte iOS-PWA erscheint **nicht** im Teilen-Menü. Auf dem iPhone gilt bis zur nativen App: Link kopieren und einfügen.

### Funktion 2 – Verkäuferchat
| Bestandteil | Status |
|---|---|
| Eingabe: Screenshots, Bildschirmaufnahme, Text | ✅ (Screenshots/Video brauchen KI-Schlüssel) |
| Zusammenführung mehrerer Screenshots, Duplikaterkennung | ✅ |
| Regelbasierte Warnsignale (Zahlung, Druck, Kanalwechsel, Spedition/Treuhand, Phishing-Links inkl. Nachahmer-Domains, Datenabfragen, unbeantwortete Fragen) | ✅ |
| Widersprüche Inserat ↔ Chat (Unfall, km, Scheckheft, Vorbesitzer, Mängel, Aktivierungssperre, Rechnung), Gegenüberstellung | ✅ |
| Belegt vs. möglich, Verneinungen, nur Verkäufernachrichten | ✅ |
| KI-Abgleich mit Halluzinationsschutz (nur echte Zitate, max. „möglich“) | ✅ mit Test-KI, 🟡 mit echter OpenAI nicht getestet |
| Empfehlungen, sichere Zahlwege, Rückfragen, Antwortvorschlag, aktualisierte Kaufempfehlung | ✅ |
| Datenschutz: Schwärzung (Standard an), Screenshots nach Auswertung gelöscht, Löschfrist (30 Tage), Löschen durch Nutzer | ✅ |
| Läuft als Hintergrundjob, keine Neuanalyse des Produkts, kein Token | ✅ |

### Funktion 3 – Besichtigungsassistent
| Bestandteil | Status |
|---|---|
| Dynamische Checklisten je Kategorie (Fahrzeug, Elektronik, Mode, Uhren, Gaming, Sonstiges) | ✅ |
| Individuelle Punkte aus Inserat, Bildbefunden, Schwachstellen, Risiken, fehlenden Angaben, Chat-Widersprüchen | ✅ |
| Status (In Ordnung / Auffällig / Nicht geprüft / Nicht anwendbar), Notizen, Fotos | ✅ |
| KI-Fotoprüfung inkl. Vergleich mit Inseratsfotos (sofern noch gespeichert) | 🟡 Code fertig, mit echter KI nicht getestet |
| Offline: Eingaben lokal gespeichert, automatische Synchronisierung (jüngste Änderung gewinnt), Seite offline erneut aufrufbar | ✅ (E2E mit simuliertem Offline-Modus) |
| Besichtigungsbericht mit aktualisierter Risikoeinschätzung, versioniert | ✅ |

### Funktion 4 – Inseratsverlauf und Preisalarm
| Bestandteil | Status |
|---|---|
| Schnappschüsse (nur tatsächlich erfasste Stände), Preisverlauf als Treppengrafik | ✅ |
| Änderungsanalyse (Preis, Attribute, entfernte/neue Kernaussagen mit Textbeleg, Verfügbarkeit) – regelbasiert, ohne KI | ✅ |
| Manuelle Aktualisierung (Preis, Screenshot, Text) | ✅ (Screenshot braucht KI) |
| Automatische Abfrage **nur** über eBay Browse API | 🟡 Code fertig, ohne eBay-Zugang nicht testbar |
| Alle anderen Plattformen: ehrlich „manuell“, keine Scheinüberwachung | ✅ |
| In-App-Benachrichtigungen, Tageslimit | ✅ |
| E-Mail (Resend) | 🟡 ohne Schlüssel nicht getestet |
| Web Push (VAPID) | 🟡 ohne Schlüssel nicht getestet |
| Native Push (APNs/FCM) | 🔧 nur Schnittstelle |

### Funktion 5 – Gesamtkosten
| Bestandteil | Status |
|---|---|
| Trennung belegt / geschätzt / Risiko, „Betrag unbekannt“ statt erfundener Werte | ✅ |
| Kostentabelle nur mit Quelle + Prüfdatum (Admin), eigene Kostenvoranschläge | ✅ |
| Datenqualität, Szenario mit Risiken getrennt | ✅ |
| Integration in den Angebotsvergleich | ✅ |
| **Ausgelieferte Kostentabelle ist leer** (keine verifizierten Daten vorhanden) | bewusst – Betreiber muss pflegen |

### Funktion 6 – Bildabgleich
| Bestandteil | Status |
|---|---|
| dHash + DCT-pHash, Klassen identisch / stark ähnlich / möglich / kein Treffer | ✅ |
| Abgleich im Inserat und mit bereits in DEAL-NIVO geprüften Inseraten (nur Hashes, LSH-Bänder) | ✅ |
| Transparenzhinweis „keine umfassende Internetsuche“, Hinweis „kein Betrugsnachweis“ | ✅ |
| Fremde Kaufakten werden nicht verlinkt, keine Nutzerdaten | ✅ |
| Bild-Embeddings | ❌ nicht implementiert (Hashes genügen für Wiederverwendung) |
| Externe Bildsuche | 🔧 Schnittstelle `ExternalImageSearchProvider`, kein Anbieter angebunden |

### Gemeinsame Kaufakte, UI, Monetarisierung, Jobs
| Bestandteil | Status |
|---|---|
| Versionierte Module je Kaufakte, unabhängig aktualisierbar | ✅ |
| Gesamtempfehlung (erhöhtes Risiko bleibt bestehen), „Nächster Schritt“ | ✅ |
| Kaufbericht: Aktionen, Karten für Chat/Besichtigung/Kosten/Preisverlauf/Bilder | ✅ |
| Export der Kaufakte (JSON) | ✅ (PDF enthält weiterhin nur den Kaufcheck) |
| Persistente Job-Queue (Status, Retries mit Backoff, Idempotenz, Lease nach Absturz, Abbruch, Fortschritt) | ✅ |
| Video-Verarbeitung auf persistente Queue umgestellt | ✅ |
| V4-Limits und Löschfristen im Admin | ✅ |
| Guardian-Paket (14,99 €) | 🔧 nur Konzept/Anzeige, **keine Zahlung aktivierbar** |
| Tokenpreise 7,99 / 17,99 / 39,99 € | unverändert |

## 3. Tests

- Unit/Integration: **115 bestanden**, 1 übersprungen (KI-Evaluation ohne Schlüssel). Davon 42 neu in `tests/v4.test.ts`.
- E2E (Playwright, 390 px): Registrierung → Analyse → Teilen (bereits geprüft, neue Plattform, Share-Target-Eingang) → Chatprüfung mit Schwärzung → Besichtigung inkl. Offline/Sync und Abschluss → Gesamtkosten mit eigener Position → Beobachtung mit Preisänderung + Benachrichtigung → Export → Zugriffsschutz (401). Keine Browserfehler, kein horizontaler Überlauf.
- Migration `0004` auf PostgreSQL 16 ausgeführt (zweimal, idempotent), Versionsvergabe, `FOR UPDATE SKIP LOCKED`-Claim, Kaskadenlöschung geprüft.
- Bestehende Funktionen (Login, Wallet, Historie, Marktwert, Verkäufer, Vergleich, PDF, Admin) über die bestehenden Tests abgedeckt – alle grün.

## 4. Übersichten

### Neue Dateien (Auswahl)
`src/lib/akte/*` (Schemas, Service, Limits, View-Model), `src/lib/chat/*`, `src/lib/inspection/*`, `src/lib/costs/*`, `src/lib/images/*`, `src/lib/watch/*`, `src/lib/notify/service.ts`, `src/lib/jobs/*`, `src/lib/share/*`, `src/lib/store/akte-types.ts`, `src/instrumentation.ts`, `src/components/akte/*`, `src/components/share/share-landing.tsx`, `mobile/**`, `supabase/migrations/0004_v4_kaufakte.sql`, `tests/v4.test.ts`.

### Geänderte Dateien (Auswahl)
`store/local.ts`, `store/supabase.ts`, `store/types.ts`, `pipeline/service.ts` (Bildabgleich nach Analyse), `video/jobs.ts`, `import/adapters.ts` (SSRF-Kurzlinks), `manifest.ts` (Share Target), `public/sw.js` (Push, Offline-Besichtigung), `report-view.tsx`, `check-flow.tsx`, `analysis/[id]/page.tsx`, `vergleich/page.tsx`, `dashboard/page.tsx`, `admin/page.tsx`, `admin/actions.ts`, `preise/page.tsx`, `legal/docs.ts`, `render.yaml`, `.env.example`.

### Datenbankmigration
`0004_v4_kaufakte.sql` – rein additiv: `kaufakte_modules`, `jobs`, `watches`, `notifications`, `push_subscriptions`, `image_hashes`, `share_inbox` + Funktionen `kaufakte_add_module`, `jobs_claim`, `share_inbox_take`, RLS aktiviert.

### Neue Umgebungsvariablen (alle optional)
`CRON_SECRET`, `JOB_WORKER`, `JOB_WORKER_INTERVAL_SECONDS`, `RESEND_API_KEY`, `EMAIL_FROM`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.

### Neue API-Endpunkte
`POST /share-target`, `GET /share-target`, `POST /api/share/import`, `POST|DELETE /api/analyses/{id}/seller-chat`, `GET|POST|PUT /api/analyses/{id}/inspection`, `POST /api/analyses/{id}/inspection/photo`, `POST /api/analyses/{id}/inspection/finish`, `POST /api/analyses/{id}/costs`, `POST /api/analyses/{id}/images`, `POST|DELETE /api/analyses/{id}/watch`, `POST /api/analyses/{id}/watch/update`, `GET /api/analyses/{id}/akte`, `GET|DELETE /api/jobs/{id}`, `GET|POST /api/notifications`, `GET|POST|DELETE /api/push/subscribe`, `GET /api/cron/jobs`.

### Neue Seiten
`/teilen`, `/analysis/{id}/chat`, `/analysis/{id}/besichtigung`.

### Hintergrundjobs
`video_frames`, `chat_check`, `watch_check` (+ Haushaltsaufgaben alle 10 min: fällige Beobachtungen einreihen, Löschfristen durchsetzen).

### Geschätzte KI-Kosten pro Funktion
Grundlage: konfigurierte Preise (Standard 1,25 $ / 10 $ je Mio. Tokens). Mit einem günstigeren „schnellen Modell“ deutlich weniger. **Schätzungen, nicht gemessen.**

| Funktion | KI? | ca. Kosten |
|---|---|---|
| Teilen-Import | nein | 0 |
| Chatprüfung, Text | 1 Aufruf | 0,01–0,02 $ |
| Chatprüfung, 6 Screenshots | 2 Aufrufe | 0,03–0,05 $ |
| Chatprüfung, Video (bis 20 Frames) | 4–5 Aufrufe | 0,08–0,15 $ |
| Besichtigung (Checkliste, Bericht) | nein | 0 |
| KI-Fotoprüfung je Foto | 1 Aufruf | ~0,01 $ |
| Gesamtkosten | nein | 0 |
| Bildabgleich | nein | 0 |
| Preisalarm automatisch (eBay) | nein | 0 |
| Manuelle Aktualisierung per Screenshot | 1 Aufruf | ~0,02 $ |

Alle KI-Aufrufe laufen über den bestehenden Kostenwächter (Tages-, Monats-, Nutzer- und Analysebudget).

### Offene Sicherheits- und Datenschutzpunkte
1. DNS-Rebinding: theoretisches Restrisiko zwischen DNS-Prüfung und Verbindungsaufbau; durch feste Kurzlink-Allowlist praktisch ausgeschlossen.
2. `/share-target` ist bewusst ohne Anmeldung erreichbar (Teilen-Menü sendet keine Sitzung) – Rate-Limit, 30-min-Ablauf, einmalige Abholung, keine automatische Analyse.
3. Offline-Besichtigung legt die Besichtigungsseite im Browser-Cache des Geräts ab; bei gemeinsam genutzten Geräten Browserdaten löschen.
4. Lokaler Dateimodus (Render-Test) verliert alle Daten bei Neustart – für echten Betrieb Supabase nötig.
5. Rechtstexte (Datenschutz zu Chat, Bild-Hashes, Benachrichtigungen) sind ergänzt, aber **juristisch prüfbedürftig**.
6. Native Apps: App-Store-Richtlinie 4.2 (WebView-Apps) als Ablehnungsrisiko.

## 5. Schritt-für-Schritt für den Betreiber

1. **Supabase**: Migration `0004_v4_kaufakte.sql` im SQL-Editor ausführen (nach 0001–0003).
2. **Render → Environment**: `CRON_SECRET` (wird per Blueprint erzeugt) prüfen. `JOB_WORKER=on` lassen.
3. **Cron** (z. B. cron-job.org oder Render Cron Job): alle 10 Minuten `GET https://dealnivo.onrender.com/api/cron/jobs` mit Header `Authorization: Bearer <CRON_SECRET>`. Wichtig, weil der Render-Free-Plan die Instanz schlafen legt.
4. **OpenAI-Schlüssel** setzen (siehe `ANLEITUNG-SCHLUESSEL.md`) – nötig für Chat-Screenshots, Videos und KI-Fotoprüfung. Empfehlung: `OPENAI_FAST_MODEL` auf ein günstiges Modell setzen.
5. **Optional E-Mail**: Konto bei Resend, Domain verifizieren, `RESEND_API_KEY` und `EMAIL_FROM` setzen.
6. **Optional Web Push**: lokal `npx web-push generate-vapid-keys`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:…` setzen.
7. **Optional eBay**: `EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET` – aktiviert automatischen Preisalarm für eBay-Inserate.
8. **Admin → Kaufakte**: Limits/Löschfristen prüfen; Kostentabelle nur mit belegten Werten (Quelle + Datum) füllen.
9. **Guardian**: bleibt aus, bis Preis und Leistungsumfang freigegeben sind; eine Zahlung dafür existiert nicht.
10. **Native Apps**: `mobile/README.md` befolgen (Apple-Developer-Account, Xcode; Android Studio, Keystore).
11. **Rechtstexte** juristisch prüfen lassen.
