/**
 * Lectura y saneamiento de las credenciales de Supabase.
 *
 * Al pegar variables de entorno en paneles como Vercel es habitual arrastrar un
 * salto de línea, un espacio o comillas. Eso rompe la construcción de la cabecera
 * `apikey` y el navegador falla con «Failed to execute 'fetch' on 'Window':
 * Invalid value», un mensaje que no señala la causa. Aquí se limpian los valores
 * y se lanza un error explícito cuando faltan o quedan mal formados.
 */

function limpiar(valor: string | undefined): string {
  return (valor ?? "")
    .trim()
    .replace(/^["']|["']$/g, "")   // comillas envolventes
    .replace(/[\r\n\t]/g, "");      // saltos de línea y tabuladores
}

export function credencialesSupabase() {
  const url = limpiar(process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, "");
  const anonKey = limpiar(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!url || !anonKey) {
    throw new Error(
      "Faltan las credenciales de Supabase. Defina NEXT_PUBLIC_SUPABASE_URL y " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY en el entorno de despliegue."
    );
  }

  if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url)) {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL tiene un formato inesperado: «${url}». ` +
        "Debe ser https://<ref>.supabase.co sin barra final."
    );
  }

  if (anonKey.split(".").length !== 3) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY no parece un JWT válido (deben ser tres " +
        "segmentos separados por punto). Verifique que se copió completa y sin " +
        "saltos de línea."
    );
  }

  return { url, anonKey };
}
