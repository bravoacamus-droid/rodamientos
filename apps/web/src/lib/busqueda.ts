/**
 * La carrera de las cajas de búsqueda, resuelta en un solo sitio.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EL PROBLEMA
 * ───────────────────────────────────────────────────────────────────────────
 * Cuatro pantallas tienen una caja que consulta al servidor mientras se
 * teclea: el constructor de cotizaciones (productos y clientes), el de compras
 * y el de recepciones. Las cuatro esperaban a que dejaras de teclear y
 * pintaban lo que volviera.
 *
 * Esperar no basta. Con 250 ms de espera y una red normal siguen saliendo dos
 * consultas en vuelo en cuanto alguien teclea a ritmo humano, y **no hay
 * ninguna garantía de que vuelvan en orden**. Si la de «620» tarda 400 ms y la
 * de «6205» tarda 150, la segunda pinta y la primera la pisa: la caja dice
 * «6205» y la lista enseña resultados de «620».
 *
 * En una pantalla de filtros eso es feo. En el constructor de una cotización
 * es una LÍNEA EQUIVOCADA en un documento que se manda al cliente, y nadie se
 * entera hasta que llega la mercadería que no era.
 *
 * `BuscadorProductos` de `@rodatech/ui` ya lo resolvía —lleva su número de
 * orden y su AbortController desde el principio— pero no lo usaba ninguna de
 * las cuatro: cada módulo se había hecho el suyo. Esto es esa protección,
 * extraída para que no vuelva a haber cuatro copias divergiendo.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * POR QUÉ UN REDUCER Y NO DIRECTAMENTE UN HOOK
 * ───────────────────────────────────────────────────────────────────────────
 * Lo que hay que probar es exactamente esto: que una respuesta vieja no pisa a
 * una nueva. Eso es una máquina de estados y se prueba sin React, sin red y
 * sin temporizadores — que es la única forma de probar una carrera de verdad,
 * porque reproducirla a mano depende de la suerte.
 */

export type RespuestaBusqueda<T> =
  | { ok: true; datos: T[] }
  | { ok: false; error: string };

export interface EstadoBusqueda<T> {
  /** Número de la última consulta LANZADA. Solo esa puede pintar. */
  peticion: number;
  /** `null` es «todavía no se ha buscado»; `[]` es «se buscó y no hay». */
  resultados: T[] | null;
  error: string | null;
  buscando: boolean;
}

/**
 * El número de consulta lo pone QUIEN LLAMA, no el reducer.
 *
 * Es deliberado y costó un intento: si el reducer llevara su propio contador,
 * habría dos —el suyo y el que el hook necesita para etiquetar la respuesta
 * que todavía no ha vuelto— y bastaría un despacho sin su pareja para que se
 * separaran. Separados, el filtro de respuestas tardías deja de filtrar y el
 * fallo vuelve sin que nada se rompa a la vista.
 */
export type AccionBusqueda<T> =
  | { tipo: "lanzar"; peticion: number }
  | { tipo: "responder"; peticion: number; respuesta: RespuestaBusqueda<T> }
  | { tipo: "limpiar"; peticion: number };

export function estadoInicialBusqueda<T>(): EstadoBusqueda<T> {
  return { peticion: 0, resultados: null, error: null, buscando: false };
}

export function reducirBusqueda<T>(
  estado: EstadoBusqueda<T>,
  accion: AccionBusqueda<T>,
): EstadoBusqueda<T> {
  switch (accion.tipo) {
    case "lanzar":
      return { ...estado, peticion: accion.peticion, buscando: true };

    case "responder":
      // AQUÍ está todo. Una respuesta de una consulta que ya no es la última
      // se tira: su término ya no es el que está escrito.
      if (accion.peticion !== estado.peticion) return estado;
      return accion.respuesta.ok
        ? { ...estado, resultados: accion.respuesta.datos, error: null, buscando: false }
        : { ...estado, resultados: [], error: accion.respuesta.error, buscando: false };

    case "limpiar":
      // Vaciar la caja también invalida lo que esté en vuelo: si no, la
      // respuesta de lo que se acaba de borrar aparecería un instante después.
      return { peticion: accion.peticion, resultados: null, error: null, buscando: false };
  }
}

/** ¿Merece la pena salir a la red con esto? */
export function valeLaPenaBuscar(termino: string, minimo = 2): boolean {
  return termino.trim().length >= minimo;
}
