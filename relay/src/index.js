// Sky Aquarium relay: a tiny Cloudflare Worker that forwards the two public ADS-B position
// APIs and adds the CORS headers they leave out, so the Sky Aquarium page can read them.
//
//   GET /adsblol/v2/lat/{lat}/lon/{lon}/dist/{nm}      -> https://api.adsb.lol/v2/...
//   GET /adsbfi/api/v3/lat/{lat}/lon/{lon}/dist/{nm}   -> https://opendata.adsb.fi/api/v3/...
//
// Only those two read-only query shapes are forwarded; everything else is a 404.

const NUM = '-?\\d{1,3}(?:\\.\\d+)?';
const ROUTES = [
  { re: new RegExp(`^/adsblol/v2/lat/(${NUM})/lon/(${NUM})/dist/(\\d{1,3})$`), upstream: m => `https://api.adsb.lol/v2/lat/${m[1]}/lon/${m[2]}/dist/${m[3]}` },
  { re: new RegExp(`^/adsbfi/api/v3/lat/(${NUM})/lon/(${NUM})/dist/(\\d{1,3})$`), upstream: m => `https://opendata.adsb.fi/api/v3/lat/${m[1]}/lon/${m[2]}/dist/${m[3]}` },
];

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);
  const ok = allowed.includes('*') || allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': allowed.includes('*') ? '*' : ok ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors });

    const { pathname } = new URL(request.url);
    if (pathname === '/') {
      return new Response('Sky Aquarium relay is running. Paste this page\'s address into Sky Aquarium → menu → Live data relay.\n', {
        headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    for (const route of ROUTES) {
      const m = pathname.match(route.re);
      if (!m) continue;
      try {
        const upstream = await fetch(route.upstream(m), {
          headers: { Accept: 'application/json', 'User-Agent': 'sky-aquarium-relay (+https://github.com/mikmok5/playground)' },
          cf: { cacheTtl: 3, cacheEverything: true },
        });
        const headers = new Headers(cors);
        headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
        headers.set('Cache-Control', 'public, max-age=3');
        return new Response(upstream.body, { status: upstream.status, headers });
      } catch (err) {
        return new Response(JSON.stringify({ error: 'upstream unreachable' }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
    }
    return new Response('Not found', { status: 404, headers: cors });
  },
};
