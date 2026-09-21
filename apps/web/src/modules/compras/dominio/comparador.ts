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
  /**
   * Cuántas tiene. `null` = las que se le pidieron (090).
   *
   * Willy, 21/09: *«no siempre todos cuentan con el stock solicitado, a veces
   * tienen stock parcial y habría que completar con los demás»*.
   */
  cantidad_disponible?: number | null;
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
   * Si a este proveedor se le preguntó por este producto (058).
   *
   * Con productos de proveedores distintos, la mitad de la rejilla son
   * cruces que nunca se preguntaron: al de retenes no se le pidió precio de
   * las chapas. Sin esto, esos huecos se leían como respuestas que faltan.
   */
  preguntada: boolean;
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
  /** Cuántas tiene. `null` = las que se le pidieron (090). */
  cantidadDisponible: number | null;
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
  /**
   * Qué se le preguntó a quién, como `item_id|consulta_proveedor_id`. Vacío
   * significa «a todos, todo», que es lo que valía antes de la 058 y sigue
   * valiendo cuando la ronda se hizo así.
   */
  preguntadas?: ReadonlySet<string>,
): FilaComparada[] {
  const porClave = new Map<string, Respuesta>();
  for (const r of respuestas) {
    porClave.set(`${r.item_id}|${r.consulta_proveedor_id}`, r);
  }

  return items.map((item) => {
    const celdas: Celda[] = proveedores.map((p) => {
      const clave = `${item.item_id}|${p.consulta_proveedor_id}`;
      const r = porClave.get(clave);
      const costo = r?.costo_unitario ?? null;
      return {
        item_id: item.item_id,
        consulta_proveedor_id: p.consulta_proveedor_id,
        proveedor: p.proveedor,
        preguntada: preguntadas === undefined || preguntadas.has(clave),
        respondida: r !== undefined,
        costo,
        costoUsd: aUsdSinIgv(costo, p.moneda, p.tipo_cambio, p.incluye_igv),
        // El plazo de la cabecera se hereda: casi siempre dan uno para todo.
        dias: r?.dias_entrega ?? p.dias_entrega ?? null,
        disponible: r?.disponible ?? false,
        cantidadDisponible: r?.cantidad_disponible ?? null,
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
  /**
   * Cuántos hay que salir a buscar de verdad.
   *
   * ---------------------------------------------------------------------------
   * Lo que contaba antes, y por qué estaba mal
   * ---------------------------------------------------------------------------
   * Era `ganador === null`, o sea «todavía no hay una oferta ganadora». Y eso
   * es cierto también cuando **acabas de mandar la consulta y nadie ha
   * contestado**, que es el estado normal de una ronda recién abierta.
   *
   * Resultado: nada más crear la ronda, la pantalla decía «2 productos no los
   * tiene nadie. Esos hay que buscarlos fuera» con los dos proveedores en
   * «Esperando». Luis lo vio el 09/09 y tenía toda la razón en desconfiar: la
   * pantalla mandaba a buscar proveedores nuevos mientras esperaba respuesta
   * de los que ya tenía.
   *
   * Ahora solo cuenta lo que de verdad está cerrado en falso:
   *
   *   · a nadie se le preguntó por ese producto, o
   *   · se preguntó, todos contestaron, y todos dijeron que no lo tienen.
   *
   * Una fila con alguien pendiente de contestar NO entra: sigue viva.
   */
  sinNadie: number;
  /**
   * Preguntados y sin respuesta todavía. Es lo que queda por esperar, no lo
   * que hay que buscar, y por eso va en su propia cifra.
   */
  esperando: number;
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

  /*
    Una fila sigue viva mientras quede alguien por contestar.

    `preguntada` y `respondida` ya existían en la celda —se añadieron en la 058
    justo para no confundir «no me ha contestado» con «me dijo que no»— y el
    resumen no las estaba usando.
  */
  const pendiente = (f: FilaComparada) =>
    f.celdas.some((c) => c.preguntada && !c.respondida);

  return {
    productos: filas.length,
    // Sin ganador Y sin nadie a quien esperar: o no se preguntó, o todos
    // dijeron que no. Esos sí hay que buscarlos fuera.
    sinNadie: filas.filter((f) => f.ganador === null && !pendiente(f)).length,
    esperando: filas.filter((f) => f.ganador === null && pendiente(f)).length,
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
 * Sale **una compra por proveedor**, que es como se pide de verdad. Los
 * importes van en la moneda de cada uno porque así se cuadran contra su
 * factura (044), y sin IGV porque la cabecera de la compra lo calcula aparte.
 *
 * ---------------------------------------------------------------------------
 * Un producto puede ir a VARIOS proveedores
 * ---------------------------------------------------------------------------
 * Willy, 21/09: *«a veces tienen stock parcial y habría que completar con los
 * demás»*. Así que lo normal ya no es «este producto se lo compro a este»,
 * sino el reparto de `repartir()`: el más barato hasta donde llegue, y el
 * resto al siguiente.
 *
 * Hasta hoy `eleccion` mandaba siempre y era item → UN proveedor, con lo que
 * el caso de Willy no se podía ni expresar: se compraban las 10 al que solo
 * tenía 6.
 *
 * ---------------------------------------------------------------------------
 * `eleccion` sigue eligiendo: el reparto la COMPLETA
 * ---------------------------------------------------------------------------
 * El elegido va primero y se le compra todo lo que tenga; solo lo que no
 * alcance pasa al siguiente más barato. Así una elección a mano se respeta
 * —hay motivos que el sistema no sabe— y a la vez el pedido no llega corto.
 *
 * Si el elegido tiene de sobra, esto da exactamente lo de antes: una compra,
 * todas las unidades. Por eso las rondas en las que nadie dijo cuántas tenía
 * se comportan igual que siempre.
 *
 * Lo que no esté en `eleccion` NO se compra: se puede dejar una línea fuera
 * porque ya se pidió o porque no convence el precio.
 */
export function comprasPropuestas(
  filas: readonly FilaComparada[],
  proveedores: readonly ProveedorConsultado[],
  eleccion: Readonly<Record<string, string>>,
): CompraPropuesta[] {
  const porId = new Map(proveedores.map((p) => [p.consulta_proveedor_id, p]));
  const compras = new Map<string, CompraPropuesta>();

  /** Mete una cantidad de un producto en la compra de un proveedor. */
  const anotar = (
    cpId: string,
    fila: FilaComparada,
    cantidad: number,
    costoMoneda: number | null,
  ) => {
    const proveedor = porId.get(cpId);
    if (!proveedor || cantidad <= 0) return;

    const costo = costoParaCompra(costoMoneda, proveedor.incluye_igv);
    if (costo === null) return;

    let compra = compras.get(cpId);
    if (!compra) {
      compra = {
        consulta_proveedor_id: cpId,
        proveedor_id: proveedor.proveedor_id,
        proveedor: proveedor.proveedor,
        moneda: proveedor.moneda,
        tipo_cambio: proveedor.tipo_cambio,
        tipo: proveedor.tipoProveedor,
        lineas: [],
        subtotal: 0,
      };
      compras.set(cpId, compra);
    }

    compra.lineas.push({
      producto_id: fila.item.producto_id,
      codigo: fila.item.codigo,
      descripcion: fila.item.descripcion,
      cantidad,
      costo_unitario: costo,
    });
    compra.subtotal = dos(compra.subtotal + cantidad * costo);
  };

  for (const fila of filas) {
    const elegido = eleccion[fila.item.item_id];
    if (!elegido) continue;

    /*
      El elegido tiene que poder venderlo. Si no, la fila no se compra.

      Elegir a alguien que contestó «no lo tengo» no es una invitación a
      comprárselo a otro: es una elección que ya no vale. Quitarlo y dejar que
      el reparto buscara al siguiente cambiaría de proveedor sin decirlo — y
      con el precio que sale en pantalla siendo el del elegido.

      Esta guarda estaba antes del 21/09 y se perdió al meter el reparto. La
      recuperan dos tests que empezaron a fallar: «no propone comprarle a quien
      dijo que no lo tiene» y el de los soles sin tipo de cambio.
    */
    const suya = fila.celdas.find((c) => c.consulta_proveedor_id === elegido);
    if (!suya || !suya.disponible) continue;
    if (costoParaCompra(suya.costo, porId.get(elegido)?.incluye_igv ?? false) === null) continue;

    /*
      Lo que no se puede convertir a dólares no se puede repartir.

      Una celda en soles sin tipo de cambio tiene `costoUsd` en null: no se
      puede ordenar por precio, así que no puede entrar en un reparto que se
      ordena por precio. Pero la COMPRA sí vale —el importe va en soles y no
      necesita conversión—, y es lo que hace la 044.

      Así que en ese caso se compra entera al elegido, como antes del 21/09.
      Lo caza un test que ya existía; sin esta rama, un proveedor en soles sin
      TC dejaba de poder comprarse.
    */
    if (suya.costoUsd === null) {
      anotar(elegido, fila, fila.item.cantidad, suya.costo);
      continue;
    }

    // El elegido primero; el resto solo completa lo que no alcance.
    for (const tramo of repartir(fila, elegido).tramos) {
      const celda = fila.celdas.find(
        (c) => c.consulta_proveedor_id === tramo.consulta_proveedor_id,
      );
      if (!celda) continue;
      anotar(tramo.consulta_proveedor_id, fila, tramo.cantidad, celda.costo);
    }
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

/**
 * En qué punto está un producto de la rejilla.
 *
 * Existe porque «nadie lo tiene» se estaba diciendo antes de que nadie hubiera
 * contestado. Es el mismo error que la rejilla tenía en las celdas —dar por
 * cerrada una pregunta abierta— pero en la columna que resume la fila, que es
 * la que se lee para decidir.
 *
 *  · `esperando` — se le preguntó a alguien y todavía no ha contestado. No se
 *    sabe nada; perseguir.
 *  · `nadie` — todos los que podían contestar dijeron que no lo tienen. Ahí sí
 *    hay que buscar fuera.
 *  · `sin_preguntar` — no se le preguntó a nadie. Es un descuido al armar la
 *    consulta, no una respuesta del mercado.
 *  · `resuelto` — hay al menos una oferta y por tanto un ganador.
 */
export type EstadoFila = "resuelto" | "esperando" | "nadie" | "sin_preguntar";

export function estadoDeFila(fila: FilaComparada): EstadoFila {
  if (fila.ganador) return "resuelto";

  const preguntadas = fila.celdas.filter((c) => c.preguntada);
  if (preguntadas.length === 0) return "sin_preguntar";
  if (preguntadas.some((c) => !c.respondida)) return "esperando";
  return "nadie";
}

// ---------------------------------------------------------------------------
// El reparto entre proveedores
// ---------------------------------------------------------------------------

/** Un tramo del reparto: a quién se le compran cuántas y a cuánto. */
export interface Tramo {
  consulta_proveedor_id: string;
  proveedor: string;
  cantidad: number;
  costoUsd: number;
  dias: number | null;
}

export interface Reparto {
  tramos: Tramo[];
  /** Lo que se consigue cubrir. Puede ser menos de lo que hace falta. */
  cubierto: number;
  /** Lo que falta por cubrir: nadie tiene tanto. */
  falta: number;
  /**
   * El costo unitario PONDERADO de lo que se consigue.
   *
   * Es el número con el que hay que trabajar, y es lo que pidió Willy: *«al
   * final el precio de compra sería el promedio ponderado de los mejores
   * precios»*. `null` si no se cubre nada.
   */
  costoPonderado: number | null;
}

/**
 * Repartir lo que hace falta entre los proveedores, del más barato al más caro.
 *
 * Willy, 21/09, por chat, y es el algoritmo tal como lo dictó:
 *
 *   *«se tomaría el 1er mejor precio con la cantidad que tiene; si falta,
 *   entonces se promedia con el 2do mejor precio con la cantidad que tenga; si
 *   falta, se incluye en el promedio el 3er mejor precio, y así
 *   sucesivamente»*.
 *
 * Su ejemplo: hacen falta 10; B lo tiene a $6 pero solo 6 unidades, A lo tiene
 * a $8 y le sobra. Sale 6 × $6 + 4 × $8 = $68 → **$6.80** la unidad.
 *
 * ---------------------------------------------------------------------------
 * Por qué no basta con el ganador
 * ---------------------------------------------------------------------------
 * `ganadorDe` contesta «¿quién está más barato?», que es otra pregunta. Hasta
 * hoy el comparador daba por hecho que el ganador tenía todo —Willy lo dijo
 * así: *«se está considerando que todos tienen stock suficiente»*— y proponía
 * comprar las 10 a $6. Ese precio no existe: a $6 solo hay 6.
 *
 * Y no es un decimal de más. El margen se calcula sobre el costo (023), así
 * que un costo que no se puede pagar es un margen que no se va a cobrar.
 *
 * ---------------------------------------------------------------------------
 * `null` en la cantidad significa «tiene las que hagan falta»
 * ---------------------------------------------------------------------------
 * Es lo que valen todas las respuestas anteriores al 090 y lo que se quiere
 * cuando el proveedor no dice nada de stock. Tratarlo como 0 dejaría todas las
 * rondas viejas sin ningún reparto posible.
 */
export function repartir(fila: FilaComparada, preferido?: string): Reparto {
  const necesarias = fila.item.cantidad;

  const ofertas = fila.celdas
    .filter(
      (c): c is Celda & { costoUsd: number } =>
        c.disponible && c.costoUsd !== null && c.costoUsd >= 0,
    )
    .sort(
      (a, b) =>
        /*
          El elegido va PRIMERO, si se eligió a alguien.

          El reparto COMPLETA una decisión, no la sustituye. Si quien mira la
          pantalla puso a un proveedor —porque le debe un favor, porque tiene
          crédito con él, porque el barato tarda tres semanas—, se empieza por
          él y solo se completa con los demás lo que no alcance. Es lo que dijo
          Willy: *«se tomaría el 1er mejor precio con la cantidad que tiene; si
          falta, entonces se promedia con el 2do»*. Lo que cambia con una
          elección a mano es quién es «el primero».
        */
        Number(b.consulta_proveedor_id === preferido) -
          Number(a.consulta_proveedor_id === preferido) ||
        a.costoUsd - b.costoUsd ||
        (a.dias ?? Number.MAX_SAFE_INTEGER) - (b.dias ?? Number.MAX_SAFE_INTEGER) ||
        a.proveedor.localeCompare(b.proveedor),
    );

  const tramos: Tramo[] = [];
  let pendiente = necesarias;
  let importe = 0;

  for (const o of ofertas) {
    if (pendiente <= 0) break;
    // Sin dato, tiene lo que haga falta. Con dato, lo que dijo.
    const puede = o.cantidadDisponible === null ? pendiente : o.cantidadDisponible;
    const toma = Math.min(puede, pendiente);
    if (toma <= 0) continue;

    tramos.push({
      consulta_proveedor_id: o.consulta_proveedor_id,
      proveedor: o.proveedor,
      cantidad: dos(toma),
      costoUsd: o.costoUsd,
      dias: o.dias,
    });
    importe += toma * o.costoUsd;
    pendiente -= toma;
  }

  const cubierto = dos(necesarias - Math.max(pendiente, 0));

  return {
    tramos,
    cubierto,
    falta: dos(Math.max(pendiente, 0)),
    /*
      El ponderado se calcula sobre lo CUBIERTO, no sobre lo que hacía falta.

      Si hacen falta 10 y solo se consiguen 8, el costo de esas 8 es el de las
      8. Dividir entre 10 daría un unitario más barato de lo que nadie te
      vendió — y encima mejoraría cuanto menos consigas, que es al revés de la
      realidad.
    */
    costoPonderado: cubierto > 0 ? cuatro(importe / cubierto) : null,
  };
}
