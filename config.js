// ===============================
// CONFIGURACIÓN DE CAPAS (RELEASES)
// ===============================
//
// Este visor carga las capas pesadas desde GitHub Releases (descarga directa),
// para evitar límites de subida en GitHub Pages.
//
// Si una URL está vacía, la capa se deshabilita (sin alerts).

const RELEASE_TAG = "v1.0";
const RELEASE_BASE =
  "https://github.com/powerpaz/IE_Atendidas_no_atendidas/releases/download/" + RELEASE_TAG;

window.LAYER_SOURCES = {
  ieNoAtendidas: `${RELEASE_BASE}/ie_fiscales_no_atendidas.geojson`,
  otrasNacionalidades: `${RELEASE_BASE}/total_estudiantes_otras_nacionalidades.geojson`,
  serviciosAguaLuz: `${RELEASE_BASE}/servicios_agua_luz.geojson`,
  violencia: `${RELEASE_BASE}/total_casos_violencia.geojson`
};

// TopoJSON de NBI (>50%) desde Releases (asegúrate que el asset se llame EXACTO así)
window.NBI_TOPO = {
  url: `${RELEASE_BASE}/cantones_nbi_mayor_50.topo.json`,
  // Si no sabes el nombre del objeto TopoJSON, déjalo vacío y el visor tomará el primero disponible
  objectName: ""
};
