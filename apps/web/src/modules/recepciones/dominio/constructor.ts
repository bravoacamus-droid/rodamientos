import { costearRecepcion, redondear2, redondear4, type CosteoRecepcion } from "./costeo";
import type { CompraPendiente } from "./tipos";

/**
 * El estado del registro de recepción, como reducer PURO.
 *
 * Mismo patrón que el constructor de cotizaciones: entra un estado y una
 * acción, sale un estado. Sin React, sin fetch, sin `Date.now()` ni
 * `Math.random()` — las claves de fila salen de un contador, para que dos
 * ejecuciones iguales den el mismo resultado y se puedan comparar en un test.
 */

/** Un producto tal como lo devuelve `buscar_productos`. */
export interface ProductoParaRecibir {
  id: string;
  codigo: string;
  descripcion: string;
  marca: string | null;
  unidad?: string;
  stock?: number;
  /** Costo promedio vigente. Sirve de referencia y de valor por defecto. */
  costo_promedio?: number;
}

export interface LineaRecibida {
  /** Clave estable para React. Determinista: sale de un contador. */
  key: string;
  productoId: string;
  codigo: string;
  marca: string | null;
  descripcion: string;
  unidad: string;
  cantidad: number;
  costoUnitario: number;
  /** Costo promedio del maestro ANTES de esta recepción, para comparar. */
  costoAnterior: number;
  /** Saldo en almacén antes de recibir. */
  stockAnterior: number;
  /**
   * Cuánto falta por recibir de esta línea en la compra enlazada.
   * `null` cuando la línea no viene de una compra.
   */
  pendiente: number | null;
}

export interface EstadoRecepcion {
  compraId: string | null;
  proveedorId: string | null;
  /** ISO `yyyy-mm-dd`. Lo fija la pantalla al montar; el dominio no lee reloj. */
  fecha: string;
  guiaProveedor: string;
  facturaProveedor: string;
  observaciones: string;
  /**
   * Gastos de la compra enlazada. Es de SOLO LECTURA aquí: lo manda
   * `compras.gastos_importacion` y la función lo vuelve a leer de la base al
   * grabar. Vive en el estado únicamente para poder previsualizar el
   * prorrateo.
   */
  gastosImportacion: number;
  lineas: LineaRecibida[];
  proximaKey: number;
}

export type CampoCabecera =
  | "proveedorId"
  | "fecha"
  | "guiaProveedor"
  | "facturaProveedor"
  | "observaciones";

export type Accion =
  | { tipo: "cabecera"; campo: CampoCabecera; valor: string | null }
  | { tipo: "agregar"; producto: ProductoParaRecibir; cantidad?: number }
  | { tipo: "quitar"; key: string }
  | { tipo: "cantidad"; key: string; valor: number }
  | { tipo: "costo"; key: string; valor: number }
  | { tipo: "cargarCompra"; compra: CompraPendiente }
  | { tipo: "soltarCompra" }
  | { tipo: "cargar"; estado: EstadoRecepcion };

export function estadoInicial(fecha: string): EstadoRecepcion {
  return {
    compraId: null,
    proveedorId: null,
    fecha,
    guiaProveedor: "",
    facturaProveedor: "",
    observaciones: "",
    gastosImportacion: 0,
    lineas: [],
    proximaKey: 1,
  };
}

/** Redondeo defensivo de lo que llega de un input. */
const cantidadValida = (n: number) =>
  Number.isFinite(n) && n > 0 ? redondear2(n) : 1;
const costoValido = (n: number) =>
  Number.isFinite(n) && n >= 0 ? redondear4(n) : 0;

function mapear(
  estado: EstadoRecepcion,
  key: string,
  f: (l: LineaRecibida) => LineaRecibida,
): EstadoRecepcion {
  const lineas = estado.lineas.map((l) => (l.key === key ? f(l) : l));
  return { ...estado, lineas };
}

export function reducir(estado: EstadoRecepcion, accion: Accion): EstadoRecepcion {
  switch (accion.tipo) {
    case "cargar":
      return accion.estado;

    case "cabecera":
      return { ...estado, [accion.campo]: accion.valor } as EstadoRecepcion;

    case "agregar": {
      const cantidad = cantidadValida(accion.cantidad ?? 1);

      // Si el producto ya está, se suma a la línea existente. No es cosmético:
      // `recepcion_items` tiene UNIQUE (recepcion_id, producto_id), así que
      // dos líneas del mismo código harían fallar el INSERT entero con un
      // error de restricción que no le dice nada a nadie.
      const yaEsta = estado.lineas.find((l) => l.productoId === accion.producto.id);
      if (yaEsta) {
        return mapear(estado, yaEsta.key, (l) => ({
          ...l,
          cantidad: redondear2(l.cantidad + cantidad),
        }));
      }

      const costo = accion.producto.costo_promedio ?? 0;
      return {
        ...estado,
        lineas: [
          ...estado.lineas,
          {
            key: `r${estado.proximaKey}`,
            productoId: accion.producto.id,
            codigo: accion.producto.codigo,
            marca: accion.producto.marca,
            descripcion: accion.producto.descripcion,
            unidad: accion.producto.unidad ?? "NIU",
            cantidad,
            // Se propone el costo promedio vigente, no cero: en una reposición
            // el costo casi nunca cambia, y arrancar en cero hace que un
            // despiste meta mercadería a coste nulo y hunda el promedio.
            costoUnitario: costo,
            costoAnterior: costo,
            stockAnterior: accion.producto.stock ?? 0,
            pendiente: null,
          },
        ],
        proximaKey: estado.proximaKey + 1,
      };
    }

    case "quitar":
      return { ...estado, lineas: estado.lineas.filter((l) => l.key !== accion.key) };

    case "cantidad":
      return mapear(estado, accion.key, (l) => ({
        ...l,
        cantidad: cantidadValida(accion.valor),
      }));

    case "costo":
      return mapear(estado, accion.key, (l) => ({
        ...l,
        costoUnitario: costoValido(accion.valor),
      }));

    case "cargarCompra": {
      // Precarga lo que falta por llegar, no la compra entera: recibir en dos
      // veces es lo normal, y volver a proponer lo ya recibido es la forma más
      // fácil de duplicar stock.
      const pendientes = accion.compra.lineas
        .map((l) => ({ ...l, falta: redondear2(l.cantidad - l.cantidad_recibida) }))
        .filter((l) => l.falta > 0);

      return {
        ...estado,
        compraId: accion.compra.id,
        proveedorId: accion.compra.proveedor_id,
        gastosImportacion: accion.compra.gastos_importacion,
        lineas: pendientes.map((l, i) => ({
          key: `c${estado.proximaKey + i}`,
          productoId: l.producto_id,
          codigo: l.codigo,
          marca: l.marca,
          descripcion: l.descripcion,
          unidad: l.unidad,
          cantidad: l.falta,
          // El costo lo manda la compra, que es lo que se pactó con el
          // proveedor. El promedio del maestro aquí no pinta nada.
          costoUnitario: l.costo_unitario,
          costoAnterior: l.costo_unitario,
          stockAnterior: 0,
          pendiente: l.falta,
        })),
        proximaKey: estado.proximaKey + pendientes.length,
      };
    }

    case "soltarCompra":
      // Se sueltan la compra y sus gastos, pero NO las líneas: el operador ya
      // ha podido corregir cantidades y perderlas sería castigarle por
      // cambiar de opinión.
      return {
        ...estado,
        compraId: null,
        gastosImportacion: 0,
        lineas: estado.lineas.map((l) => ({ ...l, pendiente: null })),
      };

    default:
      return estado;
  }
}

// ---------------------------------------------------------------------------
// Selectores
// ---------------------------------------------------------------------------

export function costeoDe(estado: EstadoRecepcion): CosteoRecepcion {
  return costearRecepcion(
    estado.lineas.map((l) => ({
      cantidad: l.cantidad,
      costoUnitario: l.costoUnitario,
    })),
    estado.gastosImportacion,
  );
}

export interface Bloqueo {
  campo: "proveedor" | "lineas" | "fecha";
  mensaje: string;
}

/**
 * Por qué NO se puede guardar todavía.
 *
 * Devuelve motivos, no un booleano: un botón deshabilitado sin explicación es
 * de las cosas que más se odian de un ERP.
 */
export function bloqueos(estado: EstadoRecepcion): Bloqueo[] {
  const lista: Bloqueo[] = [];

  // `recepciones.proveedor_id` acepta NULL, así que la base dejaría pasar una
  // recepción sin proveedor. Se exige igual: mercadería que entra sin saber de
  // quién es un agujero en la trazabilidad, y el kardex ya no puede repararlo.
  if (!estado.proveedorId) {
    lista.push({ campo: "proveedor", mensaje: "Falta indicar de qué proveedor llega." });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(estado.fecha)) {
    lista.push({ campo: "fecha", mensaje: "La fecha de recepción no es válida." });
  }
  if (estado.lineas.length === 0) {
    lista.push({ campo: "lineas", mensaje: "La recepción no tiene productos." });
  }

  return lista;
}

export interface Aviso {
  key: string;
  codigo: string;
  mensaje: string;
}

/**
 * Lo que conviene mirar dos veces, pero NO impide guardar.
 *
 * La diferencia con `bloqueos` es deliberada: son situaciones legítimas que
 * suelen ser errores. Bloquearlas obligaría a inventarse un rodeo el día que
 * de verdad pasan.
 */
export function avisos(estado: EstadoRecepcion): Aviso[] {
  const lista: Aviso[] = [];

  for (const l of estado.lineas) {
    if (l.costoUnitario === 0) {
      lista.push({
        key: l.key,
        codigo: l.codigo,
        mensaje: "Entra a costo cero: va a hundir el costo promedio del producto.",
      });
      // Un costo cero ya es el aviso importante de esa línea; encadenar el de
      // la variación encima solo hace ruido.
      continue;
    }

    if (l.pendiente !== null && l.cantidad > l.pendiente) {
      lista.push({
        key: l.key,
        codigo: l.codigo,
        mensaje: `Llegan ${l.cantidad} y la compra solo esperaba ${l.pendiente}. El stock sube igual por el total.`,
      });
    }

    // Un salto de costo grande casi siempre es un decimal mal puesto. El
    // umbral es del 50 %: por debajo son subidas de precio normales.
    if (l.costoAnterior > 0) {
      const variacion = Math.abs(l.costoUnitario - l.costoAnterior) / l.costoAnterior;
      if (variacion >= 0.5) {
        lista.push({
          key: l.key,
          codigo: l.codigo,
          mensaje: `El costo pasa de ${l.costoAnterior} a ${l.costoUnitario}. Comprueba que no sobre o falte un decimal.`,
        });
      }
    }
  }

  return lista;
}

/** El payload que espera `recepcionar_mercaderia()`. */
export function aPayload(estado: EstadoRecepcion) {
  return {
    compra_id: estado.compraId,
    proveedor_id: estado.proveedorId,
    fecha: estado.fecha,
    guia_proveedor: estado.guiaProveedor.trim() || null,
    factura_proveedor: estado.facturaProveedor.trim() || null,
    observaciones: estado.observaciones.trim() || null,
    items: estado.lineas.map((l) => ({
      producto_id: l.productoId,
      cantidad: l.cantidad,
      costo_unitario: l.costoUnitario,
      // OJO: los gastos NO se mandan. La función los relee de
      // `compras.gastos_importacion` con el `compra_id`. Aceptarlos de quien
      // llama sería dejar que el navegador decidiera el costo del inventario.
    })),
  };
}
