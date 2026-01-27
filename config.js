// config.js
// Objetivo: definir fuentes de capas sin Supabase.
//
// Tip: si te aparece "NetworkError" o no cargan las capas desde Releases, lo más estable es
// subir los archivos a la carpeta /data del repo (si están por debajo de 100MB) y poner
// USE_LOCAL_DATA = true.

// Si pones true, el visor buscará los archivos en /data/* (misma web, sin CORS).
window.USE_LOCAL_DATA = false;

// Tag de tu release actual.
window.RELEASE_TAG = 'v1.0';

// Base de descarga de GitHub Releases.
window.DEFAULT_RELEASE_BASE = `https://github.com/powerpaz/IE_Atendidas_no_atendidas/releases/download/${window.RELEASE_TAG}/`;
// Además definimos la variable global que usa app.js (por compatibilidad).
var DEFAULT_RELEASE_BASE = window.DEFAULT_RELEASE_BASE;

// URLs explícitas por capa (si quieres, puedes reemplazar por links directos a objetos.githubusercontent.com)
window.LAYER_URLS = {
  // Polígonos
  cantonesNbiTopo: window.DEFAULT_RELEASE_BASE + 'cantones_nbi_mayor_50.topo.json',

  // Puntos
  violencia: window.DEFAULT_RELEASE_BASE + 'total_casos_violencia.geojson',
  otrasNacionalidades: window.DEFAULT_RELEASE_BASE + 'total_estudiantes_otras_nacionalidades.geojson',
  ieNoAtendidas: window.DEFAULT_RELEASE_BASE + 'ie_fiscales_no_atendidas.geojson',
  servicios: window.DEFAULT_RELEASE_BASE + 'servicios_agua_luz.geojson'
};

// Rutas locales (solo si USE_LOCAL_DATA = true)
window.LOCAL_PATHS = {
  provincias: 'provincias_simplificado.geojson',
  cantonesNbiTopo: 'data/cantones_nbi_mayor_50.topo.json',
  violencia: 'data/total_casos_violencia.geojson',
  otrasNacionalidades: 'data/total_estudiantes_otras_nacionalidades.geojson',
  ieNoAtendidas: 'data/ie_fiscales_no_atendidas.geojson',
  servicios: 'data/servicios_agua_luz.geojson'
};
