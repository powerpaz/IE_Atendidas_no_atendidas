// Configuración del visor (sin Supabase)
//
// GeoJSON de puntos: se cargan desde Assets de Releases (recomendado).
// Si una URL queda vacía, esa capa se deshabilita (no habrá alerts ni pantalla en blanco).

window.LAYER_SOURCES = {
  ieNoAtendidas: "https://github.com/powerpaz/IE_Atendidas_no_atendidas/releases/download/v1.0/ie_fiscales_no_atendidas.geojson",
  otrasNacionalidades: "https://github.com/powerpaz/IE_Atendidas_no_atendidas/releases/download/v1.0/total_estudiantes_otras_nacionalidades.geojson",
  serviciosAguaLuz: "https://github.com/powerpaz/IE_Atendidas_no_atendidas/releases/download/v1.0/servicios_agua_luz.geojson",
  violencia: "https://github.com/powerpaz/IE_Atendidas_no_atendidas/releases/download/v1.0/total_casos_violencia.geojson"
};

// NBI se carga desde TopoJSON (ligero) incluido en el repo
window.NBI_TOPO = {
  url: "data/cantones_nbi_mayor_50.topo.json",
  objectName: "Cantones con NBI mayor al 50%"
};
