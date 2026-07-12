// One-time (manual re-run as needed) scrape of Santander beach metadata from
// Cruz Roja Española's beach-status site. Coordinates and names don't change,
// so this is run manually and the output is committed as public/beaches.json.
// Live flag color is fetched separately, on every page load, by functions/api/flags.js.

import { fetchBeachHtml } from "../functions/_lib/cruzRoja.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LIST_URL =
  "https://www.cruzroja.es/appjv/consPlayas/listaPlayas.do?autonomia=Cantabria&autonomia_id=6&provincia=CANTABRIA&provincia_id=39&municipio=SANTANDER&municipio_id=75&playa=&action=noadaptadas";

// Santander bounding box, used to sanity-check parsed coordinates.
const BOUNDS = { minLat: 43.3, maxLat: 43.6, minLng: -4.0, maxLng: -3.6 };

// Cruz Roja's own HTML has a malformed LatLng for this beach (extra stray
// dots in the latitude: "4.346.791.917.533.990"). Verified by hand against
// the sibling beach "Bikinis" (43.467471, -3.767763), which sits ~500m away.
const MANUAL_OVERRIDES = {
  1198: { lat: 43.467919, lng: -3.7721 },
};

async function fetchIds() {
  const res = await fetch(LIST_URL);
  const html = await res.text();
  const ids = [...html.matchAll(/irFichaPlaya\((\d+)\);/g)].map((m) =>
    Number(m[1])
  );
  if (ids.length !== 13) {
    console.warn(
      `Expected 13 beach ids, found ${ids.length}. Cruz Roja may have added/removed beaches — double check before committing.`
    );
  }
  return ids;
}

function extractName(html) {
  const matches = [
    ...html.matchAll(/capaFichaNombrePlaya"[^>]*>([^<]*)<\/div>/g),
  ];
  // First match is always the literal label "Playa:"; second is the real name.
  let name = (matches[1]?.[1] ?? "").trim();
  name = name.replace(/\bIi\b/g, "II").replace(/\bIii\b/g, "III");
  return name;
}

function extractLatLng(html) {
  const m = html.match(/new google\.maps\.LatLng\(([\-\d.]+),\s*([\-\d.]+)\)/);
  if (!m) return null;
  return { lat: Number(m[1]), lng: Number(m[2]) };
}

function inBounds({ lat, lng }) {
  return (
    lat >= BOUNDS.minLat &&
    lat <= BOUNDS.maxLat &&
    lng >= BOUNDS.minLng &&
    lng <= BOUNDS.maxLng
  );
}

async function fetchBeach(id) {
  const html = await fetchBeachHtml(id);

  const name = extractName(html);
  let latlng = extractLatLng(html);

  if (MANUAL_OVERRIDES[id]) {
    if (!latlng || !inBounds(latlng)) {
      console.warn(
        `Beach ${id} (${name}): applying documented manual override for known upstream data bug (raw match: ${JSON.stringify(latlng)}).`
      );
    }
    latlng = MANUAL_OVERRIDES[id];
  } else if (!latlng || !inBounds(latlng)) {
    throw new Error(
      `Beach ${id} (${name}): coordinates missing or out of Santander bounding box (${JSON.stringify(latlng)}). This looks like a new upstream data bug — investigate before adding a manual override.`
    );
  }

  return { id, name, lat: latlng.lat, lng: latlng.lng };
}

async function main() {
  const ids = await fetchIds();
  const beaches = [];
  for (const id of ids) {
    const beach = await fetchBeach(id);
    beaches.push(beach);
  }

  console.table(beaches);

  const outPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "public",
    "beaches.json"
  );
  await fs.writeFile(outPath, JSON.stringify(beaches, null, 2) + "\n");
  console.log(`Wrote ${beaches.length} beaches to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
