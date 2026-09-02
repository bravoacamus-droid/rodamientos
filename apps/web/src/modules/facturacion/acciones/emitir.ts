"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import type { Json } from "@rodatech/db/tipos";

import { cotizacionParaFacturar } from "../api/consultas";
import { bloqueosEmision, cuotasDe, totalesDe, vencimientoDe } from "../dominio/emision";

/**
 * Emisión de un comprobante desde una cotización aprobada.
 *
 * Todo el trabajo pesado lo hace `emitir_comprobante()` en Postgres: pide el
 * correlativo con bloqueo de fila, calcula los totales, decide la detracción
 * por el umbral, escribe las cuotas y descarga el stock. Esta acción no
 * recalcula nada de eso — si lo hiciera, habría dos verdades sobre el mismo
 * número.
 *
 * Lo que SÍ hace aquí, y solo aquí, es comprobar lo que SUNAT rechazaría:
 * factura sin RUC, boleta grande sin documento, total en cero. Descubrirlo
 * después es caro, porque el correlativo se gasta igual aunque el documento
 * acabe rechazado.
 *
 * NO envía a SUNAT. El comprobante nace en `pendiente` y el envío es un paso
 * aparte, a propósito: mientras no haya certificado se puede seguir emitiendo
 * y cobrando, que es lo que el negocio necesita hoy.
 */

/** La misma lista que `permisos_rol` tiene para `comprobantes`. */
const ROLES = ["gerencia", "admin", "ventas"] as const;

const esquema = z.object({
  cotizacion_id: z.string().uuid(),
  tipo: z.enum(["factura", "boleta"]),
  serie: z.string().regex(/^[BF][A-Z0-9]{3}$/, "La serie no tiene el formato de SUNAT."),
  fecha_emision: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida."),
  condicion_pago: z.enum(["contado", "credito"]),
  dias_credito: z.number().int().min(0).max(365),
  observaciones: z.string().max(2000).nullable(),
  /**
   * ¿La mercadería sale del almacén con esta factura?
   *
   * Por defecto NO, y es la decisión que ya tomó el esquema: el stock sale con
   * la GUÍA DE REMISIÓN, que es el documento que acompaña el movimiento físico.
   * Descargarlo también al facturar restaría dos veces lo mismo.
   *
   * Se activa para la venta de mostrador: el cliente se lleva el rodamiento y
   * se le factura ahí mismo, sin guía previa.
   */
  descargar_stock: z.boolean(),
  /**
   * Cuánto se factura de cada línea pendiente, en el mismo orden.
   *
   * Es para el caso de Willy: el cliente confirmó 6, hay 4 en almacén, se
   * le entregan 4 ahora y 2 cuando llegue la compra. Sin esto solo se
   * puede facturar todo de una vez.
   *
   * El navegador solo puede pedir MENOS. Lo que manda se recorta contra lo
   * que el servidor calcula como pendiente, así que una llamada fabricada
   * no puede emitir de más — y los PRECIOS siguen sin venir de aquí.
   */
  cantidades: z.array(z.number().min(0)).max(200).optional(),
});

export type ResultadoEmision =
  | { ok: true; id: string; numero: string; total: number }
  | { ok: false; error: string; bloqueos?: string[] };

export async function emitirComprobante(
  _previo: ResultadoEmision | null,
  formData: FormData,
): Promise<ResultadoEmision> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede emitir comprobantes." };
  }

  const crudo = formData.get("comprobante");
  if (typeof crudo !== "string") {
    return { ok: false, error: "No llegaron los datos del comprobante." };
  }

  let datos: z.infer<typeof esquema>;
  try {
    datos = esquema.parse(JSON.parse(crudo));
  } catch (e) {
    const detalle = e instanceof z.ZodError ? e.issues[0]?.message : "formato inesperado";
    return { ok: false, error: `Los datos no son válidos: ${detalle}.` };
  }

  // La cotización se relee del servidor y NO se acepta del formulario: los
  // importes que van a acabar en un documento fiscal no pueden venir del
  // navegador.
  const cotizacion = await cotizacionParaFacturar(datos.cotizacion_id);
  if (!cotizacion.ok) return { ok: false, error: cotizacion.error };
  if (!cotizacion.datos) return { ok: false, error: "La cotización no existe." };

  const cot = cotizacion.datos;

  const bloqueos = bloqueosEmision(cot, datos.tipo);
  if (bloqueos.length > 0) {
    return {
      ok: false,
      error: "No se puede emitir todavía.",
      bloqueos: bloqueos.map((b) => b.mensaje),
    };
  }

  // La serie tiene que casar con el tipo: SUNAT exige F para factura y B para
  // boleta, y un cruce se rechaza con el correlativo ya gastado.
  const inicial = datos.tipo === "factura" ? "F" : "B";
  if (!datos.serie.startsWith(inicial)) {
    return {
      ok: false,
      error: `Una ${datos.tipo} tiene que ir en una serie que empiece por ${inicial}.`,
    };
  }

  // Lo que de verdad se va a emitir: lo pedido, recortado contra lo
  // pendiente que acaba de releerse del servidor. `l.cantidad` YA es el
  // pendiente (api/consultas.ts), así que este `min` es el techo.
  const aEmitir = cot.lineas
    .map((l, i) => {
      const pedido = datos.cantidades?.[i];
      const cantidad =
        pedido === undefined || !Number.isFinite(pedido)
          ? l.cantidad
          : Math.min(Math.max(pedido, 0), l.cantidad);
      return { ...l, cantidad };
    })
    .filter((l) => l.cantidad > 0);

  if (aEmitir.length === 0) {
    return { ok: false, error: "No hay nada que facturar: todas las cantidades están en cero." };
  }

  const alCredito = datos.condicion_pago === "credito" && datos.dias_credito > 0;
  const vencimiento = alCredito
    ? vencimientoDe(datos.fecha_emision, datos.dias_credito)
    : null;

  try {
    const supabase = await clienteServidor();

    const payload = {
      tipo: datos.tipo,
      serie: datos.serie,
      cliente_id: cot.cliente_id,
      cotizacion_id: cot.id,
      orden_compra_cliente: cot.orden_compra_cliente,
      fecha_emision: datos.fecha_emision,
      condicion_pago: datos.condicion_pago,
      dias_credito: alCredito ? datos.dias_credito : 0,
      fecha_vencimiento: vencimiento,
      observaciones: datos.observaciones,
      descargar_stock: datos.descargar_stock,
      items: aEmitir.map((l) => ({
        producto_id: l.producto_id,
        codigo: l.codigo,
        descripcion: l.descripcion,
        unidad_codigo: l.unidad,
        cantidad: l.cantidad,
        valor_unitario: l.valor_unitario,
        descuento_pct: l.descuento_pct,
      })),
      // Las cuotas se mandan porque SUNAT exige el cronograma desde 2022: sin
      // él, un comprobante al crédito se rechaza con el error 3251. La función
      // comprueba que sumen el total antes de guardar.
      //
      // El total se calcula sobre lo que SE EMITE, no sobre el de la
      // cotización. Antes se usaba `cot.total` con la nota de que «es el
      // mismo»; desde la 047 puede no serlo —se factura lo confirmado, y en
      // partes— y un cronograma que no cuadra hace fallar la emisión entera
      // con un error que no le dice nada a nadie.
      cuotas: alCredito
        ? cuotasDe(totalesDe(aEmitir).total, datos.dias_credito, datos.fecha_emision).map((c) => ({
            numero: c.numero,
            monto: c.monto,
            fecha_vencimiento: c.vencimiento,
          }))
        : [],
    };

    const { data, error } = await supabase.rpc("emitir_comprobante", {
      p_datos: payload as unknown as Json,
    });
    if (error) return { ok: false, error: error.message };

    const r = data as unknown as { id: string; numero: string; total: number };

    revalidatePath("/facturacion");
    revalidatePath("/cotizaciones");
    revalidatePath(`/cotizaciones/${cot.id}`);
    revalidatePath("/dashboard");

    // Solo si de verdad se movió el almacén. Facturar contra una guía ya
    // emitida no toca stock —salió con la guía—, así que invalidar el catálogo
    // ahí sería trabajo para nada.
    if (datos.descargar_stock) {
      revalidatePath("/productos");
      revalidatePath("/inventario");
    }

    return {
      ok: true,
      id: r.id,
      numero: r.numero,
      total: Number(r.total ?? 0),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo emitir el comprobante.",
    };
  }
}
