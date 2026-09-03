/**
 * El comparador de proveedores.
 *
 * Willy pregunta por WhatsApp y le contestan por WhatsApp. Esto es la hoja
 * donde apunta lo que le dijeron y ve quién gana cada producto.
 *
 * ---------------------------------------------------------------------------
 * Comparar dos precios que no se pueden comparar
 * ---------------------------------------------------------------------------
 * Uno contesta «S/ 37.00 puesto» y otro «$ 9.00 más IGV». El primero parece
 * cuatro veces más caro y es el barato. Hay dos conversiones de por medio:
 *
 *   · la moneda, con el tipo de cambio del día;
 *   · el IGV, que en Perú va dentro o fuera según a quién le preguntes.
 *
 * Todo se lleva a **dólares sin IGV**, que es la unidad en la que piensa el
 * resto del sistema: `compra_items.costo_unitario` es neto —el IGV va aparte
 * en la cabecera— y el kardex trabaja en dólares (042).
 *
 * ---------------------------------------------------------------------------
 * La misma cuenta está en `v_comparativa_precios` (055), y es a propósito
 * ---------------------------------------------------------------------------
 * La vista la necesita para responder «¿a cuánto me lo dejó cada uno?» desde
 * cualquier pantalla sin cargar este módulo. Esta versión la necesita para
 * mover los números MIENTRAS se escriben, antes de guardar nada.
 *
 * Las dos tienen que dar lo mismo. El centinela de la 055 comprueba la vista
 * con un caso concreto —S/ 37.00 con IGV a 3.70 son $ 8.4746— y
 * `comparador.test.ts` comprueba esta con el mismo. Si alguien cambia una y no
 * la otra, uno de los dos falla.
 *
 * ---------------------------------------------------------------------------
 * Qué NO decide esto
 * ---------------------------------------------------------------------------
 * Propone al más barato y deja mover la elección. No agrupa por comodidad —«a
 * este ya le compras tres cosas, pídele la cuarta»— porque eso puede mandar a
 * comprarle caro a alguien para ahorrarse una llamada, y esa decisión es de
 * Willy. Lo que sí se enseña es cuánto cuesta esa comodidad: el resumen dice
 * qué se paga de más comprándoselo todo a uno.
 */

import { IGV } from "@rodatech/config";

/** Dos decimales, que es como se paga. */
function dos(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Cuatro, que es la precisión de `costo_unitario` en la base. */
function cuatro(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

export type Moneda = "USD" | "PEN";

export type EstadoRespuesta = "esperando" | "respondio" | "no_contesto" | "no_tiene";

export const ETIQUETA_RESPUESTA: Record<EstadoRespuesta, string> = {
  esperando: "Esperando",
  respondio: "Contestó",
  no_contesto: "No contestó",
  no_tiene: "No lo tiene",
};

/** Uno de los proveedores a los que se les preguntó. */
export interface ProveedorConsultado {
  consulta_proveedor_id: string;
  proveedor_id: string;
  proveedor: string;
  estado: EstadoRespuesta;
  moneda: Moneda;
  /** Obligatorio si la moneda es PEN; en dólares no hay nada que convertir. */
  tipo_cambio: number | null;
  incluye_igv: boolean;
  validez_hasta: string | null;
  /** El plazo que dio para todo, cuando no dijo uno por línea. */
  dias_entrega: number | null;
  nota: string | null;
  /**
   * Si es de Lima o del exterior. Decide el tipo de la compra que salga de
   * aquí y, con él, si lleva IGV — que no se puede deducir de la moneda: a un
   * proveedor local se le compra en dólares y su factura lleva IGV igual.
   */
  tipoProveedor: "local" | "importacion";
}

/** Un producto de la ronda. */
export interface ItemConsultado {
  item_id: string;
  producto_id: string;
  codigo: string;
  descripcion: string;
  marca: string | null;
  unidad: string;
  cantidad: number;
}

/** Lo que UN proveedor contestó de UN producto. */
export interface Respuesta {
  item_id: string;
  consulta_proveedor_id: string;
  /** En la moneda del proveedor y tal como la dijo, con o sin IGV. */
  costo_unitario: number | null;
  dias_entrega: number | null;
  disponible: boolean;
  nota: string | null;
}

/**
 * A dólares sin IGV.
 *
 * Devuelve `null` cuando falta el precio o cuando hay soles sin tipo de
 * cambio. Ese null es deliberado: **un precio que no se puede convertir no se
 * puede comparar**, y devolver el número en soles como si fuera dólares es
 * exactamente el fallo que la migración 042 documenta —el costo entra al
 * inventario multiplicado por casi cuatro y no salta ningún error—.
 */
export function aUsdSinIgv(
  costo: number | null,
  moneda: Moneda,
  tipoCambio: number | null,
  incluyeIgv: boolean,
): number | null {
  if (costo === null || !Number.isFinite(costo) || costo < 0) return null;

  let n = costo;
  if (moneda === "PEN") {
    if (tipoCambio === null || !Number.isFinite(tipoCambio) || tipoCambio <= 0) return null;
    n = n / tipoCambio;
  }
  if (incluyeIgv) n = n / (1 + IGV);

  return cuatro(n);
}

/**
 * El costo que se le pone a la COMPRA, en la moneda del proveedor.
 *
 * No es lo mismo que el de comparar. La compra se registra en la moneda de la
 * factura que el proveedor va a entregar —así se cuadra contra ella, 044— pero
 * `compra_items.costo_unitario` es neto: el IGV va aparte en la cabecera. Así
 * que aquí se quita el IGV y NO se convierte la moneda.
 *
 * Meterlo con IGV dentro haría que la compra se cobrara el 18 % dos veces.
 */
export function costoParaCompra(
  costo: number | null,
  incluyeIgv: boolean,
): number | null {
  if (costo === null || !Number.isFinite(costo) || costo < 0) return null;
  return cuatro(incluyeIgv ? costo / (1 + IGV) : costo);
}

/** Una celda de la rejilla, ya normalizada. */
export interface Celda {
  item_id: string;
  consulta_proveedor_id: string;
  proveedor: string;
  /**
   * Si de esta celda hay respuesta. No es lo mismo que `disponible`, y
   * confundirlas es lo que hacía que la rejilla le pusiera «no lo tiene» a
   * quien todavía no había contestado — que es acusarle de algo que no dijo,
   * y peor: da por cerrado lo que sigue abierto.
   */
  respondida: boolean;
  /** Como lo dijo, en su moneda. */
  costo: number | null;
  costoUsd: number | null;
  dias: number | null;
  disponible: boolean;
  nota: string | null;
}

export interface Ganador {
  consulta_proveedor_id: string;
  proveedor: string;
  costoUsd: number;
  dias: number | null;
  /**
   * Cuánto más caro era el segundo, por unidad y en dólares. Null si no hubo
   * segundo — que es un dato en sí: solo uno lo tiene.
   */
  ahorroUnitario: number | null;
  segundo: string | null;
}

export interface FilaComparada {
  item: ItemConsultado;
  /** Una por proveedor consultado, en el orden en que se preguntó. */
  celdas: Celda[];
  ganador: Ganador | null;
  /** Lo que costaría la cantidad pedida al ganador, en dólares. */
  totalGanador: number | null;
}

/**
 * Quién gana un producto.
 *
 * El más barato en dólares sin IGV. Empata el de plazo más corto, y después el
 * nombre — el orden tiene que ser estable o la pantalla decidiría distinto
 * entre dos cargas.
 *
 * **Un «no lo tengo» no compite**, y tampoco un hueco. Es la trampa de este
 * tipo de rejilla: si un vacío se leyera como cero, el que no contestó ganaría
 * siempre.
 */
export function ganadorDe(celdas: readonly Celda[]): Ganador | null {
  const validas = celdas.filter(
    (c): c is Celda & { costoUsd: number } => c.disponible && c.costoUsd !== null,
  );
  if (validas.length === 0) return null;

  const orden = [...validas].sort(
    (a, b) =>
      a.costoUsd - b.costoUsd ||
      (a.dias ?? Number.MAX_SAFE_INTEGER) - (b.dias ?? Number.MAX_SAFE_INTEGER) ||
      a.proveedor.localeCompare(b.proveedor),
  );

  const primero = orden[0];
  if (!primero) return null;
  const segundo = orden[1];

  return {
    consulta_proveedor_id: primero.consulta_proveedor_id,
    proveedor: primero.proveedor,
    costoUsd: primero.costoUsd,
    dias: primero.dias,
    ahorroUnitario: segundo ? cuatro(segundo.costoUsd - primero.costoUsd) : null,
    segundo: segundo?.proveedor ?? null,
  };
}

/** La rejilla entera. */
export function compararTodo(
  items: readonly ItemConsultado[],
  proveedores: readonly ProveedorConsultado[],
  respuestas: readonly Respuesta[],
): FilaComparada[] {
  const porClave = new Map<string, Respuesta>();
  for (const r of respuestas) {
    porClave.set(`${r.item_id}|${r.consulta_proveedor_id}`, r);
  }

  return items.map((item) => {
    const celdas: Celda[] = proveedores.map((p) => {
      const r = porClave.get(`${item.item_id}|${p.consulta_proveedor_id}`);
      const costo = r?.costo_unitario ?? null;
      return {
        item_id: item.item_id,
        consulta_proveedor_id: p.consulta_proveedor_id,
        proveedor: p.proveedor,
        respondida: r !== undefined,
        costo,
        costoUsd: aUsdSinIgv(costo, p.moneda, p.tipo_cambio, p.incluye_igv),
        // El plazo de la cabecera se hereda: casi siempre dan uno para todo.
        dias: r?.dias_entrega ?? p.dias_entrega ?? null,
        disponible: r?.disponible ?? false,
        nota: r?.nota ?? null,
      };
    });

    const ganador = ganadorDe(celdas);
    return {
      item,
      celdas,
      ganador,
      totalGanador: ganador ? dos(item.cantidad * ganador.costoUsd) : null,
    };
  });
}

export interface ResumenProveedor {
  consulta_proveedor_id: string;
  proveedor: string;
  estado: EstadoRespuesta;
  /** Cuántos de los productos pedidos puede servir. */
  cubre: number;
  /** Cuántos gana por precio. */
  gana: number;
  /** Lo que costaría comprarle solo lo que gana, en dólares. */
  totalGanado: number;
  /**
   * Lo que costaría comprárselo TODO a él. Null si no lo tiene todo — y ese
   * null es la respuesta a «¿puedo resolver esto con una sola llamada?».
   */
  totalSiTodo: number | null;
  /** El plazo más largo de lo que gana: es cuando llegaría el pedido. */
  diasMaximo: number | null;
}

export function resumirProveedores(
  filas: readonly FilaComparada[],
  proveedores: readonly ProveedorConsultado[],
): ResumenProveedor[] {
  return proveedores
    .map((p) => {
      let cubre = 0;
      let gana = 0;
      let totalGanado = 0;
      let totalSiTodo = 0;
      let completo = filas.length > 0;
      let diasMaximo: number | null = null;

      for (const fila of filas) {
        const celda = fila.celdas.find(
          (c) => c.consulta_proveedor_id === p.consulta_proveedor_id,
        );
        if (celda?.disponible && celda.costoUsd !== null) {
          cubre += 1;
          totalSiTodo += fila.item.cantidad * celda.costoUsd;
        } else {
          completo = false;
        }
        if (fila.ganador?.consulta_proveedor_id === p.consulta_proveedor_id) {
          gana += 1;
          totalGanado += fila.totalGanador ?? 0;
          if (celda?.dias != null) {
            diasMaximo = Math.max(diasMaximo ?? 0, celda.dias);
          }
        }
      }

      return {
        consulta_proveedor_id: p.consulta_proveedor_id,
        proveedor: p.proveedor,
        estado: p.estado,
        cubre,
        gana,
        totalGanado: dos(totalGanado),
        totalSiTodo: completo ? dos(totalSiTodo) : null,
        diasMaximo,
      };
    })
    .sort((a, b) => b.gana - a.gana || a.proveedor.localeCompare(b.proveedor));
}

export interface ResumenComparativa {
  productos: number;
  /** Cuántos no los tiene nadie. Son los que hay que salir a buscar. */
  sinNadie: number;
  /** Repartiendo cada producto con el que lo dio más barato. */
  totalRepartido: number;
  /**
   * El mejor proveedor que puede con TODO, si hay alguno, y lo que costaría.
   * Es la comparación honesta: repartir sale más barato, pero son tres
   * llamadas, tres pagos y tres entregas.
   */
  mejorUnico: { proveedor: string; total: number } | null;
  /** Lo que cuesta la comodidad de comprárselo todo a uno. */
  costeDeUnSoloProveedor: number | null;
  /** El plazo del pedido repartido: llega entero cuando llegue el último. */
  diasMaximo: number | null;
}

export function resumirComparativa(
  filas: readonly FilaComparada[],
  resumenes: readonly ResumenProveedor[],
): ResumenComparativa {
  const totalRepartido = dos(
    filas.reduce((s, f) => s + (f.totalGanador ?? 0), 0),
  );

  const completos = resumenes
    .filter((r): r is ResumenProveedor & { totalSiTodo: number } => r.totalSiTodo !== null)
    .sort((a, b) => a.totalSiTodo - b.totalSiTodo || a.proveedor.localeCompare(b.proveedor));

  const mejor = completos[0];

  let diasMaximo: number | null = null;
  for (const f of filas) {
    if (f.ganador?.dias != null) diasMaximo = Math.max(diasMaximo ?? 0, f.ganador.dias);
  }

  return {
    productos: filas.length,
    sinNadie: filas.filter((f) => f.ganador === null).length,
    totalRepartido,
    mejorUnico: mejor ? { proveedor: mejor.proveedor, total: mejor.totalSiTodo } : null,
    costeDeUnSoloProveedor: mejor ? dos(mejor.totalSiTodo - totalRepartido) : null,
    diasMaximo,
  };
}

/** Una compra propuesta, lista para `crear_compra`. */
export interface CompraPropuesta {
  consulta_proveedor_id: string;
  proveedor_id: string;
  proveedor: string;
  moneda: Moneda;
  tipo_cambio: number | null;
  tipo: "local" | "importacion";
  lineas: {
    producto_id: string;
    codigo: string;
    descripcion: string;
    cantidad: number;
    /** En la moneda del proveedor y **sin IGV**, que es lo que espera la tabla. */
    costo_unitario: number;
  }[];
  /** En la moneda del proveedor, sin IGV. */
  subtotal: number;
}

/**
 * Las compras que salen de la comparación.
 *
 * `eleccion` es item_id → consulta_proveedor_id. Lo que no esté ahí no se
 * compra: quien mira la pantalla puede dejar fuera una línea porque ya la
 * pidió, porque el precio no le convence o porque quiere esperar.
 *
 * Sale **una compra por proveedor**, que es como se pide de verdad. Los
 * importes van en la moneda de cada uno porque así se cuadran contra su
 * factura (044), y sin IGV porque la cabecera de la compra lo calcula aparte.
 */
export function comprasPropuestas(
  filas: readonly FilaComparada[],
  proveedores: readonly ProveedorConsultado[],
  eleccion: Readonly<Record<string, string>>,
): CompraPropuesta[] {
  const porId = new Map(proveedores.map((p) => [p.consulta_proveedor_id, p]));
  const compras = new Map<string, CompraPropuesta>();

  for (const fila of filas) {
    const elegido = eleccion[fila.item.item_id];
    if (!elegido) continue;

    const proveedor = porId.get(elegido);
    const celda = fila.celdas.find((c) => c.consulta_proveedor_id === elegido);
    if (!proveedor || !celda || !celda.disponible) continue;

    const costo = costoParaCompra(celda.costo, proveedor.incluye_igv);
    if (costo === null) continue;

    let compra = compras.get(elegido);
    if (!compra) {
      compra = {
        consulta_proveedor_id: elegido,
        proveedor_id: proveedor.proveedor_id,
        proveedor: proveedor.proveedor,
        moneda: proveedor.moneda,
        tipo_cambio: proveedor.tipo_cambio,
        tipo: proveedor.tipoProveedor,
        lineas: [],
        subtotal: 0,
      };
      compras.set(elegido, compra);
    }

    compra.lineas.push({
      producto_id: fila.item.producto_id,
      codigo: fila.item.codigo,
      descripcion: fila.item.descripcion,
      cantidad: fila.item.cantidad,
      costo_unitario: costo,
    });
    compra.subtotal = dos(compra.subtotal + fila.item.cantidad * costo);
  }

  return [...compras.values()].sort(
    (a, b) => b.lineas.length - a.lineas.length || a.proveedor.localeCompare(b.proveedor),
  );
}

/** La elección de partida: el ganador de cada producto que tenga uno. */
export function eleccionPorDefecto(
  filas: readonly FilaComparada[],
): Record<string, string> {
  const r: Record<string, string> = {};
  for (const fila of filas) {
    if (fila.ganador) r[fila.item.item_id] = fila.ganador.consulta_proveedor_id;
  }
  return r;
}

/**
 * La elección final: el ganador de cada producto, salvo lo que se movió a mano.
 *
 * ---------------------------------------------------------------------------
 * Por qué hace falta separar las dos cosas
 * ---------------------------------------------------------------------------
 * La primera versión guardaba una sola tabla de item → proveedor y, al llegar
 * una respuesta nueva, la mezclaba dando prioridad a lo que ya había. La
 * intención era «lo que movió la persona se respeta»; el efecto real fue otro:
 * como lo que ya había incluía los ganadores calculados, **el primer proveedor
 * que contestaba se quedaba con todo**, y el segundo no podía ganarle aunque
 * llegara más barato.
 *
 * Que es justo lo contrario de para lo que existe un comparador. Y pasa
 * siempre, porque las respuestas nunca llegan a la vez: se anota la del lunes
 * y la del miércoles.
 *
 * Así que solo se guarda lo que la persona TOCÓ. Todo lo demás se recalcula
 * con cada respuesta que entra.
 *
 * `null` en `aMano` significa «lo quitó a mano»: un producto que se decidió no
 * comprar no debe volver a aparecer porque llegue otra oferta.
 */
export function eleccionFinal(
  filas: readonly FilaComparada[],
  aMano: Readonly<Record<string, string | null>>,
): Record<string, string> {
  const r = eleccionPorDefecto(filas);
  for (const [item, elegido] of Object.entries(aMano)) {
    if (elegido === null) delete r[item];
    else r[item] = elegido;
  }
  return r;
}
