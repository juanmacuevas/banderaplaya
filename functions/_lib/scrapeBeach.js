// Full-field extractor for Cruz Roja's fichaPlaya.do HTML — the complete
// schema (24 fields + 2 optional sub-sections). Builds on the low-level
// primitives in parseBeach.js.
//
// Schema derived by diffing 192/192 nationwide beach pages (see
// scratchpad research): 2 independent optional sections (campaign, ~9/192;
// observaciones, ~39/192) layered on an otherwise constant field set.
// A commented-out "Bandera Azul" block exists in every page's raw HTML but
// never renders — deliberately not extracted.

import { labelWindow, extractField, extractStatus, toBool } from "./parseBeach.js";

const STATUS_LABELS = {
  verde: "Verde",
  amarilla: "Amarilla",
  roja: "Roja",
  unknown: "Sin datos",
};

function extractName(html) {
  const matches = [...html.matchAll(/capaFichaNombrePlaya"[^>]*>([^<]*)<\/div>/g)];
  // First match is always the literal label "Playa:"; second is the real name.
  return (matches[1]?.[1] ?? "").trim();
}

function extractInt(html, label) {
  const value = extractField(html, label);
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// "Cobertura desde:" and its paired "Hasta:" live in the same <ul>. Reading
// both values out of that one window (rather than searching for "Hasta:"
// globally) avoids picking up the campaign section's own "Desde:"/"Hasta:"
// pair on the ~9/192 beaches that have one.
function extractCoberturaDates(html) {
  const window = labelWindow(html, "Cobertura desde");
  if (!window) return { desde: null, hasta: null };
  const values = [...window.matchAll(/class="fichaPlayaValue[^"]*"[^>]*>([^<]*)</g)].map(
    (m) => m[1].trim()
  );
  return { desde: values[0] ?? null, hasta: values[1] ?? null };
}

// Spain's actual coordinate range (mainland + Canary + Balearic islands),
// deliberately tighter than the global -90/90, -180/180 range — every
// beach in this dataset is Spanish, so a value outside this box is corrupt
// even if it's a syntactically valid coordinate somewhere else on Earth.
const SPAIN_LAT = { min: 27, max: 44 };
const SPAIN_LNG = { min: -19, max: 5 };

// Cruz Roja's own page has (at least) two flavors of malformed coordinate:
// extra stray dots (e.g. "4.346.791.917.533.990", parses as NaN) and a
// dropped decimal point (e.g. "-4353973" instead of "-4.353973" — parses
// fine but lands in the Sahara). Both are recoverable from the same
// insight: the digits themselves are intact, only the decimal point's
// position is wrong. Stripping all dots and retrying each possible
// insertion point until one lands inside Spain recovers the original value
// in both cases — losing a beach's map marker entirely is worse than a
// coordinate reconstructed this way.
function recoverCoordinate(raw, { min, max }) {
  const sign = raw.startsWith("-") ? "-" : "";
  const digits = raw.replace(/[-.]/g, "");
  for (let i = 1; i < digits.length; i++) {
    const candidate = Number(`${sign}${digits.slice(0, i)}.${digits.slice(i)}`);
    if (candidate >= min && candidate <= max) return candidate;
  }
  return null;
}

function extractLatLng(html) {
  // Absent entirely (no <script> map block at all) on a small minority of
  // beaches — not just a null/blank value, the block doesn't exist.
  const m = html.match(/new google\.maps\.LatLng\(([\-\d.]+),\s*([\-\d.]+)\)/);
  if (!m) return null;

  const [rawLat, rawLng] = [m[1], m[2]];
  let lat = Number(rawLat);
  let lng = Number(rawLng);

  if (!(lat >= SPAIN_LAT.min && lat <= SPAIN_LAT.max)) {
    lat = recoverCoordinate(rawLat, SPAIN_LAT);
  }
  if (!(lng >= SPAIN_LNG.min && lng <= SPAIN_LNG.max)) {
    lng = recoverCoordinate(rawLng, SPAIN_LNG);
  }

  return lat != null && lng != null ? { lat, lng } : null;
}

function extractPhotoUrl(html) {
  const m = html.match(/https?:\/\/[^"]*obtener_IMAGE\?position=\d+/);
  return m ? m[0] : null;
}

// Bottom-of-page free-text advisory. Lives in a plain <td>, not a
// listaFicha <li>, and is present-but-empty on the majority of beaches.
function extractConsejo(html) {
  const m = html.match(/Consejo:\s*([^<]*)<\/td>/);
  const text = m?.[1]?.trim();
  return text ? text : null;
}

// Separate optional block (~39/192 beaches) — entirely absent (not just
// empty) when there's nothing to say, distinct from "Consejo" above.
function extractObservaciones(html) {
  const m = html.match(/<li class="fichaPlayaObs">([^<]*)<\/li>/);
  const text = m?.[1]?.trim();
  return text ? text : null;
}

// Optional 3rd fieldset (~9/192 beaches), own Desde/Hasta pair using
// DD/MM/YYYY (main season dates above use DD-MM-YYYY).
function extractCampana(html) {
  const legendIdx = html.indexOf("Información de Campañas</legend>");
  if (legendIdx === -1) return null;
  const fieldsetEnd = html.indexOf("</fieldset>", legendIdx);
  const section = html.slice(legendIdx, fieldsetEnd === -1 ? undefined : fieldsetEnd);
  const values = [...section.matchAll(/class="fichaPlayaValue[^"]*"[^>]*>([^<]*)</g)].map(
    (m) => m[1].trim()
  );
  if (values.length < 3) return null;
  const [nombre, desde, hasta] = values;
  return { nombre, desde, hasta };
}

export function scrapeBeach(html) {
  const status = extractStatus(html);
  const { desde: coberturaDesde, hasta: coberturaHasta } = extractCoberturaDates(html);

  return {
    name: extractName(html),
    provincia: extractField(html, "Provincia"),
    municipio: extractField(html, "Ayuntamiento/Municipio"),
    photoUrl: extractPhotoUrl(html),
    location: extractLatLng(html),

    status,
    label: STATUS_LABELS[status],

    coberturaDesde,
    coberturaHasta,
    horario: extractField(html, "Horario"),

    sellosAenor: {
      iso9001: toBool(extractField(html, "Sello AENOR ISO 9001")),
      iso14001: toBool(extractField(html, "Sello AENOR ISO 14001")),
    },
    puestos: extractInt(html, "Número de Puestos"),
    sillasProximidad: extractInt(html, "Sillas de Proximidad"),
    torresVigilancia: extractInt(html, "Torres de Vigilancia"),
    torresIntervencion: extractInt(html, "Torres de Intervención"),
    medusas: toBool(extractField(html, "Medusas")),
    servicioAyudaBano: toBool(extractField(html, "Servicio Ayuda Baño")),
    atencion: extractField(html, "Atención"),
    consejo: extractConsejo(html),
    observaciones: extractObservaciones(html),

    accesibilidad: {
      atencionDiscapacitados: toBool(extractField(html, "Atención a discapacitados")),
      accesoDiscapacitados: toBool(extractField(html, "Acceso para discapacitados")),
      rampas: toBool(extractField(html, "Rampas")),
      serviciosWC: toBool(extractField(html, "Servicios WC")),
      duchas: toBool(extractField(html, "Duchas")),
      vestuarios: toBool(extractField(html, "Vestuarios")),
      parking: toBool(extractField(html, "Parking")),
      zonasSombra: toBool(extractField(html, "Zonas de sombra")),
      sillasAdaptadas: extractInt(html, "Nº de sillas adaptadas"),
      pasarelas: toBool(extractField(html, "Pasarelas")),
      atencionCRE: toBool(extractField(html, "Atención CRE")),
      atencionFamiliar: toBool(extractField(html, "Atención familiar")),
    },

    campana: extractCampana(html),
  };
}
