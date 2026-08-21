"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import type { Json } from "@rodatech/db/tipos";

import { leerPlantilla, matrizDeArchivo } from "../api/hoja";
import { columnasQueFaltan } from "../dominio/plantilla";
import type {
  FilaPlantilla,
  ResultadoAnalisis,
  ResumenImportacion,
} from "../dominio/tipos";

/**
 * Importación del maestro de productos, en dos pasos.
 *
 *   analizar()  lee el archivo y pide a la base el PLAN, sin escribir nada
 *   confirmar() aplica ese mismo plan
 *
 * Los dos llaman a `importar_productos()`, que resuelve catálogos y dictamina
 * cada fila con el MISMO código en los dos modos. Si la previsualización y la
 * aplicación fueran caminos distintos, la pantalla podría prometer algo que el
 * guardado no cumple.
 *
 * El .xlsx se lee SIEMPRE en el servidor. ExcelJS pesa cerca de un mega: en el
 * navegador lo pagaría cada persona que abre el ERP, use el importador o no.
 */

/** Quién puede tocar el maestro. Compras lo mantiene; gerencia y admin, todo. */
const ROLES_IMPORTACION = ["gerencia", "admin", "compras"] as const;

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FILAS = 5000;

const esquemaFila = z.object({
  fila: z.number().int().nonnegative(),
  codigo: z.string().min(1).max(60),
  familia: z.string().max(120),
  subfamilia: z.string().max(120),
  tipo: z.string().max(200),
  marca: z.string().max(80),
  stock: z.number().finite(),
  stock_minimo: z.number().finite(),
  precio_compra: z.number().finite(),
  precio_venta: z.number().finite(),
  precio_minimo: z.number().finite(),
});

const esquemaLote = z.array(esquemaFila).min(1).max(MAX_FILAS);

async function exigirPermiso(): Promise<string | null> {
  const perfil = await perfilActual();
  if (!perfil) return "Hay que iniciar sesión.";
  if (!perfil.activo) return "La cuenta está desactivada.";
  if (!ROLES_IMPORTACION.includes(perfil.rol as (typeof ROLES_IMPORTACION)[number])) {
    return "Tu rol no puede cargar el maestro de productos. Lo hace Compras o Gerencia.";
  }
  return null;
}

/** Paso 1: leer el archivo y pedir el plan. No escribe nada. */
export async function analizar(
  _previo: ResultadoAnalisis | null,
  formData: FormData,
): Promise<ResultadoAnalisis> {
  const problema = await exigirPermiso();
  if (problema) return { ok: false, error: problema };

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Elige el archivo .xlsx con la plantilla llena." };
  }
  if (archivo.size > MAX_BYTES) {
    return {
      ok: false,
      error: `El archivo pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y el tope son 5 MB. Mándalo en tandas.`,
    };
  }
  if (!archivo.name.toLowerCase().endsWith(".xlsx")) {
    return {
      ok: false,
      error: "El archivo tiene que ser .xlsx. Si es .xls o .csv, ábrelo en Excel y guárdalo como .xlsx.",
    };
  }

  let lectura: Awaited<ReturnType<typeof leerPlantilla>>;
  let matriz: string[][] = [];
  try {
    const datos = await archivo.arrayBuffer();
    lectura = await leerPlantilla(datos);
    if (!lectura) matriz = await matrizDeArchivo(datos);
  } catch {
    return {
      ok: false,
      error: "No se pudo abrir el archivo. ¿Está dañado o protegido con contraseña?",
    };
  }

  if (!lectura) {
    // Se vuelve a mirar la matriz solo para poder decir QUÉ columna falta.
    const faltan = columnasQueFaltan(matriz);
    return {
      ok: false,
      error:
        faltan.length > 0
          ? `No se encontraron estas columnas: ${faltan.join(", ")}. Usa la plantilla sin cambiarle los títulos.`
          : "No se encontró la fila de títulos. Usa la plantilla tal cual se envió.",
    };
  }

  const { filas, problemas } = lectura;
  if (filas.length === 0) {
    return {
      ok: false,
      error: "El archivo no tiene ninguna fila con código de producto.",
      problemas,
    };
  }
  if (filas.length > MAX_FILAS) {
    return {
      ok: false,
      error: `Son ${filas.length} filas y el tope por tanda son ${MAX_FILAS}.`,
    };
  }

  const resumen = await pedirPlan(filas, true);
  if (!resumen.ok) return { ok: false, error: resumen.error, problemas };

  return { ok: true, resumen: resumen.datos, filas, problemas };
}

/** Paso 2: aplicar. Recibe las filas que la previsualización devolvió. */
export async function confirmar(
  _previo: { ok: boolean; error?: string; resumen?: ResumenImportacion } | null,
  formData: FormData,
): Promise<{ ok: boolean; error?: string; resumen?: ResumenImportacion }> {
  const problema = await exigirPermiso();
  if (problema) return { ok: false, error: problema };

  const crudo = formData.get("filas");
  if (typeof crudo !== "string") {
    return { ok: false, error: "Se perdieron los datos del análisis. Vuelve a subir el archivo." };
  }

  // La entrada de una Server Action es hostil hasta que se demuestre lo
  // contrario, aunque venga de una pantalla nuestra. Se revalida entera.
  let filas: FilaPlantilla[];
  try {
    filas = esquemaLote.parse(JSON.parse(crudo));
  } catch {
    return { ok: false, error: "Los datos del análisis no son válidos. Vuelve a subir el archivo." };
  }

  const resultado = await pedirPlan(filas, false);
  if (!resultado.ok) return { ok: false, error: resultado.error };

  revalidatePath("/productos");
  revalidatePath("/inventario");
  revalidatePath("/dashboard");

  return { ok: true, resumen: resultado.datos };
}

type Respuesta =
  | { ok: true; datos: ResumenImportacion }
  | { ok: false; error: string };

/** Una sola llamada con todo el lote: nunca una por fila. */
async function pedirPlan(
  filas: FilaPlantilla[],
  simular: boolean,
): Promise<Respuesta> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("importar_productos", {
      // `Json` es un tipo estructural y una interfaz declarada no le encaja,
      // aunque su contenido sea JSON puro. `FilaPlantilla` son strings y
      // numbers; el zod de arriba ya lo garantiza.
      p_filas: filas as unknown as Json,
      p_simular: simular,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, datos: data as unknown as ResumenImportacion };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error inesperado." };
  }
}
