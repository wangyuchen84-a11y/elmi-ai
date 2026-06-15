"""
Wöchentlicher Scraper für NLL AusbauMONITORING Auslastungsdaten.
Extrahiert bundesweite Auslastungsdaten pro Ladetyp (NLP/SLP/HPC)
sowie Belegdauer pro Landkreis (AGS) aus dem öffentlichen Power BI Report.

Benötigt: pip install playwright && python -m playwright install chromium

Verwendung:
    python scripts/auslastung_scraper.py

Ergebnis wird in data/auslastungs_kennzahlen.json gespeichert.
"""

import json
import math
import os
import sys
from datetime import date
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
except ImportError:
    print("Bitte zuerst installieren: pip install playwright && python -m playwright install chromium")
    sys.exit(1)

REPO_ROOT = Path(__file__).parent.parent
DATA_FILE = REPO_ROOT / "data" / "auslastungs_kennzahlen.json"

PBI_URL = (
    "https://app.powerbi.com/view?r="
    "eyJrIjoiMmRlODdmODUtYzZiNi00MGJjLWE3MGQtZThkNDhkZjQ0ZjI3IiwidCI6ImNjMGY0YTAwLTFiZWMtNGEzZS04NGVkLTNlODdiMjFhZjU2YSJ9"
)

# Mapping Power BI Kategorienamen -> JSON ladetyp
LADETYP_MAP = {"NLP": "AC", "SLP": "DC", "HPC": "HPC"}


def decode_dsr_rows(response_data: dict) -> tuple[list[str], dict, list[list]]:
    """
    Dekodiert eine Power BI querydata-Antwort.

    Returns (col_names, value_dicts, rows) wobei:
    - col_names: Namen aus dem S-Array (N-Feld), Reihenfolge entspricht den Zeilen
    - value_dicts: Wörterbücher (D0, D1, …) zum Auflösen von int-Indizes
    - rows: Liste von Zeilenwerten (int-Index bei Dict-Refs, float/str bei Measures)
    """
    result = response_data["results"][0]["result"]["data"]
    ds = result["dsr"]
    ds0 = ds["DS"][0]
    ph = ds0.get("PH", [{}])[0]
    dm = ph.get("DM0", [])
    vd = ds0.get("ValueDicts", {})

    # Spaltennamen aus dem S-Array der ersten Zeile (= Spaltendefinition)
    col_names: list[str] = []
    col_dicts: list[str | None] = []  # welches ValueDict (oder None) pro Spalte
    if dm:
        for s_entry in dm[0].get("S", []):
            col_names.append(s_entry.get("N", "?"))
            col_dicts.append(s_entry.get("DN"))  # z.B. "D0" oder None

    rows = []
    prev = None
    for row in dm:
        c = list(row.get("C", []))
        r = row.get("R", 0)
        if r and prev:
            merged = list(prev)
            for j, v in enumerate(c):
                if j < len(merged):
                    merged[j] = v
            c = merged
        # Indizes in echte Werte auflösen
        resolved = []
        for j, val in enumerate(c):
            dn = col_dicts[j] if j < len(col_dicts) else None
            if dn and isinstance(val, int):
                resolved.append(vd.get(dn, [])[val] if val < len(vd.get(dn, [])) else val)
            else:
                resolved.append(val)
        rows.append(resolved)
        prev = c  # prev bleibt der Original-C (für R-Inheritance)

    return col_names, vd, rows


def scrape_auslastung(headless: bool = True) -> dict:
    """
    Öffnet den Power BI Report, navigiert zu Seite 6 (Auslastung) und
    extrahiert bundesweite Kennzahlen pro Ladetyp + Belegdauer pro Landkreis.

    Returns:
        {
          "bundesweit": {
            "NLP": {"belegdauer_h": float, "energie_kwh": float, "ladevorgaenge": float},
            "SLP": {...},
            "HPC": {...}
          },
          "landkreise": [
            {"ags": str, "landkreis": str, "belegdauer_total_h": float},
            ...
          ]
        }
    """
    captured: list[dict] = []

    def on_response(response):
        if "querydata" in response.url:
            try:
                captured.append(json.loads(response.body()))
            except Exception:
                pass

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        page = browser.new_page()
        page.on("response", on_response)

        print("Lade Power BI Report ...")
        page.goto(PBI_URL, wait_until="networkidle", timeout=90_000)
        page.wait_for_timeout(6_000)
        n0 = len(captured)

        print("Navigiere zu Seite 6 (Auslastung) ...")
        for _ in range(5):
            btn = page.locator('[aria-label="Next Page"]')
            if btn.count() and not btn.is_disabled():
                btn.click()
                page.wait_for_timeout(4_000)

        page.wait_for_timeout(8_000)
        browser.close()

    # Alle neuen Antworten (nach dem initialen Load) durchsuchen
    new_responses = captured[n0:]

    # Identifiziere Responses anhand der Spaltennamen (S-Array-Namen, z.B. "G0","M0")
    # und Spaltenanzahl. Verwende Descriptor für semantische Zuordnung.
    METRIC_COL_PATTERNS = {
        "belegdauer_h":  "dauerinstunden",
        "energie_kwh":   "energiemenge",
        "ladevorgaenge": "lvproberi",
    }

    bundesweit: dict[str, dict] = {}
    landkreise = []

    for resp in new_responses:
        try:
            result_data = resp["results"][0]["result"]["data"]
            descriptor = result_data.get("descriptor", {})
            sel = descriptor.get("Select", [])
            # Semantische Spaltennamen aus Descriptor (für Pattern-Matching)
            sem_names = [s.get("Name", "").lower() for s in sel]

            cols, vd, rows = decode_dsr_rows(resp)
            d0 = vd.get("D0", [])
        except Exception:
            continue

        # Erkenne bundesweite Ladetyp-Response:
        # - Semantic names enthalten Metrik-Muster UND "ladepunkt_kat"
        # - D0 enthält die Ladetypen (NLP/SLP/HPC)
        # - <= 5 Zeilen (3 Ladetypen)
        if d0 and {"nlp", "slp", "hpc"} <= {s.lower() for s in d0} and len(rows) <= 5:
            for metric_key, pattern in METRIC_COL_PATTERNS.items():
                if any(pattern in n for n in sem_names):
                    # Spalten aus S-Array: G0 = Ladetyp (string nach Auflösung), M0 = Messwert
                    # cols sind S-Array-Namen (G0, M0 etc.)
                    idx_kat = next((i for i, c in enumerate(cols) if c.startswith("G")), 0)
                    idx_val = next((i for i, c in enumerate(cols) if c.startswith("M")), 1)
                    for row in rows:
                        if len(row) > max(idx_kat, idx_val):
                            kat = str(row[idx_kat])       # bereits aufgelöst: "NLP", "SLP", "HPC"
                            try:
                                value = float(row[idx_val])
                            except (ValueError, TypeError):
                                continue
                            bundesweit.setdefault(kat, {})[metric_key] = value
                    break  # diese Response zugeordnet

        # Erkenne per-Landkreis-Response:
        # - Semantic names enthalten OBELIS + "ags" (die spezifische Auslastungs-Tabelle)
        # - Viele Zeilen (> 100)
        elif len(rows) > 100 and any("obeliskennzahlen" in n for n in sem_names) and any("ags" in n for n in sem_names):
            # Finde Spalten per Semantic-Name-Index -> S-Array-Reihenfolge
            # Descriptor Select-Reihenfolge != S-Array-Reihenfolge, also per Inhalt erkennen
            # Erste Zeile inspizieren: AGS ist 5-stellige Ziffernfolge, Landkreis ist Text
            # cols (S-Array) = [G0_or_M0, ...], Zeilen bereits aufgelöst
            # Teste pro Spalte was die Werte sind
            if rows:
                sample = rows[0]
                idx_ags, idx_dauer, idx_name = None, None, None
                for i, val in enumerate(sample):
                    s = str(val)
                    # AGS: genau 5 Ziffern
                    if s.isdigit() and len(s) == 5:
                        idx_ags = i
                    else:
                        # Belegdauer: Zahl (float oder float-string)
                        try:
                            fval = float(s)
                            if 0.0 < fval < 30.0:  # realistischer Bereich: 0-30 Stunden/Tag
                                idx_dauer = i
                        except ValueError:
                            # Landkreis-Name: nicht-numerischer String
                            if isinstance(val, str) and len(s) > 3:
                                idx_name = i

                if idx_ags is not None and idx_dauer is not None and idx_name is not None:
                    for row in rows:
                        if len(row) > max(idx_ags, idx_dauer, idx_name):
                            try:
                                landkreise.append({
                                    "ags": str(row[idx_ags]),
                                    "belegdauer_total_h": float(row[idx_dauer]),
                                    "landkreis": str(row[idx_name]),
                                })
                            except (ValueError, TypeError):
                                pass

    if not bundesweit:
        raise RuntimeError("Keine bundesweiten Auslastungsdaten gefunden. Report-Struktur hat sich geaendert?")

    return {"bundesweit": bundesweit, "landkreise": landkreise}


def build_json(scraped: dict, stand: str) -> list[dict]:
    """
    Erstellt das auslastungs_kennzahlen.json-Format aus den gescrapten Daten.

    Enthält:
    - Bundesweite Einträge pro Ladetyp (ist_default=True)
    - Pro-Landkreis Einträge mit geschätzter Belegdauer pro Ladetyp (ist_default=False)
      Schätzung: Ladetyp-Belegdauer ∝ Landkreis-Total-Belegdauer / Bundesweit-Total
    """
    entries = []

    bw = scraped["bundesweit"]  # {'NLP': {'belegdauer_h':..., 'energie_kwh':..., 'ladevorgaenge':...}, ...}

    # Bundesweiter Gesamt-Durchschnitt (aggregiert über alle Ladetypen) als Referenz.
    # Wir berechnen ihn als Mittel der 394 Landkreis-Belegdauer-Werte – diese stammen aus der
    # gleichen OBELIS-NoLpArt-Tabelle wie die per-Landkreis-Daten, d.h. direkt vergleichbar.
    if scraped["landkreise"]:
        bw_total_h = sum(lk["belegdauer_total_h"] for lk in scraped["landkreise"]) / len(scraped["landkreise"])
    else:
        bw_total_h = sum(v.get("belegdauer_h", 0) for v in bw.values()) / max(len(bw), 1)

    # Bundesweite Einträge
    for pbi_kat, ladetyp in LADETYP_MAP.items():
        d = bw.get(pbi_kat, {})
        entries.append({
            "key": f"Deutschland (Bundesweit)___{ladetyp}",
            "landkreis": "Deutschland (Bundesweit)",
            "ladetyp": ladetyp,
            "avg_ladevorgaenge_taeglich": round(d.get("ladevorgaenge", 0), 4),
            "avg_energie_taeglich_kwh": round(d.get("energie_kwh", 0), 2),
            "avg_belegdauer_taeglich_min": round(d.get("belegdauer_h", 0) * 60, 1),
            "ist_default": True,
            "quelle": "NLL AusbauMONITORING Power BI",
            "stand": stand,
        })

    # Per-Landkreis-Einträge
    for lk in scraped["landkreise"]:
        lk_dauer_total_h = lk["belegdauer_total_h"]
        lk_name = lk["landkreis"]
        # Skalierungsfaktor: relativer Auslastungs-Multiplikator dieses Landkreises
        faktor = lk_dauer_total_h / bw_total_h if bw_total_h > 0 else 1.0

        for pbi_kat, ladetyp in LADETYP_MAP.items():
            d = bw.get(pbi_kat, {})
            # Belegdauer skaliert, Ladevorgänge + Energie als bundesweite Werte (keine Landkreis-Daten)
            entries.append({
                "key": f"{lk_name}___{ladetyp}",
                "landkreis": lk_name,
                "ags": lk["ags"],
                "ladetyp": ladetyp,
                "avg_ladevorgaenge_taeglich": round(d.get("ladevorgaenge", 0), 4),
                "avg_energie_taeglich_kwh": round(d.get("energie_kwh", 0), 2),
                "avg_belegdauer_taeglich_min": round(d.get("belegdauer_h", 0) * faktor * 60, 1),
                "ist_default": False,
                "quelle": "NLL AusbauMONITORING Power BI",
                "stand": stand,
            })

    return entries


def main():
    print("=== ELMI Power · Auslastungs-Scraper ===")
    today = date.today().isoformat()

    scraped = scrape_auslastung(headless=True)

    # Zusammenfassung ausgeben
    print("\nBundesweite Auslastungsdaten:")
    for kat, d in scraped["bundesweit"].items():
        ladetyp = LADETYP_MAP.get(kat, kat)
        print(
            f"  {ladetyp} ({kat}): "
            f"{d.get('ladevorgaenge', 0):.3f} Vorg/Tag, "
            f"{d.get('energie_kwh', 0):.1f} kWh/Tag, "
            f"{d.get('belegdauer_h', 0) * 60:.0f} min/Tag"
        )
    print(f"\nPer-Landkreis: {len(scraped['landkreise'])} Einträge")
    if scraped["landkreise"]:
        top = scraped["landkreise"][0]
        print(f"  Top: {top['landkreis']} ({top['ags']}) = {top['belegdauer_total_h'] * 60:.0f} min/Tag")

    entries = build_json(scraped, today)

    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)

    print(f"\nOK {len(entries)} Einträge gespeichert -> {DATA_FILE}")
    print(f"  Bundesweit: {len(LADETYP_MAP)} Einträge")
    print(f"  Per-Landkreis: {len(scraped['landkreise']) * len(LADETYP_MAP)} Einträge")


if __name__ == "__main__":
    main()
