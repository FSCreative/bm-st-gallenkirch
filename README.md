# Bürgermusik St. Gallenkirch – Website

Moderne, mobilfähige Website der Bürgermusik St. Gallenkirch (Montafon, Vorarlberg) mit integriertem Admin-Bereich.

## Technik

- Node.js (>= 20) + Express + EJS
- SQLite (better-sqlite3) – Datenbank liegt unter `DATA_DIR/site.db`
- Admin-Bereich unter `/admin` (Link im Footer): Berichte (Blog), Fotogalerien, Texte, Termine

## Bilder der alten Website

Beim ersten Start lädt `src/images.js` im Hintergrund alle Bilder der alten Website
(www.bmstgallenkirch.at) herunter und speichert sie als lokale Kopien unter
`DATA_DIR/media/images`. Die Seite liefert sie danach selbst aus (`/media/images/...`).

## Umgebungsvariablen

| Variable | Beschreibung |
|---|---|
| `ADMIN_PASSWORD` | Passwort für den Admin-Bereich (erforderlich) |
| `SESSION_SECRET` | Zufälliger String für Session-Cookies (empfohlen) |
| `DATA_DIR` | Datenverzeichnis (auf Railway: Volume-Mount, z. B. `/data`) |
| `SKIP_IMAGE_IMPORT` | `1` = Bild-Import deaktivieren |

## Lokal starten

```bash
npm install
ADMIN_PASSWORD=geheim node server.js
# → http://localhost:3000
```

## Railway

1. Repo verbinden, Volume anlegen und auf `/data` mounten
2. Variablen setzen: `DATA_DIR=/data`, `ADMIN_PASSWORD=…`, `SESSION_SECRET=…`
3. Deploy – beim ersten Start werden Inhalte geseedet und Bilder importiert
