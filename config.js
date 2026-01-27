// Configuración del visor (sin Supabase)
//
// Si subes capas pesadas (GeoJSON de puntos) como Assets de un Release en GitHub,
// pega aquí las URLs públicas. Si quedan vacías, se intentará cargar la ruta local /data.

window.LAYER_SOURCES = {
  violencia: '',
  otrasNacionalidades: '',
  ieNoAtendidas: '',
  serviciosAguaLuz: ''
};

// NBI se carga desde TopoJSON (ligero) incluido en el repo
window.NBI_TOPO = {
  url: 'data/cantones_nbi_mayor_50.topo.json',
  objectName: 'Cantones con NBI mayor al 50%'
};
