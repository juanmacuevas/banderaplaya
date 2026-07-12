// Shared Cruz Roja upstream client. Files/dirs prefixed with "_" are excluded
// from Cloudflare Pages Functions routing, so this is safe to import without
// becoming its own route.

const DETAIL_URL = "https://www.cruzroja.es/appjv/consPlayas/fichaPlaya.do";

// Hardcoded to Santander for v1. Expanding to other municipios means storing
// these per-beach in beaches.json and passing them through instead.
const DETAIL_FORM = {
  action: "noadaptadas",
  aplicacion: "consultaPlayas",
  autonomia: "Cantabria",
  autonomia_id: "6",
  provincia: "CANTABRIA",
  provincia_id: "39",
  municipio: "SANTANDER",
  municipio_id: "75",
  playa: "",
  playa_id: "",
};

export async function fetchBeachHtml(id) {
  const body = new URLSearchParams({ ...DETAIL_FORM, id: String(id) });
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
