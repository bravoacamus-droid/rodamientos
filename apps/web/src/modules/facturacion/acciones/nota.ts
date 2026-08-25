"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import type { Json } from "@rodatech/db/tipos";

import { detalleComprobante } from "../api/consultas";
import {
  bloqueosNota,
  lineasDeNota,
  serieDeNota,
  valorSinIgv,
} from "../dominio/nota";

/**
 * Emite una nota de crédito o de débito sobre un comprobante.
 *
 * Una factura emitida NO se edita: se corrige con una nota, que es otro
 * documento con su propio correlativo. Ese es el diseño que impone SUNAT y el
 * que evita que un número ya declarado cambie de contenido.
 *
 * Reutiliza `emitir_comprobante()`, que ya sabe de notas: la restricción
 * `comp_nota_referencia` exige que toda nota apunte al documento que corrige y
 * traiga su motivo. Lo único que hay que decidir aquí —y que la función no
 * puede adivinar— es la SERIE, porque la predeterminada solo acierta con
 * facturas.
 */

/** La misma lista que `permisos_rol` tiene para `comprobantes`. */
const ROLES = ["gerencia", "admin", "ventas"] as const;

const esquema = z.object({
  referencia_id: z.string().uuid(),
  tipo: z.enum(["nota_credito", "nota_debito"]),
  motivo_codigo: z.string().length(2),
  fecha_emision: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida."),
  /** Importe CON IGV, que es como lo piensa quien emite. */
  monto: z.number().positive().finite(),
  concepto: z.string().max(500),
  observaciones: z.string().max(2000).nullable(),
});

export type ResultadoNota =
  | { ok: true; id: string; numero: string; total: number }
  | { ok: false; error: string; bloqueos?: string[] };

export async function emitirNota(
  _previo: ResultadoNota | null,
  formData: FormData,
): Promise<ResultadoNota> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede emitir notas." };
  }

  const crudo = formData.get("nota");
  if (typeof crudo !== "string") {
    return { ok: false, error: "No llegaron los datos de la nota." };
  }

  let datos: z.infer<typeof esquema>;
  try {
    datos = esquema.parse(JSON.parse(crudo));
  } catch (e) {
    const detalle = e instanceof z.ZodError ? e.issues[0]?.message : "formato inesperado";
    return { ok: false, error: `Los datos no son válidos: ${detalle}.` };
  }

  // El documento afectado se relee del servidor: los importes de un documento
  // fiscal no viajan por el navegador.
  const ficha = await detalleComprobante(datos.referencia_id);
  if (!ficha.ok) return { ok: false, error: ficha.error };
  if (!ficha.datos) return { ok: false, error: "El documento a corregir no existe." };

  const doc = ficha.datos;

  // Cuánto se ha acreditado ya con otras notas vigentes. Sin este dato se
  // podrían emitir dos notas por el total y acreditar el doble de lo facturado.
  const supabase = await clienteServidor();
  const { data: notasPrevias, error: errorNotas } = await supabase
    .from("comprobantes")
    .select("total")
    .eq("referencia_id", doc.id)
    .eq("tipo", "nota_credito")
    .neq("estado", "anulado");

  if (errorNotas) return { ok: false, error: errorNotas.message };

  const yaAcreditado =
    Math.round(
      (notasPrevias ?? []).reduce((a, n) => a + Number(n.total ?? 0), 0) * 100,
    ) / 100;

  const bloqueos = bloqueosNota(
    doc,
    datos.tipo,
    datos.motivo_codigo,
    datos.monto,
    datos.fecha_emision,
    yaAcreditado,
  );

  if (bloqueos.length > 0) {
    return {
      ok: false,
      error: "No se puede emitir la nota todavía.",
      bloqueos: bloqueos.map((b) => b.mensaje),
    };
  }

  try {
    const lineas = lineasDeNota(doc, datos.motivo_codigo, datos.monto, datos.concepto);

    const payload = {
      tipo: datos.tipo,
      // La serie NO se elige: sale del tipo del documento afectado. Una nota
      // sobre boleta va en serie B, y cruzarla es un rechazo con el correlativo
      // ya gastado.
      serie: serieDeNota(doc.tipo, datos.tipo),
      cliente_id: doc.cliente_id,
      referencia_id: doc.id,
      motivo_nota_codigo: datos.motivo_codigo,
      orden_compra_cliente: doc.orden_compra_cliente,
      fecha_emision: datos.fecha_emision,
      // Una nota se emite al contado: no genera una nueva deuda a plazo, ajusta
      // la que ya existe.
      condicion_pago: "contado",
      dias_credito: 0,
      observaciones: datos.observaciones,
      items: lineas.map((l) => ({
        producto_id: l.producto_id,
        codigo: l.codigo,
        descripcion: l.descripcion,
        unidad_codigo: l.unidad,
        cantidad: l.cantidad,
        valor_unitario: l.valor_unitario,
        descuento_pct: l.descuento_pct,
      })),
      cuotas: [],
    };

    const { data, error } = await supabase.rpc("emitir_comprobante", {
      p_datos: payload as unknown as Json,
    });
    if (error) return { ok: false, error: error.message };

    const r = data as unknown as { id: string; numero: string; total: number };

    revalidatePath("/facturacion");
    revalidatePath(`/facturacion/${doc.id}`);
    revalidatePath(`/facturacion/${r.id}`);
    // Una nota de crédito cambia lo que se debe.
    revalidatePath("/cobranzas");
    revalidatePath("/reportes");
    revalidatePath("/dashboard");

    return {
      ok: true,
      id: r.id,
      numero: r.numero,
      total: Number(r.total ?? 0),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo emitir la nota.",
    };
  }
}

/**
 * Anula un comprobante.
 *
 * Solo gerencia: `anular_comprobante()` exige `tiene_rol('gerencia','admin')`.
 *
 * Ojo con la diferencia respecto a la nota de crédito, que es la que más se
 * confunde:
 *
 * - **Anular** marca el documento como no válido y repone el stock que
 *   descargó. Sirve para un documento que NUNCA debió existir y que SUNAT no
 *   ha aceptado todavía.
 * - **La nota de crédito** deja el documento en pie y emite otro que lo
 *   corrige. Es lo que hay que hacer si SUNAT ya lo aceptó, porque un
 *   documento aceptado no desaparece: se comunica su baja.
 *
 * Cuando el comprobante ya estaba aceptado, la función lo deja en
 * `baja_solicitada`, que es exactamente eso.
 */
const esquemaAnulacion = z.object({
  id: z.string().uuid(),
  motivo: z.string().trim().min(5, "Explica en una frase por qué se anula.").max(500),
});

export type ResultadoAnulacionComprobante =
  | { ok: true; numero: string; requiereBaja: boolean }
  | { ok: false; error: string };

export async function anularComprobante(
  _previo: ResultadoAnulacionComprobante | null,
  formData: FormData,
): Promise<ResultadoAnulacionComprobante> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!["gerencia", "admin"].includes(perfil.rol)) {
    return { ok: false, error: "Solo Gerencia puede anular un comprobante." };
  }

  let datos: z.infer<typeof esquemaAnulacion>;
  try {
    datos = esquemaAnulacion.parse({
      id: formData.get("id"),
      motivo: formData.get("motivo"),
    });
  } catch (e) {
    const detalle = e instanceof z.ZodError ? e.issues[0]?.message : "formato inesperado";
    return { ok: false, error: detalle ?? "Los datos no son válidos." };
  }

  const ficha = await detalleComprobante(datos.id);
  if (!ficha.ok) return { ok: false, error: ficha.error };
  if (!ficha.datos) return { ok: false, error: "El comprobante no existe." };

  const doc = ficha.datos;

  // Si ya se cobró algo, anular deja un pago aplicado a un documento que dice
  // que nunca existió. Eso se arregla con una nota de crédito, no borrando.
  if (doc.pagado > 0) {
    return {
      ok: false,
      error: `${doc.numero} ya tiene ${doc.pagado.toFixed(2)} cobrados. Emite una nota de crédito en vez de anularlo: anularlo dejaría un pago aplicado a un documento inexistente.`,
    };
  }

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase.rpc("anular_comprobante", {
      p_id: datos.id,
      p_motivo: datos.motivo,
    });
    if (error) return { ok: false, error: error.message };

    revalidatePath("/facturacion");
    revalidatePath(`/facturacion/${datos.id}`);
    revalidatePath("/cobranzas");
    revalidatePath("/productos");
    revalidatePath("/inventario");

    return {
      ok: true,
      numero: doc.numero,
      // SUNAT no olvida un documento que ya aceptó: hay que comunicar la baja.
      requiereBaja: doc.estado_sunat === "aceptado",
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo anular el comprobante.",
    };
  }
}

/** Convierte un importe con IGV a la base, para previsualizar en la pantalla. */
export async function baseDeImporte(montoConIgv: number) {
  return { ok: true as const, base: valorSinIgv(montoConIgv) };
}
