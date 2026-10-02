"use server";

import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

import { matrizDeArchivo } from "@/modules/importacion/api/hoja";

import { libroAnalisis } from "../api/analisis-excel";
import { leerHojaAnalisis } from "../dominio/analisis-hoja";
import type { LineaAnalisis, ProductoParaAnalizar } from "../dominio/analisis";

const ROLES = ["gerencia", "admin", "compras"] as const;
/** Su hoja pesa 17 KB; el tope de una Server Action es 1 MB. */
const MAX_BYTES = 900 * 1024;

/**
 * Lo que cuenta de un código para cruzarlo: letras y números.
 *
 * Su hoja escribe `6312 2Z/C3` y el catálogo `6312-2Z/C3`; `NKIB 5902-XL`
 * contra `NKIB5902-XL`. Comparar el texto tal cual daba «no está en el
 * catálogo» a productos que sí están.
 */
const claveCodigo = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * El producto del catálogo para el código que se acaba de escribir en una
 * fila, o null si no está. La pantalla lo llama al salir del campo.
 *
 * Con dos marcas del mismo código manda la escrita; si no desempata, no se
 * adivina.
 */
export async function productoPorCodigo(
  codigo: string,
  marca: string,
): Promise<ProductoParaAnalizar | null> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo || !ROLES.includes(perfil.rol as (typeof ROLES)[number])) return null;
  const trozos = String(codigo).toUpperCase().match(/[A-Z0-9]+/g);
  if (!trozos || trozos.join("").length < 2) return null;

  const supabase = await clienteServidor();
  // «6313 2Z/C3» → `6313%2Z%C3`: encuentra «6313-2Z/C3» y se afina aquí abajo.
  const { data } = await supabase
    .from("productos")
    .select("id, codigo, descripcion, peso_kg, precio_mercado, marcas(nombre)")
    .eq("es_kit", false)
    .ilike("codigo", trozos.join("%"))
    .limit(20);
  type Fila = {
    id: string;
    codigo: string;
    descripcion: string;
    peso_kg: number | null;
    precio_mercado: number | null;
    marcas: { nombre: string } | null;
  };
  const clave = trozos.join("");
  const candidatos = ((data ?? []) as unknown as Fila[]).filter((p) => claveCodigo(p.codigo) === clave);
  const m = String(marca).trim().toUpperCase();
  const p =
    candidatos.length === 1
      ? candidatos[0]
      : candidatos.find((c) => (c.marcas?.nombre ?? "").toUpperCase() === m);
  if (!p) return null;
  return {
    id: p.id,
    codigo: p.codigo,
    descripcion: p.descripcion,
    marca: p.marcas?.nombre ?? null,
    peso_kg: Number(p.peso_kg) || 0,
    precio_mercado: Number(p.precio_mercado) || 0,
  };
}

export type ResultadoHoja =
  | {
      ok: true;
      lineas: Omit<LineaAnalisis, "key" | "fobAnterior">[];
      costoEnvio: number | null;
      problemas: string[];
      enCatalogo: number;
    }
  | { ok: false; error: string; problemas?: string[] };

/**
 * Sube su hoja de Excel y la devuelve como líneas del análisis. No guarda
 * nada: la pantalla la enseña y Willy guarda cuando la ha visto.
 */
export async function leerExcelAnalisis(formData: FormData): Promise<ResultadoHoja> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede hacer análisis de importación." };
  }

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Elige el archivo de Excel." };
  }
  if (archivo.size > MAX_BYTES) {
    return { ok: false, error: "El archivo es demasiado grande para una proforma. ¿Es el correcto?" };
  }
  if (!archivo.name.toLowerCase().endsWith(".xlsx")) {
    return {
      ok: false,
      error: "Tiene que ser un .xlsx. Si es .xls, ábrelo en Excel y guárdalo como «Libro de Excel».",
    };
  }

  let matriz: string[][];
  try {
    matriz = await matrizDeArchivo(await archivo.arrayBuffer());
  } catch {
    return { ok: false, error: "No se pudo abrir el archivo. ¿Está dañado o protegido con contraseña?" };
  }

  const lectura = leerHojaAnalisis(matriz);
  if (lectura.filas.length === 0) {
    return { ok: false, error: lectura.problemas[0] ?? "La hoja está vacía.", problemas: lectura.problemas };
  }

  // El catálogo entero sin kits: son ~800 filas y así se cruza con la clave
  // normalizada, que una consulta `in` no puede hacer.
  const supabase = await clienteServidor();
  const { data, error } = await supabase
    .from("productos")
    .select("id, codigo, descripcion, peso_kg, precio_mercado, marcas(nombre)")
    .eq("es_kit", false)
    .limit(5000);
  if (error) return { ok: false, error: "No se pudo leer el catálogo. Prueba otra vez." };

  type Producto = {
    id: string;
    codigo: string;
    descripcion: string;
    peso_kg: number | null;
    precio_mercado: number | null;
    marcas: { nombre: string } | null;
  };
  const porClave = new Map<string, Producto[]>();
  for (const p of (data ?? []) as unknown as Producto[]) {
    const k = claveCodigo(p.codigo);
    porClave.set(k, [...(porClave.get(k) ?? []), p]);
  }

  let enCatalogo = 0;
  const lineas = lectura.filas.map((f) => {
    const candidatos = porClave.get(claveCodigo(f.codigo)) ?? [];
    // Con dos marcas del mismo código, manda la que dice la hoja. Si no
    // desempata, no se adivina: se queda como «no está en el catálogo».
    const p =
      candidatos.length === 1
        ? candidatos[0]
        : candidatos.find((c) => (c.marcas?.nombre ?? "").toUpperCase() === f.marca);
    if (p) enCatalogo++;
    return {
      productoId: p?.id ?? null,
      codigo: p?.codigo ?? f.codigo,
      marca: f.marca || (p?.marcas?.nombre ?? "").toUpperCase(),
      descripcion: p?.descripcion ?? "",
      cantidadRef: f.cantidadRef,
      cantidadPedido: f.cantidadPedido,
      precioFob: f.precioFob,
      // Lo de la hoja manda; si está vacío, lo que sepa el catálogo.
      pesoKg: f.pesoKg || Number(p?.peso_kg) || 0,
      precioMercado: f.precioMercado || Number(p?.precio_mercado) || 0,
      proveedorMercado: f.proveedorMercado,
      frecuencia: f.frecuencia,
      cliente: f.cliente,
    };
  });

  return { ok: true, lineas, costoEnvio: lectura.costoEnvio, problemas: lectura.problemas, enCatalogo };
}

// ---------------------------------------------------------------------------
// De vuelta a Excel
// ---------------------------------------------------------------------------

const numero = z.number().finite().nonnegative();
const texto = (max: number) => z.string().max(max).default("");

/* TODOS los campos declarados: `z.object` quita en silencio lo que no conoce. */
const esquemaExcel = z.object({
  numero: z.string().max(40).nullable().default(null),
  proveedor: z.string().max(200).nullable().default(null),
  referencia: texto(80),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  costoEnvio: numero.max(10_000_000),
  desaduanajeSoles: numero.max(10_000_000).default(0),
  tipoCambio: numero.max(100).default(0),
  lineas: z
    .array(
      z.object({
        cliente: texto(120),
        frecuencia: numero.max(10_000).nullable().default(null),
        codigo: z.string().trim().min(1).max(80),
        marca: texto(60),
        cantidadRef: numero.max(1_000_000),
        precioFob: numero.max(10_000_000),
        pesoKg: numero.max(5000),
        cantidadPedido: numero.max(1_000_000),
        precioMercado: numero.max(10_000_000),
        proveedorMercado: texto(120),
      }),
    )
    .min(1, "No hay productos que exportar.")
    .max(300),
});

export type ResultadoExcel =
  | { ok: true; base64: string; nombre: string }
  | { ok: false; error: string };

/**
 * El análisis que está en pantalla, como un .xlsx con el formato y las
 * fórmulas de su hoja (ver `api/analisis-excel.ts`). Exporta lo que se ve,
 * esté guardado o no: no escribe nada.
 */
export async function exportarAnalisisExcel(entrada: unknown): Promise<ResultadoExcel> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede hacer análisis de importación." };
  }
  const v = esquemaExcel.safeParse(entrada);
  if (!v.success) {
    return { ok: false, error: v.error.issues[0]?.message ?? "Los datos no son válidos." };
  }
  try {
    const libro = await libroAnalisis(v.data);
    // Sin caracteres que Windows no acepta en un nombre de archivo.
    const base = (v.data.numero ?? v.data.referencia) || v.data.fecha;
    const nombre = `Analisis importacion ${base}`.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80) + ".xlsx";
    return { ok: true, base64: libro.toString("base64"), nombre };
  } catch {
    return { ok: false, error: "No se pudo armar el Excel. Prueba otra vez." };
  }
}
