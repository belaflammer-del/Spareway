# Anleitung: OpenAI und Supabase für DEAL-NIVO einrichten

Beides geht am iPhone in Safari. Wenn ein Menüpunkt fehlt: **aA → Desktop-Website anfordern**.
Alle Schlüssel trägst du **nur bei Render** ein (Dashboard → dein Service → **Environment** → **Add Environment Variable** → danach **Save, rebuild and deploy**). Niemals in GitHub oder in Chats posten.

---

## Teil 1 – OpenAI (KI liest Screenshots, prüft Bilder) · ca. 10 Minuten

1. **platform.openai.com** öffnen und ein Konto anlegen bzw. anmelden. (Das ist nicht dasselbe wie ein ChatGPT-Abo – die API wird separat bezahlt.)
2. Links/oben **Settings → Billing** → Zahlungsmethode hinterlegen und Guthaben aufladen (der kleinste Betrag reicht zum Testen).
3. **Settings → Limits**: ein **monatliches Budget-Limit** setzen (z. B. 10 $). So kann nie mehr abgebucht werden.
4. **API keys** → **Create new secret key** → Name `deal-nivo-render` → **Create** → Schlüssel (beginnt mit `sk-…`) **kopieren**. Er wird nur einmal angezeigt.
5. Bei Render eintragen:
   - `OPENAI_API_KEY` = der kopierte Schlüssel
   - (optional) `OPENAI_MODEL` – nur setzen, wenn eine Fehlermeldung zum Modell kommt; dann ein aktuelles Modell mit Bildverarbeitung aus deinem OpenAI-Konto eintragen.
6. **Save, rebuild and deploy**. Nach dem Deploy steht unten auf der Seite „KI: aktiv“.

**Kosten:** Pro Analyse fallen je nach Modell und Anzahl Bilder grob wenige Cent an. Die genauen Kosten pro Analyse siehst du später im Admin-Bereich.

---

## Teil 2 – Supabase (Konten & Daten bleiben dauerhaft gespeichert) · ca. 20 Minuten

Ohne Supabase gehen auf Render alle Konten und Tokens bei jedem Neustart verloren.

### A) Projekt anlegen
1. **supabase.com** → **Start your project** → mit GitHub anmelden.
2. **New project** → Name `deal-nivo` → Datenbank-Passwort generieren lassen (irgendwo sicher speichern) → **Region: Central EU (Frankfurt)** → **Create new project**. 1–2 Minuten warten.

### B) Datenbank-Tabellen anlegen
1. In GitHub die Datei öffnen:
   `belaflammer-del/Spareway` → Branch `claude/ki-kaufpruefer-gebrauchtwaren-6suttz` → `kaufpruefer/supabase/migrations/0001_init.sql` → oben **Raw** antippen → alles markieren → **Kopieren**.
2. In Supabase links **SQL Editor** → **New query** → Text einfügen → **Run**.
   Es sollte „Success“ erscheinen.
3. Danach genauso nacheinander `0002_v2.sql` und `0003_v3.sql` aus demselben Ordner ausführen (beide sind wiederholbar und verändern keine bestehenden Daten).

### C) Schlüssel kopieren
In Supabase: **Project Settings → API** (bzw. **API Keys**). Du brauchst drei Werte:

| Bei Render eintragen als | Wert aus Supabase |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Project URL** (z. B. `https://abcd.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **anon / public** Key (neu heißt er ggf. **Publishable key**, beginnt mit `sb_publishable_`) |
| `SUPABASE_SERVICE_ROLE_KEY` | **service_role** Key (neu ggf. **Secret key**, beginnt mit `sb_secret_`) – **streng geheim** |

### D) Anmelde-Links einstellen
Supabase → **Authentication → URL Configuration**:
- **Site URL**: deine Render-Adresse, z. B. `https://deal-nivo.onrender.com`
- **Redirect URLs** → **Add URL**: `https://deal-nivo.onrender.com/**`

### E) Bei Render eintragen und neu bauen
Die drei Werte aus C) bei Render eintragen → **Save, rebuild and deploy**.
Unten auf der Seite steht danach „Datenbank: Supabase“.

### F) Testen
1. In DEAL-NIVO registrieren – jetzt kommt eine **echte Bestätigungs-E-Mail** (Absender Supabase). Link antippen.
2. Mit der E-Mail aus `ADMIN_EMAILS` registriert? Dann `/admin` öffnen.

**Hinweise:**
- Der kostenlose Supabase-Tarif verschickt nur wenige E-Mails pro Stunde – für Tests reicht das. Für den Start später einen eigenen E-Mail-Versand (SMTP) eintragen.
- Kostenlose Supabase-Projekte werden nach etwa einer Woche ohne Nutzung pausiert; im Dashboard kann man sie mit einem Klick wieder starten.
- Test-Tokens: `ALLOW_TEST_CREDITS=true` bleibt bei Render gesetzt, bis Stripe eingerichtet ist.

---

## Stripe
Kommt später. Die Anleitung steht dann in derselben Datei.
