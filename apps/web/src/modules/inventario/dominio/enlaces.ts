/**
 * A qué ficha lleva cada movimiento del kardex.
 *
 * El kardex anota QUIÉN movió el stock —una recepción, una factura, una guía—
 * y desde el libro mayor lo primero que se quiere es abrir ese documento. Hasta
 * hoy solo la recepción enlazaba: el resto enseñaba el número sin enlace,
 * porque cuando se escribió aquello los módulos no existían. Ya existen todos.
 *
 * Está aparte y probado porque es un acoplamiento que ningún compilador vigila:
 * la cadena de `referencia_tipo` la escribe PL/pgSQL y el directorio que la
 * sirve vive en `app/(erp)`. Su prueba lee las migraciones, saca los tipos que
 * el kardex graba DE VERDAD y exige que cada uno esté contemplado aquí — así,
 * el día que alguien añada un tipo nuevo se entera al correr las pruebas y no
 * cuando un usuario pulse un número que no lleva a ninguna parte.
 */

/** Los cinco valores que `registrar_movimientos` graba en `referencia_tipo`. */
export const TIPOS_REFERENCIA = [
  "recepcion",
  "comprobante",
  "guia",
  "ajuste",
  "importacion",
] as const;

export type TipoReferencia = (typeof TIPOS_REFERENCIA)[number];

/**
 * La ficha del documento que movió el stock, o `null` si no hay dónde ir.
 *
 * Los dos que devuelven `null` lo hacen por motivos distintos y ninguno es un
 * descuido:
 *
 *  · `ajuste` SÍ trae su id, pero un ajuste de inventario no tiene ficha: la
 *    pantalla `/inventario/ajuste` es el formulario para hacer uno nuevo, no
 *    para mirar uno viejo. Enlazar ahí llevaría a empezar otro ajuste, que es
 *    peor que no enlazar.
 *  · `importacion` no trae id siquiera. Y ojo con el nombre, que engaña: NO es
 *    el módulo de importaciones —los envíos que vienen de fuera— sino la carga
 *    inicial del maestro desde el Excel (`importar_productos`). Un stock que
 *    entró por una hoja de cálculo no tiene documento que abrir.
 */
export function enlaceDeReferencia(
  tipo: string | null,
  id: string | null,
): string | null {
  if (!id || !tipo) return null;
  switch (tipo) {
    case "recepcion":
      return `/recepciones/${id}`;
    case "comprobante":
      return `/facturacion/${id}`;
    case "guia":
      return `/guias/${id}`;
    case "ajuste":
    case "importacion":
      return null;
    default:
      // Un tipo que no conocemos. No se inventa una ruta: se enseña el número
      // sin enlazar, que es lo que se hacía antes con todos.
      return null;
  }
}
