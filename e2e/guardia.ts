/**
 * El seguro que impide correr las pruebas contra la base del CLIENTE.
 *
 * No es paranoia: estas pruebas emiten documentos, queman correlativos y mueven
 * stock. Contra el Supabase de Rodatech eso significa facturas con números
 * gastados que ya no se pueden recuperar —un correlativo no se devuelve— y un
 * kardex con movimientos que nadie hizo.
 *
 * El README lo dice desde el primer día: «Nunca deben apuntar al proyecto
 * Supabase del cliente». Esto lo hace cumplir en vez de confiar en que alguien
 * se acuerde, porque el día que se olvide va a ser justo el día que haya prisa.
 *
 * Cómo distinguirlos: el proyecto del cliente está fijado por su `ref`. Para
 * correr las pruebas hay que apuntar a otro proyecto, y decirlo a propósito con
 * `E2E_PERMITIR_ESCRITURA=1`.
 */

/**
 * El `ref` del Supabase de producción de Rodatech.
 *
 * Va escrito aquí a propósito y no leído del entorno: si saliera del mismo
 * `.env` que se está comprobando, bastaría un despiste para que la guardia se
 * apuntara a sí misma y dejara pasar todo.
 */
const REF_CLIENTE = "vlvwrobbdrxvcxvahunf";

export interface Veredicto {
  puedeEscribir: boolean;
  motivo: string;
  ref: string | null;
}

/** Saca el `ref` del proyecto de la URL de Supabase. */
export function refDeUrl(url: string | undefined): string | null {
  if (!url) return null;
  const m = /^https?:\/\/([a-z0-9]+)\.supabase\./i.exec(url.trim());
  return m?.[1] ?? null;
}

/**
 * ¿Se puede escribir contra la base a la que apunta el entorno?
 *
 * Función pura: recibe el entorno en vez de leerlo, para poder probarla.
 */
export function revisar(entorno: NodeJS.ProcessEnv): Veredicto {
  const ref = refDeUrl(entorno.NEXT_PUBLIC_SUPABASE_URL);

  if (!ref) {
    return {
      puedeEscribir: false,
      ref: null,
      motivo:
        "No se pudo leer NEXT_PUBLIC_SUPABASE_URL. Sin saber contra qué base se corre, no se escribe.",
    };
  }

  if (ref === REF_CLIENTE) {
    return {
      puedeEscribir: false,
      ref,
      motivo:
        `El entorno apunta al Supabase del CLIENTE (${ref}).\n\n` +
        "Estas pruebas emiten documentos y mueven stock: contra esta base dejarían\n" +
        "correlativos quemados —que no se recuperan— y movimientos de kardex que\n" +
        "nadie hizo.\n\n" +
        "Crea un proyecto Supabase aparte, aplícale las migraciones con\n" +
        "`pnpm db:aplicar`, y apunta ahí el `.env.local` antes de correr `pnpm e2e`.",
    };
  }

  if (entorno.E2E_PERMITIR_ESCRITURA !== "1") {
    return {
      puedeEscribir: false,
      ref,
      motivo:
        `El entorno apunta a ${ref}, que no es el del cliente. Bien.\n\n` +
        "Aun así hace falta decirlo a propósito: pon E2E_PERMITIR_ESCRITURA=1\n" +
        "para confirmar que esa base se puede ensuciar.",
    };
  }

  return { puedeEscribir: true, ref, motivo: `Escribiendo contra ${ref}.` };
}

/**
 * Corta la ejecución si no se puede escribir.
 *
 * Lo llaman SOLO las pruebas que mutan datos. Las de solo lectura —navegación,
 * permisos, búsqueda— pueden correr contra cualquier base sin ensuciarla, y
 * bloquearlas también dejaría el proyecto sin ninguna prueba de punta a punta
 * ejecutable, que es donde está hoy.
 */
export function exigirBaseDePruebas(): void {
  const v = revisar(process.env);
  if (!v.puedeEscribir) {
    throw new Error(`\n\n[e2e] Prueba de ESCRITURA detenida.\n\n${v.motivo}\n`);
  }
}
