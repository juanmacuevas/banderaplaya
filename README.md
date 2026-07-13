# banderaplaya

A map of Spain's beaches showing today's Cruz Roja flag — green, yellow,
or red — live, nationwide.

Live at [banderaplaya.pages.dev](https://banderaplaya.pages.dev).
`banderaplaya.es` is the intended domain but isn't attached yet (see
"Custom domain" below).

## What it does, simply

Cruz Roja (the Spanish Red Cross) staffs 192 beaches across Spain and
publishes a flag and a set of details (schedule, accessibility, lifeguard
towers, jellyfish, etc.) for each one on their own site. This project:

1. Shows all 192 beaches on a map.
2. Colors each marker to match that beach's current flag.
3. Keeps that data warm in the background instead of asking Cruz Roja
   live on every visit — a small standalone Worker sweeps a rotating
   slice of beaches every 2 minutes (only during the hours beaches are
   actually staffed), so any single page load is just an instant read
   from cache, never a live call to Cruz Roja.

There's no database — a Cloudflare KV cache holds the current snapshot,
refreshed continuously and never fully rebuilt from scratch.

## How it works, in more detail

Two separate pieces, because Cloudflare Pages Functions can't hold a
Cron Trigger — only a standalone Worker can:

- **`worker-scraper/`** — a standalone Worker on a 2-minute Cron Trigger.
  Gated to `isNationalAttendedHours()` (08:30–21:30 Europe/Madrid,
  derived from the earliest/latest `Horario` values seen across all 192
  beaches, padded 30min each side) — outside that window it's a no-op.
  Each active tick fetches a slice of 16 beaches (rotating through the
  full list, cursor persisted in the cache itself) and writes one merged
  KV blob per tick. A full nationwide refresh takes ~24 minutes
  (192 beaches ÷ 16/tick × 2min). This keeps KV writes to ~390/day, well
  under free-tier KV's 1,000 writes/day cap (which is account-wide, not
  per-namespace).
- **`functions/api/beaches/`** — Pages Functions that only *read* that
  cache. `GET /api/beaches` returns all 192 (with `status: "pending"`
  for anything the rotation hasn't reached yet); `GET /api/beaches/:id`
  is a separate on-demand live scrape of one beach, uncached, for ad-hoc
  lookups — it does talk to Cruz Roja directly, since it's for one-off
  study rather than the map.

On page load, the map fetches `/api/beaches` once and places a marker
for every beach that currently has coordinates (skipping the handful
still waiting on their first scrape, and the handful Cruz Roja itself
has no map data for at all).

Cruz Roja's site is old-style HTML, not an API, so the code just looks
for known text patterns in the page rather than using a full HTML parser.

## Project layout

```
public/
  index.html              page shell — Leaflet, fonts, the header/legend markup
  app.js                  map setup and marker rendering
  style.css               all styling
  beaches-national.json   static id/name manifest worker-scraper/ iterates over

functions/
  api/beaches/index.js    GET /api/beaches — reads the cache worker-scraper/ writes
  api/beaches/[id].js     GET /api/beaches/:id — on-demand live scrape of one beach
  _lib/cruzRoja.js        talks to Cruz Roja's site
  _lib/parseBeach.js      shared low-level HTML field-extraction primitives
  _lib/scrapeBeach.js     the full per-beach field schema, built on parseBeach.js
  _lib/schedule.js        "is it attended hours right now?"

worker-scraper/
  src/index.js            the Cron Trigger that keeps BEACHES_CACHE warm
  wrangler.toml           its own deploy config (separate from the root one)
```

(`functions/_lib/` is shared code, not a URL — Cloudflare Pages skips
routing any file or folder starting with `_`.)

## Running locally

```sh
npm install
npm run dev   # http://localhost:8788
```

This emulates KV locally, so it works without a Cloudflare account —
but a local `/api/beaches` will be empty until you also run
`worker-scraper/` locally (see below) or point at the real cache, since
`wrangler pages dev` can't bind to remote KV.

To run the scraper locally and simulate a tick:

```sh
cd worker-scraper
npm install
npm run dev -- --test-scheduled   # exposes POST /__scheduled
curl -X POST "http://localhost:8787/__scheduled?cron=*/2+*+*+*+*"
```

## Deploying

Two separate deploys — the root Pages project and the standalone Worker:

```sh
npm run deploy                        # root: Pages project
cd worker-scraper && npm run deploy   # the scraper + its Cron Trigger
```

Setting this up again from scratch (new clone, new Cloudflare account)
would look like:

```sh
npx wrangler login
npx wrangler kv namespace create BEACHES_CACHE   # paste the id into both wrangler.toml files
npx wrangler pages project create banderaplaya
npm run deploy
cd worker-scraper && npm run deploy
```

### Custom domain (banderaplaya.es)

Not attached yet — the domain's nameservers need to point at Cloudflare
first, which happens at the registrar. Once that's done: Cloudflare
dashboard → Pages project → Custom domains → Add, or
`wrangler pages domain add banderaplaya.es`.

## Updating the beach list

`public/beaches-national.json` is the id/name manifest worker-scraper/
iterates over. Only needs regenerating if Cruz Roja adds or removes a
beach nationwide — re-fetch `listaPlayas.do` (no query params returns
the full national list) and decode it as ISO-8859-1, not UTF-8 (the
page declares that charset and mis-decoding mangles accented names).

## Initial and returning map position

On a visitor's first load, the map fits all currently-cached beaches on
screen. After they pan or zoom, that view is saved in their browser's
`localStorage` and restored on later visits. No location or map
preference is sent to the server.

To simulate a first visit while developing, remove the
`banderaplaya:map-view:v1` local-storage entry in the browser's developer
tools.

## Known quirks in Cruz Roja's data

- Their flag-color text is inconsistent (`amarill`/`roja` instead of the
  expected `amarillo`/`rojo`), so the parsing matches by prefix.
- A "Bandera Azul" (blue flag) field exists in every page's raw HTML but
  is always HTML-commented-out — dead markup, not real data.
- 6/192 beaches have no coordinates at all (not just null — the whole
  map `<script>` block is absent), clustered around Santa Eulalia del
  Río plus two outliers.
- Beaches with a "campaign" section (e.g. assisted bathing) have a
  second, differently-formatted `Desde`/`Hasta` date pair that can be
  mistaken for the main season dates if you search for the label
  globally instead of within the right block.
- Outside attended hours their flag is genuinely blank ("no info") —
  confirmed by hand, which is why the scraper predicts that from the
  clock instead of asking.

## Source

Cruz Roja España's public beach-status tool, nationwide:
[cruzroja.es — listaPlayas.do](https://www.cruzroja.es/appjv/consPlayas/listaPlayas.do).
Same link is in the app's legend.
