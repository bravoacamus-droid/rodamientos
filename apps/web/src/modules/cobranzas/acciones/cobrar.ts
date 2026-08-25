"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import type { Json } from "@rodatech/db/tipos";

/**
 * Registra uno o varios pagos.
 *
 * `registrar_pagos()` SOLO inserta en `pagos`. Todo lo demás lo hace el trigger
 * `trg_pagos_recalcular`: actualiza `comprobantes.pagado`, mueve el estado a
 * parcial / pagado / vencido y reparte sobre las cuotas de la más antigua a la
 * más nueva.
 *
 * Por eso esta acción no toca ningún saldo. Un saldo que se calcula en dos
 * sitios acaba diciendo dos cosas, y aquí el segundo sitio sería el navegador.
 *
 * Acepta varios pagos de golpe porque es como llega el dinero: una
 * transferencia paga tres facturas, y registrarlas de una en una son tres
 * viajes y tres oportunidades de dejarlo a medias.
 */

/** La misma lista que `permisos_rol` tiene para `pagos`. */
const ROLES = ["gerencia", "admin", "ventas", "cobranzas"] as const;

const MEDIOS = [
  "efectivo",
  "transferencia",
  "deposito",
  "cheque",
  "letra",
  "detraccion",
  "retencion",
  "nota_credito",
] as const;

const esquemaPago = z.object({
  comprobante_id: z.string().uuid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha del pago no es válida."),
  monto: z.number().positive("El importe tiene que ser mayor que cero.").finite(),
  medio: z.enum(MEDIOS),
  referencia: z.string().max(120).nullable(),
  observaciones: z.string().max(1000).nullable(),
});

const esquema = z.object({
  pagos: z.array(esquemaPago).min(1, "No hay ningún pago que registrar.").max(100),
});

export type ResultadoCobro =
  | { ok: true; registrados: number; total: number }
  | { ok: false; error: string };

export async function registrarCobro(
  _previo: ResultadoCobro | null,
  formData: FormData,
): Promise<ResultadoCobro> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede registrar pagos." };
  }

  const crudo = formData.get("cobro");
  if (typeof crudo !== "string") {
    return { ok: false, error: "No llegaron los datos del pago." };
  }

  let datos: z.infer<typeof esquema>;
  try {
    datos = esquema.parse(JSON.parse(crudo));
  } catch (e) {
    const detalle = e instanceof z.ZodError ? e.issues[0]?.message : "formato inesperado";
    return { ok: false, error: `Los datos no son válidos: ${detalle}.` };
  }

  try {
    const supabase = await clienteServidor();

    // Los saldos se releen del servidor y NO se aceptan del formulario: cobrar
    // más de lo que se debe deja el comprobante en un estado que la base
    // rechaza (`comp_pagado_rango`), y el mensaje que sale de ahí no ayuda.
    const ids = [...new Set(datos.pagos.map((p) => p.comprobante_id))];
    const { data: docs, error: errorDocs } = await supabase
      .from("comprobantes")
      .select("id, numero, saldo, estado")
      .in("id", ids);

    if (errorDocs) return { ok: false, error: errorDocs.message };

    const porId = new Map((docs ?? []).map((d) => [String(d.id), d]));

    for (const id of ids) {
      const doc = porId.get(id);
      if (!doc) return { ok: false, error: "Uno de los documentos ya no existe." };
      if (doc.estado === "anulado") {
        return {
          ok: false,
          error: `${doc.numero} está anulado: no se le pueden aplicar pagos.`,
        };
      }

      // Se suma lo que va a este documento en ESTA tanda: dos pagos al mismo
      // comprobante en la misma pantalla podrían pasarse entre los dos aunque
      // ninguno se pase por separado.
      const aplicado = datos.pagos
        .filter((p) => p.comprobante_id === id)
        .reduce((a, p) => a + p.monto, 0);

      const saldo = Number(doc.saldo ?? 0);
      if (aplicado > Math.round((saldo + 0.01) * 100) / 100) {
        return {
          ok: false,
          error: `${doc.numero}: se están aplicando ${aplicado.toFixed(2)} sobre un saldo de ${saldo.toFixed(2)}.`,
        };
      }
    }

    const { data, error } = await supabase.rpc("registrar_pagos", {
      p_pagos: datos.pagos as unknown as Json,
    });
    if (error) return { ok: false, error: error.message };

    const r = data as unknown as { pagos: number };

    revalidatePath("/cobranzas");
    revalidatePath("/facturacion");
    for (const id of ids) revalidatePath(`/facturacion/${id}`);
    // El cobro cambia la cartera y los indicadores del tablero.
    revalidatePath("/reportes");
    revalidatePath("/dashboard");

    return {
      ok: true,
      registrados: Number(r.pagos ?? 0),
      total: Math.round(datos.pagos.reduce((a, p) => a + p.monto, 0) * 100) / 100,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo registrar el pago.",
    };
  }
}
