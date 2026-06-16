# Preisrecherche-Prompt (wöchentlich, HPC-Betreiber)

## Kontext
Du bist Teil eines wöchentlichen Wettbewerber-Analyse-Workflows für ELMI Power GmbH (CPO-Geschäft / Ladesäulenbetrieb). Fokus ausschließlich auf HPC (Schnellladen > 149 kW) – AC/DC-Betreiber (≤ 149 kW) werden separat und nur einmalig erfasst (`data/wettbewerber_ac_dc.json`).

## Aufgabe
1. Lies `data/wettbewerber_analyse.json` – sie enthält ausschließlich HPC-Betreiber mit mehr als 20 HPC-Ladepunkten (Feld `meta.hpc_min_ladepunkte`).
2. Prüfe je Betreiber das Feld `recherche_datum`. Betreiber mit `recherche_datum` älter als 14 Tage oder `null` haben Priorität.
3. Recherchiere für die **Prioritäts-Betreiber** (max. 25 pro Lauf für Rotation) den aktuellen Ad-hoc-Preis (€/kWh) für HPC:
   - Bevorzuge offizielle Preisseiten des Betreibers
   - Alternativ: Chargeprice, ADAC Ladesäulen-Preisvergleich, EnBW-Tarifübersicht
   - Ad-hoc-Tarif ohne App/Registrierung bevorzugen; falls nur App-Tarif: nehmen und in `quelle` vermerken
4. Erstelle eine JSON-Datei `data/neue_preise.json` mit folgendem Schema:

```json
{
  "EnBW mobility+ AG und Co.KG": {
    "HPC": { "preis": 0.59, "quelle": "https://www.enbw.com/... (offizielle Preisseite, 2026-06-15)" }
  },
  "IONITY GmbH": {
    "HPC": { "preis": 0.79, "quelle": "https://ionity.eu/... (Ad-hoc, 2026-06-15)" }
  }
}
```

5. Führe danach aus:
   ```
   python scripts/wettbewerber_analyse.py data/neue_preise.json
   ```
   Dies schreibt `data/wettbewerber_analyse.json` (HPC) und `data/auslastungs_kennzahlen.json` (HPC) mit den neuen Preisen. `data/wettbewerber_ac_dc.json` wird dabei NICHT erneut geschrieben, sofern die Datei bereits existiert (einmalige Momentaufnahme).

6. Git-Commit und Push:
   ```
   git -C "<REPO_DIR>" add data/wettbewerber_analyse.json data/auslastungs_kennzahlen.json
   git -C "<REPO_DIR>" commit -m "Wöchentliches Wettbewerber-Update <DATUM>"
   git -C "<REPO_DIR>" push origin main
   ```

## Wichtige Hinweise
- Wenn ein Betreiber keinen öffentlich einsehbaren Preis hat, setze `preis: null` und vermerke dies in `quelle`.
- Ladetyp-Zuordnung im Register: AC ≤ 21 kW, DC > 21 kW ≤ 149 kW, HPC > 149 kW
- `quelle` muss immer URL + Zugriffsdatum enthalten
- Rotation: Es gibt 99 HPC-Betreiber mit > 20 Ladepunkten; priorisiere nach Alter des `recherche_datum` (älteste zuerst)
- AC/DC-Betreiber werden nicht mehr recherchiert. `data/wettbewerber_ac_dc.json` ist eine einmalige Momentaufnahme und wird vom Skript nur erzeugt, falls sie noch nicht existiert.
