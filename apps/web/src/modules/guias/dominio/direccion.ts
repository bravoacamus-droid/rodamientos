/**
 * La dirección reducida a lo que la distingue (195): sin espacios ni signos,
 * en mayúsculas. «AV. SAN GENARO NRO. 222» y «Av. San Genaro Nro 222» son la
 * misma. Lo mismo que calcula la columna `cliente_direcciones.clave`.
 */
export function claveDireccion(s: string): string {
  return s.toUpperCase().replace(/[^\p{L}\p{N}]/gu, "");
}
