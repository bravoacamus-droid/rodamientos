/**
 * Soles a dólares con el tipo de cambio de la compra (042, 06/11). La misma
 * cuenta que hace la base al recibir y que usan los reportes (133, 196):
 * dividir. Sin tipo de cambio no se inventa uno: devuelve el número tal cual.
 */
export function enDolares(soles: number, tipoCambio: number): number {
  if (!(tipoCambio > 0)) return soles;
  return Math.round((soles / tipoCambio) * 100) / 100;
}
