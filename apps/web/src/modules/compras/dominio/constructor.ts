import { IGV, importeExacto, redondear2, redondear4 } from "@rodatech/config";

import type { TipoCompra } from "./tipos";

/**
 * El estado del registro de compra, como reducer PURO.
 *
 * Mismo patrón que cotizaciones y recepciones: entra un estado y una acción,
 * sale un estado. Sin React, sin fetch, sin `Date.now()` ni `Math.random()` —
 * las claves de fila salen de un contador, para que dos ejecuciones iguales den
 * el mismo resultado y se puedan comparar en un test.
 *
 * Comprar NO mueve stock. Willy, 25:21: *"el stock se mueve al recibir la
 * mercadería"*. Aquí solo se registra el compromiso; el kardex no se entera
 * hasta que una recepción consume esta compra.
 */

/** Un producto tal como lo devuelve `buscar_productos`. */
export interface ProductoParaComprar {
  id: string;
  codigo: string;
  descripcion: string;
  marca: string | null;
  unidad?: string;
  stock?: number;
  /** Costo promedio vigente. Sirve de referencia y de valor por defecto. */
  costo_promedio?: number;
  /** Punto de reposición, para avisar si se está comprando de menos. */
  stock_minimo?: number;
}

export interface LineaCompraEditable {
  /** Clave estable para React. Determinista: sale de un contador. */
  key: string;
  productoId: string;
  codigo: string;
  marca: string | null;
  descripcion: string;
  unidad: string;
  cantidad: number;
  costoUnitario: number;
  /** Costo promedio del maestro, para comparar contra lo que se está pagando. */
  costoAnterior: number;
  /** Saldo en almacén ahora mismo. */
  stockActual: number;
  stockMinimo: number;
}

export interface EstadoCompra {
  proveedorId: string | null;
  tipo: TipoCompra;
  /** ISO `yyyy-mm-dd`. Lo fija la pantalla al montar; el dominio no lee reloj. */
  fecha: string;
  /** Cuándo se espera que llegue. Vacío es legítimo. */
  fechaEstimada: string;
  documentoProveedor: string;
  guiaProveedor: string;
  /**
   * Si la factura del proveedor lleva IGV.
   *
   * No se deduce del tipo de compra: una importación normalmente llega sin IGV
   * peruano —se paga en aduana— pero un proveedor local exonerado también
   * existe. Lo decide quien registra, mirando el papel que tiene delante.
   */
  afectoIgv: boolean;
  gastosImportacion: number;
  tracking: string;
  courier: string;
  observaciones: string;
  lineas: LineaCompraEditable[];
  proximaKey: number;
}

export type CampoCabecera =
  | "proveedorId"
  | "fecha"
  | "fechaEstimada"
  | "documentoProveedor"
  | "guiaProveedor"
  | "tracking"
  | "courier"
  | "observaciones";

export type Accion =
  | { tipo: "cabecera"; campo: CampoCabecera; valor: string | null }
  | { tipo: "tipoCompra"; valor: TipoCompra }
  | { tipo: "afectoIgv"; valor: boolean }
  | { tipo: "gastos"; valor: number }
  | { tipo: "agregar"; producto: ProductoParaComprar; cantidad?: number }
  | { tipo: "quitar"; key: string }
  | { tipo: "cantidad"; key: string; valor: number }
  | { tipo: "costo"; key: string; valor: number }
  | { tipo: "cargar"; estado: EstadoCompra };

export function estadoInicial(fecha: string): EstadoCompra {
  return {
    proveedorId: null,
    tipo: "local",
    fecha,
    fechaEstimada: "",
    documentoProveedor: "",
    guiaProveedor: "",
    // La mayoría de sus compras son locales y con IGV; es el valor por defecto
    // que menos veces hay que corregir.
    afectoIgv: true,
    gastosImportacion: 0,
    tracking: "",
    courier: "",
    observaciones: "",
    lineas: [],
    proximaKey: 1,
  };
}

/** Redondeo defensivo de lo que llega de un input. */
const cantidadValida = (n: number) =>
  Number.isFinite(n) && n > 0 ? redondear2(n) : 1;
const costoValido = (n: number) =>
  Number.isFinite(n) && n >= 0 ? redondear4(n) : 0;
const montoValido = (n: number) =>
  Number.isFinite(n) && n >= 0 ? redondear2(n) : 0;

function mapear(
  estado: EstadoCompra,
  key: string,
  f: (l: LineaCompraEditable) => LineaCompraEditable,
): EstadoCompra {
  return { ...estado, lineas: estado.lineas.map((l) => (l.key === key ? f(l) : l)) };
}

export function reducir(estado: EstadoCompra, accion: Accion): EstadoCompra {
  switch (accion.tipo) {
    case "cargar":
      return accion.estado;

    case "cabecera":
      return { ...estado, [accion.campo]: accion.valor } as EstadoCompra;

    case "tipoCompra": {
      // Al pasar a local se sueltan los campos que solo tienen sentido en una
      // importación. Dejarlos puestos guarda un tracking de DHL en una compra
      // a un proveedor de Lima, y eso ensucia el histórico para siempre.
      if (accion.valor === "local") {
        return {
          ...estado,
          tipo: "local",
          gastosImportacion: 0,
          tracking: "",
          courier: "",
        };
      }
      return { ...estado, tipo: "importacion" };
    }

    case "afectoIgv":
      return { ...estado, afectoIgv: accion.valor };

    case "gastos":
      return { ...estado, gastosImportacion: montoValido(accion.valor) };

    case "agregar": {
      const cantidad = cantidadValida(accion.cantidad ?? 1);

      // Si el producto ya está, se suma a la línea existente. No es cosmético:
      // `compra_items` tiene UNIQUE (compra_id, producto_id), así que dos
      // líneas del mismo código harían fallar el INSERT entero con un error de
      // restricción que no le dice nada a nadie.
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
            key: `k${estado.proximaKey}`,
            productoId: accion.producto.id,
            codigo: accion.producto.codigo,
            marca: accion.producto.marca,
            descripcion: accion.producto.descripcion,
            unidad: accion.producto.unidad ?? "NIU",
            cantidad,
            // Se propone el costo promedio vigente, no cero: en una reposición
            // el costo casi nunca cambia, y arrancar en cero convierte un
            // despiste en una compra registrada a coste nulo.
            costoUnitario: costo,
            costoAnterior: costo,
            stockActual: accion.producto.stock ?? 0,
            stockMinimo: accion.producto.stock_minimo ?? 0,
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

    default:
      return estado;
  }
}

// ---------------------------------------------------------------------------
// Selectores
// ---------------------------------------------------------------------------

export interface TotalesCompra {
  subtotal: number;
  igv: number;
  total: number;
  /** Gastos de importación. Van APARTE del total pactado con el proveedor. */
  gastos: number;
  /**
   * Lo que va a costar de verdad la mercadería puesta en almacén: el subtotal
   * más los gastos. El IGV no entra porque es crédito fiscal recuperable, no
   * costo.
   */
  costoEnAlmacen: number;
  lineas: number;
  unidades: number;
}

/** Importe de una línea, tal como lo va a guardar la columna generada. */
export function importeLinea(linea: {
  cantidad: number;
  costoUnitario: number;
}): number {
  return importeExacto(linea.cantidad, linea.costoUnitario);
}

/**
 * Totales de la compra.
 *
 * Réplica EXACTA de lo que hace `crear_compra()` en Postgres: el importe se
 * redondea a dos decimales POR LÍNEA —`compra_items.importe` es una columna
 * generada `round(cantidad * costo_unitario, 2)`— y después se suman las
 * líneas ya redondeadas. Sumar con todos los decimales y redondear al final
 * daría un total distinto al que la base va a guardar, y el operador vería un
 * número en pantalla y otro en la ficha.
 *
 * El importe de línea usa `importeExacto` y no `redondear2(cantidad × costo)`:
 * con costos de cuatro decimales la multiplicación en coma flotante se come
 * medio céntimo antes de redondear. `3 × 1.005` da 3.02 en la base y 3.01 con
 * el redondeo ingenuo.
 */
export function totalesDe(estado: EstadoCompra): TotalesCompra {
  const subtotal = redondear2(
    estado.lineas.reduce((a, l) => a + importeLinea(l), 0),
  );
  const igv = estado.afectoIgv ? redondear2(subtotal * IGV) : 0;
  const gastos = estado.tipo === "importacion" ? estado.gastosImportacion : 0;

  return {
    subtotal,
    igv,
    total: redondear2(subtotal + igv),
    gastos,
    costoEnAlmacen: redondear2(subtotal + gastos),
    lineas: estado.lineas.length,
    unidades: redondear2(estado.lineas.reduce((a, l) => a + l.cantidad, 0)),
  };
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
export function bloqueos(estado: EstadoCompra): Bloqueo[] {
  const lista: Bloqueo[] = [];

  if (!estado.proveedorId) {
    lista.push({ campo: "proveedor", mensaje: "Falta indicar a quién se le compra." });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(estado.fecha)) {
    lista.push({ campo: "fecha", mensaje: "La fecha de la compra no es válida." });
  }
  if (estado.lineas.length === 0) {
    lista.push({ campo: "lineas", mensaje: "La compra no tiene productos." });
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
export function avisos(estado: EstadoCompra): Aviso[] {
  const lista: Aviso[] = [];

  for (const l of estado.lineas) {
    if (l.costoUnitario === 0) {
      lista.push({
        key: l.key,
        codigo: l.codigo,
        mensaje: "Se está comprando a costo cero. Comprueba el precio pactado.",
      });
      // Un costo cero ya es el aviso importante de esa línea; encadenar el de
      // la variación encima solo hace ruido.
      continue;
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

    // Reponer por debajo del mínimo es comprar para volver a quedarse corto.
    // Es un aviso y no un bloqueo: a veces se compra poco a propósito, porque
    // el proveedor no tiene más o porque se está probando una marca.
    if (l.stockMinimo > 0 && l.stockActual + l.cantidad < l.stockMinimo) {
      lista.push({
        key: l.key,
        codigo: l.codigo,
        mensaje: `Aun con esta compra queda en ${redondear2(l.stockActual + l.cantidad)}, por debajo del mínimo de ${l.stockMinimo}.`,
      });
    }
  }

  return lista;
}

/** El payload que espera `crear_compra()`. */
export function aPayload(estado: EstadoCompra) {
  const esImportacion = estado.tipo === "importacion";
  return {
    proveedor_id: estado.proveedorId,
    tipo: estado.tipo,
    fecha: estado.fecha,
    fecha_estimada: estado.fechaEstimada || null,
    documento_proveedor: estado.documentoProveedor.trim() || null,
    guia_proveedor: estado.guiaProveedor.trim() || null,
    afecto_igv: estado.afectoIgv,
    // Los campos de importación NO viajan en una compra local, aunque el
    // estado los tuviera de antes de cambiar el tipo.
    gastos_importacion: esImportacion ? estado.gastosImportacion : 0,
    tracking: esImportacion ? estado.tracking.trim() || null : null,
    courier: esImportacion ? estado.courier.trim() || null : null,
    observaciones: estado.observaciones.trim() || null,
    items: estado.lineas.map((l) => ({
      producto_id: l.productoId,
      cantidad: l.cantidad,
      costo_unitario: l.costoUnitario,
      unidad_codigo: l.unidad,
      // OJO: el dinero NO se manda. `crear_compra()` lo calcula desde los
      // ítems, sumando la columna generada `importe`. Aceptar un total de
      // quien llama sería dejar que el navegador decidiera cuánto se debe.
    })),
  };
}
