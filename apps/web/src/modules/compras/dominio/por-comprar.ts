/**
 * La bandeja «Por comprar».
 *
 * Willy, 01/09: *«si no tiene, que en compras le avise que no tiene y tiene
 * que pedir o comprar a sus proveedores»*. Esto es esa cuenta.
 *
 * ---------------------------------------------------------------------------
 * Por qué la resta no se puede hacer línea a línea
 * ---------------------------------------------------------------------------
 * `v_comprometido` (041) trae ya un `falta` por línea, y es correcto para lo
 * que aquella vista responde —«¿esta línea concreta se puede servir?»—. Pero
 * sumarlo NO da lo que hay que comprar, porque cada línea mira el stock
 * ENTERO, como si fuera solo para ella:
 *
 *     stock 10 · A confirmó 10 · B confirmó 10
 *       falta de A = 0     falta de B = 0     suma = 0
 *       y sin embargo hay que comprar 10.
 *
 * Con dos clientes esperando el mismo rodamiento, ese cero es una venta que no
 * se puede entregar. Por eso el reparto se hace aquí, una sola vez por
 * producto, y no se confía en la suma de los parciales.
 *
 * ---------------------------------------------------------------------------
 * A quién se le da el stock que hay
 * ---------------------------------------------------------------------------
 * Al que confirmó primero. Es la única regla que no hay que explicarle a un
 * cliente enfadado, y es la que Willy sigue de hecho. **No es una reserva**:
 * mientras `stock.reservado` siga sin usarse —está preguntado a Willy, y es la
 * primera de las cinco preguntas del plan— nada impide facturarle antes al
 * segundo. El reparto sirve para saber cuánto comprar y a quién avisar, no
 * para apartar mercadería.
 *
 * ---------------------------------------------------------------------------
 * Lo que ya viene en camino
 * ---------------------------------------------------------------------------
 * Se descuenta lo pedido y no recibido (`v_pedido_pendiente`, 045). Sin eso la
 * bandeja repite el mismo consejo cada día hasta que la mercadería llega, y
 * quien lo sigue compra dos veces.
 */

/** Una línea de `v_comprometido`: lo que un cliente confirmó y espera. */
export interface LineaComprometida {
  item_id: string;
  cotizacion_id: string;
  cotizacion: string;
  /** La de la cotización, `YYYY-MM-DD`. Es el reloj de la promesa. */
  fecha: string;
  cliente_id: string;
  cliente: string;
  producto_id: string;
  codigo: string;
  descripcion: string;
  marca: string | null;
  disponibilidad: "inmediata" | "exterior" | "fabricacion";
  /** Ya resuelto por la vista contra `dias_por_defecto()`. */
  dias_entrega: number | null;
  comprometido: number;
  /** El stock del PRODUCTO. Viene repetido en cada línea del mismo producto. */
  stock: number;
  /**
   * El costo con el que se cotizó esta línea, en dólares.
   *
   * Es una REFERENCIA, no un precio de compra: sale del maestro en el momento
   * de cotizar y puede tener meses. Sirve para ordenar por dinero y para saber
   * si lo que hay que comprar son cien dólares o diez mil; el precio de verdad
   * lo dirá el proveedor cuando conteste.
   */
  costo_referencia: number;
}

/** Una fila de `v_pedido_pendiente`: lo que ya se le pidió al proveedor. */
export interface PedidoPendiente {
  producto_id: string;
  pendiente: number;
  compras: number;
  proxima_llegada: string | null;
  primera_compra: string | null;
}

/** Una línea con su parte del stock ya asignada. */
export interface LineaRepartida extends LineaComprometida {
  /** Lo que sale del almacén, por orden de llegada. */
  cubierto: number;
  /** Lo que no. */
  descubierto: number;
  /** El día para el que se prometió, `YYYY-MM-DD`. */
  prometida: string;
}

/**
 * En qué situación está un producto de la bandeja.
 *
 * `en_camino` existe para no esconder la fila: el producto sigue sin poder
 * entregarse, y quien mira la bandeja necesita ver que ya se hizo algo —si no,
 * lo vuelve a pedir—. Pero no es lo mismo que un `comprar`, y no debe competir
 * por su atención.
 */
export type EstadoPorComprar = "comprar" | "en_camino";

/** Cuánto aprieta. Sale de la fecha prometida más cercana. */
export type Urgencia = "vencido" | "hoy" | "pronto" | "holgado";

export interface ProductoPorComprar {
  producto_id: string;
  codigo: string;
  descripcion: string;
  marca: string | null;
  /** Todo lo confirmado y no entregado, de todos los clientes. */
  comprometido: number;
  stock: number;
  /** Lo confirmado que el almacén no cubre. */
  sinCubrir: number;
  /** De eso, lo que ya está pedido a un proveedor. */
  pedido: number;
  /** Y lo que queda por pedir. **Es la cifra de la bandeja.** */
  falta: number;
  estado: EstadoPorComprar;
  /** El costo de referencia más reciente de sus líneas. */
  costoReferencia: number;
  /** Lo que costaría comprar lo que falta, con ese costo. Aproximado. */
  estimado: number;
  /** Cuántos clientes distintos lo esperan. */
  clientes: number;
  /** La fecha prometida más cercana de sus líneas descubiertas. */
  prometida: string;
  /** Días hasta esa fecha. Negativo = ya se pasó. */
  dias: number;
  urgencia: Urgencia;
  /** Cuándo llega lo que ya está pedido, si hay algo pedido. */
  proximaLlegada: string | null;
  /** Y en qué compra, para poder ir a verla. */
  primeraCompra: string | null;
  /** El detalle, en el orden en que se reparte el stock. */
  lineas: LineaRepartida[];
}

/** Dos decimales, que es lo que guardan las columnas `numeric(14,2)`. */
const dos = (n: number): number => Math.round(n * 100) / 100;

/**
 * El día para el que se prometió una línea.
 *
 * `inmediata` promete HOY —no la fecha de la cotización—: prometer entrega
 * inmediata el lunes no significa que el jueves lleve tres días de retraso,
 * significa que sigue debiéndose. Contarlo desde la cotización llenaría la
 * bandeja de rojos falsos y la haría inútil en una semana.
 */
export function fechaPrometida(
  linea: Pick<LineaComprometida, "fecha" | "disponibilidad" | "dias_entrega">,
  hoy: string,
  sumar: (fecha: string, dias: number) => string,
): string {
  if (linea.disponibilidad === "inmediata") return hoy;
  const dias = linea.dias_entrega;
  if (dias === null || !Number.isFinite(dias) || dias <= 0) return linea.fecha;
  return sumar(linea.fecha, Math.round(dias));
}

/** Días de `desde` a `hasta`. Ambas `YYYY-MM-DD`. */
export function diasEntre(desde: string, hasta: string): number {
  // Mediodía en Lima para las dos, así que ni el huso ni un cambio de hora
  // pueden convertir una diferencia de 3 días en 2,96.
  const a = Date.parse(`${desde}T12:00:00-05:00`);
  const b = Date.parse(`${hasta}T12:00:00-05:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Cuánto aprieta, a partir de los días que quedan.
 *
 * Tres días de margen porque un rodamiento que no está en Lima tarda eso en
 * conseguirse con un proveedor local; por debajo de eso ya no da tiempo a
 * comparar precios, que es justo lo que la bandeja intenta que se pueda hacer.
 */
export function urgenciaDe(dias: number): Urgencia {
  if (dias < 0) return "vencido";
  if (dias === 0) return "hoy";
  if (dias <= 3) return "pronto";
  return "holgado";
}

/** Lo que se lee en pantalla. */
export const ETIQUETA_URGENCIA: Record<Urgencia, string> = {
  vencido: "Vencido",
  hoy: "Para hoy",
  pronto: "Esta semana",
  holgado: "Con margen",
};

const ORDEN_URGENCIA: Record<Urgencia, number> = {
  vencido: 0,
  hoy: 1,
  pronto: 2,
  holgado: 3,
};

/**
 * De las líneas confirmadas a la lista de lo que hay que comprar.
 *
 * Solo salen los productos que el almacén NO cubre: lo que está en stock no es
 * un problema de compras. Un producto cuyo faltante ya está pedido entero sale
 * igualmente, marcado `en_camino`, por lo dicho arriba.
 */
export function agruparPorComprar(
  lineas: readonly LineaComprometida[],
  pedidos: readonly PedidoPendiente[],
  hoy: string,
  sumar: (fecha: string, dias: number) => string,
): ProductoPorComprar[] {
  const enCamino = new Map(pedidos.map((p) => [p.producto_id, p]));

  const grupos = new Map<string, LineaComprometida[]>();
  for (const l of lineas) {
    const previas = grupos.get(l.producto_id);
    if (previas) previas.push(l);
    else grupos.set(l.producto_id, [l]);
  }

  const filas: ProductoPorComprar[] = [];

  for (const [producto_id, delProducto] of grupos) {
    const cabecera = delProducto[0];
    if (!cabecera) continue;

    // Por orden de confirmación. El número de cotización desempata porque dos
    // del mismo día tienen que repartirse siempre igual: si el orden bailara
    // entre dos cargas de la pantalla, el reparto cambiaría solo.
    const ordenadas = [...delProducto].sort(
      (a, b) => a.fecha.localeCompare(b.fecha) || a.cotizacion.localeCompare(b.cotizacion),
    );

    let resto = Math.max(cabecera.stock, 0);
    const repartidas: LineaRepartida[] = ordenadas.map((l) => {
      const cubierto = dos(Math.min(resto, l.comprometido));
      resto = dos(resto - cubierto);
      return {
        ...l,
        cubierto,
        descubierto: dos(l.comprometido - cubierto),
        prometida: fechaPrometida(l, hoy, sumar),
      };
    });

    const comprometido = dos(repartidas.reduce((a, l) => a + l.comprometido, 0));
    const sinCubrir = dos(repartidas.reduce((a, l) => a + l.descubierto, 0));
    if (sinCubrir <= 0) continue;

    const camino = enCamino.get(producto_id);
    const pedido = dos(Math.max(camino?.pendiente ?? 0, 0));
    const falta = dos(Math.max(sinCubrir - pedido, 0));

    // Manda la más apretada de sus líneas: el producto no puede estar tranquilo
    // si uno de los clientes que lo espera ya lleva esperando de más. Y solo
    // cuentan las descubiertas — a quien ya se le puede servir del almacén no
    // le corre prisa ninguna compra.
    const prometida = repartidas
      .filter((l) => l.descubierto > 0)
      .reduce((min, l) => (l.prometida < min ? l.prometida : min), "9999-12-31");
    const dias = diasEntre(hoy, prometida);

    // El de la cotización más reciente, que es el que menos ha envejecido.
    // `ordenadas` va de la más vieja a la más nueva, así que es la última con
    // un costo puesto: un cero no es un costo, es que nadie lo llenó.
    const costoReferencia =
      [...repartidas].reverse().find((l) => l.costo_referencia > 0)?.costo_referencia ?? 0;

    filas.push({
      producto_id,
      codigo: cabecera.codigo,
      descripcion: cabecera.descripcion,
      marca: cabecera.marca,
      comprometido,
      stock: dos(cabecera.stock),
      sinCubrir,
      pedido,
      falta,
      estado: falta > 0 ? "comprar" : "en_camino",
      costoReferencia,
      estimado: dos(falta * costoReferencia),
      clientes: new Set(repartidas.map((l) => l.cliente_id)).size,
      prometida,
      dias,
      urgencia: urgenciaDe(dias),
      proximaLlegada: camino?.proxima_llegada ?? null,
      primeraCompra: camino?.primera_compra ?? null,
      lineas: repartidas,
    });
  }

  return filas.sort(
    (a, b) =>
      // Lo que hay que comprar antes que lo que ya viene: son dos bandejas
      // distintas puestas en la misma tabla.
      Number(a.estado === "en_camino") - Number(b.estado === "en_camino") ||
      ORDEN_URGENCIA[a.urgencia] - ORDEN_URGENCIA[b.urgencia] ||
      a.prometida.localeCompare(b.prometida) ||
      b.falta - a.falta ||
      a.codigo.localeCompare(b.codigo),
  );
}

/** El resumen de la cabecera: lo que se ve sin leer la tabla. */
export interface ResumenPorComprar {
  productos: number;
  porComprar: number;
  enCamino: number;
  vencidos: number;
  clientes: number;
  /** Aproximado, con costos de referencia. Solo de lo que falta comprar. */
  estimado: number;
}

export function resumirPorComprar(
  filas: readonly ProductoPorComprar[],
): ResumenPorComprar {
  const clientes = new Set<string>();
  for (const f of filas) for (const l of f.lineas) clientes.add(l.cliente_id);
  return {
    productos: filas.length,
    porComprar: filas.filter((f) => f.estado === "comprar").length,
    enCamino: filas.filter((f) => f.estado === "en_camino").length,
    vencidos: filas.filter((f) => f.urgencia === "vencido").length,
    clientes: clientes.size,
    estimado: dos(filas.reduce((a, f) => a + f.estimado, 0)),
  };
}
