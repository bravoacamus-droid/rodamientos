/**
 * El orden de las listas de documentos: lo último arriba (12/10).
 *
 * Luis: *«si pongo todas, me debería aparecer por fechas; pero las últimas
 * que creé son de COT1 y aparecen al último. Debería ser por fecha y hora el
 * orden de todas las listas»*. Se ordenaban por NÚMERO, y con dos series
 * vivas («CT02-…» y «COT1-…») el texto manda: CT02 va antes que COT1.
 *
 * El orden era fecha del documento → hora de creación → número, de mayor a
 * menor. El número desempata: el histórico tiene la misma hora (medianoche)
 * en todo un día, y así la CT02-001261 va antes que la 001260.
 * La fecha va primero porque el histórico cargado del Excel tiene la hora de
 * la CARGA (los 561 comprobantes dicen 28/08), no la del documento; dentro de
 * un mismo día manda la hora en que se creó.
 *
 * Y dentro del MISMO día manda el número, no la hora (24/11). Willy: en
 * facturación salía la F002-00000579 encima de la 580, las dos del 02/11,
 * porque la 579 se cargó por SQL después. Luis: *«no salen en orden de
 * correlativo… tiene que estar en orden»*. El correlativo es lo que se busca
 * en un libro de facturas; la hora de creación queda de último desempate.
 * Lo de COT1 contra CT02 del 12/10 ya no pesa: COT1 era la serie de prueba,
 * y entre días distintos sigue mandando la fecha.
 *
 * Paginación por clave («keyset»), con las tres columnas en ese orden. El
 * cursor sigue escribiéndose «fecha|creado_en|número».
 */

export interface ClaveOrden {
  fecha: string;
  creado: string;
  numero: string;
}

export function cursorDe(c: ClaveOrden | undefined | null): string | null {
  return c ? `${c.fecha}|${c.creado}|${c.numero}` : null;
}

/**
 * El filtro `or` de PostgREST para seguir desde un cursor, o null si el cursor
 * no es válido (uno viejo, solo con el número, vuelve a la primera página).
 */
export function filtroCursor(cursor: string | undefined, atras: boolean, colFecha: string): string | null {
  const [fecha, creado, numero] = (cursor ?? "").split("|");
  if (
    !fecha ||
    !creado ||
    !numero ||
    !/^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
    !/^[0-9T:.\-+ ]{10,40}$/.test(creado) ||
    !/^[A-Z0-9-]{3,30}$/.test(numero)
  ) {
    return null;
  }
  const op = atras ? "gt" : "lt";
  // Comillas: la hora lleva «:» y «+», que en un filtro `or` se leerían mal.
  const c = `"${creado}"`;
  return [
    `${colFecha}.${op}.${fecha}`,
    `and(${colFecha}.eq.${fecha},numero.${op}.${numero})`,
    `and(${colFecha}.eq.${fecha},numero.eq.${numero},creado_en.${op}.${c})`,
  ].join(",");
}
