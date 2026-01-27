(() => {
  const STATUS = document.getElementById("status");
  const setStatus = (msg) => { if (STATUS) STATUS.textContent = msg; };

  // ------------------ Map init ------------------
  const map = L.map("map", { zoomControl: true, preferCanvas: true }).setView([-1.4, -78.5], 7);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  // ------------------ Paths ------------------
  const NBI_URL = (window.NBI_TOPO && window.NBI_TOPO.url) ? window.NBI_TOPO.url : "data/cantones_nbi_mayor_50.topo.json";
  const NBI_OBJECT = (window.NBI_TOPO && window.NBI_TOPO.objectName) ? window.NBI_TOPO.objectName : "";

  const GEO = {
    prov: "provincias_simplificado.geojson",
    viol: ((window.LAYER_SOURCES && (window.LAYER_SOURCES.violencia || "").trim()) || (DEFAULT_RELEASE_BASE + "total_casos_violencia.geojson")),
    otras: ((window.LAYER_SOURCES && (window.LAYER_SOURCES.otrasNacionalidades || "").trim()) || (DEFAULT_RELEASE_BASE + "total_estudiantes_otras_nacionalidades.geojson")),
    ieNo: ((window.LAYER_SOURCES && (window.LAYER_SOURCES.ieNoAtendidas || "").trim()) || (DEFAULT_RELEASE_BASE + "ie_fiscales_no_atendidas.geojson")),
    serv: ((window.LAYER_SOURCES && (window.LAYER_SOURCES.serviciosAguaLuz || "").trim()) || (DEFAULT_RELEASE_BASE + "servicios_agua_luz.geojson")),
  };

  // ------------------ Helpers ------------------
  function getNumber(props, candidates) {
    for (const k of candidates) {
      if (props && Object.prototype.hasOwnProperty.call(props, k) && props[k] !== null && props[k] !== undefined && props[k] !== "") {
        const v = Number(props[k]);
        if (!Number.isNaN(v)) return v;
      }
    }
    return 0;
  }

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

  function bubbleSize(sum) {
    const s = clamp(Math.sqrt(Math.max(0, sum)) * 7 + 22, 28, 96);
    return Math.round(s);
  }

  function bubbleIcon(sum, variantClass = "") {
    const size = bubbleSize(sum);
    const fontSize = clamp(Math.round(size * 0.32), 10, 22);
    return L.divIcon({
      html: `<div class="bubble ${variantClass}" style="width:${size}px;height:${size}px;line-height:${size}px;font-size:${fontSize}px;">${sum}</div>`,
      className: "bubble-wrap",
      iconSize: [size, size],
    });
  }

  async function loadJSON(url) {
    setStatus(`Cargando: ${url.split("/").pop()}`);
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status} al cargar ${url}`);
    return await res.json();
  }

  async function loadTopoToGeo(url, objectName) {
    const topo = await loadJSON(url);
    const objects = topo.objects || {};
    const keys = Object.keys(objects);
    if (!keys.length) throw new Error("TopoJSON sin objetos");
    const name = (objectName && objects[objectName]) ? objectName : keys[0];
    return topojson.feature(topo, objects[name]);
  }

  function makePolygonLayer(geojson, style, popupFields = []) {
    return L.geoJSON(geojson, {
      style,
      onEachFeature: (feature, layer) => {
        const props = feature.properties || {};
        const rows = popupFields
          .filter((k) => props[k] !== undefined && props[k] !== null && props[k] !== "")
          .map((k) => `<div><b>${k}</b>: ${props[k]}</div>`)
          .join("");
        if (rows) layer.bindPopup(`<div class="popup">${rows}</div>`);
      },
    });
  }

  function makeClusteredBubbleLayer(geojson, valueFields, title, variantClass = "") {
    const cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      chunkedLoading: true,
      iconCreateFunction: function (c) {
        const markers = c.getAllChildMarkers();
        let sum = 0;
        for (const m of markers) sum += (m.__v || 0);
        sum = Math.round(sum);
        return bubbleIcon(sum, variantClass);
      },
    });

    const points = L.geoJSON(geojson, {
      pointToLayer: (feature, latlng) => {
        const props = feature.properties || {};
        const v = getNumber(props, valueFields);
        const m = L.marker(latlng);
        m.__v = v;
        m.bindPopup(
          `<div class="popup"><div class="popup-title">${title}</div><div><b>Total</b>: ${v}</div></div>`
        );
        return m;
      },
    });

    cluster.addLayer(points);
    return cluster;
  }

  function makeSimplePointLayer(geojson, title, iconUrl) {
    const icon = L.icon({
      iconUrl,
      iconSize: [28, 28],
      iconAnchor: [14, 28],
      popupAnchor: [0, -26],
    });

    return L.geoJSON(geojson, {
      pointToLayer: (feature, latlng) => {
        const props = feature.properties || {};
        const entries = Object.entries(props)
          .slice(0, 24)
          .map(([k, v]) => `<div><b>${k}</b>: ${v}</div>`)
          .join("");
        return L.marker(latlng, { icon }).bindPopup(
          `<div class="popup"><div class="popup-title">${title}</div>${entries}</div>`
        );
      },
    });
  }

  function disableIfMissing(toggleId, url) {
    const el = document.getElementById(toggleId);
    if (!el) return;
    if (!url) {
      el.checked = false;
      el.disabled = true;
      const lbl = document.querySelector(`label[for="${toggleId}"]`);
      if (lbl) {
        lbl.textContent = `${lbl.textContent} (configurar URL)`;
        lbl.style.opacity = "0.7";
      }
    }
  }

  disableIfMissing("tgViol", GEO.viol);
  disableIfMissing("tgOtras", GEO.otras);
  disableIfMissing("tgIENo", GEO.ieNo);
  disableIfMissing("tgServ", GEO.serv);

  // ------------------ Layers ------------------
  const layers = {};

  async function ensureLayer(key, maker) {
    if (layers[key]) return layers[key];
    layers[key] = await maker();
    return layers[key];
  }

  function hookToggle(toggleId, key, maker) {
    const el = document.getElementById(toggleId);
    if (!el) return;

    el.addEventListener("change", async () => {
      if (el.checked) {
        try {
          setStatus("Cargando capa…");
          const lyr = await ensureLayer(key, maker);
          if (!map.hasLayer(lyr)) lyr.addTo(map);
          setStatus("Listo");
        } catch (err) {
          console.error(err);
          setStatus(`Error: ${err.message}`);
          el.checked = false;
        }
      } else {
        const lyr = layers[key];
        if (lyr && map.hasLayer(lyr)) map.removeLayer(lyr);
      }
    });
  }

  // Provincias
  hookToggle("tgProv", "prov", async () => {
    const gj = await loadJSON(GEO.prov);
    return makePolygonLayer(gj, { color: "#111827", weight: 1.2, fillOpacity: 0.0 }, ["DPA_DESPRO", "DPA_PROVIN"]);
  });

  // NBI TopoJSON
  hookToggle("tgNbi", "nbi", async () => {
    const gj = await loadTopoToGeo(NBI_URL, NBI_OBJECT);
    return makePolygonLayer(gj, { color: "#f59e0b", weight: 1.0, fillOpacity: 0.08 }, ["DPA_DESPRO", "DPA_DESCAN", "NBI", "%NBI", "NBI_CANTON"]);
  });

  // Violencia
  hookToggle("tgViol", "viol", async () => {
    const gj = await loadJSON(GEO.viol);
    return makeClusteredBubbleLayer(gj, ["Total Caso", "Total_Caso", "TOTAL_CASO", "total_casos", "total"], "Total Casos de Violencia");
  });

  // Otras nacionalidades
  hookToggle("tgOtras", "otras", async () => {
    const gj = await loadJSON(GEO.otras);
    return makeClusteredBubbleLayer(gj, ["Total estu", "Total_Otro", "Total_otro", "Total", "total"], "Total Estudiantes Otras Nacionalidades", "bubble-otras");
  });

  // IE No atendidas
  hookToggle("tgIENo", "ieNo", async () => {
    const gj = await loadJSON(GEO.ieNo);
    const cluster = L.markerClusterGroup({ showCoverageOnHover: false, chunkedLoading: true });
    cluster.addLayer(makeSimplePointLayer(gj, "IE Fiscales No atendidas", "https://maps.google.com/mapfiles/ms/icons/green-dot.png"));
    return cluster;
  });

  // Servicios
  hookToggle("tgServ", "serv", async () => {
    const gj = await loadJSON(GEO.serv);
    const cluster = L.markerClusterGroup({ showCoverageOnHover: false, chunkedLoading: true });
    cluster.addLayer(makeSimplePointLayer(gj, "Servicios básicos (agua y luz)", "https://maps.google.com/mapfiles/ms/icons/blue-dot.png"));
    return cluster;
  });

  // Trigger initial load for checked toggles
  setStatus("Cargando capas…");
  (async () => {
    const initialIds = ["tgProv", "tgNbi"]
      .concat(GEO.viol ? ["tgViol"] : [])
      .concat(GEO.otras ? ["tgOtras"] : [])
      .concat(GEO.ieNo ? ["tgIENo"] : [])
      .concat(GEO.serv ? ["tgServ"] : []);
    for (const id of initialIds) {
      const el = document.getElementById(id);
      if (el && el.checked) el.dispatchEvent(new Event("change"));
    }
    setStatus("Listo");
  })();
})();
