# Keilhof – Hof-Management

Web-App (PWA) für den Keilhof in Prettau: Flächen & Feldbuch, Fuhrpark, Viehhaltung,
Futtermittel und Finanzen. Basiert auf dem Hof-Management von Armin
(github.com/zimatarmin-hash/hof-management), angepasst für den Keilhof:

- Name „Keilhof“ in App, Kopfzeile und Handy-Icon
- Karte startet in Prettau / Ahrntal
- Modul **Weinbau & Keller ausgeblendet** (wieder einschalten: `frontend/config.js` → `MODULE.WEINBAU: true`)
- eigene, leere Datenbank (keine Verbindung mehr zu Armins Daten)

---

## 1. Supabase-Projekt anlegen (ca. 5 Min.)

1. Auf **supabase.com** kostenlos registrieren → **New project**.
   Name z. B. `keilhof`, Region **Frankfurt (eu-central-1)**, Datenbank-Passwort notieren.
2. Links **SQL Editor → New query** → kompletten Inhalt von
   `backend/KEILHOF_SETUP.sql` einfügen → **Run**. Legt alle Tabellen, Rechte und den Foto-Speicher an.
3. **Project Settings → API**: *Project URL* und *publishable / anon key* kopieren
   und in `frontend/config.js` bei `SUPABASE_URL` und `SUPABASE_ANON_KEY` eintragen.

## 2. Google-Login einrichten

1. **console.cloud.google.com** → neues Projekt → **APIs & Dienste → OAuth-Zustimmungsbildschirm**
   (Typ „Extern“, App-Name „Keilhof“, eigene E-Mail).
2. **Anmeldedaten → OAuth-Client-ID → Webanwendung**.
   Unter *Autorisierte Weiterleitungs-URIs* eintragen:
   `https://DEIN-PROJEKT.supabase.co/auth/v1/callback`
3. Client-ID und Client-Secret kopieren → in Supabase **Authentication → Sign In / Providers → Google**
   aktivieren und beide Werte einfügen.
4. In Supabase **Authentication → URL Configuration**: die Adresse der App eintragen
   (bei *Site URL* und *Redirect URLs*), z. B. `http://localhost:8080` und später
   `https://65yzz9nzm2-lgtm.github.io/keilhof/`.

**Erster Login = Admin.** Wer sich als Erster anmeldet, wird automatisch Admin.
Alle weiteren müssen danach unter **Einstellungen → Benutzer** freigeschaltet werden.

## 3. Lokal testen

```
cd frontend
python -m http.server 8080
```
Dann `http://localhost:8080` öffnen. Ohne Python unter Windows: `serve.ps1` per Rechtsklick → „Mit PowerShell ausführen“.

## 4. Online stellen (GitHub Pages)

1. Neues Repository z. B. `keilhof` anlegen und den **ganzen** Ordner hochladen
   (inkl. `.github`). Bei jedem Push auf `main` wird `frontend` automatisch veröffentlicht.
2. **Settings → Pages → Source: GitHub Actions** auswählen.
3. Die angezeigte URL in Supabase unter *URL Configuration* ergänzen (Schritt 2.4).
4. Am Handy die Seite öffnen → „Zum Startbildschirm hinzufügen“.

Hinweis: Der `publishable key` darf öffentlich sein – die Daten schützen die
Zugriffsregeln in der Datenbank (nur freigeschaltete Benutzer sehen etwas).

---

## Updates

Bei jeder Änderung an der App die Versionsnummer an **drei Stellen gleich** erhöhen:
`frontend/version.json`, `APP_VERSION` in `frontend/app.js` und die `?v=…` an den
Skripten in `frontend/index.html`. Die App vergleicht ihre Version mit `version.json`
und zeigt dann „Eine neue Version der App ist verfügbar – Jetzt laden“ (wichtig für
die App auf dem Home-Bildschirm, die sonst nicht neu lädt).

## Ordner

```
frontend/            die App (index.html, app.js, api.js, config.js …)
backend/
  KEILHOF_SETUP.sql  Grund-Setup für die neue Datenbank
  IMKEREI_SETUP.sql  Zusatz: Tabellen für das Modul Imkerei (nach dem Grund-Setup ausführen)
  FIX_DATEIEN_SCHUETZEN.sql  Nachtrag: Dateiliste nur für freigeschaltete Nutzer (nur nötig,
                     wenn KEILHOF_SETUP.sql vor dem 05.11.2026 ausgeführt wurde)
```
