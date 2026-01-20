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
  const used = new Set(keysPreferred);
  for (const [k, v] of Object.entries(props)) {
    if (used.has(k)) continue;
    if (v === undefined || v === null) continue;
    const sv = String(v).trim();
    if (!sv) continue;
    rows.push([k, v]);
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

async function tryLoadLayer(label, url, buildLayerFn) {
  try {
    const data = await loadGeoJSON(url);
    return buildLayerFn(data);
  } catch (e) {
    console.warn(`[${label}] No cargada:`, e);
    return null;
  }
}

function setStatus(msg) {
  if ($status) $status.textContent = msg;
}

// ===== Base maps =====
const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap"
});

const esriSat = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 19, attribution: "Tiles &copy; Esri" }
);

// ===== Map =====
const map = L.map("map", {
  center: [-1.5, -78.5],
  zoom: 7,
  layers: [osm]
});

// Panes con alta prioridad para Cantonal
map.createPane("paneProvincias");
map.getPane("paneProvincias").style.zIndex = 410;

map.createPane("paneDistritos");
map.getPane("paneDistritos").style.zIndex = 415;

map.createPane("paneCantonal");
map.getPane("paneCantonal").style.zIndex = 450; // Z-Index muy alto para que nada lo cubra

// Leyenda
const legend = L.control({ position: "bottomleft" });
legend.onAdd = () => {
  const div = L.DomUtil.create("div", "legend");
  div.innerHTML = `
    <div style="font-weight:700; margin-bottom:6px;">IE Priorizacion</div>
    <div class="row"><span class="dot green"></span><span>SI (Mantenimiento C_I)</span></div>
    <div class="row"><span class="dot red"></span><span>NO (Mantenimiento C_I)</span></div>
  `;
  return div;
};
legend.addTo(map);

// ===== Sidebar controls =====
const ui = {
  baseOSM: document.getElementById("base_osm"),
  baseSAT: document.getElementById("base_sat"),
  lyrProvincias: document.getElementById("lyr_provincias"),
  lyrCantonal: document.getElementById("lyr_cantonal"),
  lyrDistritos: document.getElementById("lyr_distritos"),
  lyrIE: document.getElementById("lyr_ie")
};

function setLayerAvailability(checkboxEl, isAvailable) {
  if (!checkboxEl) return;
  checkboxEl.disabled = !isAvailable;
  if (!isAvailable) checkboxEl.checked = false;
}

function setBaseLayer(name) {
  if (map.hasLayer(osm)) map.removeLayer(osm);
  if (map.hasLayer(esriSat)) map.removeLayer(esriSat);
  if (name === "sat") esriSat.addTo(map);
  else osm.addTo(map);
}

if (ui.baseOSM) ui.baseOSM.addEventListener("change", () => setBaseLayer("osm"));
if (ui.baseSAT) ui.baseSAT.addEventListener("change", () => setBaseLayer("sat"));

// ===== Layers =====
const layers = {
  provincias: null,
  cantonal: null,
  distritos: null,
  ie: null
};

// Modificación importante en el toggle para asegurar la carga y visualización inmediata
function bindToggle(checkboxEl, layerKey) {
  if (!checkboxEl) return;
  checkboxEl.addEventListener("change", async () => {
    if (checkboxEl.checked) {
      if (!layers[layerKey]) {
        if (layerKey === "distritos") await loadDistritosLazy();
        if (layerKey === "cantonal") await loadCantonalLazy();
      } else {
        layers[layerKey].addTo(map);
        if (layers[layerKey].bringToFront) layers[layerKey].bringToFront();
      }
    } else {
      if (layers[layerKey]) map.removeLayer(layers[layerKey]);
    }
  });
}

bindToggle(ui.lyrProvincias, "provincias");
bindToggle(ui.lyrCantonal, "cantonal");
bindToggle(ui.lyrDistritos, "distritos");
bindToggle(ui.lyrIE, "ie");

async function loadCantonalLazy() {
  try {
    setStatus("Cargando Cantonal...");
    const data = await loadGeoJSON("data/Cantonal.geojson");
    layers.cantonal = L.geoJSON(data, {
      pane: "paneCantonal",
      style: () => ({
        weight: 6.0,           // Grosor extremo para asegurar visibilidad
        color: "#ff00ff",      // Magenta neón (contraste máximo sobre cualquier mapa)
        opacity: 1,
        fillColor: "#ff00ff",
        fillOpacity: 0.1,
        lineJoin: "round"
      }),
      onEachFeature: (feature, layer) => {
        layer.bindPopup(popupFromProps(feature.properties, Object.keys(feature.properties).slice(0, 10)));
      }
    });

    setLayerAvailability(ui.lyrCantonal, true);
    layers.cantonal.addTo(map);
    layers.cantonal.bringToFront();
    setStatus("Listo.");
  } catch (e) {
    console.error("[Cantonal] Error fatal:", e);
    setStatus("Error al cargar Cantonal.");
  }
}

async function loadDistritosLazy() {
  try {
    setStatus("Cargando Distritos...");
    const data = await loadGeoJSON("data/Distritos_simplified.geojson");
    layers.distritos = L.geoJSON(data, {
      pane: "paneDistritos",
      style: () => ({
        weight: 2,
        color: "#fbbf24",
        fillOpacity: 0.1
      }),
      onEachFeature: (f, l) => l.bindPopup(popupFromProps(f.properties, Object.keys(f.properties).slice(0, 8)))
    });
    setLayerAvailability(ui.lyrDistritos, true);
    layers.distritos.addTo(map);
    setStatus("Listo.");
  } catch (e) { setStatus("Error Distritos."); }
}

(async () => {
  try {
    setStatus("Cargando Capas Iniciales...");

    layers.provincias = await tryLoadLayer(
      "Provincias",
      "data/Provincias_simplified.geojson",
      (provData) => L.geoJSON(provData, {
        pane: "paneProvincias",
        style: () => ({
          weight: 1.5,
          color: "#000000",
          fillColor: "#1d4ed8",
          fillOpacity: 0.05
        })
      })
    );
    if (layers.provincias && ui.lyrProvincias?.checked) layers.provincias.addTo(map);

    layers.ie = await tryLoadLayer(
      "IE Priorizacion",
      "data/IE_Priorizacion_light.geojson",
      (ieData) => L.geoJSON(ieData, {
        pointToLayer: (feature, latlng) => {
          const yn = normYesNo(feature.properties["Mantenimiento C_I"]);
          return L.circleMarker(latlng, {
            radius: 6,
            fillColor: yn === "SI" ? "#22c55e" : "#ef4444",
            fillOpacity: 0.9,
            color: "#fff",
            weight: 1
          });
        }
      })
    );
    if (layers.ie && ui.lyrIE?.checked) layers.ie.addTo(map);

    setLayerAvailability(ui.lyrProvincias, !!layers.provincias);
    setLayerAvailability(ui.lyrIE, !!layers.ie);
    setLayerAvailability(ui.lyrCantonal, true);
    setLayerAvailability(ui.lyrDistritos, true);

    setStatus("Listo.");
  } catch (e) {
    console.error(e);
    setStatus("Error en el inicio.");
  }
})();
