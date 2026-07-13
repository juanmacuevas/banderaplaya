// Cloudflare Pages Function: GET /api/beaches
//
// Serves the nationwide cache that worker-scraper/ fills in the background
// (see that project for the write side). This endpoint never calls Cruz
// Roja itself — it only reads BEACHES_CACHE, so it stays instant regardless
// of how many people hit it.

import manifest from "../../../public/beaches-national.json";

const CACHE_KEY = "national:cache";

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

export async function onRequestGet(context) {
  const cache = context.env.BEACHES_CACHE;
  const cached = cache && (await cache.get(CACHE_KEY, "json"));
  const scraped = cached?.beaches ?? {};

  const beaches = manifest.map(({ id, name }) => {
    const beach = scraped[id];
    return beach ?? { id, name, status: "pending" };
  });

  return json({
    beaches,
    scrapedCount: Object.keys(scraped).length,
    total: manifest.length,
    updatedAt: cached?.updatedAt ?? null,
  });
}
