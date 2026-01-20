// ===== Helpers =====
const $status = document.getElementById("status");

// ===== Config =====
// Reglas solicitadas
const THRESH_NBI_MIN = 0.50;

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

async function loadText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`No se pudo cargar: ${url}`);
  return r.text();
}

function parseCSV(text) {
  // Parser simple: detecta separador ',' o ';' y respeta comillas básicas.
  const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim() !== "");
  if (!lines.length) return [];
  const sep = (lines[0].includes(";") && !lines[0].includes(",")) ? ";" : ",";
  const headers = lines[0].split(sep).map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(sep);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (parts[idx] !== undefined) ? parts[idx].trim() : "";
    });
    rows.push(obj);
  }
  return rows;
}

function toNum(v) {
  if (v === null || v === undefined) return NaN;
  const s = String(v).trim().replace(/%/g, "").replace(/,/g, ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

function colorPorNBI(nbi) {
  if (!Number.isFinite(nbi)) return "#bdbdbd";
  if (nbi >= 0.8) return "#d7191c";
  if (nbi >= 0.7) return "#7b3294";
  if (nbi >= 0.6) return "#2c7bb6";
  if (nbi >= 0.5) return "#1a9641";
  return "#bdbdbd";
}

function radioPorCasos(casos) {
  if (!Number.isFinite(casos) || casos <= 0) return 4;
  if (casos === 1) return 6;
  if (casos <= 3) return 9;
  if (casos <= 6) return 13;
  return 18;
}


// Convierte TopoJSON -> GeoJSON (FeatureCollection)
function topoToGeoJSON(topo) {
  if (!topo || topo.type !== 'Topology') return topo;
  if (typeof topojson === 'undefined' || !topojson.feature) {
    throw new Error('TopoJSON detectado pero falta topojson-client (topojson.feature).');
  }
  const feats = [];
  const objs = topo.objects || {};
  for (const key of Object.keys(objs)) {
    const fc = topojson.feature(topo, objs[key]);
    if (fc?.type === 'FeatureCollection' && Array.isArray(fc.features)) {
      feats.push(...fc.features);
    } else if (fc?.type === 'Feature') {
      feats.push(fc);
    }
  }
  return { type: 'FeatureCollection', features: feats };
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
    <div style="font-weight:700; margin-bottom:6px;">IE Priorización (Fiscal · Filtrado)</div>

    <div style="font-weight:700; margin:8px 0 6px;">% NBI Cantón (color)</div>
    <div class="row"><span class="swatch" style="background:${colorPorNBI(0.55)}"></span><span>0.50–0.60</span></div>
    <div class="row"><span class="swatch" style="background:${colorPorNBI(0.65)}"></span><span>0.60–0.70</span></div>
    <div class="row"><span class="swatch" style="background:${colorPorNBI(0.75)}"></span><span>0.70–0.80</span></div>
    <div class="row"><span class="swatch" style="background:${colorPorNBI(0.85)}"></span><span>&ge; 0.80</span></div>
    <div class="row"><span class="swatch" style="background:${colorPorNBI(NaN)}"></span><span>Sin dato</span></div>

    <div style="font-weight:700; margin:10px 0 6px;">Total Casos (tamaño punto)</div>
    <div class="row"><span class="bub" style="width:${radioPorCasos(1)*2}px;height:${radioPorCasos(1)*2}px"></span><span>1</span></div>
    <div class="row"><span class="bub" style="width:${radioPorCasos(3)*2}px;height:${radioPorCasos(3)*2}px"></span><span>2–3</span></div>
    <div class="row"><span class="bub" style="width:${radioPorCasos(6)*2}px;height:${radioPorCasos(6)*2}px"></span><span>4–6</span></div>
    <div class="row"><span class="bub" style="width:${radioPorCasos(10)*2}px;height:${radioPorCasos(10)*2}px"></span><span>&gt; 6</span></div>

    <div style="margin-top:10px; font-size:12px; opacity:.9; line-height:1.25;">
      Reglas: excluir <b>Mantenimiento C_I = Sí</b> · solo <b>Fiscal</b> · solo <b>%NBI &gt; ${THRESH_NBI_MIN.toFixed(2)}</b>.
    </div>
  `;
  return div;
};
legend.addTo(map);

// ===== Lookups (CSV) =====
let nbiByCanton = new Map(); // key: DPA_CANTON (string) OR DPA_DESCAN

async function loadNBILookup() {
  // Espera un CSV: DPA_CANTON,% NBI_Cantón (o NBI)
  // Alternativa: DPA_DESCAN,% NBI_Cantón
  try {
    const txt = await loadText("data/NBI_Canton.csv");
    const rows = parseCSV(txt);
    const m = new Map();
    for (const r of rows) {
      const key = (r.DPA_CANTON || r.DPA_DESCAN || r.canton || r.CANTON || "").toString().trim();
      const v = toNum(r["% NBI_Cantón"] ?? r["%NBI"] ?? r["NBI"] ?? r["% NBI_Canton"] ?? r["% NBI_Cantón**"]);
      if (key) m.set(key, v);
    }
    nbiByCanton = m;
    return true;
  } catch (e) {
    console.warn("[NBI] Sin CSV de NBI_Canton.csv (coroplético se verá 'sin dato').", e);
    nbiByCanton = new Map();
    return false;
  }
}

function getNBIForCanton(props) {
  const code = (props?.DPA_CANTON ?? "").toString().trim();
  const name = (props?.DPA_DESCAN ?? "").toString().trim();
  if (code && nbiByCanton.has(code)) return nbiByCanton.get(code);
  if (name && nbiByCanton.has(name)) return nbiByCanton.get(name);
  return NaN;
}

async function loadIEFromCSV() {
  // CSV esperado: lat,lon,AMIE,NOM_INSTITUCION_EDUCATIVA,DPA_CANTON,DPA_DESCAN,DPA_DESPRO,
  // NOM_SOSTENIMIENTO,Mantenimiento C_I,Total Casos,Total estudiantes otras nacionalidades
  try {
    const txt = await loadText("data/IE_Datos.csv");
    const rows = parseCSV(txt);
    const feats = [];
    for (const r of rows) {
      const lat = toNum(r.lat ?? r.Lat ?? r.LAT ?? r.latitude);
      const lon = toNum(r.lon ?? r.Lon ?? r.LON ?? r.longitude ?? r.longitud);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      const props = { ...r };
      // Normaliza algunas claves comunes
      if (props["% NBI_Cantón"] === undefined && props["% NBI_Cantón**"] !== undefined) {
        props["% NBI_Cantón"] = props["% NBI_Cantón**"];
      }
      feats.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties: props
      });
    }
    return { type: "FeatureCollection", features: feats };
  } catch (e) {
    console.warn("[IE CSV] No existe data/IE_Datos.csv. Se usará IE_Priorizacion_light.geojson.", e);
    return null;
  }
}

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


function ensureFeatureCollection(data) {
  // Acepta GeoJSON o TopoJSON (Topology).
  if (!data) return data;
  if (data.type === "FeatureCollection" || data.type === "Feature") return data;
  if (data.type === "Topology") {
    if (typeof topojson === "undefined" || !topojson.feature) {
      throw new Error("TopoJSON detectado pero topojson-client no está cargado.");
    }
    const features = [];
    const objs = data.objects || {};
    for (const k of Object.keys(objs)) {
      const fc = topojson.feature(data, objs[k]);
      if (fc?.type === "FeatureCollection") features.push(...fc.features);
      else if (fc?.type === "Feature") features.push(fc);
    }
    return { type: "FeatureCollection", features };
  }
  // Si viniera otra estructura, intentamos pasarla tal cual.
  return data;
}

async function loadCantonalLazy() {
  try {
    setStatus("Cargando Cantonal...");
    // Carga lookup NBI (si existe) para coroplético
    await loadNBILookup();
    // En el paquete la capa puede venir como Cantonal.json (GeoJSON válido).
    // Para evitar fallos por nombre/extensión, probamos ambas rutas.
    let data;
    try {
      data = await loadGeoJSON("data/Cantonal.geojson");
    } catch (_) {
      data = await loadGeoJSON("data/Cantonal.json");
    }
    data = ensureFeatureCollection(data);
    data = topoToGeoJSON(data);
    layers.cantonal = L.geoJSON(data, {
      pane: "paneCantonal",
      style: (feature) => {
        const nbi = getNBIForCanton(feature.properties);
        return {
          weight: 1.4,
          color: "#0ea5e9",
          opacity: 0.85,
          fillColor: colorPorNBI(nbi),
          fillOpacity: 0.45,
          lineJoin: "round"
        };
      },
      onEachFeature: (feature, layer) => {
        const nbi = getNBIForCanton(feature.properties);
        const props = { ...feature.properties, "% NBI_Cantón": Number.isFinite(nbi) ? nbi.toFixed(3) : "Sin dato" };
        layer.bindPopup(popupFromProps(props, ["DPA_DESCAN", "DPA_DESPRO", "DPA_CANTON", "% NBI_Cantón"]));
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

    // Intenta cargar lookup de NBI (si no existe, no detiene el mapa)
    await loadNBILookup();

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

    // Capa IE: primero intenta CSV completo (recomendado). Si no existe, usa el GeoJSON light.
    const ieFromCsv = await loadIEFromCSV();
    const ieDataFinal = ieFromCsv || await loadGeoJSON("data/IE_Priorizacion_light.geojson");
    layers.ie = L.geoJSON(ieDataFinal, {
      filter: (feature) => {
        const p = feature.properties || {};
        // Regla 1: excluir Mantenimiento C_I = Sí
        const mant = normYesNo(p["Mantenimiento C_I"] ?? p.Mantenimiento_C_I);
        if (mant === "SI") return false;

        // Regla 2: solo Fiscal (si existe el campo; si no existe, no filtra)
        const sost = (p.NOM_SOSTENIMIENTO ?? p.SOSTENIMIENTO ?? "").toString().trim().toLowerCase();
        if (sost && sost !== "fiscal") return false;

        // Regla 3: solo %NBI > 0.50 (si existe, filtra; si no existe, lo deja)
        const nbi = toNum(p["% NBI_Cantón"] ?? p["% NBI_Cantón**"] ?? p.NBI);
        if (Number.isFinite(nbi) && nbi <= THRESH_NBI_MIN) return false;

        return true;
      },
      pointToLayer: (feature, latlng) => {
        const p = feature.properties || {};
        const nbi = toNum(p["% NBI_Cantón"] ?? p["% NBI_Cantón**"] ?? p.NBI);
        const casos = toNum(p["Total Casos"] ?? p.Total_Casos ?? p.TotalCasos);
        return L.circleMarker(latlng, {
          radius: radioPorCasos(casos),
          fillColor: colorPorNBI(nbi),
          fillOpacity: 0.85,
          color: "#ffffff",
          weight: 1
        });
      },
      onEachFeature: (feature, layer) => {
        const p = feature.properties || {};
        const popupProps = {
          AMIE: p.AMIE ?? "",
          "IE": p.NOM_INSTITUCION_EDUCATIVA ?? p.IE ?? "",
          "Cantón": p.DPA_DESCAN ?? p.CANTON ?? "",
          "Provincia": p.DPA_DESPRO ?? p.PROVINCIA ?? p.DPA_DESPRO2 ?? "",
          "% NBI_Cantón": Number.isFinite(toNum(p["% NBI_Cantón"] ?? p["% NBI_Cantón**"] ?? p.NBI)) ? toNum(p["% NBI_Cantón"] ?? p["% NBI_Cantón**"] ?? p.NBI).toFixed(3) : "Sin dato",
          "Total Casos": (p["Total Casos"] ?? p.Total_Casos ?? p.TotalCasos ?? "Sin dato"),
          "Estudiantes otras nacionalidades": (p["Total estudiantes otras nacionalidades"] ?? p.Otras_Nacionalidades ?? p.nacionalidades ?? "Sin dato"),
          "Sostenimiento": (p.NOM_SOSTENIMIENTO ?? p.SOSTENIMIENTO ?? "Fiscal")
        };
        layer.bindPopup(popupFromProps(popupProps, ["AMIE", "IE", "Cantón", "Provincia", "% NBI_Cantón", "Total Casos", "Estudiantes otras nacionalidades", "Sostenimiento"]));
      }
    });
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
