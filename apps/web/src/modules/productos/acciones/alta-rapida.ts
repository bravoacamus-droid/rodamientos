"use server";

import { z } from "zod";
import { perfilActual } from "@rodatech/db/servidor";

import { catalogosParaProducto } from "../api/consultas";
import { guardarProducto, type ResultadoProducto } from "./guardar";

/**
 * Dar de alta un producto SIN salir de donde estás.
 *
 * Willy, 16/09, cotizando: *«digito un código que no está creado y no me sale
 * la opción para crearlo en el sistema»*. Tecleó `22208` —un rodamiento SKF de
 * verdad— y el buscador le abrió una caja vacía. Ni resultados, ni salida.
 *
 * ---------------------------------------------------------------------------
 * Por qué aquí y no mandándolo a «Nuevo producto»
 * ---------------------------------------------------------------------------
 * Porque el constructor de cotizaciones **no guarda borrador**. Un enlace a
 * `/productos/nuevo` a mitad de una cotización de ocho líneas se lleva por
 * delante las ocho. La opción tiene que vivir donde está la persona.
 *
 * ---------------------------------------------------------------------------
 * Por qué se crea de verdad y no se mete una «línea libre»
 * ---------------------------------------------------------------------------
 * La tabla admite `producto_id` nulo y el papel lo imprime bien, así que era
 * tentador. Pero el flujo de esta casa es
 * `Cotización → Pedido → Compra → Recepción`, y **todo lo que viene después se
 * mueve por `producto_id`**: lo que falta comprar, el stock que descarga la
 * guía, el kardex. Una línea sin producto sale preciosa en el PDF y luego no
 * se puede comprar ni recibir — sería vender algo que el sistema no sabe
 * atender.
 *
 * Se crea con lo mínimo: código, descripción, marca, familia, sub-familia,
 * unidad y precio. Todo lo demás —costo, pesos, mínimos— nace en cero, que es
 * exactamente como están los 790 que entraron del Excel.
 */

export type ResultadoAlta =
  | {
      ok: true;
      producto: {
        id: string;
        codigo: string;
        descripcion: string;
        marca: string | null;
        unidad: string;
        precio_venta: number;
        stock: number;
      };
    }
  | { ok: false; error: string };

/** Lo que hay que elegir en el diálogo. Se pide al abrirlo, no antes. */
export async function catalogosParaAlta() {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) {
    return { ok: false as const, error: "Hay que iniciar sesión." };
  }

  const r = await catalogosParaProducto();
  if (!r.ok) return { ok: false as const, error: r.error };

  // Del catálogo completo, solo lo que el alta rápida pregunta. Mandar los
  // proveedores y los tipos sería arrastrar al navegador listas que este
  // diálogo no usa.
  return {
    ok: true as const,
    datos: {
      marcas: r.datos.marcas,
      familias: r.datos.familias,
      subfamilias: r.datos.subfamilias,
      unidades: r.datos.unidades,
    },
  };
}

const esquema = z.object({
  codigo: z.string().trim().min(1, "El código es obligatorio").max(60),
  descripcion: z.string().trim().min(3, "Falta la descripción").max(300),
  marca_id: z.string().uuid("Elige una marca"),
  familia_id: z.string().uuid("Elige una familia"),
  subfamilia_id: z.string().uuid("Elige una sub-familia"),
  unidad_codigo: z.string().min(2).max(4),
  precio_venta: z.number().nonnegative().finite(),
});

export async function crearProductoRapido(datos: {
  codigo: string;
  descripcion: string;
  marca_id: string;
  familia_id: string;
  subfamilia_id: string;
  unidad_codigo: string;
  precio_venta: number;
  marcaNombre: string | null;
}): Promise<ResultadoAlta> {
  const v = esquema.safeParse(datos);
  if (!v.success) {
    return { ok: false, error: v.error.issues[0]?.message ?? "Los datos no son válidos." };
  }

  /*
    Se delega en `guardarProducto` en vez de insertar aquí.

    Es la única escritura del maestro, y ahí viven el candado de rol —solo
    gerencia, administración y compras tocan el catálogo—, el mensaje del
    código repetido y la regla de que el precio mínimo no supere al de lista.
    Duplicar el insert sería abrir un segundo camino al maestro que mañana no
    se entera de una regla nueva. Ya pasó dos veces en este proyecto.

    Todo lo que el alta rápida no pregunta va en cero, igual que los 790
    productos que entraron del Excel.
  */
  const formData = new FormData();
  formData.set(
    "producto",
    JSON.stringify({
      codigo: v.data.codigo,
      codigo_fabricante: null,
      descripcion: v.data.descripcion,
      marca_id: v.data.marca_id,
      familia_id: v.data.familia_id,
      subfamilia_id: v.data.subfamilia_id,
      unidad_codigo: v.data.unidad_codigo,
      ultimo_costo: 0,
      precio_venta: v.data.precio_venta,
      precio_minimo: 0,
      stock_minimo: 0,
      stock_maximo: 0,
      peso_kg: 0,
      ubicacion: null,
      precio_mercado: 0,
      proveedor_id: null,
    }),
  );

  const r: ResultadoProducto = await guardarProducto(null, formData);
  if (!r.ok) return { ok: false, error: r.error };

  return {
    ok: true,
    producto: {
      id: r.id,
      codigo: r.codigo,
      descripcion: v.data.descripcion,
      marca: datos.marcaNombre,
      unidad: v.data.unidad_codigo,
      precio_venta: v.data.precio_venta,
      // Nace sin stock, y eso es un dato: la línea saldrá marcada como algo
      // que hay que conseguir, no como algo que está en el almacén.
      stock: 0,
    },
  };
}

/**
 * Los nombres de las marcas que ya existen, para sugerir al escribir.
 *
 * Willy, 16/09, sobre los retenes: *«puede ser diversas marcas: LYO, NQK, PHK,
 * NAK… etc»*. Ese «etc» es el motivo de que esto sugiera y no obligue: la
 * marca de una línea de cotización es texto —una copia de lo que se imprimió—
 * y no una clave ajena. Si la que hace falta no está en el catálogo, se
 * escribe y ya; el maestro no se toca.
 */
export async function marcasConocidas(): Promise<string[]> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return [];

  const r = await catalogosParaProducto();
  return r.ok ? r.datos.marcas.map((m) => m.nombre) : [];
}
