"use server";

import { z } from "zod";
import { perfilActual } from "@rodatech/db/servidor";

import { catalogosParaProducto, productoPorId } from "../api/consultas";
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

/* =========================================================================
   EDITAR la ficha sin salir de la cotización
   =========================================================================

   Luis, 16/09, viendo el primer diálogo —que solo tocaba lo impreso—: *«el
   editar nada que ver, no trae las marcas ni las familias ni las subfamilias;
   todo eso tiene que traer, todo lo que se puede editar»*.

   Así que «Editar artículo» edita la FICHA DEL CATÁLOGO, con los mismos siete
   campos del alta. Y el caso del retén —un código, varias marcas— se queda
   resuelto por el otro camino, que ya existe: la columna «Marca» de la fila,
   que cambia solo esa línea.

   Dos caminos, dos alcances, y cada uno dicho en su sitio:

     · columna Marca de la tabla  →  solo esta cotización;
     · Editar artículo            →  el catálogo, para todos.
*/

export interface FichaParaEditar {
  id: string;
  codigo: string;
  descripcion: string;
  marca_id: string;
  familia_id: string;
  subfamilia_id: string;
  unidad_codigo: string;
  precio_venta: number;
  ultimo_costo: number;
  precio_minimo: number;
}

/** La ficha y las listas, en un viaje: el diálogo necesita las dos cosas. */
export async function fichaParaEditar(id: string) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) {
    return { ok: false as const, error: "Hay que iniciar sesión." };
  }

  const [p, c] = await Promise.all([productoPorId(id), catalogosParaProducto()]);
  if (!p.ok) return { ok: false as const, error: p.error };
  if (!c.ok) return { ok: false as const, error: c.error };

  return {
    ok: true as const,
    datos: {
      producto: {
        id: p.datos.id,
        codigo: p.datos.codigo,
        descripcion: p.datos.descripcion,
        marca_id: p.datos.marca_id,
        familia_id: p.datos.familia_id,
        subfamilia_id: p.datos.subfamilia_id,
        unidad_codigo: p.datos.unidad_codigo,
        precio_venta: p.datos.precio_venta,
        ultimo_costo: p.datos.ultimo_costo,
        precio_minimo: p.datos.precio_minimo,
      } satisfies FichaParaEditar,
      marcas: c.datos.marcas,
      familias: c.datos.familias,
      subfamilias: c.datos.subfamilias,
      unidades: c.datos.unidades,
    },
  };
}

/*
  La edición admite tres campos que el alta no pregunta: costo, precio mínimo
  y —ya estaba— precio de lista.

  Luis, 17/09: *«en editar no puedo poner el precio de costo, precio mínimo y
  el precio normal o de lista pues»*. Y es donde hacen falta: 790 productos
  entraron del Excel sin costo y sin mínimo, y uno se entera de que faltan
  justo cotizando, no visitando el catálogo.

  `guardarProducto` sigue siendo quien valida que el mínimo no supere al de
  lista. Aquí solo se comprueba que sean números que existen.
*/
const esquemaEdicion = esquema.extend({
  id: z.string().uuid(),
  ultimo_costo: z.number().nonnegative().finite(),
  precio_minimo: z.number().nonnegative().finite(),
});

export async function editarProductoRapido(datos: {
  id: string;
  codigo: string;
  descripcion: string;
  marca_id: string;
  familia_id: string;
  subfamilia_id: string;
  unidad_codigo: string;
  precio_venta: number;
  ultimo_costo: number;
  precio_minimo: number;
  marcaNombre: string | null;
}): Promise<ResultadoAlta> {
  const v = esquemaEdicion.safeParse(datos);
  if (!v.success) {
    return { ok: false, error: v.error.issues[0]?.message ?? "Los datos no son válidos." };
  }

  /*
    El resto de la ficha se relee AQUÍ, no viaja por el navegador.

    `guardarProducto` recibe el producto entero y hace un `update` con todas
    las columnas, así que mandar ceros en lo que este diálogo no pregunta
    —costo, precio mínimo, stock mínimo y máximo, peso, ubicación, precio de
    mercado, proveedor— **borraría** esos datos sin que nadie lo pidiera.
    Editar la marca de un rodamiento no puede dejar su costo en cero.

    Y se relee en el servidor a propósito. Si estos campos viajaran ocultos en
    el formulario, una Server Action —que es un endpoint público— aceptaría el
    costo que le mandaran. Aquí lo único que puede cambiar es lo que el
    diálogo enseña.
  */
  const actual = await productoPorId(v.data.id);
  if (!actual.ok) return { ok: false, error: actual.error };

  const formData = new FormData();
  formData.set(
    "producto",
    JSON.stringify({
      id: v.data.id,

      // Lo que el diálogo edita.
      codigo: v.data.codigo,
      descripcion: v.data.descripcion,
      marca_id: v.data.marca_id,
      familia_id: v.data.familia_id,
      subfamilia_id: v.data.subfamilia_id,
      unidad_codigo: v.data.unidad_codigo,
      precio_venta: v.data.precio_venta,
      // Luis, 17/09: *«en editar no puedo poner el precio de costo, precio
      // mínimo y el precio de lista pues»*. Los tres se editan aquí porque
      // aquí es donde uno se entera de que faltan: cotizando.
      ultimo_costo: v.data.ultimo_costo,
      precio_minimo: v.data.precio_minimo,

      // Lo que se conserva tal cual estaba.
      codigo_fabricante: actual.datos.codigo_fabricante,
      stock_minimo: actual.datos.stock_minimo,
      stock_maximo: actual.datos.stock_maximo,
      peso_kg: actual.datos.peso_kg,
      ubicacion: actual.datos.ubicacion,
      precio_mercado: actual.datos.precio_mercado,
      proveedor_id: actual.datos.proveedor_id,

      /*
        `tipo_id` NO se conserva: se manda en null a propósito.

        Es lo que empareja este producto con el mismo de otra marca en el
        buscador de equivalentes (004). Si aquí se cambia la descripción, el
        tipo viejo deja de describirlo, y `guardarProducto` lo vuelve a
        deducir con `crear_tipo`, que es idempotente: si la descripción no
        cambió, devuelve el tipo que ya tenía.
      */
      tipo_id: null,
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
      // La edición no toca el almacén; quien la llama ya sabe su stock.
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
