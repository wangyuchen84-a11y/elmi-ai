/* =========================================================
   ELMI CPO Sales Center AI – eco-movement API client
   Zwei Datenquellen:
     - Locations (OCPI cpo/2.2): eigener API-Token-scope, KEIN Radius-Filter
       serverseitig -> wir laden alles und filtern client-seitig per Haversine
       (gleiche Logik wie bei Own Analysis).
     - Prices: locations -> connector_prices/{location_id} -> prices/{pricing_id}
   Preise werden pro Standort in IndexedDB gecacht (Store apiPriceCache),
   und beim erneuten Abruf fuer diesen Standort ueberschrieben.
   ========================================================= */

const ECO_TOKEN_KEY = 'elmi.ecoMovementToken';
// Locations (OCPI cpo/2.2) beantwortet CORS-Preflights korrekt -> direkter Aufruf moeglich.
const ECO_LOCATIONS_URL = 'https://api.eco-movement.com/api/ocpi/cpo/2.2/locations/';

// /prices und /prices/connector_prices/{id} beantworten OPTIONS-Preflights mit
// 405 (kein CORS) - weder von localhost noch von der Live-Domain direkt aus dem
// Browser aufrufbar. Muessen ueber den eco-movement-Proxy-Worker laufen
// (cloudflare-worker/eco-movement-proxy.js). URL hier eintragen, sobald deployt:
const ECO_PROXY_BASE = 'https://elmi-eco-movement-proxy.mick-meyer.workers.dev';
const ECO_CONNECTOR_PRICES_BASE = (ECO_PROXY_BASE || 'https://api.eco-movement.com') + '/prices/connector_prices/';
const ECO_PRICE_BASE = (ECO_PROXY_BASE || 'https://api.eco-movement.com') + '/prices/';

function getEcoToken() { return sessionStorage.getItem(ECO_TOKEN_KEY) || ''; }
function setEcoToken(t) { sessionStorage.setItem(ECO_TOKEN_KEY, t); }
function clearEcoToken() { sessionStorage.removeItem(ECO_TOKEN_KEY); }

function ladetypFromWatt(w) {
  const kw = (w || 0) / 1000;
  if (kw > 149) return 'HPC';
  if (kw > 21) return 'DC';
  return 'AC';
}

/* ---- Locations: alle Standorte des Tokens laden + auf bestehendes Schema mappen ---- */
// Liefert Rows im selben Format wie wettbewerber_analyse.json "standorte",
// zusaetzlich _locationId (fuer den Preisabruf) und _apiSource:true.
async function fetchEcoLocations(token) {
  if (!token) throw Object.assign(new Error('Kein eco-movement API-Token hinterlegt'), { code: 'NOKEY' });
  let all = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const res = await fetch(`${ECO_LOCATIONS_URL}?limit=${limit}&offset=${offset}`, {
      headers: { 'Authorization': `Token ${token}`, 'accept': 'application/json' }
    });
    if (res.status === 401 || res.status === 403) {
      throw Object.assign(new Error('eco-movement Token ungueltig oder ohne Berechtigung'), { code: res.status });
    }
    if (!res.ok) throw Object.assign(new Error('eco-movement API Fehler: HTTP ' + res.status), { code: res.status });
    const body = await res.json();
    const rows = body.data || [];
    all = all.concat(rows);
    if (rows.length < limit) break;
    offset += limit;
    if (offset > 200000) break; // Sicherheitslimit
  }

  const standorte = [];
  all.forEach(loc => {
    const byType = {}; // ladetyp -> { evseCount }
    (loc.evses || []).forEach(evse => {
      const types = new Set((evse.connectors || []).map(c => ladetypFromWatt(c.max_electric_power)));
      types.forEach(t => {
        byType[t] = byType[t] || { evseCount: 0 };
        byType[t].evseCount++;
      });
    });
    Object.keys(byType).forEach(ladetyp => {
      standorte.push({
        betreiber: (loc.operator && loc.operator.name) || 'Unbekannt',
        ladetyp,
        ladepunkte: byType[ladetyp].evseCount,
        strasse: loc.address || '',
        hausnummer: '',
        plz: loc.postal_code || '',
        ort: loc.city || '',
        landkreis: '', // OCPI liefert keinen Landkreis
        bundesland: loc.state || '',
        lat: loc.coordinates ? parseFloat(loc.coordinates.latitude) : null,
        lng: loc.coordinates ? parseFloat(loc.coordinates.longitude) : null,
        _locationId: loc.id,
        _locationName: loc.name || '',
        _apiSource: true
      });
    });
  });
  return standorte;
}

/* ---- Preise fuer EINEN Standort: connector_prices/{location_id} -> prices/{id} ----
   Gezielter Abruf per Pfad-Parameter (NICHT der 2.6-Mio.-Datensatz scannen). */
async function fetchStationPrices(token, locationId, onProgress) {
  if (!token) throw Object.assign(new Error('Kein eco-movement API-Token hinterlegt'), { code: 'NOKEY' });
  if (!ECO_PROXY_BASE) {
    throw Object.assign(new Error('eco-movement Preis-Proxy noch nicht konfiguriert (ECO_PROXY_BASE in js/eco-api.js eintragen, nachdem cloudflare-worker/eco-movement-proxy.js deployt wurde)'), { code: 'NOPROXY' });
  }

  if (onProgress) onProgress('Connectors abrufen…');
  const cpRes = await fetch(`${ECO_CONNECTOR_PRICES_BASE}${encodeURIComponent(locationId)}?limit=1000`, {
    headers: { 'Authorization': `Token ${token}`, 'accept': 'application/json' }
  });
  if (cpRes.status === 401 || cpRes.status === 403) {
    throw Object.assign(new Error('eco-movement Token ungueltig oder ohne Berechtigung'), { code: cpRes.status });
  }
  if (!cpRes.ok) throw Object.assign(new Error('eco-movement API Fehler: HTTP ' + cpRes.status), { code: cpRes.status });
  const cpBody = await cpRes.json();
  const connectorRows = cpBody.data || [];

  const pricingIds = new Set();
  connectorRows.forEach(row => (row.pricing_ids || []).forEach(id => pricingIds.add(id)));
  const idList = Array.from(pricingIds);

  const items = [];
  for (let i = 0; i < idList.length; i++) {
    if (onProgress) onProgress(`Preise abrufen… (${i + 1}/${idList.length})`);
    const pid = idList[i];
    try {
      const r = await fetch(`${ECO_PRICE_BASE}${encodeURIComponent(pid)}`, {
        headers: { 'Authorization': `Token ${token}`, 'accept': 'application/json' }
      });
      if (!r.ok) continue;
      const b = await r.json();
      (b.data || []).forEach(item => items.push(item));
    } catch (e) { /* einzelnen Preis ueberspringen, Rest weiterlaufen lassen */ }
  }

  return {
    locationId,
    connectors: connectorRows.length,
    items,
    fetchedAt: new Date().toISOString()
  };
}

function energyPriceOf(item) {
  for (const el of (item.elements || [])) {
    for (const pc of (el.price_components || [])) {
      if (pc.type === 'ENERGY') return pc.price_excl_vat;
    }
  }
  return null;
}

// Fasst Eintraege mit gleichem Anbieter UND gleichem €/kWh-Preis zu einer Zeile
// zusammen (z.B. mehrere Connectoren desselben Tarifs). Unterschiedliche
// Produktnamen werden dabei erhalten, mit " / " verbunden.
function dedupePrices(items) {
  const map = new Map();
  (items || []).forEach(it => {
    const price = energyPriceOf(it);
    const key = (it.partner || '') + '|' + (price != null ? price.toFixed(4) : 'null');
    const name = (it.product && it.product.name) || '';
    if (!map.has(key)) {
      map.set(key, { ...it, _productNames: name ? [name] : [] });
    } else {
      const existing = map.get(key);
      if (name && !existing._productNames.includes(name)) existing._productNames.push(name);
    }
  });
  return Array.from(map.values()).map(it => {
    const merged = { ...it };
    if (merged.product) merged.product = { ...merged.product, name: (it._productNames || []).join(' / ') || it.product.name };
    delete merged._productNames;
    return merged;
  });
}

function medianOf(values) {
  const v = (values || []).filter(x => x != null).slice().sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

// Gruppiert aufgeloeste Preise nach product.type (adhoc / msp / cpo_subscription),
// dedupliziert je Gruppe nach Anbieter+Preis.
function groupStationPrices(items) {
  const adhoc = [], msp = [], sub = [];
  (items || []).forEach(it => {
    const t = (it.product && it.product.type) || '';
    if (t === 'adhoc') adhoc.push(it);
    else if (t === 'cpo_subscription') sub.push(it);
    else msp.push(it);
  });
  const byPrice = (a, b) => (energyPriceOf(a) || 0) - (energyPriceOf(b) || 0);
  const dedupSort = arr => dedupePrices(arr).sort(byPrice);
  return { adhoc: dedupSort(adhoc), msp: dedupSort(msp), sub: dedupSort(sub) };
}

// Kompakte Zusammenfassung fuer Uebersicht (Liste/Karte): Ad-hoc-Preis + Median-Roaming
function summarizeStationPrices(items) {
  const { adhoc, msp } = groupStationPrices(items);
  const adhocPrice = adhoc.length ? energyPriceOf(adhoc[0]) : null;
  const roamingPrices = msp.map(energyPriceOf).filter(p => p != null);
  const medianRoaming = medianOf(roamingPrices);
  return { adhocPrice, medianRoaming, roamingCount: roamingPrices.length };
}

/* ---- Cache in IndexedDB: apiPriceCache, keyPath location_id, wird beim naechsten Abruf ueberschrieben ---- */
async function getCachedStationPrices(locationId) {
  return await dbGet('apiPriceCache', locationId);
}

async function saveCachedStationPrices(locationId, data) {
  await dbPut('apiPriceCache', { location_id: locationId, ...data });
}

// High-level: Cache nutzen, sonst live abrufen + cachen
async function getStationPrices(token, locationId, opts) {
  opts = opts || {};
  if (!opts.forceRefresh) {
    const cached = await getCachedStationPrices(locationId);
    if (cached) return { ...cached, source: 'cache' };
  }
  const fresh = await fetchStationPrices(token, locationId, opts.onProgress);
  await saveCachedStationPrices(locationId, fresh);
  return { ...fresh, location_id: locationId, source: 'network' };
}

// Laedt Preise fuer mehrere Standorte im Hintergrund nach (sequentiell, damit
// die API nicht ueberrannt wird), ruft onEach(locationId, summary) auf sobald
// je ein Standort fertig ist - fuer progressive UI-Updates ohne auf alle zu warten.
// Nutzt den Cache: bereits geladene Standorte liefern sofort.
async function preloadStationPrices(token, locationIds, onEach) {
  for (const locationId of locationIds) {
    try {
      const result = await getStationPrices(token, locationId);
      const summary = summarizeStationPrices(result.items);
      if (onEach) onEach(locationId, summary, null);
    } catch (e) {
      if (onEach) onEach(locationId, null, e);
    }
  }
}

window.ELMI_ECO = {
  ECO_TOKEN_KEY,
  getEcoToken, setEcoToken, clearEcoToken,
  ladetypFromWatt,
  fetchEcoLocations,
  fetchStationPrices,
  getStationPrices,
  getCachedStationPrices,
  preloadStationPrices,
  energyPriceOf,
  medianOf,
  dedupePrices,
  groupStationPrices,
  summarizeStationPrices
};
