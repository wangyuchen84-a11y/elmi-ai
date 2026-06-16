#!/usr/bin/env python3
"""
Wöchentliche Wettbewerber-Analyse (HPC-Fokus): BNetzA-Register → wettbewerber_analyse.json
Schritte 1-3 + 5-8 (ohne Preisrecherche, die läuft per Claude-Prompt)

Scope: nur Betreiber mit HPC-Ladepunkten (> 149 kW) und mehr als HPC_MIN_LADEPUNKTE
Ladepunkten werden recherchiert/aktualisiert. AC/DC-Betreiber (≤ 149 kW) landen
einmalig in einer separaten Datei (wettbewerber_ac_dc.json), die nicht
wöchentlich aktualisiert wird.
"""

import json
import os
import re
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

REGISTER_DIR = Path(r"D:\ELMI Power\OneDrive - ELMI\OneDrive - ELMI Power GmbH\Dokumente\Claude Cowork Playground\Ladesäulenregister")
REPO_DIR = Path(r"D:\ELMI Power\OneDrive - ELMI\OneDrive - ELMI Power GmbH\Dokumente\Claude Cowork Playground\elmi-ai")
DATA_DIR = REPO_DIR / "data"
OUT_ANALYSE = DATA_DIR / "wettbewerber_analyse.json"
OUT_AUSLASTUNG = DATA_DIR / "auslastungs_kennzahlen.json"
OUT_AC_DC = DATA_DIR / "wettbewerber_ac_dc.json"

HPC_MIN_LADEPUNKTE = 20  # nur HPC-Betreiber oberhalb dieser Schwelle werden recherchiert


# ── Schritt 1: Neueste Register-Datei finden ─────────────────────────────────

def find_latest_register() -> tuple[Path, str]:
    pattern = re.compile(r"Ladesaeulenregister_BNetzA_(\d{4}-\d{2}-\d{2})\.xlsx$")
    candidates = []
    for f in REGISTER_DIR.glob("Ladesaeulenregister_BNetzA_*.xlsx"):
        m = pattern.match(f.name)
        if m:
            candidates.append((m.group(1), f))
    if not candidates:
        raise FileNotFoundError(f"Keine Register-Datei in {REGISTER_DIR}")
    candidates.sort(key=lambda x: x[0], reverse=True)
    datum, path = candidates[0]
    return path, datum


# ── Schritt 2: Register parsen ────────────────────────────────────────────────

def ladetyp_from_kw(kw) -> str:
    try:
        kw = float(str(kw).replace(",", "."))
    except (TypeError, ValueError):
        return "AC"
    if kw > 149:
        return "HPC"
    if kw > 21:
        return "DC"
    return "AC"


def dominant_ladetyp(counts: dict) -> str:
    return max(counts, key=counts.get)


def parse_latlon(val) -> float | None:
    if val is None:
        return None
    try:
        return float(str(val).replace(",", "."))
    except ValueError:
        return None


def parse_register(path: Path) -> list[dict]:
    import openpyxl
    print(f"Lese {path.name} …", flush=True)
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active

    # Standorte: key = (betreiber, strasse, hausnummer, plz, ort)
    standort_map: dict[tuple, dict] = {}

    rows_processed = 0
    for row in ws.iter_rows(min_row=12, values_only=True):
        # A=0 B=1 C=2 D=3 E=4 F=5 G=6 H=7 I=8 J=9 K=10 L=11 M=12 N=13 O=14 P=15 Q=16
        status = row[3]
        if status != "In Betrieb":
            continue

        betreiber  = str(row[1]).strip() if row[1] else ""
        ladepunkte = int(row[5]) if row[5] else 0
        nennleist  = row[6]
        strasse    = str(row[8]).strip() if row[8] else ""
        hausnr     = str(row[9]).strip() if row[9] else ""
        plz        = str(row[11]).strip() if row[11] else ""
        ort        = str(row[12]).strip() if row[12] else ""
        landkreis  = str(row[13]).strip() if row[13] else ""
        bundesland = str(row[14]).strip() if row[14] else ""
        lat        = parse_latlon(row[15])
        lng        = parse_latlon(row[16])

        if not betreiber:
            continue

        lt = ladetyp_from_kw(nennleist)
        key = (betreiber, strasse, hausnr, plz, ort)

        if key not in standort_map:
            standort_map[key] = {
                "betreiber":  betreiber,
                "strasse":    strasse,
                "hausnummer": hausnr,
                "plz":        plz,
                "ort":        ort,
                "landkreis":  landkreis,
                "bundesland": bundesland,
                "lat":        lat,
                "lng":        lng,
                "_ladetyp_counts": defaultdict(int),
                "ladepunkte": 0,
            }
        s = standort_map[key]
        s["ladepunkte"] += ladepunkte
        s["_ladetyp_counts"][lt] += ladepunkte
        rows_processed += 1

    wb.close()
    print(f"  {rows_processed:,} aktive Einträge, {len(standort_map):,} Standorte", flush=True)

    standorte = []
    for s in standort_map.values():
        lt = dominant_ladetyp(s["_ladetyp_counts"])
        standorte.append({
            "betreiber":  s["betreiber"],
            "ladetyp":    lt,
            "ladepunkte": s["ladepunkte"],
            "strasse":    s["strasse"],
            "hausnummer": s["hausnummer"],
            "plz":        s["plz"],
            "ort":        s["ort"],
            "landkreis":  s["landkreis"],
            "bundesland": s["bundesland"],
            "lat":        s["lat"],
            "lng":        s["lng"],
        })
    return standorte


# ── Schritt 3: Betreiber-Liste ────────────────────────────────────────────────

def build_betreiber_stats(standorte: list[dict]) -> list[dict]:
    stats: dict[str, dict] = {}
    for s in standorte:
        b = s["betreiber"]
        if b not in stats:
            stats[b] = {"betreiber": b, "ladepunkte_gesamt": 0, "_lt_counts": defaultdict(int)}
        stats[b]["ladepunkte_gesamt"] += s["ladepunkte"]
        stats[b]["_lt_counts"][s["ladetyp"]] += s["ladepunkte"]

    result = []
    for b, d in stats.items():
        lt = dominant_ladetyp(d["_lt_counts"])
        result.append({"betreiber": b, "ladepunkte_gesamt": d["ladepunkte_gesamt"], "ladetyp_dominant": lt})

    result.sort(key=lambda x: x["ladepunkte_gesamt"], reverse=True)
    return result


# ── Schritt 5: Preishistorie fortschreiben ───────────────────────────────────

def load_existing_analyse() -> dict | None:
    if OUT_ANALYSE.exists():
        with open(OUT_ANALYSE, encoding="utf-8") as f:
            return json.load(f)
    return None


def merge_preisdaten(
    betreiber_stats: list[dict],
    existing_map: dict[tuple, dict],
    neue_preise: dict | None,  # {betreiber: {ladetyp: {preis, quelle}}}
    heute: str,
) -> list[dict]:
    result = []
    for bs in betreiber_stats:
        b_name = bs["betreiber"]
        lt = bs["ladetyp_dominant"]

        prev = existing_map.get((b_name, lt), {})
        historie = list(prev.get("preishistorie", []))

        new_preis_info = (neue_preise or {}).get(b_name, {}).get(lt)
        if new_preis_info:
            preis_neu = new_preis_info.get("preis")
            if preis_neu is not None:
                # Snapshot nur hinzufügen, falls noch keiner für heute
                if not any(h["datum"] == heute for h in historie):
                    historie.append({"datum": heute, "preis": preis_neu})
            quelle = new_preis_info.get("quelle", "")
            recherche_datum = heute
        else:
            quelle = prev.get("quelle", "")
            recherche_datum = prev.get("recherche_datum")

        # Rolling averages
        def avg_window(days: int) -> float | None:
            cutoff = (datetime.fromisoformat(heute) - timedelta(days=days)).isoformat()[:10]
            vals = [h["preis"] for h in historie if h["datum"] >= cutoff and h["preis"] is not None]
            return round(sum(vals) / len(vals), 4) if vals else None

        preis_aktuell = (historie[-1]["preis"] if historie else None)
        p1m  = avg_window(28)
        p3m  = avg_window(91)
        p12m = avg_window(365) if len(historie) >= 10 else None

        kategorie = classify_preis(preis_aktuell, lt, quelle)

        result.append({
            "betreiber": b_name,
            "ladetyp": lt,
            "ladepunkte_gesamt": bs["ladepunkte_gesamt"],
            "preis_aktuell": preis_aktuell,
            "preis_letzter_monat": p1m,
            "preis_letzte_3_monate": p3m,
            "preis_letzte_12_monate": p12m,
            "preisstrategie_kategorie": kategorie,
            "preishistorie": historie,
            "quelle": quelle,
            "recherche_datum": recherche_datum,
        })

    return result


# ── Schritt 6: Preisstrategie-Kategorie ─────────────────────────────────────

def classify_preis(preis: float | None, ladetyp: str, quelle: str) -> str:
    if preis is None:
        return "Unbekannt"
    is_ac = ladetyp == "AC"
    if is_ac:
        if preis < 0.40:
            return "Penetration/Markteinstieg"
        if preis > 0.75 and "app" not in quelle.lower():
            return "Premium Ad-hoc"
    else:
        if preis < 0.45:
            return "Penetration/Markteinstieg"
        if preis > 0.65 and "app" not in quelle.lower():
            return "Premium Ad-hoc"
    if "app" in quelle.lower() or "registrierung" in quelle.lower():
        return "Tarif-/App-basiert mit Rabatt"
    if "flatrate" in quelle.lower() or "abo" in quelle.lower():
        return "Flatrate/Abo"
    if "zeit" in quelle.lower() or "last" in quelle.lower():
        return "Dynamisch/Zeitabhängig"
    return "Tarif-/App-basiert mit Rabatt"


# ── Schritt 7: Auslastungs-Kennzahlen (Platzhalter) ──────────────────────────

def build_auslastung(standorte: list[dict]) -> dict:
    # Deutschland-weite Platzhalter-Werte je Ladetyp (Quelle: Marktstudien ~2024)
    defaults = {
        "AC":  {"avg_belegdauer_taeglich_min": 72.0,  "avg_ladevorgaenge_taeglich": 3.2, "avg_energie_taeglich_kwh": 18.0},
        "DC":  {"avg_belegdauer_taeglich_min": 38.0,  "avg_ladevorgaenge_taeglich": 5.5, "avg_energie_taeglich_kwh": 55.0},
        "HPC": {"avg_belegdauer_taeglich_min": 24.0,  "avg_ladevorgaenge_taeglich": 8.0, "avg_energie_taeglich_kwh": 130.0},
    }

    # Alle Landkreis × Ladetyp-Kombinationen aus Standorten sammeln
    combos: set[tuple[str, str]] = set()
    for s in standorte:
        combos.add((s["landkreis"], s["ladetyp"]))

    kennzahlen = []
    for landkreis, lt in sorted(combos):
        d = defaults.get(lt, defaults["AC"])
        kennzahlen.append({
            "landkreis": landkreis,
            "ladetyp": lt,
            **d,
            "ist_default": True,
        })

    return {"kennzahlen": kennzahlen}


# ── AC/DC-Snapshot (einmalig) ─────────────────────────────────────────────────

def build_ac_dc_snapshot(ac_dc_standorte: list[dict], existing_map: dict[tuple, dict], heute: str) -> dict:
    betreiber_stats = build_betreiber_stats(ac_dc_standorte)
    betreiber_list = []
    for bs in betreiber_stats:
        b_name = bs["betreiber"]
        lt = bs["ladetyp_dominant"]
        prev = existing_map.get((b_name, lt), {})
        betreiber_list.append({
            "betreiber": b_name,
            "ladetyp": lt,
            "ladepunkte_gesamt": bs["ladepunkte_gesamt"],
            "preis_aktuell": prev.get("preis_aktuell"),
            "preis_letzter_monat": prev.get("preis_letzter_monat"),
            "preis_letzte_3_monate": prev.get("preis_letzte_3_monate"),
            "preis_letzte_12_monate": prev.get("preis_letzte_12_monate"),
            "preisstrategie_kategorie": prev.get("preisstrategie_kategorie", "Unbekannt"),
            "preishistorie": prev.get("preishistorie", []),
            "quelle": prev.get("quelle", ""),
            "recherche_datum": prev.get("recherche_datum"),
        })

    return {
        "meta": {
            "hinweis": "Einmalige Momentaufnahme (AC/DC, ≤ 149 kW) – wird nicht wöchentlich aktualisiert.",
            "erstellt_am": heute,
            "anzahl_standorte": len(ac_dc_standorte),
            "anzahl_betreiber": len(betreiber_list),
        },
        "standorte": ac_dc_standorte,
        "betreiber": betreiber_list,
    }


# ── Hauptprogramm ─────────────────────────────────────────────────────────────

def main():
    heute = date.today().isoformat()

    # Neue Preise aus optionalem Argument (JSON-Datei) laden
    neue_preise = None
    if len(sys.argv) > 1 and sys.argv[1].endswith(".json"):
        with open(sys.argv[1], encoding="utf-8") as f:
            neue_preise = json.load(f)
        print(f"Neue Preise geladen: {sys.argv[1]}", flush=True)

    print("=== Schritt 1: Register-Datei suchen ===", flush=True)
    register_path, register_datum = find_latest_register()
    print(f"  Gefunden: {register_path.name} ({register_datum})", flush=True)

    existing = load_existing_analyse()
    existing_map: dict[tuple, dict] = {}
    if existing:
        for b in existing.get("betreiber", []):
            existing_map[(b["betreiber"], b["ladetyp"])] = b
        prev_datum = existing.get("meta", {}).get("register_datum")
        if prev_datum == register_datum:
            print(f"  Hinweis: register_datum unverändert ({register_datum}), parse trotzdem", flush=True)

    print("\n=== Schritt 2: Register parsen ===", flush=True)
    standorte = parse_register(register_path)
    hpc_standorte = [s for s in standorte if s["ladetyp"] == "HPC"]
    ac_dc_standorte = [s for s in standorte if s["ladetyp"] != "HPC"]

    print("\n=== Schritt 3: HPC-Betreiber filtern ===", flush=True)
    hpc_betreiber_stats = build_betreiber_stats(hpc_standorte)
    hpc_betreiber_stats = [b for b in hpc_betreiber_stats if b["ladepunkte_gesamt"] > HPC_MIN_LADEPUNKTE]
    print(f"  HPC-Betreiber mit > {HPC_MIN_LADEPUNKTE} Ladepunkten: {len(hpc_betreiber_stats)}", flush=True)

    print("\n=== Schritt 5+6: Preishistorie & Kategorien ===", flush=True)
    betreiber_list = merge_preisdaten(hpc_betreiber_stats, existing_map, neue_preise, heute)

    print("\n=== Schritt 7: Auslastungs-Kennzahlen (HPC) ===", flush=True)
    auslastung = build_auslastung(hpc_standorte)

    # Output schreiben
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    analyse = {
        "meta": {
            "register_datum": register_datum,
            "analyse_datum": heute,
            "anzahl_standorte": len(hpc_standorte),
            "anzahl_betreiber": len(hpc_betreiber_stats),
            "hpc_min_ladepunkte": HPC_MIN_LADEPUNKTE,
        },
        "standorte": hpc_standorte,
        "betreiber": betreiber_list,
    }

    with open(OUT_ANALYSE, "w", encoding="utf-8") as f:
        json.dump(analyse, f, ensure_ascii=False, separators=(",", ":"))
    print(f"\nGeschrieben: {OUT_ANALYSE}", flush=True)

    with open(OUT_AUSLASTUNG, "w", encoding="utf-8") as f:
        json.dump(auslastung, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Geschrieben: {OUT_AUSLASTUNG}", flush=True)

    if OUT_AC_DC.exists():
        print(f"\nAC/DC-Datei existiert bereits ({OUT_AC_DC.name}) – kein erneutes Update (einmalig).", flush=True)
    else:
        ac_dc_snapshot = build_ac_dc_snapshot(ac_dc_standorte, existing_map, heute)
        with open(OUT_AC_DC, "w", encoding="utf-8") as f:
            json.dump(ac_dc_snapshot, f, ensure_ascii=False, separators=(",", ":"))
        print(f"\nGeschrieben (einmalig): {OUT_AC_DC}", flush=True)

    print("\n=== Fertig ===", flush=True)
    print(f"HPC-Standorte: {len(hpc_standorte):,}", flush=True)
    print(f"HPC-Betreiber (> {HPC_MIN_LADEPUNKTE} Ladepunkte): {len(hpc_betreiber_stats)}", flush=True)


if __name__ == "__main__":
    main()
