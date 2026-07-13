# banderaplaya

A one-page map of Santander's beaches showing today's Cruz Roja flag —
green, yellow, or red — live.

Live at [banderaplaya.pages.dev](https://banderaplaya.pages.dev).
`banderaplaya.es` is the intended domain but isn't attached yet (see
"Custom domain" below).

## What it does, simply

Cruz Roja (the Spanish Red Cross) staffs Santander's 13 beaches and
publishes a flag for each one on their own website. This project:

1. Shows all 13 beaches on a map.
2. Asks Cruz Roja's site what each flag says right now, and colors each
   marker to match.
3. Outside the hours beaches are staffed (roughly 10:00–20:30), there's no
   real flag to report — so instead of showing "no data", it shows
   whichever flag was last seen before closing, frozen in place.
4. It's polite about asking: it only checks Cruz Roja's site once every
   5 minutes at most, no matter how many people are looking at the map,
   and it doesn't ask at all outside staffed hours.

There's no database — just a small cache that remembers the last answer
for a few minutes.

## How it works, in more detail

Two kinds of data, handled differently:

- **Where the beaches are** (`public/beaches.json`) — name and coordinates
  for all 13 beaches. This doesn't change day to day, so it was scraped
  once and is just a committed file, not fetched live.
- **What the flag says right now** — genuinely changes through the day,
  so this part talks to Cruz Roja's site live, through
  `functions/api/flags.js` (a small Cloudflare Pages Function). Cruz
  Roja's site doesn't allow direct browser requests from other sites, so
  this function exists to fetch it on the browser's behalf.

That function follows two rules so it never hammers Cruz Roja's server:

1. **Outside attended hours, skip Cruz Roja entirely.**
   `functions/_lib/schedule.js` figures this out from the clock alone
   (Europe/Madrid time, no network call needed). Instead of "no data",
   it replies with whatever the flags said last, saved in a
   never-expiring cache entry (`flags:last-known`) that gets updated
   every time a real flag is fetched.
2. **During attended hours, remember the answer for 5 minutes.** The
   first visitor after those 5 minutes triggers a real fetch from Cruz
   Roja and refills the cache; everyone else in that window gets the
   cached answer instantly. Nothing runs on a timer — if nobody visits,
   nothing gets fetched.

On page load: the map draws all 13 markers immediately (gray, from the
static beach list), then asks `/api/flags` for the real colors and updates
each marker once that answers.

Cruz Roja's site is old-style HTML, not an API, so the code just looks
for known text patterns in the page rather than using a full HTML parser.

## Project layout

```
public/
  index.html         page shell — Leaflet, fonts, the header/legend markup
  app.js              map setup and marker rendering
  style.css           all styling
  beaches.json         static beach list, see "Updating the beach list"

functions/
  api/flags.js         the one backend endpoint, GET /api/flags
  _lib/cruzRoja.js      talks to Cruz Roja's site
  _lib/parseBeach.js    reads flag color + details out of their HTML
  _lib/schedule.js       "is it attended hours right now?"

scripts/
  scrape-beaches.js    run manually to (re)build public/beaches.json
```

(`functions/_lib/` is shared code, not a URL — Cloudflare Pages skips
routing any file or folder starting with `_`.)

## Running locally

```sh
npm install
npm run dev   # http://localhost:8788
```

This also works offline-ish: the cache is emulated locally by wrangler,
no Cloudflare account needed just to browse the code.

## Deploying

Already set up for this project (Cloudflare login done, cache namespace
created, its id is in `wrangler.toml`). To ship a change:

```sh
npm run deploy
```

Setting this up again from scratch (new clone, new Cloudflare account)
would look like:

```sh
npx wrangler login
npx wrangler kv namespace create FLAG_CACHE   # paste the id it prints into wrangler.toml
npx wrangler pages project create banderaplaya
npm run deploy
```

### Custom domain (banderaplaya.es)

Not attached yet — the domain's nameservers need to point at Cloudflare
first, which happens at the registrar. Once that's done: Cloudflare
dashboard → Pages project → Custom domains → Add, or
`wrangler pages domain add banderaplaya.es`.

## Updating the beach list

Only needed if Cruz Roja adds, removes, or moves a Santander beach:

```sh
npm run scrape
```

It double-checks every scraped coordinate falls within a Santander
bounding box before writing anything, so a bad scrape fails loudly
instead of silently corrupting the beach list.

## Initial and returning map position

On a visitor's first load, the map automatically fits all Santander beaches
on screen. After they pan or zoom, that view is saved in their browser's
`localStorage` and restored on later visits. No location or map preference is
sent to the server.

To simulate a first visit while developing, remove the
`banderaplaya:map-view:v1` local-storage entry in the browser's developer
tools.

## Known quirks in Cruz Roja's data

- Their flag-color text is inconsistent (`amarill`/`roja` instead of the
  expected `amarillo`/`rojo`), so the parsing matches by prefix.
- One beach ("Bikinis II", id 1198) has a broken coordinate in Cruz
  Roja's own page. There's a documented manual fix for it in
  `scrape-beaches.js`.
- Outside attended hours their flag is genuinely blank ("no info") —
  confirmed by hand, which is why this project predicts that from the
  clock instead of asking.

## Source

Cruz Roja España's public beach-status tool, filtered to Santander:
[cruzroja.es — listaPlayas.do](https://www.cruzroja.es/appjv/consPlayas/listaPlayas.do?autonomia=Cantabria&autonomia_id=6&provincia=CANTABRIA&provincia_id=39&municipio=SANTANDER&municipio_id=75&playa=&action=noadaptadas).
Same link is in the app's legend.

## Scope

Santander only, 13 beaches. Covering other towns would mean storing each
beach's own municipio/provincia/autonomia in `beaches.json` and using
that instead of the Santander constants currently hardcoded in
`functions/_lib/cruzRoja.js`.
