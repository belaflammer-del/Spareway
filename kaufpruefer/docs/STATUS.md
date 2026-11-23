# DEAL-NIVO – Entwicklungsstand (V2)

## Fertig implementiert und getestet
- **KI-Pipeline (OpenAI, austauschbar):** Extraktion aus Screenshots/Text, Bildbefunde mit Evidenzstufen und Markierung, Text-Bild-Widersprüche, unverifizierte Modell-Hinweise klar gekennzeichnet, OCR von Bewertungen, Texte. Zod-Validierung (doppelt), Timeouts + 2 Wiederholungen, Logging ohne Inhalte, Fallback auf Regelmodus bei KI-Fehlern.
- **Kostenkontrolle:** KI-Kosten pro Analyse (Modell, Tokens, Dauer), Tages-Kostenbremse (`AI_DAILY_BUDGET_USD`, im Admin änderbar), Modell im Admin umstellbar.
- **Link-Import:** Teilen-Texte der Apps, Tracking-Entfernung, eBay-Kurzlinks, eBay Browse API (mit Schlüssel).
- **Screenshot-Workflow:** Mehrfachupload mit Fortschritt, KI führt Screenshots zusammen, **Konflikte** (z. B. zwei Kilometerstände) werden zur Auswahl angezeigt statt geraten.
- **Bestätigungsschritt:** „Angebot erkannt“-Karte, nur fehlende Pflichtangaben, Rest aufklappbar.
- **Marktpreis:** Valuation-Engine (IQR, gewichtete Quartile, Regression, Angebot vs. Verkauf), **Liste der Vergleichsangebote** mit Quelle/Datum/Link, **eBay-Vergleichsangebote** über Browse API (mit Schlüssel), lizenzierter HTTP-Provider vorbereitet.
- **Ergebnisseite:** Produktbild, Score-Kasten, Preis-Wasserwaage, „Lohnt sich eine Besichtigung?“, realistischer Preis, separate Karten (Preis, Zustand, Schwachstellen, Risiken, Verkäufer, Bezahlung, Checkliste, Nachricht, Datenqualität), **Checkliste in drei Phasen**, Hinweis auf veraltete Marktdaten.
- **Verkäuferprüfung nachträglich** zu bezahlten Analysen – ohne weiteren Token. Screenshots, Bildschirmaufnahme oder Text.
- **Video:** Frame-Auswahl nach Scrollbewegung, Hinweis bei zu schnellem/zu wenig Scrollen, sofortige Löschung.
- **Angebotsvergleich** (`/vergleich`): eigene Analysen und Demos, nur aus Berichtsdaten, kostenlos.
- **Token:** Reservierung/Verbuchung/Freigabe, Idempotenz, **Wiederverwendung identischer Analysen (7 Tage) ohne neuen Token**, klare Einzelpreis-Kommunikation.
- **Historie:** Suche, Kategorie-Filter, Veraltet-Hinweis.
- **Kategorien:** Status live/beta im Admin; Beta = nur Schnellcheck.
- **Admin:** aktive Nutzer, Verkäuferprüfungen, Vergleiche, Wiederverwendungen, Ø Dauer, häufigste Fehler, KI-Kosten heute vs. Budget.
- **Tests:** 60 automatisierte Tests inkl. simuliertem KI-Durchlauf; KI-Qualitätsmessung (`npm run eval`) mit Referenz-Inseraten, Genauigkeit ≥ 90 %, Halluzinationsrate ≤ 5 %.

## Teilweise (braucht Zugänge)
- Echte KI-Analysen → `OPENAI_API_KEY`
- Dauerhafte Daten, E-Mail-Bestätigung → Supabase (Migrationen `0001_init.sql` und `0002_v2.sql`)
- eBay-Import und eBay-Vergleichspreise → `EBAY_CLIENT_ID/SECRET`
- Fahrzeug-Marktwerte mit Verkaufspreisen → lizenzierter Datenanbieter
- Zahlungen → Stripe (bewusst später)

## Noch offen
- Videoanalyse asynchron mit Fortschrittsanzeige (läuft derzeit synchron im Request, max. 90 s Video)
- Analysen über Job-Queue statt im Request (für viele parallele Nutzer)
- Wissensdatenbank mit geprüften Schwachstellen befüllen
- mobile.de/AutoScout24-Import (nur mit Partnervertrag)
- Monitoring/Alerting (z. B. Sentry), Lasttests
- Native Apps inkl. „Teilen → DEAL-NIVO“
