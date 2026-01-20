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

// Panes para control de superposición
map.createPane("paneProvincias");
map.getPane("paneProvincias").style.zIndex = 410;

map.createPane("paneDistritos");
map.getPane("paneDistritos").style.zIndex = 415;

map.createPane("paneCantonal");
map.getPane("paneCantonal").style.zIndex = 420;

// Leyenda
const legend = L.control({ position: "bottomleft" });
legend.onAdd = () => {
  const div = L.DomUtil.create("div", "legend");
  div.innerHTML = `
    <div style="font-weight:700; margin-bottom:6px;">IE Priorizacion</div>
    <div class="row"><span class="dot green"></span><span>SI (Mantenimiento C_I)</span></div>
    <div class="row"><span class="dot red"></span><span>NO (Mantenimiento C_I)</span></div>
    <div style="color: var(--muted); margin-top:8px;">
      Capas administrativas cargadas bajo demanda.
    </div>
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

// ===== Layers Logic =====
const layers = {
  provincias: null,
  cantonal: null,
  distritos: null,
  ie: null
};

function bindToggle(checkboxEl, layerKey) {
  if (!checkboxEl) return;
  checkboxEl.addEventListener("change", () => {
    const lyr = layers[layerKey];
    if (!lyr) {
      if (checkboxEl.checked) {
        if (layerKey === "distritos") loadDistritosLazy();
        if (layerKey === "cantonal") loadCantonalLazy();
      }
      return;
    }
    if (checkboxEl.checked) {
      map.addLayer(lyr);
    } else {
      map.removeLayer(lyr);
    }
  });
}

bindToggle(ui.lyrProvincias, "provincias");
bindToggle(ui.lyrCantonal, "cantonal");
bindToggle(ui.lyrDistritos, "distritos");
bindToggle(ui.lyrIE, "ie");

async function loadDistritosLazy() {
  if (layers.distritos) {
    if (ui.lyrDistritos?.checked) map.addLayer(layers.distritos);
    return;
  }
  try {
    setStatus("Cargando Distritos...");
    const data = await loadGeoJSON("data/Distritos_simplified.geojson");
    layers.distritos = L.geoJSON(data, {
      pane: "paneDistritos",
      style: () => ({
        weight: 1,
        color: "#fbbf24",
        fillColor: "#fbbf24",
        fillOpacity: 0.1
      }),
      onEachFeature: (feature, layer) => {
        layer.bindPopup(popupFromProps(feature.properties, Object.keys(feature.properties).slice(0, 5)));
      }
    });
    if (ui.lyrDistritos?.checked) map.addLayer(layers.distritos);
    setStatus("Listo.");
  } catch (e) {
    setStatus("Error Distritos.");
  }
}

async function loadCantonalLazy() {
  if (layers.cantonal) {
    if (ui.lyrCantonal?.checked) map.addLayer(layers.cantonal);
    return;
  }
  try {
    setStatus("Cargando Cantonal...");
    const data = await loadGeoJSON("data/Cantonal.geojson");
    layers.cantonal = L.geoJSON(data, {
      pane: "paneCantonal",
      style: () => ({
        weight: 2,           // Aumentado para visibilidad
        color: "#ff4444",    // Color rojo para diferenciarlo de provincias
        dashArray: "3",      // Línea punteada para estilo técnico
        fillColor: "#ff4444",
        fillOpacity: 0.05    // Opacidad mínima para permitir clics
      }),
      onEachFeature: (feature, layer) => {
        const props = feature.properties || {};
        layer.bindPopup(popupFromProps(props, Object.keys(props).slice(0, 10)));
      }
    });
    if (ui.lyrCantonal?.checked) map.addLayer(layers.cantonal);
    setStatus("Listo.");
  } catch (e) {
    console.error("[Cantonal] Error:", e);
    setStatus("Error Cantonal.");
  }
}

// ===== Initial Load =====
(async () => {
  try {
    setStatus("Cargando Provincias...");
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
        }),
        onEachFeature: (feature, layer) => {
          layer.bindPopup(popupFromProps(feature.properties, ["DPA_DESPRO", "NAME_1"]));
        }
      })
    );

    if (layers.provincias && ui.lyrProvincias?.checked) map.addLayer(layers.provincias);

    setStatus("Cargando IE Priorizacion...");
    layers.ie = await tryLoadLayer(
      "IE Priorizacion",
      "data/IE_Priorizacion_light.geojson",
      (ieData) => L.geoJSON(ieData, {
        pointToLayer: (feature, latlng) => {
          const yn = normYesNo(feature.properties["Mantenimiento C_I"]);
          return L.circleMarker(latlng, {
            radius: 6,
            color: "#ffffff",
            weight: 1,
            fillColor: yn === "SI" ? "#22c55e" : "#ef4444",
            fillOpacity: 0.9
          });
        },
        onEachFeature: (feature, layer) => {
          const p = feature.properties;
          layer.bindPopup(popupFromProps({
            "AMIE": p.AMIE,
            "Institución": p.NOM_INSTITUCION_EDUCATIVA,
            "Mantenimiento": normYesNo(p["Mantenimiento C_I"])
          }, ["AMIE", "Institución", "Mantenimiento"]));
        }
      })
    );

    if (layers.ie && ui.lyrIE?.checked) map.addLayer(layers.ie);
    
    setLayerAvailability(ui.lyrProvincias, !!layers.provincias);
    setLayerAvailability(ui.lyrIE, !!layers.ie);
    setLayerAvailability(ui.lyrCantonal, true);
    setLayerAvailability(ui.lyrDistritos, true);

    setStatus("Listo.");
  } catch (e) {
    console.error(e);
    setStatus("Error en carga inicial.");
  }
})();
