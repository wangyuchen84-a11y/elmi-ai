/**
 * ELMI Power – Claude AI Proxy (Cloudflare Worker)
 *
 * Setup:
 *   1. Deploy this file as a new Cloudflare Worker
 *   2. Settings → Variables → Add secret: ANTHROPIC_API_KEY = sk-ant-...
 *   3. Copy the worker URL (e.g. https://elmi-claude-proxy.YOUR-SUBDOMAIN.workers.dev)
 *   4. Paste it into preisempfehlung.html as PROXY_URL
 */

const ALLOWED_ORIGIN = 'https://wangyuchen84-a11y.github.io';
const ANTHROPIC_URL  = 'https://api.anthropic.com/v1/messages';

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Parse incoming body
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    // Forward to Anthropic
    let anthropicResp;
    try {
      anthropicResp = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Upstream error: ' + e.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    const data = await anthropicResp.json();
    return new Response(JSON.stringify(data), {
      status: anthropicResp.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  },
};

function corsHeaders(origin) {
  // Allow GitHub Pages origin (and localhost for local testing)
  const allowed = origin === ALLOWED_ORIGIN || origin.startsWith('http://localhost');
  return {
    'Access-Control-Allow-Origin':  allowed ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age':       '86400',
  };
}
