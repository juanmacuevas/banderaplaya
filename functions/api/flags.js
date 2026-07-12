// Cloudflare Pages Function: GET /api/flags
//
// Two ways this avoids hammering Cruz Roja's server:
//  1. Outside attended hours the flag is never meaningful (verified: Cruz
//     Roja returns "no info" for every beach then) — skip calling their
//     server at all. Instead of showing "no data", freeze on whatever the
//     flags last said before closing (LAST_KNOWN_KEY, no expiry) — falling
//     back to a genuine "no data" only if nothing has ever been fetched.
//  2. During attended hours, results are cached in KV for CACHE_TTL_SECONDS.
//     The cache is filled lazily by whichever request happens to miss it —
//     no cron/scheduled job, so nothing calls Cruz Roja if nobody visits.

import beaches from "../../public/beaches.json";
import { fetchBeachHtml } from "../_lib/cruzRoja.js";
import { parseBeachDetail } from "../_lib/parseBeach.js";
import { isAttendedHours } from "../_lib/schedule.js";

const CACHE_KEY = "flags:cache";
const CACHE_TTL_SECONDS = 300; // 5 minutes
const LAST_KNOWN_KEY = "flags:last-known";
const LAST_KNOWN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days — hygiene ceiling, not a real limit

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

function neverFetchedResponse() {
  return beaches.map((beach) => ({
    ...beach,
    status: "unknown",
    label: "Fuera de horario",
  }));
}

function freeze(results) {
  return results.map((beach) => ({ ...beach, frozen: true }));
}

async function fetchAllLive() {
  return Promise.all(
    beaches.map(async (beach) => {
      try {
        const html = await fetchBeachHtml(beach.id);
        return { ...beach, ...parseBeachDetail(html) };
      } catch (err) {
        return {
          ...beach,
          status: "unknown",
          label: "Sin datos",
          error: "upstream_unreachable",
        };
      }
    })
  );
}

export async function onRequestGet(context) {
  const cache = context.env.FLAG_CACHE;

  if (!isAttendedHours()) {
    const lastKnown = cache && (await cache.get(LAST_KNOWN_KEY, "json"));
    return json(lastKnown ? freeze(lastKnown) : neverFetchedResponse());
  }

  const cached = cache && (await cache.get(CACHE_KEY, "json"));
  if (cached) {
    return json(cached);
  }

  const results = await fetchAllLive();

  // Respond immediately; let the cache writes finish in the background so
  // the request that fills the cache isn't slowed down by them.
  if (cache) {
    context.waitUntil(
      Promise.all([
        cache.put(CACHE_KEY, JSON.stringify(results), {
          expirationTtl: CACHE_TTL_SECONDS,
        }),
        cache.put(LAST_KNOWN_KEY, JSON.stringify(results), {
          expirationTtl: LAST_KNOWN_TTL_SECONDS,
        }),
      ])
    );
  }

  return json(results);
}
