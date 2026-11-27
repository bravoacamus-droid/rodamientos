/**
 * El saludo de la portada del tablero (27/11).
 *
 * El supervisor encontró el tablero «muy plano, neutral»: abría con la
 * palabra «Tablero» y una frase de manual. Es la primera pantalla del día de
 * Willy, y «Buenas tardes, Willy» le dice que el sistema es suyo antes de
 * leer ninguna cifra.
 *
 * Puro: la hora y la fecha llegan de fuera, ya en la zona de Lima.
 */

/** «Buenos días» hasta las 12, «Buenas tardes» hasta las 19, «Buenas noches» después. */
export function saludoPorHora(hora: number): string {
  if (hora >= 5 && hora < 12) return "Buenos días";
  if (hora >= 12 && hora < 19) return "Buenas tardes";
  return "Buenas noches";
}

/**
 * El nombre de pila, con mayúscula inicial: «GIUSEPPE CALLE» → «Giuseppe».
 *
 * Los perfiles se dieron de alta en mayúsculas, y un saludo en mayúsculas se
 * lee como un grito. Si no hay nombre, cadena vacía y el saludo va sin él.
 */
export function nombreDePila(nombre: string | null | undefined): string {
  const primero = (nombre ?? "").trim().split(/\s+/)[0] ?? "";
  if (!primero) return "";
  return primero.charAt(0).toLocaleUpperCase("es-PE") + primero.slice(1).toLocaleLowerCase("es-PE");
}
