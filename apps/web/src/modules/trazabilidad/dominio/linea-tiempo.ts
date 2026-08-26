/**
 * Reglas puras de la línea de tiempo.
 *
 * Lo que aquí se calcula y la base no: agrupar por día, medir el recorrido del
 * precio y decir en qué proveedor conviene volver a preguntar.
 */

import type {
  Evento,
  EventoTrazabilidad,
  Lado,
  ResumenTrazabilidad,
} from "./tipos";

/**
 * Orden de la línea de tiempo: del día más reciente al más antiguo, y dentro
 * de cada día siguiendo el flujo del negocio.
 *
 * El día es `dia` y no `fecha` a propósito. Solo la recepción lleva hora real
 * —viene del kardex—; las compras, cotizaciones y facturas guardan una fecha
 * sin hora, que al convertirse en marca de tiempo cae a medianoche. Ordenando
 * por `fecha`, la recepción se iba siempre al final de su día por delante de
 * documentos que en realidad la precedían.
 */
export function ordenarEventos(
  eventos: readonly EventoTrazabilidad[],
): EventoTrazabilidad[] {
  return [...eventos].sort((a, b) => {
    const porDia = b.dia.localeCompare(a.dia);
    if (porDia !== 0) return porDia;
    // Dentro del día, el flujo hacia adelante: primero se compra, al final se
    // factura. Es como se cuenta una historia, aunque los días vayan al revés.
    return a.secuencia - b.secuencia;
  });
}

/** Agrupa por día conservando el orden. Un encabezado por fecha. */
export function agruparPorDia(
  eventos: readonly EventoTrazabilidad[],
): Array<{ dia: string; eventos: EventoTrazabilidad[] }> {
  const grupos: Array<{ dia: string; eventos: EventoTrazabilidad[] }> = [];

  for (const e of ordenarEventos(eventos)) {
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.dia === e.dia) ultimo.eventos.push(e);
    else grupos.push({ dia: e.dia, eventos: [e] });
  }

  return grupos;
}

/** Tono de la insignia según de qué lado viene el evento. */
export function tonoEvento(evento: Evento): "brand" | "success" | "warning" | "neutral" {
  switch (evento) {
    case "compra":
    case "recepcion":
      return "brand";
    case "factura":
      return "success";
    case "nota_credito":
    case "nota_debito":
      return "warning";
    default:
      return "neutral";
  }
}

/**
 * Lo que se le ha comprado a cada proveedor, resumido.
 *
 * Es la respuesta directa a «¿a quién se lo vuelvo a pedir?». Se ordena por
 * precio y no por fecha: el más reciente no es necesariamente el mejor, y la
 * pregunta de Willy era por el mejor.
 */
export function porProveedor(
  eventos: readonly EventoTrazabilidad[],
): Array<{
  id: string;
  nombre: string;
  documento: string | null;
  veces: number;
  unidades: number;
  mejorPrecio: number;
  ultimoPrecio: number;
  ultimaFecha: string;
}> {
  const mapa = new Map<string, ReturnType<typeof porProveedor>[number]>();

  // Solo las órdenes de compra: la recepción repite el mismo trato con el
  // costo ya cargado de gastos, y contarla sería contar la compra dos veces.
  for (const e of eventos) {
    if (e.evento !== "compra" || !e.contraparte_id) continue;

    const actual = mapa.get(e.contraparte_id);
    if (!actual) {
      mapa.set(e.contraparte_id, {
        id: e.contraparte_id,
        nombre: e.contraparte ?? "—",
        documento: e.contraparte_doc,
        veces: 1,
        unidades: e.cantidad,
        mejorPrecio: e.unitario,
        ultimoPrecio: e.unitario,
        ultimaFecha: e.dia,
      });
      continue;
    }

    actual.veces += 1;
    actual.unidades += e.cantidad;
    actual.mejorPrecio = Math.min(actual.mejorPrecio, e.unitario);
    if (e.dia >= actual.ultimaFecha) {
      actual.ultimaFecha = e.dia;
      actual.ultimoPrecio = e.unitario;
    }
  }

  return [...mapa.values()].sort((a, b) => a.mejorPrecio - b.mejorPrecio);
}

/**
 * A qué precio se le ha vendido a cada cliente.
 *
 * Ordenado por lo más reciente: aquí la pregunta no es «quién paga más» sino
 * «a este cliente qué le dije la última vez», que es lo que hay que sostener
 * cuando vuelve a llamar.
 */
export function porCliente(
  eventos: readonly EventoTrazabilidad[],
): Array<{
  id: string;
  nombre: string;
  documento: string | null;
  cotizaciones: number;
  ventas: number;
  ultimoPrecio: number;
  ultimaFecha: string;
}> {
  const mapa = new Map<string, ReturnType<typeof porCliente>[number]>();

  for (const e of eventos) {
    if (e.lado !== "venta" || !e.contraparte_id) continue;
    // Las notas corrigen un documento anterior; el precio que dicen no es un
    // precio ofrecido.
    if (e.evento === "nota_credito" || e.evento === "nota_debito") continue;

    const actual = mapa.get(e.contraparte_id);
    if (!actual) {
      mapa.set(e.contraparte_id, {
        id: e.contraparte_id,
        nombre: e.contraparte ?? "—",
        documento: e.contraparte_doc,
        cotizaciones: e.evento === "cotizacion" ? 1 : 0,
        ventas: e.evento === "factura" ? 1 : 0,
        ultimoPrecio: e.unitario,
        ultimaFecha: e.dia,
      });
      continue;
    }

    if (e.evento === "cotizacion") actual.cotizaciones += 1;
    if (e.evento === "factura") actual.ventas += 1;
    if (e.dia >= actual.ultimaFecha) {
      actual.ultimaFecha = e.dia;
      actual.ultimoPrecio = e.unitario;
    }
  }

  return [...mapa.values()].sort((a, b) => b.ultimaFecha.localeCompare(a.ultimaFecha));
}

/**
 * El margen que dejaría comprarle al mejor proveedor y vender al último precio
 * cotizado. Null si falta cualquiera de los dos.
 *
 * Sobre el COSTO, como el resto del sistema desde la migración 023.
 */
export function margenDeReferencia(resumen: ResumenTrazabilidad): number | null {
  const costo = resumen.mejorProveedor?.unitario ?? 0;
  const venta = resumen.ultimaCotizacion?.unitario ?? 0;
  if (costo <= 0 || venta <= 0) return null;
  return Math.round(((venta - costo) / costo) * 10000) / 100;
}

/**
 * ¿El precio de este código depende del cliente?
 *
 * Si lo cotizado va de 3,90 a 7,00 no hay «un precio»: hay una negociación
 * distinta cada vez, y el vendedor tiene que mirar el histórico antes de
 * abrir la boca. Se responde con la dispersión sobre el mínimo, que es más
 * legible que una desviación típica y suficiente para decidir.
 */
export function dispersionCotizada(resumen: ResumenTrazabilidad): number | null {
  const { cotizadoMin, cotizadoMax } = resumen;
  if (cotizadoMin === null || cotizadoMax === null || cotizadoMin <= 0) return null;
  return Math.round(((cotizadoMax - cotizadoMin) / cotizadoMin) * 10000) / 100;
}

/** Cuenta los eventos de un lado, para las pestañas. */
export function contarPorLado(
  eventos: readonly EventoTrazabilidad[],
  lado: Lado,
): number {
  return eventos.filter((e) => e.lado === lado).length;
}
