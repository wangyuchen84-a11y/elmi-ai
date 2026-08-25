/**
 * ELMI Power – Energy-Charts API Proxy (Cloudflare Worker)
 *
 * Grund: https://api.energy-charts.info/price beantwortet CORS-Anfragen
 * mit einem FEST verdrahteten, falschen Header
 * (Access-Control-Allow-Origin: https://www.api.energy-charts.info) -
 * unabhaengig davon, von welcher Origin aus angefragt wird. Das blockiert
 * den Browser-Zugriff generell, nicht nur von localhost aus. Server-seitig
 * (curl, dieser Worker) liefert die API ganz normal 200 OK, da dort keine
 * CORS-Pruefung stattfindet - nur der Browser haelt sich an den Header.
 *
 * Kein API-Key noetig (oeffentliche, kostenlose API), daher reicht ein
 * reiner Pass-Through ohne Auth-Handling.
 *
 * Retry bei 429: Cloudflare Workers teilen sich ausgehende IP-Adressen mit
 * sehr vielen anderen Kunden weltweit. Energy-Charts drosselt diese IP-Range
 * offenbar unabhaengig vom eigenen Traffic-Volumen (empirisch reproduziert:
 * direkte Anfragen vom selben Rechner liefen zuverlaessig durch, Anfragen
 * ueber den Worker bekamen wiederholt 429). Retry server-seitig statt im
 * Browser, da ein Worker-zu-Upstream-Roundtrip viel schneller ist als
 * Browser-zu-Worker-zu-Upstream - erlaubt mehr Versuche im selben Zeitbudget.
 *
 * Zusaetzlich: kurzer serverseitiger Cache (Cloudflare Cache API) pro
 * exakter Anfrage-URL. Day-Ahead-Preise aendern sich nicht sekuendlich -
 * ein schneller zweiter Refresh-Klick trifft damit direkt den Cache statt
 * erneut die rate-limitete Upstream-Verbindung zu belasten.
 *
 * Setup:
 *   1. Als neuen Cloudflare Worker deployen
 *   2. Keine Secrets noetig
 *   3. Worker-URL in js/energy-charts-api.js als PROXY_BASE eintragen
 */

const ALLOWED_ORIGIN = 'https://wangyuchen84-a11y.github.io';
const UPSTREAM_BASE = 'https://api.energy-charts.info';
const MAX_RETRIES = 5;
const CACHE_TTL_SECONDS = 180; // 3 Minuten - Day-Ahead-Preise aendern sich nicht sekuendlich

const ROUND_SECONDS = 300; // 5 Minuten

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// start/end haengen im Client an "jetzt" und verschieben sich bei jedem
// Aufruf um ein paar Sekunden -> jede Anfrage-URL waere technisch
// einzigartig, der Cache wuerde nie treffen. Auf 5-Minuten-Schritte runden,
// damit mehrere Aufrufe innerhalb kurzer Zeit denselben Cache-Eintrag
// treffen. Wirkung auf die Chart-Daten selbst: vernachlaessigbar (Fenster
// verschiebt sich um max. ±5min bei einem 48h/36h-Chart).
function roundIso(iso, floorFn) {
  const t = Math.floor(new Date(iso).getTime() / 1000);
  const rounded = floorFn(t / ROUND_SECONDS) * ROUND_SECONDS;
  return new Date(rounded * 1000).toISOString();
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders(origin) });
    }
    if (url.pathname !== '/price') {
      return new Response('Not found', { status: 404, headers: corsHeaders(origin) });
    }

    // start auf 5min abrunden, end auf 5min aufrunden - deckt das
    // urspruenglich angefragte Fenster weiterhin vollstaendig ab.
    const roundedUrl = new URL(url);
    if (roundedUrl.searchParams.has('start')) {
      roundedUrl.searchParams.set('start', roundIso(roundedUrl.searchParams.get('start'), Math.floor));
    }
    if (roundedUrl.searchParams.has('end')) {
      roundedUrl.searchParams.set('end', roundIso(roundedUrl.searchParams.get('end'), Math.ceil));
    }

    // Cache-Key ohne Origin (identische Preisdaten fuer alle Aufrufer),
    // Cloudflare Cache API ist pro Worker global, nicht pro Nutzer.
    const cacheKey = new Request(new URL(roundedUrl.pathname + roundedUrl.search, 'https://cache-key.internal'));
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) {
      const body = await cached.text();
      return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT', ...corsHeaders(origin) } });
    }

    const targetUrl = UPSTREAM_BASE + roundedUrl.pathname + roundedUrl.search;

    let upstream, lastErr;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) await sleep(150 * attempt + Math.random() * 150);
      try {
        upstream = await fetch(targetUrl);
      } catch (e) {
        lastErr = e;
        continue;
      }
      if (upstream.status === 429) { lastErr = new Error('429 from upstream'); continue; }
      break;
    }

    if (!upstream || upstream.status === 429) {
      return new Response(JSON.stringify({ error: 'Upstream rate-limited after ' + MAX_RETRIES + ' retries: ' + (lastErr && lastErr.message) }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    const body = await upstream.text();

    if (upstream.status === 200) {
      const cacheResponse = new Response(body, {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${CACHE_TTL_SECONDS}` },
      });
      ctx.waitUntil(cache.put(cacheKey, cacheResponse));
    }

    return new Response(body, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS', ...corsHeaders(origin) },
    });
  },
};

function corsHeaders(origin) {
  const allowed = origin === ALLOWED_ORIGIN || origin.startsWith('http://localhost');
  return {
    'Access-Control-Allow-Origin':  allowed ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age':       '86400',
  };
}
