/* =========================================================
   ELMI CPO Sales Center AI – shared IndexedDB helpers
   DB: elmi_cpo_sales  version: 1
   Stores:
     settings            keyPath: 'id'
     eigeneLadedaten     keyPath: 'key'  (stationSN + '_' + gun)
     wettbewerberOverrides keyPath: 'key' (betreiber + '_' + ladetyp)
     wettbewerberStandorte keyPath: '_idx' (autoIncrement)
     wettbewerberBetreiber keyPath: 'key' (betreiber + '_' + ladetyp)
     auslastungsKennzahlen keyPath: 'key' (landkreis + '_' + ladetyp)
     wettbewerberMeta    keyPath: 'id'
   ========================================================= */

const DB_NAME    = 'elmi_cpo_sales';
const DB_VERSION = 1;

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('settings'))
        db.createObjectStore('settings', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('eigeneLadedaten'))
        db.createObjectStore('eigeneLadedaten', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('wettbewerberOverrides'))
        db.createObjectStore('wettbewerberOverrides', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('wettbewerberStandorte'))
        db.createObjectStore('wettbewerberStandorte', { keyPath: '_idx', autoIncrement: true });
      if (!db.objectStoreNames.contains('wettbewerberBetreiber'))
        db.createObjectStore('wettbewerberBetreiber', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('auslastungsKennzahlen'))
        db.createObjectStore('auslastungsKennzahlen', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('wettbewerberMeta'))
        db.createObjectStore('wettbewerberMeta', { keyPath: 'id' });
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror   = e => reject(e.target.error);
  });
}

async function dbGet(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function dbPut(store, record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function dbGetAll(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function dbClear(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).clear();
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

async function dbBulkPut(store, records) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    records.forEach(r => os.put(r));
    tx.oncomplete = () => resolve();
    tx.onerror    = e => reject(e.target.error);
  });
}

/* ---- Settings helpers ---- */

const SETTINGS_ID = 'main';
const DEFAULT_SETTINGS = {
  id: SETTINGS_ID,
  preise: { AC: 0.45, DC: 0.55, HPC: 0.65 },
  standort: { strasse: '', hausnummer: '', plz: '', ort: '', land: 'Deutschland', lat: null, lng: null, landkreis: '' },
  radiusKm: 10,
  preisstrategie: {
    auslastungSchwelle: 50,
    auslastungSchritt: 5,
    auslastungsGewicht: 0.5,
    wettbewerbsGewicht: 0.5,
    preisMin: { AC: 0.35, DC: 0.45, HPC: 0.55 },
    preisMax: { AC: 0.65, DC: 0.79, HPC: 0.89 }
  }
};

async function loadSettings() {
  const s = await dbGet('settings', SETTINGS_ID);
  if (!s) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  // merge defaults for missing keys
  const merged = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  Object.assign(merged, s);
  merged.preise        = Object.assign({}, DEFAULT_SETTINGS.preise, s.preise || {});
  merged.standort      = Object.assign({}, DEFAULT_SETTINGS.standort, s.standort || {});
  merged.preisstrategie = Object.assign({}, DEFAULT_SETTINGS.preisstrategie, s.preisstrategie || {});
  if (s.preisstrategie) {
    merged.preisstrategie.preisMin = Object.assign({}, DEFAULT_SETTINGS.preisstrategie.preisMin, s.preisstrategie.preisMin || {});
    merged.preisstrategie.preisMax = Object.assign({}, DEFAULT_SETTINGS.preisstrategie.preisMax, s.preisstrategie.preisMax || {});
  }
  return merged;
}

async function saveSettings(s) {
  s.id = SETTINGS_ID;
  await dbPut('settings', s);
}

/* ---- Wettbewerber data loader ---- */

const WETT_URL      = '../data/wettbewerber_analyse.json';
const AUSL_URL      = '../data/auslastungs_kennzahlen.json';

// Returns { standorte, betreiber, kennzahlen, meta, source }
// source: 'network' | 'cache' | 'none'
async function loadWettbewerberDaten(forceRefresh = false) {
  let metaCache = null;
  try { metaCache = await dbGet('wettbewerberMeta', 'main'); } catch(_) {}

  let wettData = null, auslData = null, fetchError = null;

  if (!forceRefresh) {
    // try network with short timeout; fall back to cache
  }

  try {
    const [r1, r2] = await Promise.all([
      fetch(WETT_URL).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      fetch(AUSL_URL).then(r => r.ok ? r.json() : Promise.reject(r.status))
    ]);
    wettData = r1;
    auslData = r2;
  } catch(e) {
    fetchError = e;
  }

  if (wettData && auslData) {
    const networkDatum = wettData.meta && wettData.meta.analyse_datum;
    const cacheDatum   = metaCache && metaCache.analyse_datum;

    if (forceRefresh || networkDatum !== cacheDatum) {
      // Rebuild cache
      await Promise.all([
        dbClear('wettbewerberStandorte'),
        dbClear('wettbewerberBetreiber'),
        dbClear('auslastungsKennzahlen'),
        dbClear('wettbewerberMeta')
      ]);

      const standorte = (wettData.standorte || []).map((s, i) => ({ ...s, _idx: i + 1 }));
      const betreiber = (wettData.betreiber || []).map(b => ({
        ...b,
        key: b.betreiber + '___' + b.ladetyp
      }));
      const kennzahlen = (auslData.kennzahlen || []).map(k => ({
        ...k,
        key: k.landkreis + '___' + k.ladetyp
      }));
      const meta = { id: 'main', ...wettData.meta };

      await Promise.all([
        dbBulkPut('wettbewerberStandorte', standorte),
        dbBulkPut('wettbewerberBetreiber', betreiber),
        dbBulkPut('auslastungsKennzahlen', kennzahlen),
        dbPut('wettbewerberMeta', meta)
      ]);
    }

    const finalMeta = await dbGet('wettbewerberMeta', 'main');
    const standorte  = await dbGetAll('wettbewerberStandorte');
    const betreiber  = await dbGetAll('wettbewerberBetreiber');
    const kennzahlen = await dbGetAll('auslastungsKennzahlen');
    return { standorte, betreiber, kennzahlen, meta: finalMeta, source: 'network' };
  }

  // fallback to cache
  if (metaCache) {
    const standorte  = await dbGetAll('wettbewerberStandorte');
    const betreiber  = await dbGetAll('wettbewerberBetreiber');
    const kennzahlen = await dbGetAll('auslastungsKennzahlen');
    if (standorte.length > 0) {
      return { standorte, betreiber, kennzahlen, meta: metaCache, source: 'cache', fetchError };
    }
  }

  return { standorte: [], betreiber: [], kennzahlen: [], meta: null, source: 'none', fetchError };
}

/* ---- Geo helpers ---- */

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function geocode(strasse, hausnummer, plz, ort, land) {
  const q = encodeURIComponent(`${strasse} ${hausnummer}, ${plz} ${ort}, ${land}`);
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&addressdetails=1&limit=1`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'de', 'User-Agent': 'ELMI-CPO-Sales/1.0' } });
  const data = await res.json();
  if (!data || !data[0]) return null;
  const r = data[0];
  return {
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    landkreis: r.address && (r.address.county || r.address.city_district || '') || ''
  };
}

/* ---- Join helper ---- */
// Returns standorteImRadius enriched with Betreiber data + overrides
function joinWettbewerber(standorte, betreiber, overrides, settings) {
  if (!settings.standort || settings.standort.lat == null) return [];

  const { lat, lng } = settings.standort;
  const radius = settings.radiusKm || 10;

  const betreiberMap = {};
  betreiber.forEach(b => { betreiberMap[b.key] = b; });

  const overrideMap = {};
  (overrides || []).forEach(o => { overrideMap[o.key] = o; });

  return standorte
    .filter(s => s.lat != null && s.lng != null &&
                 haversineKm(lat, lng, s.lat, s.lng) <= radius)
    .map(s => {
      const key = s.betreiber + '___' + s.ladetyp;
      const b   = betreiberMap[key] || {};
      const ov  = overrideMap[key] || {};
      return {
        ...s,
        distanzKm: Math.round(haversineKm(lat, lng, s.lat, s.lng) * 10) / 10,
        preis_aktuell:              ov.preis_aktuell              !== undefined ? ov.preis_aktuell              : b.preis_aktuell,
        preisstrategie_kategorie:   ov.preisstrategie_kategorie   !== undefined ? ov.preisstrategie_kategorie   : (b.preisstrategie_kategorie || 'Unbekannt'),
        recherche_datum:            b.recherche_datum,
        _override: Object.keys(ov).length > 0
      };
    });
}

/* ---- i18n mini helper ---- */
const LANG_KEY = 'elmi_lang';
function getLang() { return localStorage.getItem(LANG_KEY) || 'de'; }
function setLang(l) { localStorage.setItem(LANG_KEY, l); location.reload(); }

function applyLangButtons(lang) {
  ['de','en'].forEach(l => {
    const b = document.getElementById('lbtn-' + l);
    if (b) b.classList.toggle('active', l === lang);
  });
  document.documentElement.lang = lang;
}

/* ---- Expose ---- */
window.ELMI_DB = {
  openDB, dbGet, dbPut, dbGetAll, dbClear, dbBulkPut,
  loadSettings, saveSettings,
  loadWettbewerberDaten,
  haversineKm, geocode, joinWettbewerber,
  getLang, setLang, applyLangButtons,
  DEFAULT_SETTINGS
};
