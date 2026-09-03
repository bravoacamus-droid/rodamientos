import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import type { EmisorHoja } from "@/componentes/hoja-documento";

import { fallo } from "./errores";

/**
 * Los datos de Rodatech tal como salen impresos en la cabecera de cualquier
 * documento.
 *
 * Vive aquí y no dentro de un módulo porque lo necesitan CUATRO: la
 * cotización, la factura, la boleta y la guía. Antes solo lo pedía
 * cotizaciones, dentro de su propia consulta, y por eso al construir la
 * impresión de la factura no había de dónde sacarlo.
 *
 * Un fallo aquí NO tumba el documento: se devuelve un emisor mínimo con el
 * RUC vacío. Una factura que no se puede imprimir porque la fila de la empresa
 * no cargó es peor que una con la cabecera a medias — el número, el cliente y
 * los importes, que es lo que tiene valor, están en el documento y no aquí.
 */
export async function emisorParaImprimir(): Promise<EmisorHoja> {
  const vacio: EmisorHoja = {
    razonSocial: "",
    nombreComercial: null,
    ruc: "",
    direccion: null,
    telefono: null,
    email: null,
    web: null,
    logoUrl: null,
  };

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("empresa")
      .select(
        "razon_social, nombre_comercial, ruc, direccion, telefono, email_ventas, email, web, logo_url",
      )
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      fallo(error, "lib/emisorParaImprimir");
      return vacio;
    }
    if (!data) return vacio;

    return {
      razonSocial: String(data.razon_social ?? ""),
      nombreComercial: (data.nombre_comercial as string | null) ?? null,
      ruc: String(data.ruc ?? ""),
      direccion: (data.direccion as string | null) ?? null,
      telefono: (data.telefono as string | null) ?? null,
      // El de ventas primero: es al que se quiere que conteste el cliente.
      email: (data.email_ventas as string | null) ?? (data.email as string | null) ?? null,
      web: (data.web as string | null) ?? null,
      logoUrl: (data.logo_url as string | null) ?? null,
    };
  } catch (e) {
    fallo(e, "lib/emisorParaImprimir");
    return vacio;
  }
}
