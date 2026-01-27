/*
  Visor ligero (sin Supabase / sin filtros)
  - Panel lateral solo con toggles de capas GeoJSON
  - Provincias + Cantones NBI (>50%) como polígonos base
  - Puntos con burbujas (clusters con suma) para:
      * Total Casos de Violencia
      * Total Estudiantes de Otras Nacionalidades
*/

(() => {
  const STATUS = document.getElementById('status');

  function setStatus(msg) {
    if (STATUS) STATUS.textContent = msg;
  }

  // ------------------ Map init ------------------
  const map = L.map('map', { zoomControl: true, preferCanvas: true }).setView([-1.4, -78.5], 7);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // ------------------ Helpers ------------------
  const LAYERS = new Map(); // key -> {layer, loaded, toggle}

  const GEOJSON_PATHS = {
  // Siempre usa rutas relativas (GitHub Pages publica bajo /<repo>/)
  prov: './provincias_simplificado.geojson',

  // NBI (>50%) como TopoJSON (ligero, sin deformar geometría)
  nbiTopo: (window.NBI_TOPO && window.NBI_TOPO.url) ? window.NBI_TOPO.url : './data/cantones_nbi_mayor_50.topo.json',
  nbiObject: (window.NBI_TOPO && window.NBI_TOPO.objectName) ? window.NBI_TOPO.objectName : 'Cantones con NBI mayor al 50%',

  // Puntos (recomendado: URL de Release; fallback: carpeta /data)
  // Si en config.js dejas vacío, NO se intentará cargar (evita alerts / pantalla en blanco)
  viol: (window.LAYER_SOURCES && typeof window.LAYER_SOURCES.violencia === 'string' && window.LAYER_SOURCES.violencia.trim())
    ? window.LAYER_SOURCES.violencia.trim()
    : null,
  otras: (window.LAYER_SOURCES && typeof window.LAYER_SOURCES.otrasNacionalidades === 'string' && window.LAYER_SOURCES.otrasNacionalidades.trim())
    ? window.LAYER_SOURCES.otrasNacionalidades.trim()
    : null,
  ieNo: (window.LAYER_SOURCES && typeof window.LAYER_SOURCES.ieNoAtendidas === 'string' && window.LAYER_SOURCES.ieNoAtendidas.trim())
    ? window.LAYER_SOURCES.ieNoAtendidas.trim()
    : null,
  serv: (window.LAYER_SOURCES && typeof window.LAYER_SOURCES.serviciosAguaLuz === 'string' && window.LAYER_SOURCES.serviciosAguaLuz.trim())
    ? window.LAYER_SOURCES.serviciosAguaLuz.trim()
    : null
};


  function getNumber(props, candidates) {
    for (const k of candidates) {
      if (props && Object.prototype.hasOwnProperty.call(props, k) && props[k] !== null && props[k] !== undefined && props[k] !== '') {
        const v = Number(props[k]);
        if (!Number.isNaN(v)) return v;
      }
    }
    return 0;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function bubbleSize(sum) {
    // Ajuste visual: burbujas más grandes (sin cambiar datos)
    const s = clamp(Math.sqrt(Math.max(0, sum)) * 7 + 22, 28, 96);
    return Math.round(s);
  }

  function bubbleIcon(sum) {
    const size = bubbleSize(sum);
    const fontSize = clamp(Math.round(size * 0.32), 10, 22);
    return L.divIcon({
      html: `<div class="bubble" style="width:${size}px;height:${size}px;line-height:${size}px;font-size:${fontSize}px;">${sum}</div>`,
      className: 'bubble-wrap',
      iconSize: [size, size]
    });
  }

  function makeClusteredBubbleLayer(geojson, valueCandidates, popupTitle) {
    const cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      disableClusteringAtZoom: 12,
      chunkedLoading: true,
      iconCreateFunction: function (c) {
        const markers = c.getAllChildMarkers();
        let sum = 0;
        for (const m of markers) sum += (m.__v || 0);
        sum = Math.round(sum);
        return bubbleIcon(sum);
      }
    });

    const points = L.geoJSON(geojson, {
      pointToLayer: (feature, latlng) => {
        const v = getNumber(feature.properties || {}, valueCandidates);
        const m = L.circleMarker(latlng, {
          radius: 4,
          weight: 0,
          fillOpacity: 0.0 // invisible: el cluster es la visual principal
        });
        m.__v = v;

        if (popupTitle) {
          const p = feature.properties || {};
          const amie = p.AMIE || '';
          const nom = p.NOM_INSTIT || p.NOMBRE_IE_ || '';
          const prov = p.DPA_DESPRO || '';
          const canton = p.DPA_DESCAN || '';

          m.bindPopup(
            `<div style="font-family:Inter,system-ui,Segoe UI,Roboto,Arial,sans-serif;font-size:12px;line-height:1.35;">
              <div style="font-weight:700;margin-bottom:6px;">${popupTitle}</div>
              <div><b>Valor:</b> ${v}</div>
              ${amie ? `<div><b>AMIE:</b> ${amie}</div>` : ''}
              ${nom ? `<div><b>IE:</b> ${nom}</div>` : ''}
              ${(prov || canton) ? `<div><b>Ubicación:</b> ${[prov, canton].filter(Boolean).join(' / ')}</div>` : ''}
            </div>`
          );
        }

        return m;
      }
    });

    cluster.addLayer(points);
    return cluster;
  }

  function makeSimplePointLayer(geojson, popupTitle, iconUrl) {
    const icon = L.icon({
      iconUrl: iconUrl || 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    });

    return L.geoJSON(geojson, {
      pointToLayer: (feature, latlng) => L.marker(latlng, { icon }),
      onEachFeature: (feature, lyr) => {
        const p = feature.properties || {};
        const amie = p.AMIE || '';
        const nom = p.NOM_INSTIT || p.NOMBRE_IE_ || '';
        const prov = p.DPA_DESPRO || '';
        const canton = p.DPA_DESCAN || '';

        lyr.bindPopup(
          `<div style="font-family:Inter,system-ui,Segoe UI,Roboto,Arial,sans-serif;font-size:12px;line-height:1.35;">
            <div style="font-weight:700;margin-bottom:6px;">${popupTitle}</div>
            ${amie ? `<div><b>AMIE:</b> ${amie}</div>` : ''}
            ${nom ? `<div><b>IE:</b> ${nom}</div>` : ''}
            ${(prov || canton) ? `<div><b>Ubicación:</b> ${[prov, canton].filter(Boolean).join(' / ')}</div>` : ''}
          </div>`
        );
      }
    });
  }

  function makePolygonLayer(geojson, style, popupFields) {
    return L.geoJSON(geojson, {
      style,
      onEachFeature: (feature, lyr) => {
        if (!popupFields || popupFields.length === 0) return;
        const p = feature.properties || {};
        const rows = popupFields
          .map((k) => (p[k] !== undefined && p[k] !== null && p[k] !== '' ? `<div><b>${k}:</b> ${p[k]}</div>` : ''))
          .filter(Boolean)
          .join('');
        if (rows) {
          lyr.bindPopup(
            `<div style="font-family:Inter,system-ui,Segoe UI,Roboto,Arial,sans-serif;font-size:12px;line-height:1.35;">
              ${rows}
            </div>`
          );
        }
      }
    });
  }

  async function loadGeoJSON(url) {
    if (!url) throw new Error('Capa no configurada: pega la URL pública del GeoJSON en config.js (window.LAYER_SOURCES).');
    const r = await fetch(url);
    if (!r.ok) throw new Error(`No se pudo cargar: ${url}`);
    return await r.json();
  }


async function loadTopoJSON(url, objectName) {
  const topo = await loadGeoJSON(url);
  if (!topo || topo.type !== 'Topology') throw new Error(`El archivo no es TopoJSON: ${url}`);
  const objs = topo.objects || {};
  const key = objectName || Object.keys(objs)[0];
  if (!key || !objs[key]) {
    throw new Error(`No se encontró el objeto TopoJSON '${objectName || ''}'. Disponibles: ${Object.keys(objs).join(', ')}`);
  }
  if (!window.topojson || typeof window.topojson.feature !== 'function') {
    throw new Error('No se encontró topojson-client. Revisa que index.html cargue topojson-client.min.js');
  }
  return window.topojson.feature(topo, objs[key]);
}


  function ensureBubbleCss() {
    const id = 'bubble-style';
    if (document.getElementById(id)) return;

    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      .bubble-wrap{ background: transparent; border: none; }
      .bubble{
        box-sizing:border-box;
        border-radius:999px;
        background: rgba(220,38,38,0.65);
        border: 2px solid rgba(220,38,38,0.9);
        color:#fff;
        font-weight:700;
        text-align:center;
        box-shadow: 0 2px 10px rgba(0,0,0,.18);
        user-select:none;
      }
      .bubble-otras .bubble{
        background: rgba(59,130,246,0.65);
        border: 2px solid rgba(59,130,246,0.9);
      }
    `;
    document.head.appendChild(style);
  }

  // ------------------ Toggles ------------------
  function bindToggle(toggleId, layerKey, loader) {
    const el = document.getElementById(toggleId);
    if (!el) return;

    LAYERS.set(layerKey, { layer: null, loaded: false, toggle: el });

    el.addEventListener('change', async () => {
      const record = LAYERS.get(layerKey);
      if (!record) return;

      if (el.checked) {
        try {
          if (!record.loaded) {
            setStatus(`Cargando capa: ${layerKey}…`);
            record.layer = await loader();
            record.loaded = true;
          }
          record.layer.addTo(map);
          setStatus('Listo');
        } catch (e) {
          console.error(e);
          el.checked = false;
          setStatus(`No se pudo cargar '${layerKey}'. Revisa: (1) URL en config.js o (2) archivo dentro de /data.`);
        }
      } else {
        if (record.layer && map.hasLayer(record.layer)) map.removeLayer(record.layer);
      }
    });
  }

  // ------------------ Boot ------------------
  ensureBubbleCss();

  // Si una capa depende de URL (Release) y no está configurada, desactiva el toggle para evitar confusión
  function disableIfMissing(toggleId, url) {
    const el = document.getElementById(toggleId);
    if (!el) return;
    if (!url) {
      el.checked = false;
      el.disabled = true;
      el.title = 'Capa pendiente: configura la URL en config.js (window.LAYER_SOURCES)';
      const lbl = document.querySelector(`label[for="${toggleId}"]`);
      if (lbl && !lbl.dataset.noteAdded) {
        lbl.dataset.noteAdded = '1';
        lbl.textContent = `${lbl.textContent} (configurar URL)`;
        lbl.style.opacity = '0.7';
      }
    }
  }

  disableIfMissing('tgViol', GEOJSON_PATHS.viol);
  disableIfMissing('tgOtras', GEOJSON_PATHS.otras);
  disableIfMissing('tgIENo', GEOJSON_PATHS.ieNo);
  disableIfMissing('tgServ', GEOJSON_PATHS.serv);

  // Provincias (base)
  bindToggle('tgProv', 'prov', async () => {
    const gj = await loadGeoJSON(GEOJSON_PATHS.prov);
    return makePolygonLayer(gj, { color: '#111827', weight: 1.2, fillOpacity: 0.0 }, ['DPA_DESPRO', 'DPA_PROVIN']);
  });

  // NBI > 50
  bindToggle('tgNbi', 'nbi', async () => {
    const gj = await loadTopoJSON(GEOJSON_PATHS.nbiTopo, GEOJSON_PATHS.nbiObject);
    return makePolygonLayer(gj, { color: '#f59e0b', weight: 1.0, fillOpacity: 0.08 }, ['DPA_DESPRO', 'DPA_DESCAN', 'NBI', '%NBI', 'NBI_CANTON']);
  });

  // Violencia (burbujas)
  bindToggle('tgViol', 'viol', async () => {
    const gj = await loadGeoJSON(GEOJSON_PATHS.viol);
    return makeClusteredBubbleLayer(gj, ['Total Caso', 'Total_Caso', 'TOTAL_CASO'], 'Total Casos de Violencia');
  });

  // Otras nacionalidades (burbujas)
  bindToggle('tgOtras', 'otras', async () => {
    const gj = await loadGeoJSON(GEOJSON_PATHS.otras);
    const cluster = makeClusteredBubbleLayer(gj, ['Total estu', 'Total_Otro', 'Total_otro', 'Total'], 'Total Estudiantes de Otras Nacionalidades');
    // Fuerza clase azul al icono
    cluster.options.iconCreateFunction = function (c) {
      const markers = c.getAllChildMarkers();
      let sum = 0;
      for (const m of markers) sum += (m.__v || 0);
      sum = Math.round(sum);
      const icon = bubbleIcon(sum);
      icon.options.className = 'bubble-wrap bubble-otras';
      return icon;
    };
    return cluster;
  });

  // IE No atendidas (puntos)
  bindToggle('tgIENo', 'ieNo', async () => {
    const gj = await loadGeoJSON(GEOJSON_PATHS.ieNo);
    const cluster = L.markerClusterGroup({ showCoverageOnHover: false, chunkedLoading: true });
    cluster.addLayer(makeSimplePointLayer(gj, 'IE Fiscales No atendidas', 'https://maps.google.com/mapfiles/ms/icons/green-dot.png'));
    return cluster;
  });

  // Servicios (puntos)
  bindToggle('tgServ', 'serv', async () => {
    const gj = await loadGeoJSON(GEOJSON_PATHS.serv);
    const cluster = L.markerClusterGroup({ showCoverageOnHover: false, chunkedLoading: true });
    cluster.addLayer(makeSimplePointLayer(gj, 'Servicios de Agua y Luz', 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png'));
    return cluster;
  });

  // Dispara carga inicial según toggles
  setStatus('Cargando capas…');
  // Solo intenta cargar las capas de puntos si existe URL configurada
  const initial = ['tgProv', 'tgNbi']
    .concat(GEOJSON_PATHS.viol ? ['tgViol'] : [])
    .concat(GEOJSON_PATHS.otras ? ['tgOtras'] : [])
    .concat(GEOJSON_PATHS.ieNo ? ['tgIENo'] : [])
    .concat(GEOJSON_PATHS.serv ? ['tgServ'] : []);
  (async () => {
    for (const id of initial) {
      const el = document.getElementById(id);
      if (el && el.checked) el.dispatchEvent(new Event('change'));
    }
    setStatus('Listo');
  })();
})();
