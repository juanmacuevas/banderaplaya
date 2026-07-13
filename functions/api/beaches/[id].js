// Cloudflare Pages Function: GET /api/beaches/:id
//
// On-demand scraper for a single Cruz Roja beach, returning the full field
// set (see scrapeBeach.js). Separate from /api/beaches, which serves the
// worker-scraper/-maintained cache for all 192 beaches — this one fetches
// live every time, uncached, for ad-hoc lookups and study.

import { fetchBeachHtml } from "../../_lib/cruzRoja.js";
import { scrapeBeach } from "../../_lib/scrapeBeach.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

export async function onRequestGet(context) {
  const id = Number(context.params.id);
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
  // Cruz Roja returns HTTP 200 with an empty name field for unknown ids
  // rather than a 404 — verified directly (id=99999999).
  if (!beach.name) {
    return json({ error: "not_found" }, 404);
  }

  return json({ id, ...beach });
}
