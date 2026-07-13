const MAP_VIEW_STORAGE_KEY = "banderaplaya:map-view:v1";

const STATUS_COLORS = {
  verde: "#2ecc71",
  amarilla: "#f1c40f",
  roja: "#e74c3c",
  unknown: "#95a5a6",
};

// Wavy flag on a pole, 2:3 flag ratio (height:width), as inline SVG so it
// scales cleanly and needs no external icon assets. A jellyfish badge is
// overlaid (not swapped in for the flag) so flag color stays scannable
// across the whole map even on beaches with jellyfish present.
function flagIcon(color, hasJellyfish) {
  const svg = `
    <svg width="34" height="34" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      <line x1="6" y1="4" x2="6" y2="34" stroke="#555" stroke-width="2" stroke-linecap="round" />
      <circle cx="6" cy="4" r="2" fill="#555" />
      <path d="M6,6 H30 C34,9 26,11 30,14 C34,17 26,19 30,22 H6 Z"
            fill="${color}" stroke="#333" stroke-width="1" stroke-linejoin="round" />
    </svg>`;
  const jellyfishBadge = hasJellyfish
    ? `<span class="jellyfish-badge" aria-hidden="true">🪼</span>`
    : "";
  return L.divIcon({
    html: `<div class="flag-icon-wrap">${svg}${jellyfishBadge}</div>`,
    className: "flag-icon",
    iconSize: [34, 34],
    iconAnchor: [5, 29],
  });
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

// Only badges the beach actually has go in — nothing shown when a field is
// false/null/missing, so the panel stays short for the common case.
function addBadge(row, emoji, label, show) {
  if (!show) return;
  const badge = document.createElement("span");
  badge.className = "popup-badge";
  badge.textContent = `${emoji} ${label}`;
  row.append(badge);
}

function popupContent(beach) {
  const content = document.createElement("article");
  content.className = "beach-popup";

  const title = document.createElement("h2");
  title.textContent = beach.name;
  content.append(title);

  if (beach.municipio || beach.provincia) {
    const subtitle = document.createElement("p");
    subtitle.className = "popup-subtitle";
    subtitle.textContent = [beach.municipio, beach.provincia].filter(Boolean).join(", ");
    content.append(subtitle);
  }

  const status = beach.status || "unknown";
  const badge = document.createElement("p");
  badge.className = `status-badge status-${status}`;
  badge.textContent = beach.label ?? "Cargando…";
  badge.setAttribute("aria-label", `Bandera: ${badge.textContent}`);
  content.append(badge);

  const details = document.createElement("dl");
  details.className = "popup-details";
  addDetail(details, "Horario", beach.horario);
  addDetail(
    details,
    "Temporada",
    beach.coberturaDesde && beach.coberturaHasta
      ? `${beach.coberturaDesde} – ${beach.coberturaHasta}`
      : null
  );
  if (details.children.length) content.append(details);

  const badges = document.createElement("div");
  badges.className = "popup-badges";
  addBadge(badges, "🪼", "Medusas", beach.medusas === true);
  addBadge(badges, "♿", "Acceso adaptado", beach.accesibilidad?.accesoDiscapacitados === true);
  addBadge(badges, "🏊", "Ayuda al baño", beach.servicioAyudaBano === true);
  if (badges.children.length) content.append(badges);

  if (beach.consejo) {
    const notice = document.createElement("p");
    notice.className = "popup-notice";
    notice.textContent = beach.consejo;
    content.append(notice);
  }

  if (beach.observaciones) {
    const observations = document.createElement("p");
    observations.className = "popup-observations";
    observations.textContent = beach.observaciones;
    content.append(observations);
  }

  if (beach.campana) {
    const campaign = document.createElement("p");
    campaign.className = "popup-campaign";
    campaign.textContent = `${beach.campana.nombre}: ${beach.campana.desde} – ${beach.campana.hasta}`;
    content.append(campaign);
  }

  const directions = document.createElement("a");
  directions.className = "directions-link";
  directions.href = `https://www.google.com/maps/dir/?api=1&destination=${beach.location.lat},${beach.location.lng}`;
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

// Fixed-position panel (bottom sheet on mobile, floating card on desktop —
// see style.css) instead of Leaflet's built-in popup, which anchors to the
// marker's screen point and auto-pans the map to fit — exactly the jump
// this avoids.
function setupPanel() {
  const panel = document.getElementById("beach-panel");
  const backdrop = document.getElementById("beach-panel-backdrop");
  const content = document.getElementById("beach-panel-content");
  const closeBtn = panel.querySelector(".beach-panel-close");

  function close() {
    panel.classList.remove("open");
    backdrop.hidden = true;
    setTimeout(() => {
      if (!panel.classList.contains("open")) panel.hidden = true;
    }, 250);
  }

  function open(beach) {
    content.replaceChildren(popupContent(beach));
    panel.hidden = false;
    backdrop.hidden = false;
    requestAnimationFrame(() => panel.classList.add("open"));
  }

  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  return { open, close };
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
  const panel = setupPanel();
  const map = L.map("map");
  map.on("movestart", panel.close);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  // Kicked off from an inline <script> at the top of <head>, in parallel
  // with fonts/CSS/Leaflet, rather than starting fresh once this deferred
  // script finally runs at the end of that chain.
  const { beaches } = await window.__beachesFetch;
  // A beach only has coordinates once worker-scraper has fetched it at
  // least once (or never, for the handful Cruz Roja itself has no map data
  // for) — no marker to place until then. Also guards against known Cruz
  // Roja data bugs (malformed lat/lng that parse to NaN or to a wildly
  // out-of-range number) that can leak into an otherwise-cached beach — a
  // single bad point would otherwise break fitBounds() for the whole map.
  // scrapeBeach.js validates this too; this is defense against stale cache
  // entries from before that validation existed.
  const located = beaches.filter((beach) => {
    const { lat, lng } = beach.location ?? {};
    return Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180;
  });

  const savedView = loadSavedMapView();
  if (savedView) {
    map.setView([savedView.lat, savedView.lng], savedView.zoom);
  } else if (located.length) {
    map.fitBounds(
      L.latLngBounds(located.map((beach) => [beach.location.lat, beach.location.lng])),
      { padding: [32, 32], maxZoom: 14 }
    );
  } else {
    // Cold cache (e.g. right after a deploy, before the first scrape tick).
    map.setView([40.0, -3.7], 6);
  }
  map.on("moveend", () => saveMapView(map));

  for (const beach of located) {
    const label = `${beach.name} — bandera ${beach.label ?? "cargando"}`;
    const marker = L.marker([beach.location.lat, beach.location.lng], {
      icon: flagIcon(STATUS_COLORS[beach.status] || STATUS_COLORS.unknown, beach.medusas === true),
      title: label,
      alt: label,
      keyboard: true,
    })
      .addTo(map)
      .on("click", () => panel.open(beach));
    marker.getElement()?.setAttribute("aria-label", label);
  }
}

main();
