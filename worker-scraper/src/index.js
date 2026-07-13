// Standalone Worker (Pages Functions can't hold Cron Triggers) that keeps
// a nationwide beach cache warm for functions/api/beaches/ to read.
//
// Runs every 2 minutes, gated to isNationalAttendedHours() — outside that
// window there's nothing new to learn, so most ticks are a single cheap KV
// read and a no-op. Each active tick scrapes a rotating slice of beaches
// (cursor persisted in the same cache blob) and does exactly ONE KV write
// per invocation — free-tier KV write quota (1000/day, account-wide) is the
// binding constraint here, not CPU or subrequest limits, so batch size
// drives freshness while tick frequency drives write cost.

import { fetchBeachHtml } from "../../functions/_lib/cruzRoja.js";
import { scrapeBeach } from "../../functions/_lib/scrapeBeach.js";
import { isNationalAttendedHours } from "../../functions/_lib/schedule.js";
import manifest from "../../public/beaches-national.json";

const CACHE_KEY = "national:cache";
const BATCH_SIZE = 16; // 192/16 = 12 ticks/cycle * 2min = ~24min full refresh
const FETCH_STAGGER_MS = 800;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function scrapeSlice(ids) {
  const updates = {};
  for (const [i, id] of ids.entries()) {
    if (i > 0) await sleep(FETCH_STAGGER_MS);
    try {
      const html = await fetchBeachHtml(id);
      const beach = scrapeBeach(html);
      // Cruz Roja returns HTTP 200 with an empty name for unknown/broken
      // ids rather than an error — skip rather than cache garbage.
      if (beach.name) {
        updates[id] = { id, ...beach, updatedAt: Date.now() };
      }
    } catch (err) {
      // Leave whatever's already cached for this id alone; the rotation
      // will retry it next cycle.
    }
  }
  return updates;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

// api.banderaplaya.es — mirrors functions/api/beaches/ from the Pages
// project, so the custom domain attached to this Worker actually serves
// something. GET /beaches reads the same cache the scheduled handler
// above writes; GET /beaches/:id is an on-demand live scrape, uncached.
async function handleFetch(request, env) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);

  if (parts[0] !== "beaches") {
    return json({ error: "not_found" }, 404);
  }

  if (parts.length === 1) {
    const cached = await env.BEACHES_CACHE.get(CACHE_KEY, "json");
    const scraped = cached?.beaches ?? {};
    const beaches = manifest.map(({ id, name }) => scraped[id] ?? { id, name, status: "pending" });
    return json({
      beaches,
      scrapedCount: Object.keys(scraped).length,
      total: manifest.length,
      updatedAt: cached?.updatedAt ?? null,
    });
  }

  const id = Number(parts[1]);
  if (!Number.isInteger(id) || id <= 0) {
    return json({ error: "invalid_id" }, 400);
  }
  let html;
  try {
    html = await fetchBeachHtml(id);
  } catch (err) {
    return json({ error: "upstream_unreachable" }, 502);
  }
  const beach = scrapeBeach(html);
  if (!beach.name) {
    return json({ error: "not_found" }, 404);
  }
  return json({ id, ...beach });
}

export default {
  async fetch(request, env) {
    return handleFetch(request, env);
  },

  async scheduled(event, env, ctx) {
    if (!isNationalAttendedHours()) return;

    const cached = await env.BEACHES_CACHE.get(CACHE_KEY, "json");
    const state = cached ?? { cursor: 0, beaches: {} };

    const ids = manifest.map((b) => b.id);
    const slice = Array.from(
      { length: Math.min(BATCH_SIZE, ids.length) },
      (_, i) => ids[(state.cursor + i) % ids.length]
    );

    const updates = await scrapeSlice(slice);
    Object.assign(state.beaches, updates);
    state.cursor = (state.cursor + slice.length) % ids.length;
    state.updatedAt = Date.now();

    await env.BEACHES_CACHE.put(CACHE_KEY, JSON.stringify(state));
  },
};
