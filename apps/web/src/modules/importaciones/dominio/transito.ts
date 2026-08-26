/**
 * Reglas puras del seguimiento de importaciones.
 *
 * Ninguna lee el reloj: el «hoy» lo inyecta quien llama, igual que en el resto
 * del proyecto. Es lo que permite probar «lleva tres días de retraso» sin
 * esperar tres días.
 */

import type { EstadoTransito, Importacion } from "./tipos";

/**
 * En qué punto está el envío.
 *
 * El orden de las preguntas importa: primero si ya llegó —una compra recibida
 * no está atrasada aunque llegara tarde, eso ya pasó— y después si se pasó la
 * fecha. Al revés, una importación de marzo que llegó en abril seguiría
 * saliendo en rojo para siempre.
 */
export function estadoTransito(
  compra: Pick<Importacion, "estado" | "fecha_estimada">,
  hoy: string,
): EstadoTransito {
  if (compra.estado === "recibida") return "recibida";
  if (compra.estado === "recibida_parcial") return "parcial";
  if (!compra.fecha_estimada) return "sin_fecha";
  return compra.fecha_estimada < hoy ? "atrasada" : "en_camino";
}

/**
 * Días de retraso. Cero si no ha llegado la fecha o si ya se recibió.
 *
 * Nunca negativo: «faltan cinco días» no es un retraso de −5, y enseñarlo así
 * obligaría a leer el signo para saber si algo va bien o mal.
 */
export function diasDeAtraso(
  compra: Pick<Importacion, "estado" | "fecha_estimada">,
  hoy: string,
): number {
  if (estadoTransito(compra, hoy) !== "atrasada") return 0;
  const dias =
    (Date.parse(`${hoy}T00:00:00Z`) -
      Date.parse(`${compra.fecha_estimada}T00:00:00Z`)) /
    86_400_000;
  return Math.max(0, Math.round(dias));
}

/** Días que faltan para la fecha estimada. Null si no hay fecha o ya pasó. */
export function diasParaLlegar(
  compra: Pick<Importacion, "estado" | "fecha_estimada">,
  hoy: string,
): number | null {
  if (estadoTransito(compra, hoy) !== "en_camino") return null;
  const dias =
    (Date.parse(`${compra.fecha_estimada}T00:00:00Z`) -
      Date.parse(`${hoy}T00:00:00Z`)) /
    86_400_000;
  return Math.max(0, Math.round(dias));
}

/**
 * Cuánto encarecen los gastos la mercadería, en porcentaje.
 *
 * Es la cifra que responde «¿me salió caro el flete?». Sobre el SUBTOTAL, que
 * es lo que costó la mercadería: el IGV no entra porque es crédito fiscal y no
 * forma parte del costo.
 *
 * Null sin subtotal: dividir entre cero daría infinito, y una compra sin
 * importe es un documento a medio llenar, no una importación carísima.
 */
export function incidenciaGastos(
  compra: Pick<Importacion, "subtotal" | "gastos">,
): number | null {
  if (compra.subtotal <= 0) return null;
  return Math.round((compra.gastos / compra.subtotal) * 10000) / 100;
}

/**
 * El costo unitario puesto en almacén, a partir del de la factura.
 *
 * Reproduce el factor que aplica `recepcionar_mercaderia` desde la 022:
 * `1 + gastos / valor_total_de_la_compra`. Se calcula aquí para poder
 * enseñarlo ANTES de recibir; el número que manda al costear sigue saliendo de
 * la base, que relee los gastos y no acepta lo que llegue del navegador.
 */
export function costoEnAlmacen(
  compra: Pick<Importacion, "subtotal" | "gastos">,
  costoUnitario: number,
): number {
  if (compra.subtotal <= 0) return costoUnitario;
  const factor = 1 + compra.gastos / compra.subtotal;
  return Math.round(costoUnitario * factor * 10000) / 10000;
}

/** Tono de la insignia según el estado. */
export function tonoTransito(
  estado: EstadoTransito,
): "brand" | "danger" | "warning" | "success" | "neutral" {
  switch (estado) {
    case "en_camino":
      return "brand";
    case "atrasada":
      return "danger";
    case "parcial":
      return "warning";
    case "recibida":
      return "success";
    default:
      return "neutral";
  }
}

/**
 * Orden del listado: lo que más urge arriba.
 *
 * Primero lo atrasado, de más días a menos; luego lo que está en camino, por
 * fecha de llegada; después lo que no tiene fecha, y al final lo que ya llegó.
 * Es el orden en que alguien pregunta «¿qué falta?».
 */
export function ordenarImportaciones(
  compras: readonly Importacion[],
  hoy: string,
): Importacion[] {
  const peso: Record<EstadoTransito, number> = {
    atrasada: 0,
    en_camino: 1,
    parcial: 2,
    sin_fecha: 3,
    recibida: 4,
  };

  return [...compras].sort((a, b) => {
    const ea = estadoTransito(a, hoy);
    const eb = estadoTransito(b, hoy);
    if (peso[ea] !== peso[eb]) return peso[ea] - peso[eb];

    if (ea === "atrasada") return diasDeAtraso(b, hoy) - diasDeAtraso(a, hoy);

    // Dentro del mismo grupo, lo que llega antes primero. Sin fecha, lo más
    // reciente: es lo que más probablemente siga vivo.
    if (a.fecha_estimada && b.fecha_estimada) {
      return a.fecha_estimada.localeCompare(b.fecha_estimada);
    }
    return b.fecha.localeCompare(a.fecha);
  });
}

/** Lo que se lee arriba de la pantalla. */
export function resumir(compras: readonly Importacion[], hoy: string) {
  const dos = (n: number) => Math.round(n * 100) / 100;
  let enCamino = 0;
  let atrasadas = 0;
  let valorEnCamino = 0;
  let gastosEnCamino = 0;

  for (const c of compras) {
    const e = estadoTransito(c, hoy);
    if (e === "recibida") continue;

    // Todo lo que no ha llegado del todo cuenta como «en camino», también lo
    // atrasado y lo que llegó a medias: la pregunta es cuánto dinero hay
    // fuera, no cuántos paquetes van puntuales.
    enCamino += 1;
    valorEnCamino += c.subtotal;
    gastosEnCamino += c.gastos;
    if (e === "atrasada") atrasadas += 1;
  }

  return {
    enCamino,
    atrasadas,
    valorEnCamino: dos(valorEnCamino),
    gastosEnCamino: dos(gastosEnCamino),
  };
}

/** Suma un detalle de gastos. La base mantiene el total; esto es para la vista. */
export function sumarGastos(gastos: readonly { monto: number }[]): number {
  return Math.round(gastos.reduce((a, g) => a + g.monto, 0) * 100) / 100;
}
