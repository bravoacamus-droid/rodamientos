"use server";

import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

import { matrizDeArchivo } from "@/modules/importacion/api/hoja";

import { leerHojaAnalisis } from "../dominio/analisis-hoja";
import type { LineaAnalisis } from "../dominio/analisis";

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
