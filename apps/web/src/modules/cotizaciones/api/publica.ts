import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";

/**
 * La cotización que hay detrás de un enlace público.
 *
 * ---------------------------------------------------------------------------
 * Sin sesión, y a propósito
 * ---------------------------------------------------------------------------
 * Es la única lectura del ERP que se hace SIN saber quién pregunta: el cliente
 * de Willy no tiene usuario y nunca lo va a tener. Lo que le da derecho a ver
 * este documento es tener el enlace, y nada más.
 *
 * Por eso no se lee ninguna tabla desde aquí. Se llama a
 * `cotizacion_por_token` (072), que es `security definer`, filtra por token
 * exacto y devuelve **solo lo que va impreso** — sin `costo_total`, sin
 * `margen_pct`, sin `costo_unitario` y sin el teléfono ni el correo del
 * cliente. Quien decide qué se enseña es la base, no un `select` de esta capa.
 *
 * La alternativa era leer las tablas con la clave de servicio, que salta RLS
 * por completo, y dejar toda la seguridad en que un `where` esté bien escrito
 * hoy y siga estándolo dentro de un año.
 */

/** Lo que devuelve la función de la base. Es lo que va en el papel. */
export interface CotizacionPublica {
  numero: string;
  fecha: string;
  estado: string;
  validez_dias: number;
  tiempo_entrega: string | null;
  orden_compra_cliente: string | null;
  contacto: string | null;
  condiciones: string | null;
  observaciones: string | null;
  mostrar_descuento: boolean;
  mostrar_disponibilidad: boolean;
  subtotal: number;
  descuento_total: number;
  igv: number;
  total: number;
  vendedor: string | null;
  cliente: {
    razon_social: string;
    numero_documento: string | null;
    tipo_documento: string;
    direccion: string | null;
    condicion_pago: string;
    dias_credito: number;
  };
  lineas: {
    orden: number;
    codigo: string;
    marca: string | null;
    descripcion: string;
    cantidad: number;
    unidad_codigo: string;
    valor_unitario: number;
    descuento_pct: number;
    disponibilidad: string;
    dias_entrega: number | null;
  }[];
}

/**
 * Devuelve `null` cuando el token no lleva a ninguna parte.
 *
 * Es un solo resultado para tres casos —token inventado, cotización borrada,
 * cotización anulada— y eso es deliberado: distinguirlos por fuera diría a
 * quien va probando tokens cuáles existen.
 */
export async function cotizacionPorToken(
  token: string,
): Promise<CotizacionPublica | null> {
  // Un token con la forma equivocada no llega a la base. No es por seguridad
  // —la función filtra igual— sino para no gastar una consulta por cada
  // barrido de URLs que pase por aquí.
  if (!/^[0-9a-f]{32}$/i.test(token)) return null;

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("cotizacion_por_token", {
      p_token: token,
    });

    if (error) {
      fallo(error, "cotizaciones/cotizacionPorToken");
      return null;
    }
    return (data as unknown as CotizacionPublica | null) ?? null;
  } catch (e) {
    fallo(e, "cotizaciones/cotizacionPorToken");
    return null;
  }
}
