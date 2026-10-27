/**
 * Un fallo, dicho para quien no es técnico (auditoría, 21/10).
 *
 * «Qué ha pasado › Lo que se rompió» enseñaba el error en crudo —
 * `_api_consultas__WEBPACK_IMPORTED_MODULE_4__…`, «Loading chunk app/layout
 * failed»— y quien lo abre es Willy. La frase dice qué pasó y si hay que hacer
 * algo; el texto original sigue, plegado, para quien lo arregla.
 *
 * Por patrones del mensaje y del código, del más concreto al más general.
 */
export function fraseDelFallo(f: { mensaje: string; codigo: string | null; origen: string }): string {
  const texto = `${f.codigo ?? ""} ${f.origen} ${f.mensaje}`;

  if (/chunk|ChunkLoadError/i.test(texto)) {
    return "Una pantalla no terminó de cargar, casi siempre justo después de actualizar el sistema. Se arregla recargando la página.";
  }
  if (/fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|timeout|network/i.test(texto)) {
    return "No se pudo conectar con un servicio de fuera: internet, SUNAT o la consulta de RUC y DNI.";
  }
  if (/42501|permission denied|row-level security|no autorizado|sin permiso/i.test(texto)) {
    return "Alguien intentó hacer algo que su rol no le permite. El sistema lo paró.";
  }
  if (/23505|duplicate key/i.test(texto)) {
    return "Se intentó guardar algo que ya existía (un código o un número repetido).";
  }
  if (/23503|23514|23502|violates|check constraint|not-null/i.test(texto)) {
    return "La base rechazó un dato que no cumplía sus reglas, y no se guardó.";
  }
  if (/PGRST|column .* does not exist|relation .* does not exist|function .* does not exist/i.test(texto)) {
    return "Una consulta a la base falló. Hay que revisarlo: puede faltar una actualización.";
  }
  return "Algo falló en el programa. No se perdió nada que ya estuviera guardado; hay que revisarlo.";
}

/** Cada módulo, como se llama en el menú y como se nombra UNA cosa suya. */
const MODULO: Record<string, { nombre: string; uno?: string; una?: boolean }> = {
  facturacion: { nombre: "Facturación", uno: "factura", una: true },
  cotizaciones: { nombre: "Cotizaciones", uno: "cotización", una: true },
  pedidos: { nombre: "Pedidos", uno: "pedido" },
  compras: { nombre: "Compras", uno: "compra", una: true },
  recepciones: { nombre: "Recepciones", uno: "recepción", una: true },
  guias: { nombre: "Guías de remisión", uno: "guía", una: true },
  productos: { nombre: "Productos", uno: "producto" },
  clientes: { nombre: "Clientes", uno: "cliente" },
  proveedores: { nombre: "Proveedores", uno: "proveedor" },
  cobranzas: { nombre: "Cobranzas", uno: "cobro" },
  inventario: { nombre: "Inventario" },
  transporte: { nombre: "Transporte" },
  reportes: { nombre: "Informes" },
  dashboard: { nombre: "Inicio" },
  alertas: { nombre: "Alertas" },
  configuracion: { nombre: "Configuración" },
  sunat: { nombre: "SUNAT" },
  bitacora: { nombre: "Qué ha pasado" },
  actividad: { nombre: "Qué ha pasado" },
  equivalencias: { nombre: "Equivalencias" },
  importaciones: { nombre: "Importaciones" },
};

const ID = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;

/** «la ficha de una cotización», «la lista de compras», «al hacer una factura nueva». */
function lugar(ruta: string): string | null {
  const partes = ruta.split("?")[0]!.split("/").filter(Boolean);
  const m = partes[0] ? MODULO[partes[0]] : undefined;
  if (!m) return null;
  const articulo = m.una ? "una" : "un";
  if (partes.length === 1) return `la pantalla de ${m.nombre}`;
  if (!m.uno) return `una pantalla de ${m.nombre}`;
  const [, segunda, tercera] = partes;
  if (segunda === "nueva" || segunda === "nuevo") return `al hacer ${articulo} ${m.uno} ${m.una ? "nueva" : "nuevo"}`;
  if (segunda && ID.test(segunda)) {
    if (tercera === "editar") return `al editar ${articulo} ${m.uno}`;
    if (!tercera) return `la ficha de ${articulo} ${m.uno}`;
  }
  return `una pantalla de ${m.nombre}`;
}

/**
 * El titular de un fallo: DÓNDE pasó, en castellano (TR-11, 27/10).
 *
 * `origen` era `facturacion/detalleComprobante` o `navegador`, pintado en
 * `<code>`; la ruta, `/cotizaciones/513615be-…`. Willy no lee ninguna de las
 * dos. La frase de `fraseDelFallo` dice QUÉ pasó; esto dice dónde, y el
 * texto técnico se queda plegado para quien lo arregla.
 */
export function queFallo(origen: string, ruta: string | null): string {
  const donde = ruta ? lugar(ruta) : null;
  if (origen === "navegador") {
    return donde ? `Una pantalla dejó de responder: ${donde}` : "Una pantalla dejó de responder";
  }
  const modulo = MODULO[origen.split("/")[0] ?? ""];
  const base = modulo ? `Falló algo en ${modulo.nombre}` : "Falló algo en el servidor";
  return donde ? `${base}, en ${donde}` : base;
}
