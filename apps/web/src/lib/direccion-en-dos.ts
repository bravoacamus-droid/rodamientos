/**
 * La dirección del membrete, partida en dos renglones parejos.
 *
 * Willy, 04/11 (reunión, 1:06): *«la dirección escapa… mejor lo hago en dos
 * líneas bonitas, para que aumente también el ancho y me dé la opción de
 * agrandar el logo»*. Dejada a su aire, la dirección se partía donde se
 * acababa el sitio —«…1RA ETAPA, SAN JUAN DE» / «LURIGANCHO, LIMA - LIMA»— y
 * el bloque del emisor salía largo y desigual.
 *
 * Se corta en la coma más cercana a la mitad, que es donde la dirección ya
 * se separa sola (la calle de la urbanización, el distrito de la provincia).
 * Sin comas, o si la coma deja un renglón de menos de un cuarto, va entera.
 */
export function direccionEnDos(direccion: string | null | undefined): string[] {
  const d = (direccion ?? "").trim();
  if (!d) return [];
  const mitad = d.length / 2;
  let mejor = -1;
  for (let i = d.indexOf(","); i !== -1; i = d.indexOf(",", i + 1)) {
    if (mejor === -1 || Math.abs(i - mitad) < Math.abs(mejor - mitad)) mejor = i;
  }
  if (mejor === -1) return [d];
  const primera = d.slice(0, mejor + 1).trim();
  const segunda = d.slice(mejor + 1).trim();
  if (primera.length < d.length / 4 || segunda.length < d.length / 4) return [d];
  return [primera, segunda];
}
