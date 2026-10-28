/**
 * La bitácora: quién cambió qué y cuándo.
 *
 * La escriben disparadores en la base (migración 051), no la aplicación. Aquí
 * solo vive cómo se lee: qué nombre le damos a cada tabla y a cada acción, que
 * es lo que separa una lista utilizable de un volcado de nombres técnicos.
 */

export interface Movimiento {
  id: number;
  usuario_nombre: string;
  usuario_id: string | null;
  accion: string;
  entidad: string;
  entidad_id: string | null;
  descripcion: string | null;
  creado_en: string;
  /**
   * El número o el nombre de lo que se tocó: «F002-00000356», «Juan Pérez»
   * (158). Sin él, una fila decía «Usuarios · Rol: gerencia → ventas» y no se
   * sabía de quién. Opcional para quien arma un Movimiento a mano.
   */
  referencia?: string | null;
  /** `{ antes, despues }` del disparador; en un cobro, también `comprobante_id`. */
  metadata?: Record<string, unknown> | null;
}

/**
 * Las tablas que se vigilan, con el nombre que usa quien trabaja aquí.
 *
 * La lista es la misma de la 051 y ese es el punto: lo que no está vigilado no
 * aparece, y lo que aparece tiene nombre en castellano. `permisos_rol` no le
 * dice nada a nadie; «permisos» sí.
 */
export const ETIQUETA_ENTIDAD: Record<string, string> = {
  comprobantes: "Facturas y boletas",
  cotizaciones: "Cotizaciones",
  // 158: eliminar un pedido, emitir o anular una guía y borrar un cobro no
  // dejaban rastro propio.
  pedidos: "Pedidos",
  guias_remision: "Guías de remisión",
  pagos: "Cobros",
  sunat_bajas: "Bajas en SUNAT",
  compras: "Compras",
  recepciones: "Recepciones",
  ajustes_inventario: "Ajustes de inventario",
  // `permisos_rol` se quitó en la 143; queda por las filas que ya lo dicen.
  permisos_rol: "Permisos",
  // Desde la 145: lo que cambia quién puede qué y adónde va el dinero.
  permisos: "Permisos",
  roles: "Roles",
  perfiles: "Usuarios",
  clientes: "Clientes",
  productos: "Productos",
  cuentas_bancarias: "Cuentas para cobrar",
  empresa: "Datos de la empresa",
  series_documento: "Series y numeración",
  config_sunat: "Configuración de SUNAT",
};

/**
 * En el orden en que se ofrecen para filtrar. `permisos_rol` no: se llama
 * igual que `permisos` y saldrían dos «Permisos» en el desplegable.
 */
export const ENTIDADES = Object.keys(ETIQUETA_ENTIDAD).filter((e) => e !== "permisos_rol");

export const ETIQUETA_ACCION: Record<string, string> = {
  creado: "Creado",
  cambiado: "Cambiado",
  borrado: "Borrado",
};

/**
 * El color de cada acción.
 *
 * Borrar es lo único que no tiene deshacer, así que es lo único en rojo. Si
 * todo llevara color, el rojo dejaría de significar nada.
 */
export const TONO_ACCION: Record<string, "neutral" | "info" | "danger"> = {
  creado: "info",
  cambiado: "neutral",
  borrado: "danger",
};

/**
 * A dónde lleva una fila, cuando el documento se puede abrir.
 *
 * Un borrado no enlaza (158): llevaba a /compras/<id> de una compra que ya no
 * existe. La excepción es el cobro, que no tiene ficha propia y lleva a su
 * factura, que sigue ahí aunque el cobro se haya borrado.
 */
export function enlaceDe(
  entidad: string,
  id: string | null,
  extra: { accion?: string; comprobanteId?: string | null } = {},
): string | null {
  if (entidad === "pagos") {
    return extra.comprobanteId ? `/facturacion/${extra.comprobanteId}` : null;
  }
  // Las pantallas de configuración no necesitan id: son una por tabla.
  switch (entidad) {
    case "perfiles":
      return "/configuracion/usuarios";
    case "permisos":
    case "permisos_rol":
    case "roles":
      return "/configuracion/permisos";
    case "series_documento":
    case "config_sunat":
      return "/configuracion/sunat";
    case "empresa":
    case "cuentas_bancarias":
      return "/configuracion/empresa";
    case "sunat_bajas":
      return "/sunat";
  }
  if (!id || extra.accion === "borrado") return null;
  switch (entidad) {
    case "comprobantes":
      return `/facturacion/${id}`;
    case "cotizaciones":
      return `/cotizaciones/${id}`;
    case "pedidos":
      return `/pedidos/${id}`;
    case "guias_remision":
      return `/guias/${id}`;
    case "compras":
      return `/compras/${id}`;
    case "recepciones":
      return `/recepciones/${id}`;
    case "clientes":
      return `/clientes/${id}`;
    case "productos":
      return `/productos/${id}`;
    case "ajustes_inventario":
      return `/inventario/ajustes/${id}`;
    default:
      // Un enlace roto es peor que ninguno.
      return null;
  }
}

/**
 * De qué es la fila, aunque la 158 no haya rellenado `referencia`: en un
 * borrado el número sigue en `metadata.antes`.
 */
/** Dónde guarda un borrado su número o su nombre, por orden de preferencia. */
export const CLAVES_DE_REFERENCIA = ["numero", "serie", "codigo", "razon_social", "nombre"] as const;

export function referenciaDe(m: Movimiento): string | null {
  if (m.referencia) return m.referencia;
  if (m.accion !== "borrado") return null;
  const antes = (m.metadata?.antes ?? null) as Record<string, unknown> | null;
  if (!antes || typeof antes !== "object") return null;
  for (const k of CLAVES_DE_REFERENCIA) {
    const v = antes[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** «Qué pasó»: los atajos para lo que se busca cuando algo falta. */
export const QUE_PASO = {
  // Corto: el desplegable enseña la opción elegida y a 1440 px «Solo
  // borrados y anulaciones» se cortaba en «Solo borrados y a».
  graves: "Borrados y anulaciones",
  precios: "Cambios de precio",
  permisos: "Permisos y usuarios",
} as const;

export type QuePaso = keyof typeof QUE_PASO;

/** Las tablas de «Permisos y usuarios». */
export const ENTIDADES_DE_PERMISOS = ["permisos_rol", "permisos", "roles", "perfiles"] as const;

/**
 * Lo que entró por cargas de datos: el maestro de productos (7 013 filas el
 * 20/10), el histórico de cotizaciones y facturas (07/10), los clientes y los
 * permisos que siembran las migraciones. Lo escribe «sistema» y no una
 * persona, y entierra lo demás: de 10 114 filas, 8 300 eran eso. Los
 * BORRADOS de sistema se ven siempre, porque son limpiezas y alguien
 * preguntará por ellas.
 *
 * Y solo lo de ANTES de `FIN_DE_LAS_CARGAS`. «Sistema» no es solo el Excel:
 * el envío a SUNAT escribe en `comprobantes` con la llave de servicio, sin
 * sesión, así que «SUNAT aceptó», «SUNAT rechazó» y las bajas también llegan
 * como sistema. Ocultar por tabla los habría escondido para siempre; por
 * fecha, lo que pase desde el pase a producción se ve siempre.
 */
export const ENTIDADES_DE_CARGA = [
  "productos",
  "cotizaciones",
  "comprobantes",
  "clientes",
  "permisos_rol",
] as const;

/**
 * El día siguiente a la última carga conocida (23/10: marcas por SQL y el
 * borrado del producto 20126), en hora de Lima. Una carga posterior se verá
 * en la lista: es el lado bueno para equivocarse.
 */
export const FIN_DE_LAS_CARGAS = "2026-10-24T00:00:00-05:00";

/** El valor de «Quién» para las filas sin persona. */
export const QUIEN_SISTEMA = "sistema";

export interface FiltrosBitacora {
  entidad?: string;
  usuario?: string;
  desde?: string;
  hasta?: string;
  /** «Buscar documento o persona»: número, nombre o quien lo hizo. */
  q?: string;
  /** «Qué pasó». */
  que?: string;
  /** Con las cargas de datos. Por defecto se ocultan. */
  cargas?: boolean;
  /** Cursor keyset: el `id` de la última fila de la página anterior. */
  cursor?: string;
  /**
   * Hacia dónde se mueve el cursor.
   *
   * `ant` es el mismo keyset del revés. La bitácora no salió en el recuento
   * del 10/09 —son diez tablas, y esta hace once— pero tenía el mismo
   * `cursorAnterior={null}` que las demás.
   */
  direccion?: "sig" | "ant";
  /** Filas por página, ya validado con `leerTamano`. */
  limite?: number;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * El día entero en hora de Lima, para filtrar un `timestamptz`.
 *
 * Iba en UTC (`T00:00:00Z`), y Lima es UTC−5: «hasta el 20/10» se paraba a
 * las 18:59 del 20, y «desde el 20/10» empezaba a las 19:00 del 19. La
 * aprobación de Willy del 20/10 a las 21:03 salía en el día 21. Perú no
 * cambia de hora en verano, así que el −05:00 es fijo.
 */
export function limitesDelDiaEnLima(
  desde?: string,
  hasta?: string,
): { desde: string | null; hasta: string | null } {
  return {
    desde: desde && FECHA.test(desde) ? `${desde}T00:00:00-05:00` : null,
    hasta: hasta && FECHA.test(hasta) ? `${hasta}T23:59:59.999-05:00` : null,
  };
}

/**
 * Lo que se escribe en «Buscar documento o persona», sin lo que rompería el
 * filtro de PostgREST: comas, paréntesis, comillas y comodines.
 */
export function textoDeBusqueda(q: string | undefined): string | null {
  if (!q) return null;
  const limpio = q.replace(/[,()"'\\%*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  return limpio.length > 0 ? limpio : null;
}

/**
 * Los campos vigilados, con el nombre que usa quien trabaja aquí.
 *
 * La descripción la arma la base con el nombre de la columna —`linea_credito:
 * 0.00 → 5000.00`— porque un disparador no tiene por qué saber de castellano.
 * Traducirlo es cosa de la pantalla, y es la diferencia entre una bitácora que
 * lee un programador y una que lee Willy.
 *
 * Están TODOS los que vigila algún disparador: `tipos.test.ts` lee las
 * migraciones y falla si alguien vigila un campo nuevo sin ponerle nombre.
 */
export const ETIQUETA_CAMPO: Record<string, string> = {
  estado: "Estado",
  estado_sunat: "Estado en SUNAT",
  motivo_anulacion: "Motivo de anulación",
  total: "Total",
  moneda: "Moneda",
  tipo_cambio: "Tipo de cambio",
  anulada: "Anulada",
  anulado: "Anulado",
  escribir: "Puede escribir",
  rol: "Rol",
  activo: "Activo",
  linea_credito: "Línea de crédito",
  dias_credito: "Días de crédito",
  bloqueado: "Bloqueado",
  precio_venta: "Precio de venta",
  precio_minimo: "Precio mínimo de venta",
  archivado: "Archivado",
  // Cobros (158), que la base describe con el monto y la forma de pago.
  monto: "Monto",
  medio: "Forma de pago",
  // Bajas en SUNAT: el código es la respuesta de SUNAT.
  codigo: "Respuesta de SUNAT",
  // Series (145).
  serie: "Serie",
  correlativo_inicial: "Empieza en el número",
  predeterminada: "Predeterminada",
  es_prueba: "Serie de prueba",
  // Configuración de SUNAT (145).
  ambiente: "Ambiente de SUNAT",
  usuario_sol: "Usuario SOL",
  certificado_nombre: "Certificado digital",
  certificado_caduca_en: "El certificado vence el",
  serie_factura: "Serie de factura",
  serie_boleta: "Serie de boleta",
  gre_client_id: "Clave para mandar guías a SUNAT",
  // Cuentas para cobrar y datos de la empresa (145).
  banco: "Banco",
  numero: "Número de cuenta",
  cci: "CCI",
  razon_social: "Razón social",
  ruc: "RUC",
  direccion: "Dirección",
  cuenta_corriente: "Cuenta corriente",
  cuenta_detraccion: "Cuenta de detracciones",
  igv_porcentaje: "IGV",
  retencion_porcentaje: "Retención",
  detraccion_porcentaje: "Detracción",
  detraccion_monto_minimo: "Detracción desde",
  agente_retencion: "Agente de retención",
  email: "Correo",
  // 171: el usuario con el que también se entra.
  usuario: "Usuario para entrar",
  telefono: "Teléfono",
  celular: "Celular",
};

/** Los estados, con la etiqueta de `EstadoBadge` (y los masculinos de la factura). */
const ETIQUETA_ESTADO: Record<string, string> = {
  borrador: "Borrador",
  enviada: "Enviada",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  atendida: "Atendida",
  anulada: "Anulada",
  vencida: "Vencida",
  emitida: "Emitida",
  emitido: "Emitido",
  parcial: "Pago parcial",
  pagado: "Pagado",
  pagada: "Pagada",
  vencido: "Vencido",
  anulado: "Anulado",
  registrada: "Registrada",
  recibida_parcial: "Parcial",
  recibida: "Recibida",
  pendiente: "Pendiente",
  no_enviado: "Sin enviar",
  enviado: "Enviado",
  aceptado: "Aceptado",
  aceptada: "Aceptada",
  observado: "Observado",
  rechazado: "Rechazado",
  baja_solicitada: "Baja pedida",
  baja_aceptada: "Dado de baja",
  error: "Con error",
};

/** Los seis roles de serie. Uno creado después sale con su clave. */
const ETIQUETA_ROL: Record<string, string> = {
  gerencia: "Gerencia",
  admin: "Administración",
  ventas: "Ventas",
  almacen: "Almacén",
  compras: "Compras",
  cobranzas: "Cobranzas",
};

const ETIQUETA_MEDIO: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  deposito: "Depósito",
  cheque: "Cheque",
  letra: "Letra",
  detraccion: "Detracción",
  retencion: "Retención",
  nota_credito: "Nota de crédito",
};

const ETIQUETA_OTROS: Record<string, Record<string, string>> = {
  ambiente: { beta: "Pruebas (beta)", produccion: "Producción" },
  moneda: { PEN: "Soles", USD: "Dólares" },
};

const MONTOS = new Set([
  "total",
  "monto",
  "linea_credito",
  "precio_venta",
  "precio_minimo",
  "detraccion_monto_minimo",
]);
const PORCENTAJES = new Set(["igv_porcentaje", "retencion_porcentaje", "detraccion_porcentaje"]);

const nfMonto = new Intl.NumberFormat("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nfNumero = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 4 });

/** Un valor de la descripción, dicho como se lee. «—» es «vacío» y se queda. */
function valor(campo: string, crudo: string): string {
  const v = crudo.trim();
  if (v === "—" || v === "") return "—";
  if (v === "true") return "sí";
  if (v === "false") return "no";
  if (campo === "estado" || campo === "estado_sunat") return ETIQUETA_ESTADO[v] ?? v;
  if (campo === "rol") return ETIQUETA_ROL[v] ?? v;
  if (campo === "medio") return ETIQUETA_MEDIO[v] ?? v;
  const otros = ETIQUETA_OTROS[campo]?.[v];
  if (otros) return otros;
  const n = Number(v);
  if (MONTOS.has(campo) && Number.isFinite(n)) return nfMonto.format(n);
  if (PORCENTAJES.has(campo) && Number.isFinite(n)) return `${nfNumero.format(n)} %`;
  // Una fecha ISO («2026-11-30» o con hora) se lee como en el resto del ERP.
  const f = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(v);
  if (f) return `${f[3]}/${f[2]}/${f[1]}`;
  return v;
}

/**
 * Los cambios que se dicen mejor con una frase que con «sí → no».
 * `activo: true → false` es «Lo dio de baja», no «Activo: sí → no».
 */
function frase(campo: string, antes: string, despues: string): string | null {
  const a = antes.trim();
  const d = despues.trim();
  if (campo === "activo") {
    if (a === "true" && d === "false") return "Lo dio de baja";
    if (a === "false" && d === "true") return "Lo reactivó";
  }
  if (campo === "anulada" || campo === "anulado") {
    const la = campo === "anulada" ? "La" : "Lo";
    if (d === "true") return `${la} anuló`;
    if (a === "true" && d === "false") return "Le quitó la anulación";
  }
  if (campo === "archivado") {
    if (d === "true") return "Lo archivó";
    if (a === "true" && d === "false") return "Lo sacó del archivo";
  }
  return null;
}

/**
 * La descripción, en castellano: el nombre del campo y también su valor.
 *
 * Antes solo se traducía el nombre, y salía «Activo: true → false», «Estado:
 * enviada → aprobada», «Rol: admin → almacen», «Total: 1234.5 → 1300».
 *
 * Un campo que no se conoce sale con su nombre técnico, que es feo pero
 * cierto. Inventarle una traducción sería peor.
 */
export function describir(descripcion: string | null): string {
  if (!descripcion) return "—";
  return descripcion
    .split(" · ")
    .map((trozo) => {
      const corte = trozo.indexOf(":");
      if (corte === -1) return trozo;
      const campo = trozo.slice(0, corte).trim();
      const etiqueta = ETIQUETA_CAMPO[campo];
      if (!etiqueta) return trozo;
      const resto = trozo.slice(corte + 1);
      const flecha = resto.indexOf(" → ");
      if (flecha === -1) return `${etiqueta}: ${valor(campo, resto)}`;
      const antes = resto.slice(0, flecha);
      const despues = resto.slice(flecha + 3);
      return (
        frase(campo, antes, despues) ??
        `${etiqueta}: ${valor(campo, antes)} → ${valor(campo, despues)}`
      );
    })
    .join(" · ");
}
