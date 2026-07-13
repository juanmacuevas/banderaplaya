const MAP_VIEW_STORAGE_KEY = "banderaplaya:map-view:v1";

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

function addDetail(list, label, value) {
  if (value == null || value === "") return;

  const row = document.createElement("div");
  row.className = "popup-detail";
  const term = document.createElement("dt");
  const description = document.createElement("dd");
  term.textContent = label;
  description.textContent = value;
  row.append(term, description);
  list.append(row);
}

function popupContent(beach) {
  const content = document.createElement("article");
  content.className = "beach-popup";

  const title = document.createElement("h2");
  title.textContent = beach.name;

  const status = beach.status || "unknown";
  const badge = document.createElement("p");
  badge.className = `status-badge status-${status}`;
  badge.textContent = beach.label ?? "Cargando…";
  badge.setAttribute("aria-label", `Bandera: ${badge.textContent}`);

  content.append(title, badge);

  if (beach.frozen) {
    const notice = document.createElement("p");
    notice.className = "popup-notice";
    notice.textContent = "Fuera de horario · última bandera conocida";
    content.append(notice);
  }

  const details = document.createElement("dl");
  details.className = "popup-details";
  addDetail(details, "Medusas", yesNo(beach.medusas));
  addDetail(details, "Horario", beach.horario);
  addDetail(details, "Ayuda al baño", yesNo(beach.servicioAyudaBano));
  addDetail(details, "Atención", beach.atencion);
  addDetail(details, "Torres", beach.torresVigilancia);
  if (details.children.length) content.append(details);

  if (beach.observaciones) {
    const observations = document.createElement("p");
    observations.className = "popup-observations";
    observations.textContent = beach.observaciones;
    content.append(observations);
  }

  const directions = document.createElement("a");
  directions.className = "directions-link";
  directions.href = `https://www.google.com/maps/dir/?api=1&destination=${beach.lat},${beach.lng}`;
  directions.target = "_blank";
  directions.rel = "noopener";
  directions.textContent = "Cómo llegar ↗";
  content.append(directions);

  return content;
}

function loadSavedMapView() {
  try {
    const view = JSON.parse(localStorage.getItem(MAP_VIEW_STORAGE_KEY));
    const valid =
      Number.isFinite(view?.lat) &&
      Number.isFinite(view?.lng) &&
      Number.isFinite(view?.zoom) &&
      view.lat >= -90 &&
      view.lat <= 90 &&
      view.lng >= -180 &&
      view.lng <= 180;
    return valid ? view : null;
  } catch {
    return null;
  }
}

function saveMapView(map) {
  try {
    const center = map.getCenter();
    localStorage.setItem(
      MAP_VIEW_STORAGE_KEY,
      JSON.stringify({ lat: center.lat, lng: center.lng, zoom: map.getZoom() })
    );
  } catch {
    // The map remains fully usable when browser storage is unavailable.
  }
}

function updateMarker(marker, beach) {
  const label = `${beach.name} — bandera ${beach.label ?? "cargando"}`;
  marker.setIcon(flagIcon(STATUS_COLORS[beach.status] || STATUS_COLORS.unknown));
  marker.setPopupContent(popupContent(beach));
  marker.options.title = label;
  marker.options.alt = label;

  const element = marker.getElement();
  if (element) {
    element.setAttribute("aria-label", label);
    element.setAttribute("title", label);
  }
}

function setupLegend() {
  const toggle = document.querySelector(".legend-toggle");
  if (!toggle) return;

  toggle.addEventListener("click", () => {
    toggle.setAttribute("aria-expanded", String(toggle.getAttribute("aria-expanded") !== "true"));
  });
}

async function main() {
  setupLegend();
  const map = L.map("map");

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  const beaches = await fetch("beaches.json").then((r) => r.json());

  const savedView = loadSavedMapView();
  if (savedView) {
    map.setView([savedView.lat, savedView.lng], savedView.zoom);
  } else {
    map.fitBounds(
      L.latLngBounds(beaches.map((beach) => [beach.lat, beach.lng])),
      { padding: [32, 32], maxZoom: 14 }
    );
  }
  map.on("moveend", () => saveMapView(map));

  const markers = new Map();
  for (const beach of beaches) {
    const initialLabel = `${beach.name} — bandera cargando`;
    const marker = L.marker([beach.lat, beach.lng], {
      icon: flagIcon(STATUS_COLORS.unknown),
      title: initialLabel,
      alt: initialLabel,
      keyboard: true,
    })
      .addTo(map)
      .bindPopup(popupContent(beach));
    marker.getElement()?.setAttribute("aria-label", initialLabel);
    markers.set(beach.id, marker);
  }

  const flags = await fetch("/api/flags")
    .then((r) => r.json())
    .catch(() => []);

  for (const data of flags) {
    const marker = markers.get(data.id);
    if (!marker) continue;
    updateMarker(marker, data);
  }
}

main();
