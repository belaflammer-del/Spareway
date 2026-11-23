# DEAL-NIVO – Entwicklungsstand (V3)

| Funktion | Status | Getestet | Benötigt | Einschränkungen |
|---|---|---|---|---|
| Vergleichsangebote im Bericht | Vollständig | Unit + Browser | – (für Live-Daten: eBay/Anbieter) | Ohne Datenquelle nur Nutzer-Vergleiche; Daten > 90 Tage werden verworfen |
| eBay aktive Angebote (Browse API) | Vorbereitet, nicht angebunden | Unit (simulierte API) | `EBAY_CLIENT_ID/SECRET` | Angebotspreise, keine Verkaufspreise |
| eBay Verkaufspreise (Insights API) | Vorbereitet, deaktiviert | Unit (simulierte API) | Freischaltung durch eBay + `EBAY_INSIGHTS_ENABLED=true` | Zugang nur auf Antrag |
| Konflikte zwischen Screenshots | Vollständig (regelbasiert) | Unit (125.000 vs. 152.000 km) | `OPENAI_API_KEY` fürs Auslesen | Ohne KI keine Screenshot-Auswertung |
| Kompakte Bestätigung | Vollständig | Browser | – | – |
| Verkäuferprüfung nachträglich / ergänzen | Vollständig | Unit + Browser (Token unverändert) | Für Screenshots/Video: KI | Text-Eingabe funktioniert ohne KI |
| Angebotsvergleich (gespeichert, neue Links) | Vollständig | Unit + Browser | – | Zusammenfassung regelbasiert (keine KI nötig) |
| Wiederverwendung & Versionierung | Vollständig | Unit | – | Wiederverwendung nur ohne neu hochgeladene Bilder |
| Historie: Suche, Filter, Sortierung, Seiten | Vollständig | Unit + Browser | Supabase-Migration 0003 | – |
| KI-Kostenkontrolle (alle Limits) | Vollständig | Unit | – | Job-Liste/Video im Prozessspeicher (1 Instanz) |
| Beta-Kategorien (Live/Beta/Aus) | Vollständig | Browser | – | – |
| Transparente Preise | Vollständig | Browser | – | – |
| KI-Rückfragen zum Bericht | Vollständig | Unit (simulierte KI) | `OPENAI_API_KEY` | Ohne KI deaktiviert mit Hinweis |
| Bildschirmaufnahme asynchron | Vollständig | Unit (echtes FFmpeg) | FFmpeg auf dem Server, KI für Texterkennung | Render-Standardumgebung hat evtl. kein FFmpeg |

Weitere offene Punkte: Analysen über Job-Queue (für viele parallele Nutzer), Monitoring, Wissensdatenbank füllen, mobile.de/AutoScout24 (Partnervertrag), Stripe (bewusst später).
