/**
 * Reglas puras de la bandeja de alertas.
 *
 * Puras de verdad: ninguna lee el reloj ni toca la red. `haceCuanto` recibe el
 * «ahora» como argumento porque el servidor y el navegador no comparten zona
 * horaria y una función que llama a `new Date()` por dentro no se puede probar
 * sin congelar el tiempo.
 */

import type {
  Alerta,
  Familia,
  ResumenBandeja,
  Severidad,
  TipoAlerta,
} from "./tipos";

/**
 * Peso de cada severidad, de mayor a menor urgencia.
 *
 * Existe como número y no como orden alfabético porque los nombres no ordenan:
 * «alta» va antes que «critica» en el diccionario y después en la realidad.
 */
export const PESO_SEVERIDAD: Record<Severidad, number> = {
  critica: 5,
  alta: 4,
  media: 3,
  baja: 2,
  info: 1,
};

/** Tono de la insignia por severidad. */
export function tonoSeveridad(
  severidad: Severidad,
): "neutral" | "info" | "warning" | "danger" {
  switch (severidad) {
    case "critica":
    case "alta":
      return "danger";
    case "media":
      return "warning";
    case "baja":
      return "info";
    default:
      return "neutral";
  }
}

/**
 * A quién le toca actuar.
 *
 * La bandeja se agrupa por esto y no por severidad: un quiebre de stock lo
 * resuelve almacén y una factura vencida la resuelve cobranzas, así que
 * mezclarlas por gravedad obliga a los dos a leer la lista entera.
 */
export function familiaDe(tipo: TipoAlerta): Familia {
  switch (tipo) {
    case "quiebre_stock":
    case "stock_bajo":
    case "sobrestock":
    case "stock_negativo":
    case "sin_rotacion":
      return "almacen";
    case "credito_por_vencer":
    case "credito_vencido":
    case "linea_credito":
    case "margen_bajo":
      return "dinero";
    default:
      return "documentos";
  }
}

/**
 * Orden de la bandeja: lo más grave primero y, a igual gravedad, lo más
 * reciente.
 *
 * Sin leer antes que leída dentro del mismo nivel: lo que ya se miró una vez
 * estorba menos abajo.
 */
export function ordenarBandeja(alertas: readonly Alerta[]): Alerta[] {
  return [...alertas].sort((a, b) => {
    const peso = PESO_SEVERIDAD[b.severidad] - PESO_SEVERIDAD[a.severidad];
    if (peso !== 0) return peso;

    if (a.leida !== b.leida) return a.leida ? 1 : -1;

    return b.generada_en.localeCompare(a.generada_en);
  });
}

/**
 * Cuenta lo que hay, para las tarjetas de arriba.
 *
 * Pide solo los tres campos que mira, no una `Alerta` entera: la consulta del
 * resumen trae esas tres columnas de hasta dos mil filas y no tiene por qué
 * inventarse el resto para satisfacer un tipo.
 */
export function resumir(
  alertas: readonly Pick<Alerta, "severidad" | "leida" | "generada_en">[],
): ResumenBandeja {
  const porSeveridad: Record<Severidad, number> = {
    critica: 0,
    alta: 0,
    media: 0,
    baja: 0,
    info: 0,
  };

  let sinLeer = 0;
  let ultima: string | null = null;

  for (const a of alertas) {
    porSeveridad[a.severidad] += 1;
    if (!a.leida) sinLeer += 1;
    if (ultima === null || a.generada_en > ultima) ultima = a.generada_en;
  }

  return {
    total: alertas.length,
    sinLeer,
    criticas: porSeveridad.critica,
    porSeveridad,
    ultima,
  };
}

/**
 * «hace 3 h», «hace 2 días».
 *
 * Redondea hacia abajo a propósito: decir «hace 1 h» de algo que pasó hace 119
 * minutos es más honesto que decir «hace 2 h» de algo que pasó hace 61.
 *
 * Devuelve la cadena vacía si la fecha no se entiende, y no lanza: es texto de
 * adorno junto a un dato que sí importa, y tumbar la pantalla por él sería
 * desproporcionado.
 */
export function haceCuanto(iso: string, ahora: Date): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";

  const segundos = Math.floor((ahora.getTime() - t) / 1000);
  if (segundos < 0) return "ahora mismo";
  if (segundos < 60) return "hace un momento";

  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `hace ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;

  const dias = Math.floor(horas / 24);
  if (dias === 1) return "hace un día";
  if (dias < 30) return `hace ${dias} días`;

  const meses = Math.floor(dias / 30);
  return meses === 1 ? "hace un mes" : `hace ${meses} meses`;
}

/**
 * Agrupa por familia conservando el orden de entrada dentro de cada grupo.
 *
 * Devuelve solo las familias con contenido: un encabezado «Dinero» sobre una
 * lista vacía es ruido.
 */
export function agruparPorFamilia(
  alertas: readonly Alerta[],
): Array<{ familia: Familia; alertas: Alerta[] }> {
  const orden: readonly Familia[] = ["almacen", "dinero", "documentos"];
  const mapa = new Map<Familia, Alerta[]>();

  for (const a of alertas) {
    const f = familiaDe(a.tipo);
    const lista = mapa.get(f);
    if (lista) lista.push(a);
    else mapa.set(f, [a]);
  }

  return orden.flatMap((familia) => {
    const lista = mapa.get(familia);
    return lista ? [{ familia, alertas: lista }] : [];
  });
}
