# DEAL-NIVO iOS-App – Einrichtung ohne Mac

Gebaut wird in der Cloud (Codemagic), getestet über TestFlight auf deinem iPhone.
Alles geht im Browser. Schlüssel und Zertifikate trägst du nur auf den Seiten von
Apple und Codemagic ein, **nie im Chat und nie im Code**.

## 0. Warten, bis der Developer-Account aktiv ist
Apple schaltet neue Accounts nach der Zahlung frei (meist Minuten, manchmal bis 48 h).
Aktiv ist er, wenn du auf developer.apple.com/account den Bereich
„Certificates, IDs & Profiles“ öffnen kannst.

## 1. Apple: App-Gruppe und zwei App-IDs (developer.apple.com/account/resources)
1. **Identifiers → +** → „App Groups“ → Beschreibung `DEAL-NIVO`, ID `group.de.dealnivo.app`.
2. **Identifiers → +** → „App IDs“ → „App“ → Beschreibung `DEAL-NIVO`,
   Bundle ID „Explicit“: `de.dealnivo.app` → bei Capabilities **App Groups** anhaken →
   Speichern → App-ID erneut öffnen → bei App Groups „Configure“ → `group.de.dealnivo.app` wählen.
3. Dasselbe noch einmal für die Teilen-Erweiterung: Bundle ID `de.dealnivo.app.share`,
   ebenfalls App Groups → `group.de.dealnivo.app`.

## 2. App Store Connect: App anlegen (appstoreconnect.apple.com)
**Apps → + → Neue App**: Plattform iOS, Name `DEAL-NIVO` (falls vergeben z. B. `DEAL-NIVO Kaufcheck`),
Sprache Deutsch, Bundle-ID `de.dealnivo.app`, SKU `dealnivo-ios`.

## 3. App Store Connect: API-Schlüssel für Codemagic
**Benutzer und Zugriff → Integrationen → App Store Connect API → Teamschlüssel → +**
Name `Codemagic`, Zugriff **App Manager** → Erstellen.
Notiere **Issuer ID** und **Key ID** und lade die **.p8-Datei** herunter (geht nur einmal!).

## 4. Codemagic (codemagic.io, kostenlos mit GitHub-Login)
1. Mit GitHub anmelden → **Add application** → Repository `belaflammer-del/spareway`
   → Projekttyp „Other“ / codemagic.yaml.
2. **Team settings → Team integrations → Developer Portal → Connect**:
   Name genau `DEAL-NIVO`, Issuer ID, Key ID und .p8-Datei eintragen.
3. **Team settings → codemagic.yaml settings → Code signing identities**:
   - *iOS certificates* → **Generate certificate** → Typ „Apple Distribution“, API-Schlüssel `DEAL-NIVO`.
   - *iOS provisioning profiles* → **Fetch profiles** → die Profile für `de.dealnivo.app`
     und `de.dealnivo.app.share` (Typ App Store) auswählen und hinzufügen.
     Gibt es noch keine: auf developer.apple.com unter **Profiles → +** → „App Store Connect“
     je eins für beide App-IDs mit dem neuen Zertifikat anlegen, dann erneut „Fetch profiles“.
4. In der App auf **Start new build** → Branch `claude/ki-kaufpruefer-gebrauchtwaren-6suttz`
   → Workflow „DEAL-NIVO iOS → TestFlight“.

## 5. TestFlight
Nach ca. 15–30 min erscheint der Build in App Store Connect unter **TestFlight**.
Dort dich selbst als interne Testerin/internen Tester eintragen, auf dem iPhone die App
**TestFlight** installieren und DEAL-NIVO darüber installieren.

Test: In Kleinanzeigen eine Anzeige öffnen → Teilen → **DEAL-NIVO** (ggf. unter „Mehr“
aktivieren) → DEAL-NIVO öffnet sich mit der Anzeige.

## Hinweise vor einer öffentlichen App-Store-Veröffentlichung
- **Bezahlung (Richtlinie 3.1.1):** Token sind digitale Güter. In einer App-Store-App verlangt
  Apple dafür grundsätzlich In-App-Kauf (15–30 % Gebühr). In der EU gibt es Ausnahmen mit
  eigenen Bedingungen. Für TestFlight egal – vor dem Store-Release klären/entscheiden.
- **Richtlinie 4.2:** Apps, die nur eine Webseite zeigen, werden oft abgelehnt. Die
  Teilen-Erweiterung ist ein echter App-Mehrwert; weitere native Funktionen (Mitteilungen
  für Preisalarme) erhöhen die Chancen.
- Datenschutzangaben („App Privacy“) und Datenschutzerklärung müssen ausgefüllt werden –
  rechtlich prüfen lassen.
