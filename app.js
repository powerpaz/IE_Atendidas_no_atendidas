// ===== Helpers =====
const $status = document.getElementById("status");

function normYesNo(v) {
  if (v === null || v === undefined) return "";
  const s = String(v).trim().toLowerCase();
  if (s === "si" || s === "sí" || s === "s" || s === "yes" || s === "y") return "SI";
  if (s === "no" || s === "n") return "NO";
  return String(v).trim();
}

function parseNum(v) {
  if (v === null || v === undefined) return NaN;
  if (typeof v === "number") return v;
  // Soporta: 0.5123 / 0,5123 / 1.234,56 / 1234.56
  const raw = String(v).trim();
  if (!raw) return NaN;
  // Si tiene coma como decimal (típico ES), normalizamos.
  // Estrategia: quitar separador de miles (.) cuando existe coma.
  let s = raw;
  if (/,/.test(s)) {
    s = s.replace(/\./g, "").replace(/,/g, ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function getField(props, aliases) {
  for (const k of aliases) {
    if (props && Object.prototype.hasOwnProperty.call(props, k)) return props[k];
  }
  // fallback: búsqueda laxa (ignora dobles espacios y mayúsculas)
  const norm = (x) => String(x).toLowerCase().replace(/\s+/g, " ").trim();
  const keys = Object.keys(props || {});
  for (const a of aliases) {
    const target = norm(a);
    const hit = keys.find(k => norm(k) === target);
    if (hit) return props[hit];
  }
  return undefined;
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
    <div style="font-weight:800; margin-bottom:6px;">IE Priorización (filtrado)</div>
    <div class="row"><span class="swatch" style="background: var(--c1)"></span><span>% NBI Cantón (0.50–0.60)</span></div>
    <div class="row"><span class="swatch" style="background: var(--c2)"></span><span>% NBI Cantón (0.60–0.70)</span></div>
    <div class="row"><span class="swatch" style="background: var(--c3)"></span><span>% NBI Cantón (0.70–0.80)</span></div>
    <div class="row"><span class="swatch" style="background: var(--c4)"></span><span>% NBI Cantón (&ge; 0.80)</span></div>
    <div class="row"><span class="dot blue"></span><span>Tamaño = Total Casos</span></div>
    <div class="note">
      Reglas aplicadas:<br/>
      • Excluye <b>Mantenimiento C_I = Sí</b><br/>
      • Solo <b>NOM_SOSTENIMIENTO = Fiscal</b><br/>
      • Solo <b>% NBI_Cantón &gt; 0.50</b>
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
      style: () => ({
        // Visible pero discreto (sin tapar el mapa).
        weight: 2.2,
        color: "#38bdf8",
        opacity: 0.95,
        fillColor: "#38bdf8",
        fillOpacity: 0.03,
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
      (ieData) => {
        // Aliases tolerantes (por si cambian los nombres de columnas)
        const F_MANT = ["Mantenimiento C_I", "Mantenimiento C_I ", "Mantenimiento_C_I"];
        const F_SOST = ["NOM_SOSTENIMIENTO", "NOM_SOSTENIMIE", "SOSTENIMIENTO", "NOM_SOSTEN"];
        const F_NBI = ["% NBI_Cantón**", "% NBI_Canton**", "% NBI_Cantón", "% NBI_Canton", "NBI_Canton", "NBI Cantón", "%NBI_Canton"];
        const F_CASOS = ["Total Casos", "Total_Casos", "Total_Cas", "TOTAL_CASOS"];
        const F_NAC = [
          "Total estudiantes otras nacionalidades",
          "Total estudiantes otras nacionalidades ",
          "Total_estudiantes_otras_nacionalidades",
          "Total_est_otras_nacionalidades",
          "OTRAS_NACIONALIDADES",
          "Total_Otras_Nacionalidades"
        ];

        const pickColor = (nbi) => {
          if (!Number.isFinite(nbi)) return "#94a3b8"; // gris si no hay dato
          if (nbi < 0.60) return getComputedStyle(document.documentElement).getPropertyValue('--c1').trim() || "#34d399";
          if (nbi < 0.70) return getComputedStyle(document.documentElement).getPropertyValue('--c2').trim() || "#60a5fa";
          if (nbi < 0.80) return getComputedStyle(document.documentElement).getPropertyValue('--c3').trim() || "#a78bfa";
          return getComputedStyle(document.documentElement).getPropertyValue('--c4').trim() || "#fb7185";
        };

        const radiusFromCasos = (casos) => {
          if (!Number.isFinite(casos) || casos <= 0) return 5;
          // escala suave (1..50+) sin que se salga del mapa
          return Math.max(5, Math.min(18, 4 + Math.sqrt(casos) * 2));
        };

        let shown = 0, sumCasos = 0, sumNac = 0;
        let nbiWithData = 0, casosWithData = 0, nacWithData = 0;

        const layer = L.geoJSON(ieData, {
          filter: (feature) => {
            const p = feature.properties || {};
            const mant = normYesNo(getField(p, F_MANT));
            if (mant === "SI") return false; // 1) excluir SI

            const sost = String(getField(p, F_SOST) ?? "").trim().toLowerCase();
            if (sost && sost !== "fiscal") return false; // 4) solo fiscal (si existe el campo)

            const nbi = parseNum(getField(p, F_NBI));
            if (Number.isFinite(nbi) && nbi <= 0.50) return false; // 2) solo > 0.50
            // Si no existe el campo, dejamos pasar pero quedará gris y lo verás en el popup.
            return true;
          },
          pointToLayer: (feature, latlng) => {
            const p = feature.properties || {};
            const nbi = parseNum(getField(p, F_NBI));
            const casos = parseNum(getField(p, F_CASOS));
            const nac = parseNum(getField(p, F_NAC));

            shown += 1;
            if (Number.isFinite(nbi)) nbiWithData += 1;
            if (Number.isFinite(casos)) { sumCasos += casos; casosWithData += 1; }
            if (Number.isFinite(nac)) { sumNac += nac; nacWithData += 1; }

            return L.circleMarker(latlng, {
              radius: radiusFromCasos(casos),
              fillColor: pickColor(nbi),
              fillOpacity: 0.85,
              color: "#ffffff",
              weight: 1
            });
          },
          onEachFeature: (feature, layer) => {
            const p = feature.properties || {};
            const keys = [
              "AMIE",
              "NOM_INSTITUCION_EDUCATIVA",
              ...F_SOST,
              ...F_NBI,
              ...F_CASOS,
              ...F_NAC,
              ...F_MANT
            ];
            // Presentamos solo lo relevante arriba; si faltan campos en el GeoJSON, no rompe.
            layer.bindPopup(popupFromProps(p, keys));
          }
        });

        // Mini resumen al cargar (se muestra en la barra de estado)
        const warn = [];
        if (shown > 0 && nbiWithData === 0) warn.push("sin %NBI");
        if (shown > 0 && casosWithData === 0) warn.push("sin Total Casos");
        if (shown > 0 && nacWithData === 0) warn.push("sin Otras nacionalidades");
        setStatus(
          `IE filtradas: ${shown.toLocaleString()} | Total Casos: ${Math.round(sumCasos).toLocaleString()} | Otras nacionalidades: ${Math.round(sumNac).toLocaleString()}` +
          (warn.length ? `  (Atención: ${warn.join(", ")} no están en el GeoJSON)` : "")
        );
        return layer;
      }
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
