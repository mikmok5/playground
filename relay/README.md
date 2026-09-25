# Sky Aquarium relay

The live flight APIs Sky Aquarium reads (ADSB.lol and adsb.fi) don't send CORS headers, so browsers won't let a web page read them. This relay is a tiny Cloudflare Worker that forwards those two read-only requests and adds the missing headers. It runs on Cloudflare's free plan.

## Set it up (about 2 minutes)

1. Tap this button and sign in to Cloudflare (or create a free account):

   [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mikmok5/playground/tree/main/relay)

2. Keep the suggested settings and tap **Create and deploy**. Cloudflare copies this folder into a repo on your GitHub account and deploys it.
3. When it finishes, copy the Worker's link. It looks like `https://sky-aquarium-relay.<your-name>.workers.dev`. Opening it should say "Sky Aquarium relay is running".
4. Open Sky Aquarium, tap the menu (☰), paste the link under **Live data relay** and tap **Save**. The badge turns to **LIVE**.

To have every visitor use your relay without pasting anything, put the link in `sky-aquarium/config.js`.

## What it allows

Only two request shapes are forwarded, both read-only:

- `/adsblol/v2/lat/{lat}/lon/{lon}/dist/{nm}` → `https://api.adsb.lol/v2/…`
- `/adsbfi/api/v3/lat/{lat}/lon/{lon}/dist/{nm}` → `https://opendata.adsb.fi/api/v3/…`

Everything else returns 404. `ALLOWED_ORIGINS` in `wrangler.toml` limits which sites may read through it.

## Deploy from a terminal instead

```sh
cd relay
npx wrangler login
npx wrangler deploy
```
