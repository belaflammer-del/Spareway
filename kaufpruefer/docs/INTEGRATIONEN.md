# Externe Integrationen

Alle Integrationen sind optional und über Interfaces angebunden. Es erfolgen **keine** Aufrufe ohne Vertrag bzw. Zugangsdaten, kein Scraping, keine Umgehung von Captchas oder Login-Schutz.

## Plattform-Import (`src/lib/import/adapters.ts`)

| Plattform | Status | Weg |
|---|---|---|
| eBay | **implementiert** | Offizielle Browse API (`get_item_by_legacy_id`), OAuth Client Credentials. Zugang über developer.ebay.com. |
| mobile.de | vorbereitet | Nur mit Partnervertrag (Search-/Ad-API). `canAutoImport` liefert `false`, bis ein Vertrag besteht. |
| AutoScout24 | vorbereitet | Nur mit Partnervertrag. |
| Kleinanzeigen | Fallback | Keine öffentliche Schnittstelle → Screenshots / Text. |
| Vinted | Fallback | Keine öffentliche Schnittstelle → Screenshots / Text. |

Neuer Adapter: `PlatformAdapter` implementieren (`hosts`, `extractId`, `canAutoImport`, optional `autoImport`) und in `ADAPTERS` eintragen.

## Marktdaten (`src/lib/market/providers.ts`)

`LicensedHttpMarketProvider` erwartet einen Endpunkt, der per `POST` (Bearer-Token) folgenden Request beantwortet:

```json
// Request
{ "category": "vehicle", "brand": "BMW", "model": "320d", "year": 2016, "mileageKm": 130000, "region": "50667" }
// Response
{ "provider": "Anbietername", "comparables": [
  { "priceEur": 15900, "priceType": "listing" | "sold", "year": 2016, "mileageKm": 128000,
    "condition": "good", "region": "NRW", "listingAgeDays": 12, "url": "…", "collectedAt": "2026-11-01T…" } ] }
```

Für einen konkreten Anbieter wird typischerweise ein kleiner Adapter geschrieben, der dessen API auf dieses Format abbildet. Mögliche Quellen (Vertrag nötig): Fahrzeugbewertungsdienste (z. B. DAT/Schwacke), Marktplatz-Partner-APIs, eBay „Sold Items“ über Marketplace Insights API (eingeschränkter Zugang).

## Fahrzeughistorie

Bewusst nur als Demo umgesetzt (`vehicleHistory` im Bericht, Preis zentral konfigurierbar). Für carVertical o. ä. wird **keine** öffentliche B2B-API angenommen; eine Anbindung erfordert eine kommerzielle Vereinbarung. Umsetzung: `VehicleHistoryProvider` analog zum Marktdaten-Provider, separate Abrechnung über eigenes Wallet-Produkt.

## KI-Provider (`src/lib/ai/provider.ts`)

`AIProvider.generate({ system, parts, schema })` muss schema-validierte Ausgaben liefern. Implementiert: OpenAI (Responses API + Zod Structured Outputs, doppelte Validierung). Weitere Provider (Anthropic, Azure, lokal) implementieren dasselbe Interface und werden in `registry.ts` registriert.

## Zahlungen / App-Stores

Stripe ist Web-only. Für native iOS/Android-Apps müssen digitale Guthaben in der Regel über In-App-Käufe abgerechnet werden. Das Wallet ist zahlungsanbieter-neutral (`purchases.provider`), ein `apple`/`google`-Provider kann mit serverseitiger Belegprüfung ergänzt werden.
