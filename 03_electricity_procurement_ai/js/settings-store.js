/* =========================================================
   ELMI Electricity Procurement AI – Strompreis-Settings
   Persistenz: localStorage, Key "strompreis-settings"
   Wird von settings.html geschrieben und von boersenpreise.html
   gelesen. Ein "storage"-Event (feuert in ANDEREN Tabs desselben
   Ursprungs automatisch) laesst die Chart-Seite die rechte Achse
   sofort neu berechnen, ohne die Preis-API erneut abzufragen.

   Alle Preisbestandteile (inkl. Arbeitspreis/Netzentgelte) liegen
   in EINER Liste - kein separates Arbeitspreis-Feld, da das inhaltlich
   dasselbe wie Netzentgelte ist und nicht doppelt gefuehrt wird.

   In eine IIFE gekapselt: 04_cpo_sales_center_ai/js/db.js (eigene
   DEFAULT_SETTINGS/loadSettings/saveSettings) wird auf denselben Seiten
   eingebunden - ohne Kapselung wuerden Top-Level-Namen kollidieren
   (SyntaxError bei const, stilles Ueberschreiben bei function).
   ========================================================= */
(function () {

const SETTINGS_KEY = 'strompreis-settings';

const DEFAULT_SETTINGS = {
  bestandteile: [
    { label: 'Arbeitspreis/Netzentgelte', value: 8.50 },
    { label: 'Stromsteuer', value: 2.05 },
    { label: 'KWKG-Umlage', value: 0.277 },
    { label: '§19 StromNEV-Umlage', value: 0.643 },
    { label: 'Offshore-Netzumlage', value: 0.816 },
    { label: 'Konzessionsabgabe', value: 1.66 }
  ],
  mwst: 19 // %
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    const parsed = JSON.parse(raw);
    return {
      bestandteile: Array.isArray(parsed.bestandteile) ? parsed.bestandteile : DEFAULT_SETTINGS.bestandteile,
      mwst: typeof parsed.mwst === 'number' ? parsed.mwst : DEFAULT_SETTINGS.mwst
    };
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  // localStorage-Writes loesen "storage" NUR in anderen Tabs aus, nicht im
  // schreibenden selbst - eigenes Event fuer Listener auf derselben Seite.
  window.dispatchEvent(new CustomEvent('strompreis-settings-changed', { detail: settings }));
}

// strompreis_ct_kwh = (boerse_eur_mwh/10 + Σ(bestandteile)) * (1 + mwst/100)
function computeStrompreisCtKwh(boerseEurMwh, settings) {
  if (boerseEurMwh == null || isNaN(boerseEurMwh)) return null;
  const s = settings || loadSettings();
  const sumBestandteile = (s.bestandteile || []).reduce((sum, b) => sum + (parseFloat(b.value) || 0), 0);
  const netto = boerseEurMwh / 10 + sumBestandteile;
  return netto * (1 + (parseFloat(s.mwst) || 0) / 100);
}

window.ELMI_STROMPREIS = {
  SETTINGS_KEY,
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  computeStrompreisCtKwh
};

})();
