// Shared Cruz Roja upstream client. Files/dirs prefixed with "_" are excluded
// from Cloudflare Pages Functions routing, so this is safe to import without
// becoming its own route.

const DETAIL_URL = "https://www.cruzroja.es/appjv/consPlayas/fichaPlaya.do";

export async function fetchBeachHtml(id) {
  // Verified directly: the server only looks at `id` — the autonomia/
  // provincia/municipio/etc. fields the site's own form also submits are
  // accepted but ignored, so there's no need to track them per beach.
  const body = new URLSearchParams({ id: String(id) });
  const res = await fetch(DETAIL_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    },
    body,
    signal: AbortSignal.timeout(10000),
  });
  return res.text();
}
