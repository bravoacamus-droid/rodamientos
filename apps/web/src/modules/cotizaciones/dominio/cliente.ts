/**
 * Lo que el selector de cliente sabe decir sin preguntarle a nadie.
 *
 * El ORDEN de los resultados lo decide Postgres (`buscar_clientes`, migración
 * 030): ahí están los índices. Aquí vive lo otro —qué se lee en cada fila, qué
 * se puede elegir y qué trozo del texto coincide con lo tecleado—, que es puro,
 * se prueba sin base y sin React, y es justo donde estaban los errores.
 *
 * Lo que NO es propio del cliente —resaltar, reconocer un documento, decir
 * cuánto hace— vive en `lib/texto-busqueda.ts` desde la 033, cuando el
 * selector de proveedor necesitó lo mismo. Se reexporta aquí para que ningún
 * llamador tuviera que cambiar.
 *
 * Igual que en `reportes/dominio/rango.ts`: el «hoy» lo inyecta quien llama.
 * Un «cotizado ayer» no puede cambiar según la zona horaria del equipo que
 * abre la pantalla.
 */

import { hace } from "@/lib/texto-busqueda";

export {
  digitosDe,
  pareceDocumento,
  resaltar,
  type Trozo,
} from "@/lib/texto-busqueda";

/** Un cliente tal y como lo devuelven `buscar_clientes` y `clientes_sugeridos`. */
export interface ClienteOpcion {
  id: string;
  codigo: string;
  razon_social: string;
  nombre_comercial: string | null;
  numero_documento: string | null;
  tipo_documento: string;
  /** El contacto PRINCIPAL, si tiene. Desde la 035 sale de `cliente_contactos`. */
  contacto: string | null;
  /** Cuántos contactos activos tiene. La fila lo dice cuando hay más de uno. */
  contactos: number;
  telefono: string | null;
  condicion_pago: string;
  /** Al elegir cliente se muestra su condición; «A crédito» sin decir a
   *  cuántos días no le sirve a nadie. */
  dias_credito: number;
  bloqueado: boolean;
  motivo_bloqueo: string | null;
  activo: boolean;
  /** Cuántas veces se le ha cotizado. Distingue a dos nombres parecidos. */
  cotizaciones: number;
  /** Fecha `aaaa-mm-dd` de la última cotización, o null si nunca. */
  ultima_cotizacion: string | null;
}

/* ------------------------------------------------------------------ Estado */

/**
 * Por qué NO se puede cotizar a este cliente, o null si sí se puede.
 *
 * Devuelve el motivo y no un booleano a propósito: una fila que simplemente no
 * se deja pulsar parece que la pantalla está rota. El bloqueo de un cliente
 * siempre tiene motivo escrito (lo exige `bloquearCliente`), así que hay algo
 * concreto que decir.
 */
export function motivoNoSeleccionable(
  cliente: Pick<ClienteOpcion, "activo" | "bloqueado" | "motivo_bloqueo">,
): string | null {
  if (!cliente.activo) {
    return "Está desactivado. Reactívalo en su ficha antes de cotizarle.";
  }
  if (cliente.bloqueado) {
    return cliente.motivo_bloqueo?.trim()
      ? `Bloqueado: ${cliente.motivo_bloqueo.trim()}`
      : "Está bloqueado y no se le puede cotizar.";
  }
  return null;
}

/**
 * La condición de pago en palabras.
 *
 * Sin importes: el dominio no formatea dinero, que lleva moneda y separadores
 * y eso es cosa de `@rodatech/ui`.
 */
export function resumenCredito(
  cliente: Pick<ClienteOpcion, "condicion_pago" | "dias_credito">,
): string {
  if (cliente.condicion_pago !== "credito") return "Al contado";
  return cliente.dias_credito > 0
    ? `A crédito · ${cliente.dias_credito} días`
    : "A crédito";
}

/* ------------------------------------------------------------- Cuánto hace */

/**
 * «Cotizado ayer», «Cotizado hace 3 meses», «Nunca cotizado».
 *
 * El cálculo está en `lib/texto-busqueda.ts`; aquí solo va el verbo, que es lo
 * único propio del cliente. El selector de proveedor dice «Comprado …» con la
 * misma cuenta detrás.
 */
export function ultimaVez(fecha: string | null, hoy: string): string {
  if (!fecha) return "Nunca cotizado";
  const cuando = hace(fecha, hoy);
  // «hoy» y «ayer» no llevan «hace» delante; el resto sí, y ya viene puesto.
  return `Cotizado ${cuando}`;
}
