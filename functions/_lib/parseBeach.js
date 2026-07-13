// Regex-based extraction from Cruz Roja's fichaPlaya.do HTML. The markup is
// old, fixed-layout, non-templated HTML, so plain regex is simpler and more
// robust here than pulling in a DOM parser for a Workers runtime.

const STATUS_LABELS = {
  verde: "Verde",
  amarilla: "Amarilla",
  roja: "Roja",
  unknown: "Sin datos",
};

// Cruz Roja's flag-color image filenames/alt text use inconsistent Spanish
// ("ico_band_amarill.gif" / alt "Amarilla", "ico_band_roja.gif" / alt "Roja"
// rather than the "verde|amarillo|rojo" a naive enum match would expect), so
// this normalizes by prefix instead of exact match.
function normalizeColor(token) {
  const t = token.toLowerCase();
  if (t.startsWith("verd")) return "verde";
  if (t.startsWith("amarill")) return "amarilla";
  if (t.startsWith("roj")) return "roja";
  return "unknown";
}

// Every field on the beach detail page follows the same "<li ...>Label:</li>
// ... more <li>s ... </ul>" shape. This finds the slice of HTML from a
// label to the end of its enclosing <ul>, so a value regex can be run
// inside it without wandering into an unrelated field further down the page.
// Exported: shared with scrapeBeach.js, which needs the same primitives for
// the fuller field set.
export function labelWindow(html, label) {
  const idx = html.indexOf(`>${label}:</li>`);
  if (idx === -1) return null;
  const closeUl = html.indexOf("</ul>", idx);
  return html.slice(idx, closeUl === -1 ? undefined : closeUl);
}

export function extractStatus(html) {
  const window = labelWindow(html, "Bandera");
  const m = window?.match(/ico_band_([a-zA-Z]+)\.gif"\s+alt="([^"]*)"/);
  return m ? normalizeColor(m[1]) : "unknown";
}

// Generic "<li class="fichaPlayaLabel...">Label:</li> ... <li
// class="fichaPlayaValue...">Value</li>" extractor. Only safe for labels
// that occur exactly once in the document — "Hasta:" occurs twice on the
// ~9/192 beaches that also have a campaign section, so that one needs the
// block-scoped handling in scrapeBeach.js's extractCoberturaDates instead.
export function extractField(html, label) {
  const window = labelWindow(html, label);
  const m = window?.match(/class="fichaPlayaValue[^"]*"[^>]*>([^<]*)</);
  return m ? m[1].trim() : null;
}

function extractObservaciones(html) {
  const m = html.match(/<li class="fichaPlayaObs">([^<]*)<\/li>/);
  return m ? m[1].trim() : null;
}

export function toBool(value) {
  if (value === "Sí") return true;
  if (value === "No") return false;
  return null;
}

export function parseBeachDetail(html) {
  const status = extractStatus(html);
  return {
    status,
    label: STATUS_LABELS[status],
    medusas: toBool(extractField(html, "Medusas")),
    horario: extractField(html, "Horario"),
    servicioAyudaBano: toBool(extractField(html, "Servicio Ayuda Baño")),
    atencion: extractField(html, "Atención"),
    torresVigilancia: extractField(html, "Torres de Vigilancia"),
    coberturaDesde: extractField(html, "Cobertura desde"),
    coberturaHasta: extractField(html, "Hasta"),
    observaciones: extractObservaciones(html),
  };
}
