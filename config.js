// ===============================
// CONFIGURACIÓN DE CAPAS (RELEASES)
// ===============================
//
// Si una URL está vacía, la capa se deshabilita (sin alerts).

window.LAYER_SOURCES = {
  ieNoAtendidas: "https://github.com/powerpaz/IE_Atendidas_no_atendidas/releases/download/v1.0/ie_fiscales_no_atendidas.geojson",
  otrasNacionalidades: "https://github.com/powerpaz/IE_Atendidas_no_atendidas/releases/download/v1.0/total_estudiantes_otras_nacionalidades.geojson",
  serviciosAguaLuz: "https://github.com/powerpaz/IE_Atendidas_no_atendidas/releases/download/v1.0/servicios_agua_luz.geojson",
  violencia: "https://github.com/powerpaz/IE_Atendidas_no_atendidas/releases/download/v1.0/total_casos_violencia.geojson"
};

// TopoJSON de NBI (>50%) incluido en el repo
window.NBI_TOPO = {
  url: "data/cantones_nbi_mayor_50.topo.json",
  // Si no sabes el nombre del objeto TopoJSON, déjalo vacío y el visor tomará el primero disponible
  objectName: ""
};
