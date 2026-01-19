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

// ===== Map =====
const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap"
});

const esriSat = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 19, attribution: "Tiles &copy; Esri" }
);

const map = L.map("map", {
  center: [-1.5, -78.5],
  zoom: 7,
  layers: [osm]
});

const baseLayers = { "BaseMap": osm, "Satellite": esriSat };
const overlays = {};
const layerControl = L.control.layers(baseLayers, overlays, { collapsed: false }).addTo(map);

// Leyenda
const legend = L.control({ position: "bottomleft" });
legend.onAdd = () => {
  const div = L.DomUtil.create("div", "legend");
  div.innerHTML = `
    <div style="font-weight:700; margin-bottom:6px;">IE Priorización</div>
    <div class="row"><span class="dot green"></span><span>SI (Mantenimiento C_I)</span></div>
    <div class="row"><span class="dot red"></span><span>NO (Mantenimiento C_I)</span></div>
    <div style="color: var(--muted); margin-top:8px;">
      Consejo ultralight: prende capas grandes solo cuando sea necesario.
    </div>
  `;
  return div;
};
legend.addTo(map);

(async () => {
  try {
    $status.textContent = "Cargando Provincias…";

    const provincias = await tryLoadLayer(
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
          layer.bindPopup(popupFromProps(props, ["DPA_DESPRO", "DPA_PROVIN", "DPA_ANIO"]));
        }
      })
    );

    if (provincias) {
      overlays["Provincias"] = provincias;
      layerControl.addOverlay(provincias, "Provincias");
      provincias.addTo(map);
    }

    // Cantonal (opcional, si existe el archivo ultralight)
    $status.textContent = "Verificando Cantonal (opcional)…";
    const cantonal = await tryLoadLayer(
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
          layer.bindPopup(popupFromProps(props, Object.keys(props).slice(0, 6)));
        }
      })
    );
    if (cantonal) {
      overlays["Cantonal"] = cantonal;
      layerControl.addOverlay(cantonal, "Cantonal");
      // NO se enciende por defecto para mantener el visor rápido
    }

    $status.textContent = "Cargando IE Priorización…";
    const ieLayer = await tryLoadLayer(
      "IE Priorización",
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
            "Nombre institución": nombre,
            "Mantenimiento C_I": maint
          };

          layer.bindPopup(popupFromProps(
            popupProps,
            ["AMIE", "codAMIe", "Nombre institución", "Mantenimiento C_I"]
          ));
        }
      })
    );

    if (ieLayer) {
      overlays["IE Priorización"] = ieLayer;
      layerControl.addOverlay(ieLayer, "IE Priorización");
      ieLayer.addTo(map);
    }

    $status.textContent = "Listo. Capas cargadas.";

  } catch (e) {
    console.error(e);
    $status.textContent = "Error cargando capas. Revisa consola.";
  }
})();
