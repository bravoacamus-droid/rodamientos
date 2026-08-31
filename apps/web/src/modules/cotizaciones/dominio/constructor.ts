import { lineasBajoPiso, revisarPiso, type RevisionPiso } from "./piso";
import { calcularTotales, redondear2, redondear4, type TotalesCotizacion } from "./totales";

/**
 * El estado del constructor de cotizaciones, como reducer PURO.
 *
 * En la demo esto eran 974 líneas dentro de un componente cliente que definía
 * sus tipos, todo el estado, el cálculo de precios, la negociación y la
 * persistencia. No se podía probar sin montar React, y era justo el código que
 * decide cuánto se cobra.
 *
 * Aquí entra un estado y una acción, y sale un estado. Sin React, sin fetch,
 * sin `Date.now()` ni `Math.random()` —las claves de fila salen de un contador,
 * para que dos ejecuciones iguales den el mismo resultado y se pueda comparar
 * en un test—. La interfaz encima es un `useReducer` y poco más.
 */

/** Un producto tal como lo devuelve `buscar_productos` o `sustitutos_de`. */
export interface ProductoParaCotizar {
  id: string;
  codigo: string;
  descripcion: string;
  marca: string | null;
  unidad?: string;
  stock?: number;
  precio_venta: number;
  precio_minimo?: number;
  costo_promedio?: number;
}

export interface LineaConstructor {
  /** Clave estable para React. Determinista: sale de un contador. */
  key: string;
  productoId: string | null;
  codigo: string;
  marca: string | null;
  descripcion: string;
  unidad: string;
  cantidad: number;
  valorUnitario: number;
  descuentoPct: number;
  costoUnitario: number;
  /** Piso del maestro. 0 = el producto no tiene P.M. cargado. */
  precioMinimo: number;
  /** P.V. del maestro, para poder volver a él tras negociar. */
  precioLista: number;
  stock: number;
}

export interface EstadoConstructor {
  clienteId: string | null;
  validezDias: number;
  tiempoEntrega: string;
  ordenCompraCliente: string;
  /**
   * A quién va dirigida, por NOMBRE. Es lo que se imprime.
   *
   * Sigue siendo texto libre aunque desde la 035 se pueda elegir de una
   * lista: hay clientes donde el comprador de hoy no es el de la ficha, y
   * obligar a darlo de alta antes de poder cotizar es poner una puerta
   * donde hacía falta un pasillo.
   */
  contacto: string;
  /** La ficha del contacto elegido, si salió de la lista del cliente. */
  contactoId: string | null;
  condiciones: string;
  observaciones: string;
  /** C5 (15:52): el descuento es una casilla habilitable, no una columna fija. */
  mostrarDescuento: boolean;
  lineas: LineaConstructor[];
  /** Contador de claves. No se muestra; existe para que las keys sean estables. */
  proximaKey: number;
}

export type CampoCabecera =
  | "clienteId"
  | "validezDias"
  | "tiempoEntrega"
  | "ordenCompraCliente"
  | "contacto"
  | "contactoId"
  | "condiciones"
  | "observaciones"
  | "mostrarDescuento";

export type Accion =
  | { tipo: "cabecera"; campo: CampoCabecera; valor: string | number | boolean | null }
  | { tipo: "agregar"; producto: ProductoParaCotizar; cantidad?: number }
  | { tipo: "quitar"; key: string }
  | { tipo: "cantidad"; key: string; valor: number }
  | { tipo: "precio"; key: string; valor: number }
  | { tipo: "descuento"; key: string; valor: number }
  | { tipo: "bajarAlPiso"; key: string }
  | { tipo: "volverALista"; key: string }
  | { tipo: "sustituir"; key: string; producto: ProductoParaCotizar }
  | { tipo: "mover"; key: string; direccion: -1 | 1 }
  | { tipo: "cargar"; estado: EstadoConstructor };

export const ENTREGAS = [
  "Stock inmediato",
  "24 a 48 horas",
  "3 a 5 días útiles",
  "7 días útiles",
  "15 días (importación)",
] as const;

export function estadoInicial(clienteId: string | null = null): EstadoConstructor {
  return {
    clienteId,
    validezDias: 15,
    tiempoEntrega: ENTREGAS[0],
    ordenCompraCliente: "",
    contacto: "",
    contactoId: null,
    condiciones: "",
    observaciones: "",
    mostrarDescuento: false,
    lineas: [],
    proximaKey: 1,
  };
}

/** Redondeo defensivo de lo que llega de un input. */
const cantidadValida = (n: number) =>
  Number.isFinite(n) && n > 0 ? redondear2(n) : 1;
const montoValido = (n: number) =>
  Number.isFinite(n) && n >= 0 ? redondear4(n) : 0;
const pctValido = (n: number) =>
  Number.isFinite(n) ? Math.min(100, Math.max(0, redondear2(n))) : 0;

function mapear(
  estado: EstadoConstructor,
  key: string,
  f: (l: LineaConstructor) => LineaConstructor,
): EstadoConstructor {
  const lineas = estado.lineas.map((l) => (l.key === key ? f(l) : l));
  return lineas === estado.lineas ? estado : { ...estado, lineas };
}

function desdeProducto(
  producto: ProductoParaCotizar,
  key: string,
  cantidad: number,
): LineaConstructor {
  return {
    key,
    productoId: producto.id,
    codigo: producto.codigo,
    // C2 (14:54): la marca va en columna propia, no embebida en la descripción.
    marca: producto.marca,
    // C3: la descripción NO repite el código dentro.
    descripcion: producto.descripcion,
    unidad: producto.unidad ?? "NIU",
    cantidad,
    valorUnitario: producto.precio_venta,
    descuentoPct: 0,
    costoUnitario: producto.costo_promedio ?? 0,
    precioMinimo: producto.precio_minimo ?? 0,
    precioLista: producto.precio_venta,
    stock: producto.stock ?? 0,
  };
}

export function reducir(estado: EstadoConstructor, accion: Accion): EstadoConstructor {
  switch (accion.tipo) {
    case "cargar":
      return accion.estado;

    case "cabecera":
      return { ...estado, [accion.campo]: accion.valor } as EstadoConstructor;

    case "agregar": {
      const cantidad = cantidadValida(accion.cantidad ?? 1);

      // Si el producto ya está, se suma a la línea existente en vez de
      // duplicarla. Cotizar dos veces el mismo código es un error que el
      // cliente nota y el vendedor no.
      const yaEsta = estado.lineas.find((l) => l.productoId === accion.producto.id);
      if (yaEsta) {
        return mapear(estado, yaEsta.key, (l) => ({
          ...l,
          cantidad: redondear2(l.cantidad + cantidad),
        }));
      }

      return {
        ...estado,
        lineas: [
          ...estado.lineas,
          desdeProducto(accion.producto, `l${estado.proximaKey}`, cantidad),
        ],
        proximaKey: estado.proximaKey + 1,
      };
    }

    case "quitar":
      return {
        ...estado,
        lineas: estado.lineas.filter((l) => l.key !== accion.key),
      };

    case "cantidad":
      return mapear(estado, accion.key, (l) => ({
        ...l,
        cantidad: cantidadValida(accion.valor),
      }));

    // El precio y el descuento NO se recortan al piso mientras se teclea:
    // se deja escribir y se avisa. Impedir la tecla obliga al vendedor a
    // adivinar dónde está el límite; verlo en rojo se lo enseña. Guardar sí
    // queda bloqueado, y la base lo rechazaría igual.
    case "precio":
      return mapear(estado, accion.key, (l) => ({
        ...l,
        valorUnitario: montoValido(accion.valor),
      }));

    case "descuento":
      return mapear(estado, accion.key, (l) => ({
        ...l,
        descuentoPct: pctValido(accion.valor),
      }));

    case "bajarAlPiso":
      return mapear(estado, accion.key, (l) =>
        l.precioMinimo > 0
          ? { ...l, valorUnitario: l.precioMinimo, descuentoPct: 0 }
          : l,
      );

    case "volverALista":
      return mapear(estado, accion.key, (l) => ({
        ...l,
        valorUnitario: l.precioLista,
        descuentoPct: 0,
      }));

    case "sustituir": {
      // Se conserva la cantidad ya pactada: lo que cambia es el artículo, no
      // cuántos necesita el cliente.
      const linea = estado.lineas.find((l) => l.key === accion.key);
      if (!linea) return estado;
      return mapear(estado, accion.key, (l) =>
        desdeProducto(accion.producto, l.key, l.cantidad),
      );
    }

    case "mover": {
      const i = estado.lineas.findIndex((l) => l.key === accion.key);
      const j = i + accion.direccion;
      if (i < 0 || j < 0 || j >= estado.lineas.length) return estado;
      const lineas = [...estado.lineas];
      const a = lineas[i];
      const b = lineas[j];
      if (!a || !b) return estado;
      lineas[i] = b;
      lineas[j] = a;
      return { ...estado, lineas };
    }

    default:
      return estado;
  }
}

// ---------------------------------------------------------------------------
// Selectores
// ---------------------------------------------------------------------------

export function totalesDe(estado: EstadoConstructor): TotalesCotizacion {
  return calcularTotales(
    estado.lineas.map((l) => ({
      cantidad: l.cantidad,
      valorUnitario: l.valorUnitario,
      descuentoPct: l.descuentoPct,
      costoUnitario: l.costoUnitario,
    })),
  );
}

export function revisionDe(linea: LineaConstructor): RevisionPiso {
  return revisarPiso({
    cantidad: linea.cantidad,
    valorUnitario: linea.valorUnitario,
    descuentoPct: linea.descuentoPct,
    precioMinimo: linea.precioMinimo,
  });
}

export interface Bloqueo {
  campo: "cliente" | "lineas" | "piso";
  mensaje: string;
}

/**
 * Por qué NO se puede guardar todavía.
 *
 * Devuelve motivos, no un booleano: un botón deshabilitado sin explicación es
 * de las cosas que más se odian de un ERP.
 */
export function bloqueos(estado: EstadoConstructor): Bloqueo[] {
  const lista: Bloqueo[] = [];

  if (!estado.clienteId) {
    lista.push({ campo: "cliente", mensaje: "Falta elegir el cliente." });
  }
  if (estado.lineas.length === 0) {
    lista.push({ campo: "lineas", mensaje: "La cotización no tiene productos." });
  }

  const bajas = lineasBajoPiso(
    estado.lineas.map((l) => ({
      cantidad: l.cantidad,
      valorUnitario: l.valorUnitario,
      descuentoPct: l.descuentoPct,
      precioMinimo: l.precioMinimo,
    })),
  );
  if (bajas.length > 0) {
    const codigos = bajas
      .map((b) => estado.lineas[b.indice]?.codigo)
      .filter(Boolean)
      .join(", ");
    lista.push({
      campo: "piso",
      mensaje:
        bajas.length === 1
          ? `${codigos} está por debajo del precio mínimo.`
          : `${bajas.length} líneas están por debajo del precio mínimo: ${codigos}.`,
    });
  }

  return lista;
}

/** Cuántas líneas se están cotizando sin stock suficiente. */
export function lineasSinStock(estado: EstadoConstructor): LineaConstructor[] {
  return estado.lineas.filter((l) => l.productoId !== null && l.stock < l.cantidad);
}

/** El payload que espera `crear_cotizacion()`. */
export function aPayload(estado: EstadoConstructor) {
  return {
    cliente_id: estado.clienteId,
    validez_dias: estado.validezDias,
    tiempo_entrega: estado.tiempoEntrega,
    orden_compra_cliente: estado.ordenCompraCliente || null,
    contacto: estado.contacto || null,
    // El id Y el nombre. No es redundancia: la cotización guarda el nombre
    // TAL COMO ESTABA al emitirla, porque un documento dice lo que decía
    // cuando se mandó, aunque esa persona se vaya de la empresa (035).
    contacto_id: estado.contactoId,
    condiciones: estado.condiciones || null,
    observaciones: estado.observaciones || null,
    mostrar_descuento: estado.mostrarDescuento,
    items: estado.lineas.map((l, i) => ({
      producto_id: l.productoId,
      orden: i + 1,
      codigo: l.codigo,
      marca: l.marca,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      unidad_codigo: l.unidad,
      valor_unitario: l.valorUnitario,
      descuento_pct: l.descuentoPct,
      costo_unitario: l.costoUnitario,
      // OJO: `precio_minimo_ref` NO va aquí. Lo impone el trigger
      // `trg_cotiz_items_piso` desde el maestro. Mandarlo sería ofrecerle a
      // quien llame la posibilidad de desactivar el piso.
    })),
  };
}
