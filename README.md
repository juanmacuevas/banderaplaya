# banderaplaya

A one-page map of Santander's beaches, showing today's Cruz Roja flag status
(green/yellow/red) live. Live at
[banderaplaya.pages.dev](https://banderaplaya.pages.dev); `banderaplaya.es`
pending DNS (see "Custom domain" below).

## How it works

There's no database. Three kinds of data, handled differently because they
change at different rates:

- **Where the beaches are** (`public/beaches.json`) — name + lat/lng for
  Santander's 13 beaches. Never changes day to day, so it's scraped once
  and committed to the repo instead of being fetched on every visit.
- **What the flag says right now** (medusas, horario, etc.) — genuinely
  changes through the day, but only during the hours Cruz Roja actually
  staffs the beaches. Fetched live, but rate-limited (see below).
- **Whether it's worth asking at all** — outside attended hours the flag
  is never meaningful (Cruz Roja reports "no info" for every beach then,
  confirmed by hand), so nothing is fetched — the last known flags are
  shown frozen instead.

Cruz Roja's site sends no CORS headers, so a browser can't call it
directly — requests go through the one backend piece in this project,
`functions/api/flags.js` (a Cloudflare Pages Function). The browser calls
it once; it decides whether to bother Cruz Roja at all, and if so, fetches
all 13 beaches in parallel and returns one merged JSON array.

### Not hammering Cruz Roja's server

Two rules, both in `functions/api/flags.js`, both backed by one KV
namespace (`FLAG_CACHE`):

1. **Outside attended hours (roughly 10:00–20:30, Europe/Madrid, buffered
   around the beaches' actual ~11:30–19:30 schedule) — skip Cruz Roja
   entirely.** `functions/_lib/schedule.js` answers this from the clock
   alone, no network call. Instead of showing "no data", the response is
   whatever the flags last said before closing (`flags:last-known` in KV,
   marked `frozen: true`) — falling back to a genuine
   `"Fuera de horario"` only if nothing has ever been fetched (e.g. right
   after a fresh deploy).
2. **During attended hours, cache live results in KV for 5 minutes**
   (`CACHE_TTL_SECONDS` in `flags.js`, key `flags:cache`). Whichever
   visitor's request happens to miss the cache pays the ~1s Cruz Roja
   round-trip and refills it for everyone else — and also updates
   `flags:last-known` for the next time hours close. Nothing runs on a
   schedule, so if nobody visits, nothing gets fetched.

### Sequence on page load

1. `public/app.js` fetches `beaches.json` (instant, same-origin static
   file) and drops a gray flag marker at each beach's location right away.
2. It fetches `/api/flags` and recolors every marker + fills in the
   popups once that resolves (near-instant on a cache hit, ~1s on a miss).

Cruz Roja's own HTML is old, fixed-layout markup (not a JSON API), so both
the scrape script and the live endpoint just regex out the fields they
need rather than pulling in an HTML parser.

## File map

```
public/
  index.html        page shell, loads Leaflet + fonts from CDN, source link
  app.js             map setup, marker rendering, the 2-request sequence above
  style.css          header/legend/popup styling
  beaches.json        static id/name/lat/lng, see "Updating the beach list"

functions/
  api/flags.js         GET /api/flags — the only backend route
  _lib/cruzRoja.js      shared HTTP client for Cruz Roja's site
  _lib/parseBeach.js    regex extraction from their HTML (flag color, medusas, etc.)
  _lib/schedule.js       attended-hours check (Europe/Madrid, DST-aware)

scripts/
  scrape-beaches.js    run manually to (re)generate public/beaches.json
```

`functions/_lib/` isn't a route — Cloudflare Pages ignores any file or
folder starting with `_`, which is the convention for shared code that
Functions import but shouldn't be reachable as its own URL.

## Running locally

```sh
npm install
npm run dev   # wrangler pages dev public → http://localhost:8788
```

The KV cache works locally too (wrangler emulates it on disk), using the
placeholder id in `wrangler.toml` — no Cloudflare account needed for this.

## Deploying (Cloudflare Pages)

Already set up: logged into Cloudflare, `FLAG_CACHE` KV namespace created
(its real id lives in `wrangler.toml`), Pages project `banderaplaya`
created. To ship a change:

```sh
npm run deploy   # wrangler pages deploy public
```

This deploys the static site and `/api/flags` together. (Redoing this on a
fresh clone/account: `wrangler login`, `wrangler kv namespace create
FLAG_CACHE`, paste the printed id into `wrangler.toml`, `wrangler pages
project create banderaplaya`, then `npm run deploy`.)

### Custom domain (banderaplaya.es)

Not yet attached — `banderaplaya.es`'s nameservers aren't pointed at
Cloudflare yet, which has to happen at the registrar first. Once they are,
attach the domain via the Cloudflare dashboard (Pages project → Custom
domains → Add) or `wrangler pages domain add banderaplaya.es`.

## Updating the beach list

Only needed if Cruz Roja adds/removes/moves a Santander beach:

```sh
npm run scrape   # regenerates public/beaches.json
```

The script warns instead of failing if the beach count changes, and
sanity-checks every scraped coordinate against a Santander bounding box —
if a beach's lat/lng falls outside it, the script throws rather than
silently writing bad data (see "known upstream quirks" below for why that
check exists).

## Repositioning the map

The initial map view is two hardcoded constants at the top of
`public/app.js`:

```js
const MAP_CENTER = [43.47, -3.8];
const MAP_ZOOM = 13;
```

Edit them directly, or tell me new values and I'll drop them in.

## Known upstream quirks

Cruz Roja's own site has some rough edges, worth knowing before touching
the parsing code:

- **Flag color tokens are inconsistent Spanish.** Filenames/alt text use
  `amarill`/`roja` rather than the `amarillo`/`rojo` you'd expect, so
  `parseBeach.js` normalizes by prefix match, not exact match.
- **Beach id 1198 ("Bikinis II") has a malformed coordinate** in Cruz
  Roja's own HTML (extra stray dots in the latitude). `scrape-beaches.js`
  has a documented manual override for it.
- **Outside attended hours, the flag is "blanca"** (no data) for every
  beach — confirmed by hand. `functions/_lib/schedule.js` predicts this
  from the clock instead of asking Cruz Roja to find out, and the app
  shows the frozen last-known flag instead of that "no data" state.

## Source

Data comes from Cruz Roja Española's public beach-status tool, filtered to
Santander:
[listaPlayas.do?...municipio=SANTANDER...](https://www.cruzroja.es/appjv/consPlayas/listaPlayas.do?autonomia=Cantabria&autonomia_id=6&provincia=CANTABRIA&provincia_id=39&municipio=SANTANDER&municipio_id=75&playa=&action=noadaptadas).
The same link is in the app's legend.

## Scope

Santander only (13 beaches). Expanding to other municipios means storing a
`municipio`/`provincia`/`autonomia` per beach in `beaches.json` and passing
it through in `functions/_lib/cruzRoja.js` instead of the current
hardcoded Santander constants.
