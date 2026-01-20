// ===== Helpers =====
const $status = document.getElementById("status");

function normYesNo(v) {
  if (v === null || v === undefined) return "";
  const s = String(v).trim().toLowerCase();
  if (s === "si" || s === "sí" || s === "s" || s === "yes" || s === "y") return "SI";
  if (s === "no" || s === "n") return "NO";
  return String(v).trim();
}

function popupFromProps(props, keysPreferred) {
  const rows = [];
  for (const k of keysPreferred) {
    if (props[k] !== undefined && props[k] !== null && String(props[k]).trim() !== "") {
      rows.push([k, props[k]]);
    }
  }
  const htmlRows = rows.map(([k, v]) =>
    `<tr><td class="k">${k}</td><td>${String(v)}</td></tr>`
  ).join("");
  return `<table class="popup-table">${htmlRows}</table>`;
}

async function loadGeoJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`No se pudo cargar: ${url}`);
  return r.json();
}

function setStatus(msg) {
  if ($status) $status.textContent = msg;
}

// ===== Map & Base Layers =====
const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 });
const esriSat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19 });

const map = L.map("map", {
  center: [-1.5, -78.5],
  zoom: 7,
  layers: [osm]
});

// Panes para control estricto de visualización
map.createPane("paneProvincias").style.zIndex = 410;
map.createPane("paneDistritos").style.zIndex = 415;
map.createPane("paneCantonal").style.zIndex = 450; // Prioridad máxima para que nada lo cubra

// ===== Layers Store =====
const layers = { provincias: null, cantonal: null, distritos: null, ie: null };

const ui = {
  lyrProvincias: document.getElementById("lyr_provincias"),
  lyrCantonal: document.getElementById("lyr_cantonal"),
  lyrDistritos: document.getElementById("lyr_distritos"),
  lyrIE: document.getElementById("lyr_ie")
};

function setLayerAvailability(el, avail) {
  if (!el) return;
  el.disabled = !avail;
}

// ===== Toggle Logic =====
async function toggleLayer(key, checkbox) {
  if (checkbox.checked) {
    if (!layers[key]) {
      if (key === "cantonal") await loadCantonalLazy();
      if (key === "distritos") await loadDistritosLazy();
    } else {
      layers[key].addTo(map);
    }
    if (layers[key] && layers[key].bringToFront) layers[key].bringToFront();
  } else {
    if (layers[key]) map.removeLayer(layers[key]);
  }
}

// Eventos de los Checkboxes
ui.lyrCantonal.addEventListener("change", (e) => toggleLayer("cantonal", e.target));
ui.lyrDistritos.addEventListener("change", (e) => toggleLayer("distritos", e.target));
ui.lyrProvincias.addEventListener("change", (e) => toggleLayer("provincias", e.target));
ui.lyrIE.addEventListener("change", (e) => toggleLayer("ie", e.target));

// ===== Load Functions =====

// CORRECCIÓN: Se cambió de .geojson a .json para coincidir con tu carpeta data
async function loadCantonalLazy() {
  try {
    setStatus("Cargando Cantonal...");
    const data = await loadGeoJSON("data/Cantonal.json"); 
    layers.cantonal = L.geoJSON(data, {
      pane: "paneCantonal",
      style: () => ({
        weight: 6.0,          // Grosor extremo para máxima visibilidad
        color: "#ff00ff",     // Magenta neón
        opacity: 1,
        fillColor: "#ff00ff",
        fillOpacity: 0.15,
        lineJoin: "round"
      }),
      onEachFeature: (f, l) => l.bindPopup(popupFromProps(f.properties, Object.keys(f.properties).slice(0, 10)))
    }).addTo(map);
    setStatus("Listo.");
  } catch (e) {
    console.error(e);
    setStatus("Error: No se encontró data/Cantonal.json");
  }
}

async function loadDistritosLazy() {
  try {
    setStatus("Cargando Distritos...");
    const data = await loadGeoJSON("data/Distritos_simplified.geojson");
    layers.distritos = L.geoJSON(data, {
      pane: "paneDistritos",
      style: () => ({ weight: 2, color: "#fbbf24", fillOpacity: 0.1 })
    }).addTo(map);
    setStatus("Listo.");
  } catch (e) { setStatus("Error Distritos."); }
}

// Carga inicial de capas fijas
(async () => {
  try {
    setStatus("Iniciando visor...");

    // Provincias
    const provData = await loadGeoJSON("data/Provincias_simplified.geojson");
    layers.provincias = L.geoJSON(provData, {
      pane: "paneProvincias",
      style: () => ({ weight: 1.5, color: "#000", fillOpacity: 0.05 })
    });
    if (ui.lyrProvincias.checked) layers.provincias.addTo(map);

    // Instituciones Educativas
    const ieData = await loadGeoJSON("data/IE_Priorizacion_light.geojson");
    layers.ie = L.geoJSON(ieData, {
      pointToLayer: (f, latlng) => {
        const yn = normYesNo(f.properties["Mantenimiento C_I"]);
        return L.circleMarker(latlng, {
          radius: 6,
          fillColor: yn === "SI" ? "#22c55e" : "#ef4444",
          fillOpacity: 0.9,
          color: "#fff",
          weight: 1
        });
      },
      onEachFeature: (f, l) => l.bindPopup(popupFromProps(f.properties, ["AMIE", "NOM_INSTITUCION_EDUCATIVA"]))
    });
    if (ui.lyrIE.checked) layers.ie.addTo(map);

    setLayerAvailability(ui.lyrProvincias, true);
    setLayerAvailability(ui.lyrIE, true);
    setLayerAvailability(ui.lyrCantonal, true);
    setLayerAvailability(ui.lyrDistritos, true);
    setStatus("Listo.");
  } catch (e) {
    console.error(e);
    setStatus("Error en la carga inicial.");
  }
})();
