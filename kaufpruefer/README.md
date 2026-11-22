# Kaufklar – KI-Kaufprüfer für Gebrauchtwaren

> „Ist dieses Angebot sein Geld wert, welche Risiken bestehen und worauf muss ich vor dem Kauf achten?“

Kaufklar prüft Gebrauchtwaren-Angebote (mobile.de, AutoScout24, Kleinanzeigen, eBay, Vinted …) vor dem Kauf und erstellt einen strukturierten Prüfbericht mit Marktwert, Bildbefunden, Schwachstellen, Risiken, Verkäuferanalyse, Checkliste und Deal-Score.

**Grundsätze:** Keine erfundenen Preise, keine erfundenen Schäden, keine Betrugsvorwürfe ohne Beleg, keine Garantie. Jede Aussage trägt Quelle, Evidenzstufe und Zeitpunkt.

## Schnellstart

```bash
cd kaufpruefer
npm install
cp .env.example .env.local   # optional – ohne Schlüssel läuft der Demo-/Lokalmodus
npm run dev                  # http://localhost:3000
```

Ohne jeden API-Schlüssel ist die App vollständig bedienbar:

| Bereich | Ohne Schlüssel (Demo/Lokal) | Mit Schlüssel |
|---|---|---|
| Datenbank & Auth | Lokale JSON-DB `./.data/db.json`, scrypt-Passwörter, Sitzungscookie | Supabase (Postgres, Auth, Storage, RLS) |
| KI | Regelanalyse; Screenshots werden nicht ausgelesen | OpenAI (multimodal, strukturierte Ausgaben) |
| Zahlungen | „Test-Tokens gutschreiben“ (nur Entwicklung) | Stripe Checkout (Testmodus) + Webhook |
| Marktwert | Nur aus selbst eingetragenen Vergleichsangeboten | + lizenzierter Marktdatenanbieter |

```bash
npm test          # 44 Tests (Engines, Wallet, Adapter, Sicherheit, Video, Demos)
npm run typecheck
npm run build
```

Admin-Bereich: E-Mail in `ADMIN_EMAILS` eintragen, registrieren, `/admin` öffnen.

## Benötigte API-Schlüssel

| Variable | Zweck | Pflicht |
|---|---|---|
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Bild-/Textanalyse, OCR von Bewertungen, Texte | optional |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Produktiv-Datenbank, Auth, Storage | für Produktion |
| `STRIPE_SECRET_KEY` (sk_test_…), `STRIPE_WEBHOOK_SECRET` | Tokenkäufe | für Monetarisierung |
| `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | offizieller Import über eBay Browse API | optional |
| `MARKET_DATA_API_URL`, `MARKET_DATA_API_KEY` | lizenzierte Marktdaten | optional |
| `APP_SECRET`, `CRON_SECRET` | IP-Hashing, Lösch-Cron | Produktion |

Live-Stripe-Schlüssel werden ignoriert, solange `STRIPE_ALLOW_LIVE=true` nicht gesetzt ist.

### Supabase einrichten
1. Projekt anlegen, `supabase/migrations/0001_init.sql` ausführen (getestet gegen PostgreSQL 16).
2. Auth → URL-Konfiguration: Redirect `https://<domain>/auth/confirm`. E-Mail-Templates auf `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` umstellen.
3. Schlüssel in `.env.local` eintragen.

### Stripe einrichten (Testmodus)
Webhook auf `https://<domain>/api/stripe/webhook` mit den Events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`. Lokal: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

### Löschfristen
Stündlich `GET /api/cron/cleanup` mit `Authorization: Bearer $CRON_SECRET` aufrufen (zusätzlich räumt jeder Upload opportunistisch auf).

## Architektur

```
src/
  app/                      Next.js 16 App Router (Seiten + API-Routen)
  components/               UI (shadcn-artige Primitives, Report, Check-Flow, Dashboard)
  lib/
    domain/                 Zod-Schemas (Single Source of Truth), Labels, Kategorie-Profile
    engine/                 valuation · risk · scoring · seller · negotiation · missing-info
    pipeline/               extract (Entwurf) · analyze (Pipeline) · quick · ai-steps · service
    ai/                     Provider-Interface, OpenAI-Provider, Prompts, Ausgabe-Schemas
    import/                 Plattform-Adapter (eBay-API, mobile.de/AS24 vorbereitet, KA, Vinted)
    market/                 Marktdaten-Provider-Interface (+ Nutzer-Vergleichsangebote)
    knowledge/              Checklisten, Bezahlhinweise, geprüfte Schwachstellen-DB (RAG)
    store/                  DataStore-Interface: LocalStore (JSON) | SupabaseStore
    uploads/, video/        Magic-Byte-Validierung, EXIF-Entfernung, FFmpeg-Frame-Auswahl
    pdf/                    PDF-Export (pdf-lib)
    demo/                   6 Demo-Berichte – fiktive Daten, echte Engines
supabase/migrations/        Schema, RLS, atomare Wallet-Funktionen
```

**Pipeline:** Import → Extraktion → Identifikation/Kategorie → Validierung → Marktdaten → Schwachstellen → Bildanalyse → Verkäufer → Risiken → Bericht. Jeder Schritt wird mit Status protokolliert und ist mit injizierten Abhängigkeiten testbar.

**KI-Leitplanken:** Die KI-Ausgabeschemas enthalten bewusst *keine* Felder für Marktwert, Preisbewertung oder Score – diese berechnet ausschließlich die Regel-Engine. Fremdinhalte werden als `<untrusted_data>` gekapselt, Steuerzeichen entfernt, Injection-Muster erkannt und als Risiko gemeldet. Bildbefunde ohne Bildbezug werden auf „möglich“ herabgestuft. KI-Modellwissen erscheint nur als „KI-Hinweis (nicht verifiziert)“.

**Wallet:** Reservieren → Analyse → Verbuchen bzw. bei Fehler automatisch Freigeben. Gutschrift nur per signiertem Webhook nach bestätigter Zahlung, idempotent über Session-ID, Betragsabgleich gegen DB. Doppelte Absendungen sind über `requestId` idempotent.

**Video:** FFmpeg tastet mit 2 fps ab; die Scrollverschiebung zwischen Frames wird per Zeilenabgleich geschätzt, ein Frame wird erst nach ~55 % Bildhöhe Verschiebung behalten (Überlappung, keine Lücken, wenige Duplikate). Video wird danach sofort gelöscht; Bewertungen werden dedupliziert, die tatsächlich erkannte Anzahl wird immer angezeigt.

Weitere Dokumente: [`docs/INTEGRATIONEN.md`](docs/INTEGRATIONEN.md), [`docs/WISSENSDATENBANK.md`](docs/WISSENSDATENBANK.md), [`docs/STATUS.md`](docs/STATUS.md).
