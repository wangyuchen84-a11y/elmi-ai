/**
 * ELMI Power – eco-movement API Proxy (Cloudflare Worker)
 *
 * Grund: die eco-movement-Endpunkte /prices und /prices/connector_prices/{id}
 * beantworten CORS-Preflight-Requests (OPTIONS) mit 405 - sie sind aus dem
 * Browser heraus NICHT direkt aufrufbar, weder von localhost noch von der
 * Live-Domain. Dieser Worker reicht die Anfrage serverseitig durch und
 * haengt die noetigen CORS-Header an die Antwort.
 *
 * Der eco-movement API-Token bleibt dabei beim Nutzer: der Client schickt
 * seinen eigenen "Authorization: Token ..."-Header mit, der Worker leitet
 * ihn unveraendert weiter. Es wird KEIN Token im Worker gespeichert.
 *
 * Nur GET wird durchgereicht (rein lesende eco-movement-Endpunkte).
 *
 * Setup:
 *   1. Als neuen Cloudflare Worker deployen
 *   2. Keine Secrets noetig (Token kommt vom Client)
 *   3. Worker-URL in js/eco-api.js als ECO_PROXY_BASE eintragen
 *      (siehe Kommentar dort) und die direkten api.eco-movement.com-URLs
 *      fuer /prices bzw. /prices/connector_prices darauf umstellen.
 */

const ALLOWED_ORIGIN = 'https://wangyuchen84-a11y.github.io';
const ECO_BASE = 'https://api.eco-movement.com';

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders(origin) });
    }

    const auth = request.headers.get('Authorization');
    if (!auth) {
      return new Response(JSON.stringify({ error: 'Authorization header fehlt' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    // Nur /prices und /prices/... durchreichen (kein offener Proxy fuer beliebige Pfade)
    if (!/^\/prices(\/|$)/.test(url.pathname)) {
      return new Response('Not found', { status: 404, headers: corsHeaders(origin) });
    }

    const targetUrl = ECO_BASE + url.pathname + url.search;

    let upstream;
    try {
      upstream = await fetch(targetUrl, {
        method: 'GET',
        headers: { 'Authorization': auth, 'accept': 'application/json' },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Upstream error: ' + e.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  },
};

function corsHeaders(origin) {
  const allowed = origin === ALLOWED_ORIGIN || origin.startsWith('http://localhost');
  return {
    'Access-Control-Allow-Origin':  allowed ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
    'Access-Control-Max-Age':       '86400',
  };
}
