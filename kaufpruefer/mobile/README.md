# DEAL-NIVO – Native Teilen-Integration

**Status: technisch vorbereitet, NICHT gebaut und NICHT auf Geräten getestet.**

**iOS ohne Mac:** siehe `IOS-EINRICHTUNG.md` (XcodeGen-Projekt `ios/project.yml` + Cloud-Build `codemagic.yaml` im Repo-Hauptordner).
In der Entwicklungsumgebung stehen weder macOS/Xcode noch Android SDK zur Verfügung.
Der Quellcode ist vollständig, muss aber vom Betreiber in Xcode bzw. Android Studio
in ein Projekt eingebunden, signiert und getestet werden.

## Architektur (für beide Plattformen gleich)

```
Marktplatz-App ──Teilen──▶ Share Extension / Sharesheet-Intent
                               │  (URL, Text, Bilder → JPEG neu kodiert, ohne EXIF/GPS)
                               ▼
                 POST https://dealnivo.onrender.com/share-target   (öffentlich, ohne Schlüssel)
                               │  303 → /teilen?inbox=sh_…  (Eingang 30 min gültig, einmalig abholbar)
                               ▼
                 Haupt-App (WebView) öffnet /teilen?inbox=…
                               │  Nutzer ist angemeldet → Bestätigung → Analyse vorbereiten
```

- Kein API-Schlüssel in den Apps. Alle Prüfungen laufen serverseitig.
- Es startet nie automatisch eine kostenpflichtige Analyse.
- Reiner Link/Text wird ohne Upload direkt als `/teilen?text=…` geöffnet.

## Web / PWA (bereits aktiv)

- `src/app/manifest.ts` enthält `share_target` (POST, multipart) → `/share-target`.
- Funktioniert in Chrome/Edge auf **Android** (nach „Zum Startbildschirm hinzufügen“)
  sowie in Chrome-basierten Desktop-Browsern mit installierter PWA.
- **iOS/iPadOS Safari unterstützt die Web Share Target API nicht.** Eine installierte
  iOS-PWA erscheint NICHT im Teilen-Menü – dafür ist die native Share Extension nötig.

## iOS (Ordner `ios/`)

Dateien:
- `DealNivo/DealNivoApp.swift` – SwiftUI-App mit WKWebView, übernimmt geteilte Inhalte aus der App Group
- `ShareExtension/ShareViewController.swift` – Share Extension
- `ShareExtension/Info.plist` – Aktivierungsregeln (1 URL, Text, bis 8 Bilder)
- `ShareExtension/ShareExtension.entitlements` – App Group

Schritte:
1. Xcode ≥ 16: neues Projekt „App“ (SwiftUI), Bundle-ID `de.dealnivo.app`, iOS 17+.
2. `DealNivoApp.swift` als App-Einstiegspunkt übernehmen.
3. Target hinzufügen: *File → New → Target → Share Extension*, Bundle-ID `de.dealnivo.app.share`.
   Generierten Controller durch `ShareViewController.swift` ersetzen, `Info.plist` übernehmen.
4. Bei **beiden** Targets *Signing & Capabilities → App Groups* → `group.de.dealnivo.app`.
5. Haupt-App: *Info → URL Types* → Schema `dealnivo` (für `dealnivo://teilen?url=…`).
6. Optional Universal Links: `apple-app-site-association` unter `/.well-known/` ausliefern.
7. Apple-Developer-Account (99 €/Jahr), Signing-Team wählen, auf Gerät testen, TestFlight.
8. App-Store-Prüfung: Hinweis, dass die App eine Web-App einbettet – Apple verlangt
   app-typische Mehrwerte (hier: Teilen-Erweiterung). Risiko einer Ablehnung (Guideline 4.2) beachten.

## Android (Ordner `android/`)

Dateien:
- `app/src/main/AndroidManifest.xml` – Intent-Filter `ACTION_SEND` (text/plain, image/*) und `ACTION_SEND_MULTIPLE` (image/*)
- `app/src/main/java/de/dealnivo/app/MainActivity.kt` – WebView-Rahmen + Upload an `/share-target`
- `app/build.gradle.kts`, `res/xml/network_security_config.xml` (nur HTTPS)

Schritte:
1. Android Studio: neues Projekt „Empty Activity“ (Kotlin), Paket `de.dealnivo.app`, minSdk 26.
2. Dateien übernehmen, Launcher-Icons aus `public/icons/` erzeugen.
3. Release-Keystore erzeugen (`keytool -genkeypair …`) – **niemals ins Repository**.
4. Für App-Links `/.well-known/assetlinks.json` mit SHA-256 des Signaturzertifikats ausliefern.
5. Alternative ohne eigene WebView: **Trusted Web Activity** (Bubblewrap) – dann greift das
   PWA-`share_target` direkt und `MainActivity.kt` entfällt.

## Was serverseitig bereits fertig und getestet ist

- `POST /share-target` (Teilen-Eingang, Bilder neu kodiert, Rate-Limit, 30 min Ablauf)
- `GET /share-target?url=&text=&title=` → `/teilen`
- `POST /api/share/import` (Plattformerkennung, Normalisierung, SSRF-geschützte Kurzlink-Auflösung,
  Erkennung bereits geprüfter Inserate)
- `/teilen` – Bestätigungsseite mit Screenshot-Fallback
