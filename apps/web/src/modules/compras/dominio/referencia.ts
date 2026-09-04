/**
 * Contra qué se compara el precio que te acaban de dar.
 *
 * ---------------------------------------------------------------------------
 * El agujero que esto tapa
 * ---------------------------------------------------------------------------
 * Hasta ahora el panel de respuestas pedía un número **a ciegas**: se escribía
 * «15.20» sin nada al lado que dijera si eso es caro o barato. La comparativa
 * responde «¿quién de estos tres es el más barato?», que no es la pregunta que
 * se hace quien está tecleando. La suya es:
 *
 *     ¿esto es mejor o peor de lo que ya conseguía?
 *     ¿me queda margen si lo vendo a mi precio?
 *
 * El más barato de tres puede ser el más caro de tu historia, y la rejilla
 * sola lo daría por ganador sin decir nada.
 *
 * ---------------------------------------------------------------------------
 * Tres referencias, y no una
 * ---------------------------------------------------------------------------
 * 1. **Lo que ya pagaste** (`proveedor_productos`, se llena solo con cada
 *    compra). Es el dato más fuerte: no es una promesa, es una factura.
 * 2. **Lo que te cotizaron antes** (rondas anteriores). Más débil —puede que
 *    nunca se le comprara— pero más fresco y más amplio.
 * 3. **Tu precio de venta y tu piso** (P.V. y P.M. del maestro). Es lo que
 *    convierte «me lo dejan a 12» en «entonces pierdo plata».
 *
 * Todo en dólares sin IGV, que es la única forma de que los tres números
 * signifiquen lo mismo. La conversión la hace `aUsdSinIgv` del comparador.
 *
 * Sin dependencias: se prueba entero y lo usan un componente de cliente y uno
 * de servidor.
 */

/** Uno que se sabe que lo vende, haya entrado en la ronda o no. */
export interface ProveedorConocido {
  proveedor_id: string;
  proveedor: string;
  /** Lo último que cobró, en USD. `null` = nunca se le ha comprado. */
  ultimoCostoUsd: number | null;
  ultimaCompra: string | null;
  activo: boolean;
  esHabitual: boolean;
}

/** Lo que alguien dijo en una ronda ANTERIOR. */
export interface PrecioPrevio {
  fecha: string;
  proveedor: string;
  costoUsd: number;
}

/** Todo lo que se sabe de un producto antes de escribir un precio nuevo. */
export interface Referencia {
  producto_id: string;
  /** `productos.ultimo_costo`: la última entrada del kardex, en USD. */
  ultimoCosto: number | null;
  /** `productos.costo_promedio`: el ponderado que lleva el kardex. */
  costoPromedio: number | null;
  /** P.V. — la lista vigente. */
  precioVenta: number | null;
  /** P.M. — el piso DURO de venta. 0 en la base significa «sin definir». */
  precioMinimo: number | null;
  proveedores: ProveedorConocido[];
  historial: PrecioPrevio[];
}

/** De dónde salió el número a batir. Cambia lo que se puede afirmar de él. */
export type Origen = "comprado" | "cotizado";

export interface Conocido {
  costoUsd: number;
  proveedor: string;
  fecha: string | null;
  origen: Origen;
}

/**
 * El número a batir: lo más barato que consta, venga de una factura o de una
 * cotización anterior.
 *
 * Se queda con el más barato **de los dos orígenes juntos** y no con el más
 * reciente. Lo que interesa saber es si hoy te están dando el mejor precio que
 * has tenido, no el mejor de esta semana.
 *
 * Empate: gana lo comprado. Un precio que ya se pagó vale más que uno que solo
 * se prometió.
 */
export function mejorConocido(ref: Referencia): Conocido | null {
  const candidatos: Conocido[] = [];

  for (const p of ref.proveedores) {
    if (p.ultimoCostoUsd === null || p.ultimoCostoUsd <= 0) continue;
    candidatos.push({
      costoUsd: p.ultimoCostoUsd,
      proveedor: p.proveedor,
      fecha: p.ultimaCompra,
      origen: "comprado",
    });
  }

  for (const h of ref.historial) {
    if (h.costoUsd <= 0) continue;
    candidatos.push({
      costoUsd: h.costoUsd,
      proveedor: h.proveedor,
      fecha: h.fecha,
      origen: "cotizado",
    });
  }

  if (candidatos.length === 0) return null;

  return candidatos.reduce((mejor, c) => {
    if (c.costoUsd < mejor.costoUsd) return c;
    if (c.costoUsd === mejor.costoUsd && c.origen === "comprado") return c;
    return mejor;
  });
}

export interface ContraReferencia {
  mejor: Conocido;
  /** Positivo = te lo están dejando MÁS CARO que antes. */
  diferencia: number;
  /** La misma diferencia en % sobre el conocido. */
  porcentaje: number;
  veredicto: "mejor" | "igual" | "peor";
}

/**
 * Cuánto mejor o peor es este precio que el mejor que ya se tenía.
 *
 * El «igual» tiene holgura de medio céntimo: comparar dos `numeric(14,4)` con
 * `===` deja diferencias de 0.0001 saliendo como «más caro», y eso es ruido,
 * no información.
 */
export function contraReferencia(
  costoUsd: number | null,
  ref: Referencia,
): ContraReferencia | null {
  if (costoUsd === null || !Number.isFinite(costoUsd) || costoUsd <= 0) return null;
  const mejor = mejorConocido(ref);
  if (mejor === null) return null;

  const diferencia = redondear(costoUsd - mejor.costoUsd, 4);
  const porcentaje = redondear((diferencia / mejor.costoUsd) * 100, 1);

  return {
    mejor,
    diferencia,
    porcentaje,
    veredicto: Math.abs(diferencia) < 0.005 ? "igual" : diferencia < 0 ? "mejor" : "peor",
  };
}

/**
 * Un porcentaje deja de decir algo mucho antes de lo que uno cree.
 *
 * Visto en pantalla: «+$34.80 · 17400% más caro». El 17400 no añade nada que
 * no dijeran ya los 34.80 —de hecho distrae de ellos— y aparece siempre que la
 * referencia es un céntimo, que con un catálogo a medio cargar es a menudo.
 *
 * Por encima de mil por ciento se calla y queda solo el dinero, que es lo que
 * se paga.
 */
export function porcentajeQueDiceAlgo(p: number): number | null {
  return Math.abs(p) >= 1000 ? null : p;
}

/**
 * Lo que le quedaría de margen si lo vende a su precio de lista.
 *
 * **Sobre el COSTO**, que es la definición que pidió el cliente y la que usa
 * el resto del ERP desde la 023. Dividir entre la venta daría otro número para
 * el mismo producto, que es justo el fallo que esa migración vino a cerrar.
 */
export function margenSi(costoUsd: number | null, precioVenta: number | null): number | null {
  if (costoUsd === null || costoUsd <= 0) return null;
  if (precioVenta === null || precioVenta <= 0) return null;
  return redondear(((precioVenta - costoUsd) / costoUsd) * 100, 1);
}

/**
 * `sobre_venta` — te lo dejan a más de lo que lo vendes. Comprarlo es perder.
 * `sobre_piso`  — cabe en la lista, pero no en el piso: si negocias hasta el
 *                 P.M. acabas por debajo del costo, y el piso existe justo
 *                 para no tener que pensarlo en cada venta.
 *
 * Un P.V. o un P.M. en 0 significa «sin definir» en el maestro (002), no
 * «gratis»: con 790 productos sin precios cargados, tratarlo como cero sería
 * pintar la pantalla entera de rojo.
 */
export type Alerta = "sobre_venta" | "sobre_piso" | null;

export function alertaDePrecio(costoUsd: number | null, ref: Referencia): Alerta {
  if (costoUsd === null || !Number.isFinite(costoUsd) || costoUsd <= 0) return null;

  const pv = ref.precioVenta;
  if (pv !== null && pv > 0 && costoUsd >= pv) return "sobre_venta";

  const pm = ref.precioMinimo;
  if (pm !== null && pm > 0 && costoUsd >= pm) return "sobre_piso";

  return null;
}

/**
 * A quién más se le podría preguntar y no se le preguntó.
 *
 * Es la pregunta que Willy se hace mirando la rejilla —«¿me faltó alguien?»—
 * y que hasta ahora tenía que contestar de memoria. Sale de los que constan
 * como que venden ese producto y no entraron en esta ronda.
 *
 * Los de baja no cuentan: no se les puede comprar, así que recordarlos sería
 * mandar a perder el tiempo. El orden es el mismo del resto del módulo, el
 * más barato primero, y los que nunca lo cobraron al final.
 */
export function faltaPreguntarle(
  ref: Referencia,
  yaEnLaRonda: ReadonlySet<string>,
): ProveedorConocido[] {
  return ref.proveedores
    .filter((p) => p.activo && !yaEnLaRonda.has(p.proveedor_id))
    .sort((a, b) => {
      const ca = a.ultimoCostoUsd;
      const cb = b.ultimoCostoUsd;
      if (ca === null && cb === null) return a.proveedor.localeCompare(b.proveedor);
      if (ca === null) return 1;
      if (cb === null) return -1;
      return ca - cb;
    });
}

/** Una referencia vacía, para el producto del que no se sabe nada todavía. */
export function referenciaVacia(productoId: string): Referencia {
  return {
    producto_id: productoId,
    ultimoCosto: null,
    costoPromedio: null,
    precioVenta: null,
    precioMinimo: null,
    proveedores: [],
    historial: [],
  };
}

/**
 * Si de un producto no se sabe absolutamente nada, la fila de referencia no se
 * pinta: una línea que solo dice «— · — · —» ocupa sitio y no informa.
 */
export function tieneAlgoQueDecir(ref: Referencia): boolean {
  return (
    (ref.ultimoCosto !== null && ref.ultimoCosto > 0) ||
    (ref.costoPromedio !== null && ref.costoPromedio > 0) ||
    (ref.precioVenta !== null && ref.precioVenta > 0) ||
    (ref.precioMinimo !== null && ref.precioMinimo > 0) ||
    ref.historial.length > 0 ||
    ref.proveedores.some((p) => p.ultimoCostoUsd !== null && p.ultimoCostoUsd > 0)
  );
}

/**
 * `toFixed` y volver a `Number` redondea a par en los empates y arrastra el
 * error binario: 8.245 con dos decimales sale 8.24. Con dinero eso importa,
 * así que se hace con enteros — el mismo criterio que R7.
 */
function redondear(n: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.round((n + Number.EPSILON) * f) / f;
}
