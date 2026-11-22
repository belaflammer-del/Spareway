# Entwicklungsstand

## Implementiert (Phase 1 vollständig, Teile von Phase 2–4)

- Startseite, Beispielanalysen (6 Demos, fiktive Daten, echte Engines, PDF), Methodik-, Preis- und Rechtsseiten (Entwürfe)
- Konten: Registrierung, Login, Passwort-Reset, E-Mail-Bestätigung (Supabase Auth oder Lokalmodus), Dashboard, Historie, Einstellungen, Datenexport, Kontolöschung
- Prüf-Flow: Link / Screenshots / Text → Entwurf mit Feldherkunft → gezielte Nachfragen → Schnellcheck (gratis, limitiert) oder Komplettcheck (1 Token)
- Engines: Marktwert (IQR, gewichtete Quartile, Regression aus Vergleichsdaten, Inserat vs. Verkauf), Risiken, Datenqualität, Deal-Score mit Deckelungen, Verhandlung, Verkäuferanalyse
- KI (OpenAI): Extraktion aus Screenshots, Bildbefunde mit Evidenzstufen und Markierung, Text-Bild-Widersprüche, Echtheitsmerkmale, OCR von Bewertungen, Nachrichten
- Video: Upload, FFmpeg-Frame-Auswahl nach Scrollbewegung, sofortige Löschung
- Wallet: Reservierung/Verbuchung/Freigabe, Idempotenz, Stripe Checkout + Webhook (Testmodus), Erstattungen, Transaktionsprotokoll, Test-Gutschriften im Dev
- Admin: KPIs, Umsatz, KI-Kosten pro Analyse, Fehler, Kategorien, Preise, Demo-Sichtbarkeit, Provider an/aus
- Sicherheit/Datenschutz: RLS, serverseitige Prüfung, Rate Limits, Magic-Byte-Validierung, EXIF-Entfernung, Löschfristen, Prompt-Injection-Schutz, gehashte IPs
- PWA: Manifest, Icons, Service Worker (keine Caches für personenbezogene Inhalte)

## Bekannte Einschränkungen

- Ohne Marktdatenanbieter gibt es Marktwerte nur aus vom Nutzer eingetragenen Vergleichsangeboten.
- Wissensdatenbank leer – modellspezifische Schwachstellen nur als nicht verifizierte KI-Hinweise.
- Komplettanalyse läuft synchron im Request (bis ~60 s mit KI); für Skalierung → Job-Queue.
- Lokalmodus nur für Entwicklung (eine Instanz, JSON-Datei, keine E-Mails).
- HEIC wird nicht verarbeitet (sharp-Prebuilds ohne HEVC).
- KI-Pfad und Supabase-/Stripe-Pfad sind gegen echte Dienste noch nicht live getestet (keine Schlüssel in dieser Umgebung); SQL-Migration wurde gegen PostgreSQL 16 getestet.
- Rechtstexte sind Entwürfe und juristisch zu prüfen.

## Nächste Schritte

1. Supabase-Projekt + Stripe-Testkonto anbinden, Ende-zu-Ende mit echten Schlüsseln testen
2. OpenAI-Pfad mit realen Inseraten evaluieren (Golden-Set, Halluzinationsrate der Bildbefunde)
3. Marktdatenanbieter vertraglich klären und Adapter schreiben
4. Wissensdatenbank redaktionell aufbauen (DB-Tabelle + Admin-Pflege)
5. Analysen asynchron (Queue, Status-Polling), Monitoring (Sentry/OpenTelemetry)
6. Native Apps (Capacitor/Expo) inkl. In-App-Käufe
