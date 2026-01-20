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

// ===== Mapas Base =====
const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap"
});

const esriSat = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 19, attribution: "Tiles &copy; Esri" }
);

// ===== Inicialización del Mapa =====
const map = L.map("map", {
  center: [-1.5, -78.5],
  zoom: 7,
  layers: [osm]
});

// Panes para control estricto de capas
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
    <div style="font-weight:700; margin-bottom:6px;">Capas Administrativas</div>
    <div class="row"><span style="display:inline-block; width:12px; height:12px; border:2px solid #00FF00; background:rgba(0,255,0,0.2);"></span> <span>Cantonal (Línea Gruesa)</span></div>
    <div class="row"><span class="dot green"></span><span>IE Priorizada</span></div>
  `;
  return div;
};
legend.addTo(map);

// ===== Controles UI =====
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

// ===== Lógica de Capas =====
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
      lyr.addTo(map);
      if (lyr.bringToFront) lyr.bringToFront();
    } else {
      map.removeLayer(lyr);
    }
  });
}

bindToggle(ui.lyrProvincias, "provincias");
bindToggle(ui.lyrCantonal, "cantonal");
bindToggle(ui.lyrDistritos, "distritos");
bindToggle(ui.lyrIE, "ie");

async function loadCantonalLazy() {
  if (layers.cantonal) {
    if (ui.lyrCantonal?.checked) {
      layers.cantonal.addTo(map);
      layers.cantonal.bringToFront();
    }
    return;
  }

  try {
    setStatus("Cargando Capa Cantonal...");
    const data = await loadGeoJSON("data/Cantonal.geojson");
    layers.cantonal = L.geoJSON(data, {
      pane: "paneCantonal",
      style: () => ({
        weight: 5.0,           // Grosor máximo para visibilidad extrema
        color: "#00FF00",      // Verde neón
        opacity: 1,            // Opacidad de línea total
        fillColor: "#00FF00",
        fillOpacity: 0.15,     // Relleno ligero para facilitar clics
        lineJoin: "round"
      }),
      onEachFeature: (feature, layer) => {
        layer.bindPopup(popupFromProps(feature.properties, Object.keys(feature.properties).slice(0, 10)));
      }
    });

    setLayerAvailability(ui.lyrCantonal, true);
    if (ui.lyrCantonal?.checked) {
      layers.cantonal.addTo(map);
      layers.cantonal.bringToFront();
    }
    setStatus("Listo.");
  } catch (e) {
    console.error(e);
    setStatus("Error al cargar Cantonal.");
  }
}

async function loadDistritosLazy() {
  if (layers.distritos) {
    if (ui.lyrDistritos?.checked) layers.distritos.addTo(map);
    return;
  }
  try {
    setStatus("Cargando Distritos...");
    const data = await loadGeoJSON("data/Distritos_simplified.geojson");
    layers.distritos = L.geoJSON(data, {
      pane: "paneDistritos",
      style: () => ({ weight: 2, color: "#fbbf24", fillOpacity: 0.1 }),
      onEachFeature: (f, l) => l.bindPopup(popupFromProps(f.properties, Object.keys(f.properties).slice(0, 5)))
    });
    if (ui.lyrDistritos?.checked) layers.distritos.addTo(map);
    setStatus("Listo.");
  } catch (e) { setStatus("Error Distritos."); }
}

// Carga inicial de capas fijas
(async () => {
  try {
    setStatus("Iniciando...");

    layers.provincias = await tryLoadLayer("Provincias", "data/Provincias_simplified.geojson", (data) =>
      L.geoJSON(data, {
        pane: "paneProvincias",
        style: () => ({ weight: 1.5, color: "#000000", fillOpacity: 0.05 })
      })
    );

    layers.ie = await tryLoadLayer("IE", "data/IE_Priorizacion_light.geojson", (data) =>
      L.geoJSON(data, {
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
      })
    );

    if (layers.provincias && ui.lyrProvincias?.checked) layers.provincias.addTo(map);
    if (layers.ie && ui.lyrIE?.checked) layers.ie.addTo(map);

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
