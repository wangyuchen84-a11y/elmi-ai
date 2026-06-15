# Security – Passwort-Management

## Wie funktioniert der Login-Schutz?

Das Login-Passwort für `01_operating_performance/index.html` (AI Dashboard)
wird **nicht** mehr im Quellcode gespeichert. Stattdessen:

1. Das Klartext-Passwort wird als GitHub Actions Secret hinterlegt.
2. Bei jedem Deploy berechnet der Workflow den SHA-256-Hash des Passworts.
3. Der Hash wird in die ausgelieferte HTML-Datei eingesetzt (Platzhalter-Ersatz).
4. Im Repo selbst steht nur der Platzhalter (`__ELMI_AI_PWD_HASH__`).

## Passwort ändern

1. Gehe zu **Settings → Secrets and variables → Actions** im Repo `elmi-ai`.
2. Bearbeite `AI_DASHBOARD_PASSWORD` und setze das neue Passwort.
3. Starte den Workflow **"Deploy to GitHub Pages"** manuell (oder pushe einen Commit),
   damit die neue Version mit dem neuen Hash deployt wird.

## Secrets

| Secret                 | Geschützte Seite                          |
|------------------------|------------------------------------------|
| `AI_DASHBOARD_PASSWORD`| `01_operating_performance/index.html`    |

## Hinweise

- Ein sehr kurzes oder einfaches Passwort bleibt anfällig für Brute-Force gegen den
  Hash (der im ausgelieferten HTML sichtbar ist). Verwende ein langes, zufälliges Passwort.
- Für echte, server-seitige Authentifizierung wäre ein Backend (z. B. Cloudflare Access)
  notwendig – das ist für dieses statische Hosting nicht umgesetzt.
