/**
 * La contraseña que se le da a un empleado el primer día.
 *
 * Luis, 24/09: *«eso de las contraseñas ps se crea una automáticamente»*. Quien
 * da de alta no la elige — la recibe hecha, se la pasa al empleado, y el
 * empleado la cambia antes de ver nada (092).
 *
 * ---------------------------------------------------------------------------
 * Por qué no es una cadena aleatoria a secas
 * ---------------------------------------------------------------------------
 * Esta contraseña se va a DICTAR. Por teléfono, por WhatsApp o en voz alta
 * encima de un mostrador, y quien la lee es Willy, que no ve bien. Una
 * aleatoria de las de siempre —`xK8l1O0zIj`— es exactamente el peor caso: la
 * l y la 1, la O y el 0, la I y la l no se distinguen en pantalla ni se
 * distinguen dictadas.
 *
 * Así que:
 *   · Fuera las letras y cifras que se confunden: I, l, 1, O, 0, y también
 *     las mayúsculas que se parecen a otra cosa (S/5, B/8, Z/2).
 *   · En tres grupos de cuatro separados por guiones. Leer «jefe, guion,
 *     mando, guion, viaje» es otra cosa que leer doce caracteres seguidos.
 *   · Sin símbolos raros: un `#` en un teclado de móvil peruano es un viaje.
 *
 * El alfabeto queda en 30 caracteres y son 12 útiles, así que son 30^12 ≈ 5×10^17
 * combinaciones. De sobra para algo que solo vale hasta el primer acceso, y la
 * 092 se encarga de que no valga más.
 */

/**
 * Lo que queda al quitar un miembro de cada pareja que se confunde.
 *
 * Se va la LETRA y se queda la CIFRA, siempre: quien dicta dice «ocho» sin
 * pensarlo y «be» obliga a aclarar «be de burro». Así que fuera B (8), S (5),
 * Z (2), O (0), I y L (1). Sin la letra, la cifra deja de ser ambigua — por
 * eso el 8 y el 9 sí están.
 */
export const ALFABETO = "ACDEFGHJKMNPQRTUVWXY346789";

/** Las parejas que motivan el alfabeto. El test comprueba que no vuelvan. */
export const PAREJAS_QUE_SE_CONFUNDEN: readonly [string, string][] = [
  ["B", "8"],
  ["S", "5"],
  ["Z", "2"],
  ["O", "0"],
  ["I", "1"],
  ["L", "1"],
];

/** Tres grupos de cuatro: `HRKM-79QF-3TDW`. */
const GRUPOS = 3;
const POR_GRUPO = 4;

export const LARGO_CONTRASENA_GENERADA = GRUPOS * POR_GRUPO;

/**
 * Genera la contraseña inicial.
 *
 * `aleatorio` se inyecta para poder probar esto sin depender del reloj ni del
 * azar — es la regla del directorio `dominio/`. En producción entra
 * `crypto.getRandomValues`, que es lo que hay que usar: `Math.random()` no es
 * criptográfico y esto es una credencial, aunque dure un día.
 */
export function generarContrasenaInicial(
  aleatorio: (n: number) => Uint8Array = bytesSeguros,
): string {
  const total = GRUPOS * POR_GRUPO;

  /*
    Se piden más bytes de los necesarios y se descartan los que caen en el
    resto de la división. Hacer `byte % 26` sería más corto y estaría sesgado:
    los primeros caracteres del alfabeto saldrían más veces, y un sesgo en un
    generador de credenciales no se nota hasta que importa.
  */
  const tope = Math.floor(256 / ALFABETO.length) * ALFABETO.length;
  const letras: string[] = [];

  while (letras.length < total) {
    for (const b of aleatorio(total * 2)) {
      if (b >= tope) continue;
      letras.push(ALFABETO.charAt(b % ALFABETO.length));
      if (letras.length === total) break;
    }
  }

  const grupos: string[] = [];
  for (let i = 0; i < GRUPOS; i += 1) {
    grupos.push(letras.slice(i * POR_GRUPO, (i + 1) * POR_GRUPO).join(""));
  }
  return grupos.join("-");
}

function bytesSeguros(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}
