// Hand-tuned map position — edit these two values to reposition/rezoom.
const MAP_CENTER = [43.47, -3.8];
const MAP_ZOOM = 13;

const STATUS_COLORS = {
  verde: "#2ecc71",
  amarilla: "#f1c40f",
  roja: "#e74c3c",
  unknown: "#95a5a6",
};

// Wavy flag on a pole, 2:3 flag ratio (height:width), as inline SVG so it
// scales cleanly and needs no external icon assets.
function flagIcon(color) {
  const svg = `
    <svg width="34" height="34" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      <line x1="6" y1="4" x2="6" y2="34" stroke="#555" stroke-width="2" stroke-linecap="round" />
      <circle cx="6" cy="4" r="2" fill="#555" />
      <path d="M6,6 H30 C34,9 26,11 30,14 C34,17 26,19 30,22 H6 Z"
            fill="${color}" stroke="#333" stroke-width="1" stroke-linejoin="round" />
    </svg>`;
  return L.divIcon({
    html: svg,
    className: "flag-icon",
    iconSize: [34, 34],
    iconAnchor: [5, 29],
    popupAnchor: [8, -24],
  });
}

function yesNo(value) {
  if (value === true) return "Sí";
  if (value === false) return "No";
  return null;
}

function popupText(beach) {
  const lines = [`<strong>${beach.name}</strong>`];
  lines.push(`Bandera: ${beach.label ?? "Cargando…"}`);

  if (beach.frozen) {
    lines.push(`<em>Fuera de horario — última bandera conocida</em>`);
  }

  const medusas = yesNo(beach.medusas);
  if (medusas) lines.push(`Medusas: ${medusas}`);

  if (beach.horario) lines.push(`Horario: ${beach.horario}`);

  const ayuda = yesNo(beach.servicioAyudaBano);
  if (ayuda) lines.push(`Ayuda al baño: ${ayuda}`);

  if (beach.observaciones) lines.push(`Obs: ${beach.observaciones}`);

  return lines.join("<br>");
}

async function main() {
  const map = L.map("map").setView(MAP_CENTER, MAP_ZOOM);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  const beaches = await fetch("beaches.json").then((r) => r.json());

  const markers = new Map();
  for (const beach of beaches) {
    const marker = L.marker([beach.lat, beach.lng], {
      icon: flagIcon(STATUS_COLORS.unknown),
    })
      .addTo(map)
      .bindPopup(popupText(beach));
    markers.set(beach.id, marker);
  }

  const flags = await fetch("/api/flags")
    .then((r) => r.json())
    .catch(() => []);

  for (const data of flags) {
    const marker = markers.get(data.id);
    if (!marker) continue;
    marker.setIcon(flagIcon(STATUS_COLORS[data.status] || STATUS_COLORS.unknown));
    marker.setPopupContent(popupText(data));
  }
}

main();
