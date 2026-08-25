/* =========================================================
   ELMI Electricity Procurement AI – Energy-Charts API Client
   Quelle: https://api.energy-charts.info/price?bzn=DE-LU&start=&end=
   (Fraunhofer ISE, CC BY 4.0, kein API-Key, CORS aktiviert)

   Zeitfenster: 48h Vergangenheit (real, 15-min) + 36h Zukunft
   (offizielle Day-Ahead-Werte, sonst per Vorwoche-Proxy aufgefuellt).
   Uebergang Vergangenheit->Zukunft ist eine durchgehende Linie
   (Bridge-Punkt bei "jetzt"), danach gestrichelt via future:true.
   Gekapselt in eine IIFE: wird zusammen mit 04_cpo_sales_center_ai/js/db.js
   auf derselben Seite eingebunden (Preisempfehlung), ohne Kapselung
   koennten Top-Level-Namen kuenftig kollidieren.
   ========================================================= */
(function () {

const HOUR = 3600;
const DAY = 86400;

// api.energy-charts.info beantwortet CORS-Preflights mit einem fest
// verdrahteten falschen Access-Control-Allow-Origin-Header (immer
// https://www.api.energy-charts.info, egal welche Origin anfragt) - das
// blockiert JEDEN Browser-Zugriff, nicht nur localhost. Muss daher ueber
// den Proxy-Worker laufen (cloudflare-worker/energy-charts-proxy.js).
// URL hier eintragen, sobald deployt:
const PROXY_BASE = 'https://energy-chart-proxy.mick-meyer.workers.dev';
const API_BASE = (PROXY_BASE || 'https://api.energy-charts.info') + '/price';

function toIso(unixSeconds) {
  return new Date(unixSeconds * 1000).toISOString();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Holt einen Zeitraum und liefert [{t, price}] - null-Preise (unveroeffentlichte
// Zukunftsstunden) werden bereits hier herausgefiltert, sortiert nach t.
//
// loadFullSeries() feuert zwei Fenster PARALLEL ab (Vergangenheit + Vorwoche).
// Energy-Charts' Server beantwortet zwei nahezu gleichzeitige Anfragen
// zuverlaessig mit 429 auf einer davon (empirisch reproduziert, kein
// Einzelfall) - daher mit kurzem Backoff erneut versuchen, bevor aufgegeben wird.
async function fetchPriceWindow(startUnix, endUnix, retries = 3) {
  if (!PROXY_BASE) {
    throw Object.assign(new Error('Energy-Charts-Proxy noch nicht konfiguriert (PROXY_BASE in js/energy-charts-api.js eintragen, nachdem cloudflare-worker/energy-charts-proxy.js deployt wurde)'), { code: 'NOPROXY' });
  }
  const url = `${API_BASE}?bzn=DE-LU&start=${encodeURIComponent(toIso(startUnix))}&end=${encodeURIComponent(toIso(endUnix))}`;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(400 * attempt + Math.random() * 300); // 400-700ms, 800-1100ms, ...
    const res = await fetch(url);
    if (res.status === 429) { lastErr = new Error('Energy-Charts API Fehler: HTTP 429'); continue; }
    if (!res.ok) throw new Error('Energy-Charts API Fehler: HTTP ' + res.status);
    const body = await res.json();
    const ts = body.unix_seconds || [];
    const pr = body.price || [];
    const points = [];
    for (let i = 0; i < ts.length; i++) {
      if (pr[i] == null) continue; // unveroeffentlicht -> ueberspringen
      points.push({ t: ts[i], price: pr[i] });
    }
    points.sort((a, b) => a.t - b.t);
    return points;
  }
  throw lastErr;
}

// Mittelwert aller Punkte in [hourStart, hourStart+HOUR), sonst null
function resampleHourly(points, hourStart) {
  const hourEnd = hourStart + HOUR;
  const inRange = points.filter(p => p.t >= hourStart && p.t < hourEnd);
  if (!inRange.length) return null;
  return inRange.reduce((s, p) => s + p.price, 0) / inRange.length;
}

function floorToHour(unixSeconds) {
  return Math.floor(unixSeconds / HOUR) * HOUR;
}

// Baut die vollstaendige Serie: Vergangenheit (15-min, durchgezogen) +
// Bridge-Punkt bei "jetzt" + Zukunft (stuendlich, gestrichelt, mit
// geglaettetem Uebergang official->historisch-aufgefuellt).
function buildSeries(now, realPoints, histPoints, pastHours = 48, futureHours = 36) {
  const real = [...realPoints].sort((a, b) => a.t - b.t);
  const hist = [...histPoints].sort((a, b) => a.t - b.t);
  const pastStart = now - pastHours * HOUR;

  const past = real
    .filter(p => p.t >= pastStart && p.t <= now)
    .map(p => ({ t: p.t, boerse: p.price, future: false }));

  const officialMaxT = real.length ? real[real.length - 1].t : now;
  const lastRealPrice = real.length ? real[real.length - 1].price : null;

  const future = [];
  const startH = floorToHour(now) + HOUR;
  const endH = floorToHour(now + futureHours * HOUR); // exklusiv (Python-range-Semantik)
  let prevVal = lastRealPrice;

  for (let h = startH; h < endH; h += HOUR) {
    let val = h < officialMaxT ? resampleHourly(real, h) : null;
    let fill = false;
    if (val == null) {
      fill = true;
      val = resampleHourly(hist, h - 7 * DAY); // gleicher Wochentag/Stunde vor 7 Tagen
      if (val == null) val = prevVal;
    }
    future.push({ t: h, boerse: val, future: true, fill });
    prevVal = val;
  }

  // Seam glaetten: erster gefuellter Punkt wird interpoliert, kein harter Sprung
  const i = future.findIndex(f => f.fill);
  if (i > 0 && future[i].boerse != null && future[i - 1].boerse != null) {
    future[i].boerse = 0.5 * future[i - 1].boerse + 0.5 * future[i].boerse;
  } else if (i === 0 && future[0].boerse != null && lastRealPrice != null) {
    future[0].boerse = 0.5 * lastRealPrice + 0.5 * future[0].boerse;
  }

  const series = [...past];
  if (lastRealPrice != null) {
    series.push({ t: now, boerse: lastRealPrice, future: false }); // Bridge: durchgehende Linie
  }
  return series.concat(future);
}

// High-level: laedt beide Fenster und liefert die fertige Serie.
//
// Urspruenglich per Promise.all parallel geladen (wie in der Spezifikation
// vorgesehen). Das kollidierte empirisch reproduzierbar mit Energy-Charts'
// Rate-Limit: zwei nahezu zeitgleiche Anfragen bekommen zuverlaessig eine
// 429 auf einer davon, und da beide Anfragen synchron zur selben Zeit
// starten, retryen sie auch wieder synchron und kollidieren erneut
// ("thundering herd"). Sequentiell laden entkoppelt sie vollstaendig -
// kostet einen zusaetzlichen Roundtrip (~200-500ms), ist aber zuverlaessig.
async function loadFullSeries(pastHours = 48, futureHours = 36) {
  const now = Math.floor(Date.now() / 1000);
  const realStart = now - (pastHours + 1) * HOUR;
  const realEnd = now + (futureHours + 4) * HOUR; // etwas Puffer fuer Resampling am Rand
  const histStart = realStart - 7 * DAY;
  const histEnd = realEnd - 7 * DAY;

  const real = await fetchPriceWindow(realStart, realEnd);
  const hist = await fetchPriceWindow(histStart, histEnd);

  const result = {
    series: buildSeries(now, real, hist, pastHours, futureHours),
    now,
    fetchedAt: new Date().toISOString()
  };
  saveSeriesCache(result);
  return result;
}

/* ---- Modul-uebergreifender Cache (localStorage, gleiche Origin) ----
   boersenpreise.html UND 04_cpo_sales_center_ai/preisempfehlung.html
   liegen unter derselben Origin (nur andere Pfade) - localStorage ist
   pro Origin, nicht pro Verzeichnis, daher hier direkt lesbar/schreibbar
   ohne eigenen Cross-Module-Mechanismus. */
const SERIES_CACHE_KEY = 'elmi-strommarkt-series';

function saveSeriesCache(result) {
  try {
    localStorage.setItem(SERIES_CACHE_KEY, JSON.stringify({ series: result.series, fetchedAt: result.fetchedAt }));
  } catch (e) { /* localStorage voll o.ae. - Cache ist nur eine Bequemlichkeit, kein Muss */ }
}

function loadSeriesCache() {
  try {
    const raw = localStorage.getItem(SERIES_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

// Durchschnittlicher Boersenpreis (EUR/MWh) ueber die naechsten `hours` Stunden
// Zukunftspunkte einer gecachten Serie. null falls keine Zukunftsdaten da.
function avgFuturePrice(series, hours = 24) {
  if (!series || !series.length) return null;
  const nowMs = Date.now();
  const cutoffMs = nowMs + hours * HOUR * 1000;
  const relevant = series.filter(p => p.future && p.t * 1000 <= cutoffMs && p.boerse != null);
  if (!relevant.length) return null;
  return relevant.reduce((s, p) => s + p.boerse, 0) / relevant.length;
}

window.ELMI_ENERGY_CHARTS = {
  HOUR, DAY,
  SERIES_CACHE_KEY, saveSeriesCache, loadSeriesCache, avgFuturePrice,
  fetchPriceWindow,
  resampleHourly,
  floorToHour,
  buildSeries,
  loadFullSeries
};

})();
