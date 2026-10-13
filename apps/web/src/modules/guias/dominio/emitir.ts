import type { GuiaDetalle } from "./tipos";

/**
 * Lo que le falta a una guía GUARDADA para poder emitirse (14/10).
 *
 * La usan la ventana de «Emitir y despachar» —para decirlo antes de pulsar—
 * y la Server Action —para no fiarse de la pantalla—. Las mismas reglas que
 * `bloqueosEmision` aplica mientras se prepara, más la orden de compra.
 *
 * La O/C, por Willy (reunión del 13/10): *«la guía necesita indicar la
 * cotización y la orden de compra»* — es el número con el que el almacenero
 * del cliente ubica el pedido. Sin ella, la guía no se emite.
 */
export function faltaParaEmitir(
  g: Pick<
    GuiaDetalle,
    | "orden_compra_cliente"
    | "modalidad_traslado"
    | "a_pie"
    | "transportista_documento"
    | "transportista_placa"
    | "conductor_documento"
    | "peso_bruto_kg"
    | "lineas"
  >,
): string[] {
  const falta: string[] = [];
  if (!g.orden_compra_cliente?.trim()) falta.push("la orden de compra del cliente");
  if (g.modalidad_traslado === "01") {
    if (!/^\d{11}$/.test(g.transportista_documento?.trim() ?? "")) falta.push("el RUC de la agencia");
  } else if (g.a_pie) {
    if (!g.conductor_documento?.trim()) falta.push("el DNI de quien la lleva");
  } else if (!g.transportista_placa?.trim()) {
    falta.push("el vehículo (la placa)");
  }
  if (!(g.peso_bruto_kg > 0)) falta.push("el peso bruto");
  if (g.lineas.length === 0) falta.push("al menos un producto");
  return falta;
}
