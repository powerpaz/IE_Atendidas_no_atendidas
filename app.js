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

// Leyenda
const legend = L.control({ position: "bottomleft" });
legend.onAdd = () => {
  const div = L.DomUtil.create("div", "legend");
  div.innerHTML = `
    <div style="font-weight:700; margin-bottom:6px;">IE Priorizacion</div>
    <div class="row"><span class="dot green"></span><span>SI (Mantenimiento C_I)</span></div>
    <div class="row"><span class="dot red"></span><span>NO (Mantenimiento C_I)</span></div>
    <div style="color: var(--muted); margin-top:8px;">
      Ultralight: prende capas grandes solo cuando sea necesario.
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
  lyrIE: document.getElementById("lyr_ie")
};

function setBaseLayer(name) {
  // Remove both safely, then add desired
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
  ie: null
};

function bindToggle(checkboxEl, layerKey) {
  if (!checkboxEl) return;
  checkboxEl.addEventListener("change", () => {
    const lyr = layers[layerKey];
    if (!lyr) return;
    if (checkboxEl.checked) lyr.addTo(map);
    else map.removeLayer(lyr);
  });
}

bindToggle(ui.lyrProvincias, "provincias");
bindToggle(ui.lyrCantonal, "cantonal");
bindToggle(ui.lyrIE, "ie");

(async () => {
  try {
    setStatus("Cargando Provincias...");

    layers.provincias = await tryLoadLayer(
      "Provincias",
      "data/Provincias_simplified.geojson",
      (provData) => L.geoJSON(provData, {
        style: () => ({
          weight: 1,
          color: "#2563eb",
          fillColor: "#1d4ed8",
          fillOpacity: 0.10
        }),
        onEachFeature: (feature, layer) => {
          const props = feature.properties || {};
          layer.bindPopup(popupFromProps(props, ["DPA_DESPRO", "DPA_PROVIN", "DPA_ANIO", "NAME_1"]));
        }
      })
    );

    if (layers.provincias && ui.lyrProvincias?.checked) layers.provincias.addTo(map);

    setStatus("Cargando Cantonal (opcional)...");
    layers.cantonal = await tryLoadLayer(
      "Cantonal",
      "data/Cantonal_simplified.geojson",
      (data) => L.geoJSON(data, {
        style: () => ({
          weight: 1,
          color: "#0ea5e9",
          fillColor: "#38bdf8",
          fillOpacity: 0.08
        }),
        onEachFeature: (feature, layer) => {
          const props = feature.properties || {};
          layer.bindPopup(popupFromProps(props, Object.keys(props).slice(0, 10)));
        }
      })
    );

    // NO se enciende por defecto (ultralight)
    if (layers.cantonal && ui.lyrCantonal?.checked) layers.cantonal.addTo(map);

    setStatus("Cargando IE Priorizacion...");
    layers.ie = await tryLoadLayer(
      "IE Priorizacion",
      "data/IE_Priorizacion_light.geojson",
      (ieData) => L.geoJSON(ieData, {
        pointToLayer: (feature, latlng) => {
          const props = feature.properties || {};
          const yn = normYesNo(props["Mantenimiento C_I"]);
          const isYes = yn === "SI";
          return L.circleMarker(latlng, {
            radius: 6,
            color: "rgba(255,255,255,.8)",
            weight: 1,
            fillColor: isYes ? "#22c55e" : "#ef4444",
            fillOpacity: 0.90
          });
        },
        onEachFeature: (feature, layer) => {
          const props = feature.properties || {};
          const maint = normYesNo(props["Mantenimiento C_I"]);
          const amie = props["AMIE"] ?? "";
          const nombre = props["NOM_INSTITUCION_EDUCATIVA"] ?? "";

          const popupProps = {
            "AMIE": amie,
            "codAMIe": amie,
            "Nombre institucion": nombre,
            "Mantenimiento C_I": maint
          };

          layer.bindPopup(popupFromProps(
            popupProps,
            ["AMIE", "codAMIe", "Nombre institucion", "Mantenimiento C_I"]
          ));
        }
      })
    );

    if (layers.ie && ui.lyrIE?.checked) layers.ie.addTo(map);

    setStatus("Listo.");

  } catch (e) {
    console.error(e);
    setStatus("Error cargando capas. Revisa consola.");
  }
})();
