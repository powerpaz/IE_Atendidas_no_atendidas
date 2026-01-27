/* app.js - visor Leaflet (GeoJSON/TopoJSON) */

// ---------- Helpers ----------
function withCacheBust(url) {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${Date.now()}`;
}

async function fetchJson(url) {
  const u = withCacheBust(url);
  const res = await fetch(u, {
    // Si GitHub Pages cachea agresivo, esto ayuda.
    cache: 'no-store',
    // Mantener CORS normal; si el servidor no permite CORS, la solución real es usar USE_LOCAL_DATA=true.
    mode: 'cors'
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} al cargar ${url}`);
  }
  return res.json();
}

function getSourceUrl(key) {
  // Prioridad: local (misma web) -> LAYER_URLS (Releases) -> fallback con DEFAULT_RELEASE_BASE
  if (window.USE_LOCAL_DATA && window.LOCAL_PATHS && window.LOCAL_PATHS[key]) {
    return window.LOCAL_PATHS[key];
  }
  if (window.LAYER_URLS && window.LAYER_URLS[key]) {
    return window.LAYER_URLS[key];
  }
  // fallback: usa DEFAULT_RELEASE_BASE si existe
  if (typeof DEFAULT_RELEASE_BASE !== 'undefined' && DEFAULT_RELEASE_BASE) {
    const map = {
      cantonesNbiTopo: 'cantones_nbi_mayor_50.topo.json',
      violencia: 'total_casos_violencia.geojson',
      otrasNacionalidades: 'total_estudiantes_otras_nacionalidades.geojson',
      ieNoAtendidas: 'ie_fiscales_no_atendidas.geojson',
      servicios: 'servicios_agua_luz.geojson'
    };
    if (map[key]) return DEFAULT_RELEASE_BASE + map[key];
  }
  return null;
}

function setStatus(msg) {
  const box = document.getElementById('statusBox');
  if (!box) return;
  box.textContent = msg;
}

// ---------- Map init ----------
const map = L.map('map', {
  preferCanvas: true,
  zoomControl: false
}).setView([-1.5, -78.5], 6);

L.control.zoom({ position: 'topleft' }).addTo(map);

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap &copy; CARTO'
}).addTo(map);

const layers = {
  provincias: null,
  cantonesNbi: null,
  violencia: null,
  otrasNacionalidades: null,
  ieNoAtendidas: null,
  servicios: null
};

// ---------- Styles ----------
function styleProvincias() {
  return { color: '#000', weight: 1.5, fill: false, opacity: 1 };
}

function styleCantones() {
  return { color: '#2ecc71', weight: 1.2, fill: true, fillOpacity: 0.15 };
}

function circleStyle() {
  return { radius: 4, fillOpacity: 0.75, weight: 0.5 };
}

// ---------- Loaders ----------
async function loadProvincias() {
  const url = (window.USE_LOCAL_DATA && window.LOCAL_PATHS?.provincias) ? window.LOCAL_PATHS.provincias : 'provincias_simplificado.geojson';
  const gj = await fetchJson(url);
  const lyr = L.geoJSON(gj, { style: styleProvincias() });
  layers.provincias = lyr;
  return lyr;
}

async function loadCantonesNbiTopo() {
  const url = getSourceUrl('cantonesNbiTopo');
  if (!url) throw new Error('No hay URL para cantonesNbiTopo');

  const topo = await fetchJson(url);
  if (!window.topojson) {
    throw new Error('topojson no está cargado (revisa el <script> en index.html)');
  }

  // Detectar primer objeto TopoJSON
  const objName = Object.keys(topo.objects || {})[0];
  if (!objName) throw new Error('TopoJSON sin objects');

  const geo = topojson.feature(topo, topo.objects[objName]);
  const lyr = L.geoJSON(geo, { style: styleCantones() });
  layers.cantonesNbi = lyr;
  return lyr;
}

async function loadPoints(key, layerKey, popupFields) {
  const url = getSourceUrl(key);
  if (!url) throw new Error(`No hay URL para ${key}`);

  const gj = await fetchJson(url);
  const lyr = L.geoJSON(gj, {
    pointToLayer: (feat, latlng) => {
      return L.circleMarker(latlng, circleStyle());
    },
    onEachFeature: (feat, l) => {
      const p = feat.properties || {};
      if (popupFields && popupFields.length) {
        const rows = popupFields
          .filter(f => p[f] !== undefined && p[f] !== null && String(p[f]).trim() !== '')
          .map(f => `<div><b>${f}:</b> ${p[f]}</div>`)
          .join('');
        l.bindPopup(rows || 'Sin atributos');
      }
    }
  });

  layers[layerKey] = lyr;
  return lyr;
}

// ---------- UI wiring ----------
async function toggleLayer(checkboxId, loaderFn, layerKey) {
  const cb = document.getElementById(checkboxId);
  cb.addEventListener('change', async () => {
    try {
      setStatus('');
      if (cb.checked) {
        if (!layers[layerKey]) {
          setStatus('Cargando capa...');
          const lyr = await loaderFn();
          lyr.addTo(map);
          setStatus('');
        } else {
          layers[layerKey].addTo(map);
        }
      } else {
        if (layers[layerKey]) map.removeLayer(layers[layerKey]);
      }
    } catch (e) {
      console.error(e);
      setStatus(String(e.message || e));
      cb.checked = false;
    }
  });
}

// Init
(function init() {
  // status box (top left panel)
  setStatus('');

  toggleLayer('chkProvincias', loadProvincias, 'provincias');
  toggleLayer('chkCantonesNBI', loadCantonesNbiTopo, 'cantonesNbi');

  toggleLayer(
    'chkViolencia',
    () => loadPoints('violencia', 'violencia', ['DPA_DESPROV', 'DPA_DESCAN', 'total_casos', 'TOTAL_CASOS', 'Total casos']),
    'violencia'
  );

  toggleLayer(
    'chkOtrasNac',
    () => loadPoints('otrasNacionalidades', 'otrasNacionalidades', ['DPA_DESPROV', 'DPA_DESCAN', 'total_estudiantes', 'TOTAL_EST', 'Total estudiantes otras nacionalidades']),
    'otrasNacionalidades'
  );

  toggleLayer(
    'chkIeNoAtendidas',
    () => loadPoints('ieNoAtendidas', 'ieNoAtendidas', ['AMIE', 'NOMBRE', 'SOSTENIMIENTO', 'DPA_DESPROV', 'DPA_DESCAN']),
    'ieNoAtendidas'
  );

  toggleLayer(
    'chkServicios',
    () => loadPoints('servicios', 'servicios', ['AMIE', 'NOMBRE', 'AGUA', 'LUZ', 'DPA_DESPROV', 'DPA_DESCAN']),
    'servicios'
  );
})();
