/* 
  Visor (base AMIE-main) adaptado para capas GeoJSON:
  - Total Casos de Violencia (cluster con suma y etiqueta)
  - IE Fiscales No atendidas
  - Servicios de Agua y Luz
  - Cantones con NBI > 50%

  Se conserva index.html, styles.css y logo originales.
*/

(function () {
  'use strict';

  // ---------------- Helpers ----------------
  const $ = (id) => document.getElementById(id);

  function fmtInt(n) {
    const v = Number(n || 0);
    return v.toLocaleString('es-EC', { maximumFractionDigits: 0 });
  }

  function safeNumber(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  async function fetchJSON(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`No se pudo cargar ${url} (${res.status})`);
    return await res.json();
  }

  // ---------------- Map init ----------------
  const map = L.map('map', {
    center: [-1.8312, -78.1834], // Ecuador
    zoom: 7,
    minZoom: 5,
    maxZoom: 18,
  });

  // Base map (OSM)
  const baseOSM = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map);

  // Optional: provincias (del template original)
  let provinciasLayer = null;
  fetchJSON('provincias_simplificado.geojson')
    .then((gj) => {
      provinciasLayer = L.geoJSON(gj, {
        style: { weight: 1, opacity: 0.6, fillOpacity: 0.0 }
      });
      // No se agrega por defecto; queda en control de capas
      layerControl.addOverlay(provinciasLayer, 'Provincias (referencia)');
    })
    .catch(() => { /* silencioso */ });

  // Control de capas
  const layerControl = L.control.layers(
    { 'OpenStreetMap': baseOSM },
    {},
    { collapsed: false }
  ).addTo(map);

  // ---------------- Data layers ----------------
  let violenciaCluster = null;
  let violenciaRawCount = 0;
  let violenciaTotalCasos = 0;

  let ieNoAtendidasLayer = null;
  let serviciosLayer = null;
  let cantonesNbiLayer = null;

  // ---- Estilos base ----
  const styleCantones = {
    weight: 1.5,
    opacity: 0.9,
    fillOpacity: 0.18
  };

  function popupIE(props) {
    const nom = props?.NOM_INSTIT || props?.NOMBRE_IE_ || 'Institución';
    const amie = props?.AMIE ? `AMIE: ${props.AMIE}` : '';
    const zona = props?.DA_ZONA ? `Zona: ${props.DA_ZONA}` : '';
    const dist = props?.DA_DIST ? `Distrito: ${props.DA_DIST}` : '';
    const cant = props?.DA_CANTON ? `Cantón: ${props.DA_CANTON}` : (props?.DPA_DESCAN ? `Cantón: ${props.DPA_DESCAN}` : '');
    const prov = props?.DPA_DESPRO ? `Provincia: ${props.DPA_DESPRO}` : (props?.DA_PROVIN ? `Provincia: ${props.DA_PROVIN}` : '');
    return `
      <div style="font: 13px/1.35 Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;">
        <div style="font-weight:700;margin-bottom:6px;">${nom}</div>
        <div>${amie}</div>
        <div>${prov}</div>
        <div>${cant}</div>
        <div>${zona}</div>
        <div>${dist}</div>
      </div>
    `.replaceAll('<div></div>', '');
  }

  // ---- Violencia: cluster con suma Total_Caso y etiqueta ----
  function buildViolenciaCluster(features) {
    // MarkerClusterGroup
    const mcg = L.markerClusterGroup({
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      chunkedLoading: true,
      maxClusterRadius: 55,
      iconCreateFunction: function (cluster) {
        const markers = cluster.getAllChildMarkers();
        let sum = 0;
        for (const m of markers) sum += safeNumber(m.options.__totalCaso);
        const label = fmtInt(sum);

        // Tamaño del círculo según el total (suave, tipo “burbuja”)
        const size = Math.max(26, Math.min(78, 22 + Math.sqrt(sum) * 5));

        const html = `
          <div style="
            width:${size}px;height:${size}px;
            border-radius:999px;
            background:rgba(220,0,0,0.65);
            border:2px solid rgba(255,255,255,0.95);
            display:flex;align-items:center;justify-content:center;
            color:#fff;font-weight:800;
            font-size:${Math.max(11, Math.min(18, size/3))}px;
            box-shadow:0 2px 10px rgba(0,0,0,0.25);
          ">${label}</div>
        `;
        return L.divIcon({
          html,
          className: 'violencia-cluster',
          iconSize: [size, size]
        });
      }
    });

    // Marcadores individuales (círculos pequeños) + tooltip con Total_Caso
    for (const f of features) {
      if (!f.geometry || f.geometry.type !== 'Point') continue;
      const [lon, lat] = f.geometry.coordinates;
      const props = f.properties || {};
      const totalCaso = safeNumber(props.Total_Caso ?? props['Total Caso'] ?? 0);

      // Si no hay casos, aún se muestra (pero con tamaño mínimo)
      const r = Math.max(3, Math.min(18, 2 + Math.sqrt(totalCaso)));

      const marker = L.circleMarker([lat, lon], {
        radius: r,
        weight: 1,
        opacity: 0.9,
        fillOpacity: 0.55,
        // No especifico color fijo para no “pelear” con tu paleta; Leaflet usa el default,
        // pero aquí lo mantenemos coherente con el cluster (rojo).
        color: '#b00000',
        fillColor: '#e00000',
        __totalCaso: totalCaso
      });

      marker.bindPopup(popupIE(props), { maxWidth: 320 });
      marker.bindTooltip(fmtInt(totalCaso), { direction: 'center', permanent: false, opacity: 0.9 });

      mcg.addLayer(marker);
    }

    return mcg;
  }

  // ---- IE fiscales no atendidas (puntos) ----
  function buildPointsLayer(features, opts) {
    const { color, fillColor, name } = opts;
    const layer = L.geoJSON(features, {
      pointToLayer: (feat, latlng) => L.circleMarker(latlng, {
        radius: 4,
        weight: 1,
        opacity: 0.9,
        fillOpacity: 0.6,
        color,
        fillColor
      }),
      onEachFeature: (feat, lyr) => {
        lyr.bindPopup(popupIE(feat.properties || {}), { maxWidth: 320 });
      }
    });
    layerControl.addOverlay(layer, name);
    return layer;
  }

  // ---- Cantones NBI > 50 (polígono) ----
  function buildCantonesLayer(gj) {
    const layer = L.geoJSON(gj, {
      style: () => ({
        ...styleCantones,
        color: '#ff9800',
        fillColor: '#ff9800'
      }),
      onEachFeature: (feat, lyr) => {
        const p = feat.properties || {};
        const cant = p.DPA_DESCAN ? `<div>Cantón: ${p.DPA_DESCAN}</div>` : '';
        const prov = p.DPA_DESPRO ? `<div>Provincia: ${p.DPA_DESPRO}</div>` : '';
        lyr.bindPopup(`<div style="font:13px/1.35 Inter, Arial, sans-serif;"><div style="font-weight:800;margin-bottom:6px;">NBI > 50%</div>${prov}${cant}</div>`, { maxWidth: 260 });
      }
    });
    layerControl.addOverlay(layer, 'Cantones (NBI > 50%)');
    return layer;
  }

  // ---------------- KPI / Sidebar ----------------
  function updateSidebar() {
    // KPIs reutilizando los elementos existentes del template
    const countEl = $('countInstituciones');
    const totalEl = $('totalInversion');

    if (countEl) countEl.textContent = fmtInt(violenciaRawCount);

    // Reutilizamos "Inversión Total" como "Total de casos" (sin tocar el HTML)
    if (totalEl) totalEl.textContent = fmtInt(violenciaTotalCasos);

    // Tabla “rubros” como resumen de capas
    const tbody = document.querySelector('#rubrosTable tbody');
    const totalCell = $('totalCell');

    if (tbody) {
      tbody.innerHTML = '';
      const rows = [
        ['Total de casos (Violencia)', violenciaTotalCasos],
        ['Puntos (Violencia)', violenciaRawCount],
        ['IE fiscales no atendidas', ieNoAtendidasLayer ? ieNoAtendidasLayer.getLayers().length : 0],
        ['Servicios (Agua y Luz)', serviciosLayer ? serviciosLayer.getLayers().length : 0],
        ['Cantones NBI > 50%', cantonesNbiLayer ? cantonesNbiLayer.getLayers().length : 0],
      ];

      for (const [label, val] of rows) {
        const tr = document.createElement('tr');
        const td1 = document.createElement('td');
        const td2 = document.createElement('td');
        td1.textContent = label;
        td2.textContent = fmtInt(val);
        tr.appendChild(td1);
        tr.appendChild(td2);
        tbody.appendChild(tr);
      }
    }
    if (totalCell) totalCell.textContent = fmtInt(violenciaTotalCasos);

    const filtrosActivos = $('filtrosActivos');
    if (filtrosActivos) filtrosActivos.textContent = 'Capas cargadas (sin filtros aplicados)';
  }

  // Botón limpiar (del template): aquí lo usamos para re-centrar el mapa y cerrar popups
  const btnLimpiar = $('btnLimpiar');
  if (btnLimpiar) {
    btnLimpiar.addEventListener('click', () => {
      map.setView([-1.8312, -78.1834], 7);
      map.closePopup();
    });
  }

  // ---------------- Carga de datos ----------------
  (async function init() {
    try {
      // 1) Cantones NBI
      const cantones = await fetchJSON('data/cantones_nbi_mayor_50.geojson');
      cantonesNbiLayer = buildCantonesLayer(cantones);

      // 2) Servicios (Agua y Luz)
      const servicios = await fetchJSON('data/servicios_agua_luz.geojson');
      serviciosLayer = buildPointsLayer(servicios, {
        name: 'Servicios (Agua y Luz)',
        color: '#1565c0',
        fillColor: '#1e88e5'
      });

      // 3) IE Fiscales No atendidas
      const ieNo = await fetchJSON('data/ie_fiscales_no_atendidas.geojson');
      ieNoAtendidasLayer = buildPointsLayer(ieNo, {
        name: 'IE Fiscales No atendidas',
        color: '#2e7d32',
        fillColor: '#43a047'
      });

      // 4) Violencia (cluster)
      const violencia = await fetchJSON('data/total_casos_violencia.geojson');
      const feats = Array.isArray(violencia.features) ? violencia.features : [];
      violenciaRawCount = feats.length;
      violenciaTotalCasos = feats.reduce((acc, f) => acc + safeNumber(f?.properties?.Total_Caso ?? f?.properties?.['Total Caso'] ?? 0), 0);

      violenciaCluster = buildViolenciaCluster(feats);
      map.addLayer(violenciaCluster);
      layerControl.addOverlay(violenciaCluster, 'Violencia (Total de casos)');

      // Ajuste inicial de vista
      const group = L.featureGroup([]);
      if (cantonesNbiLayer) group.addLayer(cantonesNbiLayer);
      if (violenciaCluster) group.addLayer(violenciaCluster);

      try {
        const b = group.getBounds();
        if (b && b.isValid()) map.fitBounds(b, { padding: [20, 20] });
      } catch (_) {}

      updateSidebar();

      const status = $('status');
      if (status) status.textContent = 'Datos cargados';
    } catch (err) {
      console.error(err);
      const status = $('status');
      if (status) status.textContent = 'Error al cargar datos';
      alert('No se pudieron cargar una o más capas. Revisa la consola del navegador para más detalle.');
    }
  })();
})();
