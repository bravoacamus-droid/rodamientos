/**
 * El análisis de importación: la hoja de Excel de Willy, hecha en el ERP (098).
 *
 * Reunión del 01/10 (§AQ). Sus palabras, en orden:
 *
 *   · *«Lo que yo debo ingresar en el sistema debe ser los precios FOB […] las
 *     cantidades que me ha cotizado el proveedor […] y los pesos unitarios de
 *     cada producto»*.
 *   · *«También debo ingresar el costo de DHL […] lo divido entre el peso
 *     total y tengo el costo por kilo»*.
 *   · *«Ese factor costo por kilo lo multiplico al peso de cada producto y
 *     obtengo su costo de envío […] más su costo allá en origen»*: PU Lima.
 *   · *«Con ese precio unitario en Lima los comparo con el precio de mercado
 *     […] para determinar el margen de utilidad»*.
 *   · *«Para poder jugar luego con la cantidad de pedido final […] ahí me da
 *     abajo el valor final de mi pedido […] y el costo de envío que he
 *     calculado por la cantidad final»*.
 *
 * Todo aquí es puro: sin React, sin red. La pantalla solo lo pinta.
 */

export interface LineaAnalisis {
  /** Clave estable para React. */
  key: string;
  /** Null si el código todavía no está en el catálogo. */
  productoId: string | null;
  codigo: string;
  marca: string;
  descripcion: string;
  /** Lo que se le pidió cotizar (CANT. Ref). */
  cantidadRef: number;
  /** Lo que se decide pedir (CANT. PEDIDO). */
  cantidadPedido: number;
  /** Precio unitario en origen (Price FOB $). */
  precioFob: number;
  /** Peso por unidad, en kg. Lo pone Willy para comprobar la carga. */
  pesoKg: number;
  /** Su precio de referencia en Lima (P.M). */
  precioMercado: number;
  /** De quién es ese precio (PROV.). */
  proveedorMercado: string;
  /** Veces al año que lo piden sus clientes («f»). Null si no se sabe. */
  frecuencia: number | null;
  /** El FOB de la última vez que este proveedor se lo cotizó, si hay. */
  fobAnterior?: { precio: number; numero: string } | null;
}

export interface CabeceraAnalisis {
  proveedorId: string | null;
  fecha: string;
  referencia: string;
  /** El costo de envío de toda la carga cotizada (DHL $). */
  costoEnvio: number;
  /** Lo que el proveedor dice que pesa la carga. 0 = no lo dijo. */
  pesoDeclarado: number;
  notas: string;
}

export interface EstadoAnalisis extends CabeceraAnalisis {
  lineas: LineaAnalisis[];
  proximaKey: number;
}

export interface ProductoParaAnalizar {
  id: string;
  codigo: string;
  descripcion: string;
  marca: string | null;
  peso_kg?: number;
  precio_mercado?: number;
}

export type Accion =
  | { tipo: "cabecera"; campo: keyof CabeceraAnalisis; valor: string | number | null }
  | { tipo: "agregar"; producto: ProductoParaAnalizar }
  | { tipo: "agregarLibre"; codigo: string; marca: string }
  | { tipo: "quitar"; key: string }
  | {
      tipo: "campo";
      key: string;
      campo:
        | "cantidadRef"
        | "cantidadPedido"
        | "precioFob"
        | "pesoKg"
        | "precioMercado"
        | "frecuencia";
      valor: number;
    }
  | { tipo: "texto"; key: string; campo: "codigo" | "marca" | "descripcion" | "proveedorMercado"; valor: string }
  /** Lo que llega del servidor después de añadir: la «f» y el último FOB. */
  | {
      tipo: "propuestas";
      frecuencias: Readonly<Record<string, number>>;
      fobs: Readonly<Record<string, { precio: number; numero: string }>>;
    }
  /** Todas las cantidades finales iguales a las cotizadas. */
  | { tipo: "pedirLoCotizado" };

export function estadoInicial(fecha: string): EstadoAnalisis {
  return {
    proveedorId: null,
    fecha,
    referencia: "",
    costoEnvio: 0,
    pesoDeclarado: 0,
    notas: "",
    lineas: [],
    proximaKey: 1,
  };
}

const positivo = (n: number, decimales = 4) =>
  Number.isFinite(n) && n > 0 ? Math.round(n * 10 ** decimales) / 10 ** decimales : 0;

function nuevaLinea(key: string, parcial: Partial<LineaAnalisis>): LineaAnalisis {
  return {
    key,
    productoId: null,
    codigo: "",
    marca: "",
    descripcion: "",
    cantidadRef: 1,
    cantidadPedido: 1,
    precioFob: 0,
    pesoKg: 0,
    precioMercado: 0,
    proveedorMercado: "",
    frecuencia: null,
    fobAnterior: null,
    ...parcial,
  };
}

export function reducir(estado: EstadoAnalisis, accion: Accion): EstadoAnalisis {
  switch (accion.tipo) {
    case "cabecera": {
      const v = accion.valor;
      if (accion.campo === "costoEnvio" || accion.campo === "pesoDeclarado") {
        return { ...estado, [accion.campo]: positivo(Number(v), 3) };
      }
      return { ...estado, [accion.campo]: v } as EstadoAnalisis;
    }

    case "agregar": {
      const p = accion.producto;
      // El mismo producto dos veces es un error de quien escribe: se suma.
      if (estado.lineas.some((l) => l.productoId === p.id)) {
        return {
          ...estado,
          lineas: estado.lineas.map((l) =>
            l.productoId === p.id
              ? { ...l, cantidadRef: l.cantidadRef + 1, cantidadPedido: l.cantidadPedido + 1 }
              : l,
          ),
        };
      }
      return {
        ...estado,
        lineas: [
          ...estado.lineas,
          nuevaLinea(`a${estado.proximaKey}`, {
            productoId: p.id,
            codigo: p.codigo,
            marca: p.marca ?? "",
            descripcion: p.descripcion,
            // Lo que ya sabe el catálogo, propuesto.
            pesoKg: p.peso_kg ?? 0,
            precioMercado: p.precio_mercado ?? 0,
          }),
        ],
        proximaKey: estado.proximaKey + 1,
      };
    }

    case "agregarLibre":
      return {
        ...estado,
        lineas: [
          ...estado.lineas,
          nuevaLinea(`a${estado.proximaKey}`, {
            codigo: accion.codigo.trim().toUpperCase(),
            marca: accion.marca.trim().toUpperCase(),
          }),
        ],
        proximaKey: estado.proximaKey + 1,
      };

    case "quitar":
      return { ...estado, lineas: estado.lineas.filter((l) => l.key !== accion.key) };

    case "campo":
      return {
        ...estado,
        lineas: estado.lineas.map((l) => {
          if (l.key !== accion.key) return l;
          if (accion.campo === "frecuencia") {
            return { ...l, frecuencia: Number.isFinite(accion.valor) && accion.valor >= 0 ? accion.valor : null };
          }
          if (accion.campo === "cantidadRef") {
            const n = Math.round(positivo(accion.valor, 2));
            // Mientras la cantidad final siga igual a la cotizada, la sigue:
            // es lo que se pide si no se decide otra cosa.
            return {
              ...l,
              cantidadRef: n,
              cantidadPedido: l.cantidadPedido === l.cantidadRef ? n : l.cantidadPedido,
            };
          }
          if (accion.campo === "cantidadPedido") {
            return { ...l, cantidadPedido: Math.round(positivo(accion.valor, 2)) };
          }
          return { ...l, [accion.campo]: positivo(accion.valor, accion.campo === "pesoKg" ? 5 : 4) };
        }),
      };

    case "texto":
      return {
        ...estado,
        lineas: estado.lineas.map((l) =>
          l.key === accion.key ? { ...l, [accion.campo]: accion.valor.slice(0, 300) } : l,
        ),
      };

    case "propuestas":
      return {
        ...estado,
        lineas: estado.lineas.map((l) => {
          if (!l.productoId) return l;
          const f = accion.frecuencias[l.productoId];
          const fob = accion.fobs[l.productoId];
          return {
            ...l,
            // Solo se propone lo que está vacío: lo escrito manda.
            frecuencia: l.frecuencia === null && f !== undefined ? f : l.frecuencia,
            precioFob: l.precioFob === 0 && fob ? fob.precio : l.precioFob,
            fobAnterior: fob ?? l.fobAnterior ?? null,
          };
        }),
      };

    case "pedirLoCotizado":
      return {
        ...estado,
        lineas: estado.lineas.map((l) => ({ ...l, cantidadPedido: l.cantidadRef })),
      };

    default:
      return estado;
  }
}

// ---------------------------------------------------------------------------
// El cálculo: las columnas de su hoja
// ---------------------------------------------------------------------------

const dos = (n: number) => Math.round(n * 100) / 100;
const cuatro = (n: number) => Math.round(n * 1e4) / 1e4;

export interface LineaCalculada {
  key: string;
  /** PARC.$ = cantidad cotizada × FOB. */
  parcialRef: number;
  /** PESO PARC. = cantidad cotizada × peso. */
  pesoRef: number;
  /** Envío por unidad = peso × $/kg. */
  envioUnitario: number;
  /** PU LIMA = FOB + envío por unidad. */
  puLima: number;
  /** Margen sobre el costo (CLAUDE.md §5): (mercado − Lima) ÷ Lima. Null sin precio de mercado. */
  margen: number | null;
  /** Su columna «%»: mercado ÷ Lima. Null sin precio de mercado. */
  rinde: number | null;
  /** $PARC del pedido = cantidad final × FOB. */
  parcialPedido: number;
  /** PESO PED. = cantidad final × peso. */
  pesoPedido: number;
  /** TOT. $ = cantidad final × PU Lima. */
  totalLima: number;
  /** TOT. PM = cantidad final × precio de mercado. */
  totalMercado: number;
}

export interface Calculo {
  lineas: Record<string, LineaCalculada>;
  /** Lo cotizado. */
  fobRef: number;
  pesoRef: number;
  /** $/kg = envío ÷ peso cotizado. 0 si no hay peso o no hay envío. */
  porKg: number;
  /** Diferencia con el peso que dice el proveedor, en kg. Null si no lo dijo. */
  difPeso: number | null;
  /** Lo que se va a pedir. */
  fobPedido: number;
  pesoPedido: number;
  /** El envío que tocaría a lo pedido: $/kg × peso pedido. */
  envioPedido: number;
  totalLima: number;
  totalMercado: number;
  /** Su «K»: mercado ÷ Lima del pedido entero. Null si no hay mercado. */
  rinde: number | null;
  /** Margen del pedido entero, sobre el costo. */
  margen: number | null;
  /** Líneas sin peso: con ellas el $/kg sale de más. */
  sinPeso: string[];
  /** Líneas sin precio de mercado: sin margen. */
  sinMercado: string[];
}

export function calcular(estado: Pick<EstadoAnalisis, "lineas" | "costoEnvio" | "pesoDeclarado">): Calculo {
  const fobRef = dos(estado.lineas.reduce((a, l) => a + l.cantidadRef * l.precioFob, 0));
  const pesoRef = estado.lineas.reduce((a, l) => a + l.cantidadRef * l.pesoKg, 0);
  const porKg = pesoRef > 0 && estado.costoEnvio > 0 ? estado.costoEnvio / pesoRef : 0;

  const lineas: Record<string, LineaCalculada> = {};
  let fobPedido = 0;
  let pesoPedido = 0;
  let totalLima = 0;
  let totalMercado = 0;
  let limaConMercado = 0;

  for (const l of estado.lineas) {
    const envioUnitario = l.pesoKg * porKg;
    const puLima = l.precioFob + envioUnitario;
    const tieneMercado = l.precioMercado > 0 && puLima > 0;
    const c: LineaCalculada = {
      key: l.key,
      parcialRef: dos(l.cantidadRef * l.precioFob),
      pesoRef: cuatro(l.cantidadRef * l.pesoKg),
      envioUnitario: cuatro(envioUnitario),
      puLima: cuatro(puLima),
      margen: tieneMercado ? (l.precioMercado - puLima) / puLima : null,
      rinde: tieneMercado ? l.precioMercado / puLima : null,
      parcialPedido: dos(l.cantidadPedido * l.precioFob),
      pesoPedido: cuatro(l.cantidadPedido * l.pesoKg),
      totalLima: dos(l.cantidadPedido * puLima),
      totalMercado: dos(l.cantidadPedido * l.precioMercado),
    };
    lineas[l.key] = c;
    fobPedido += c.parcialPedido;
    pesoPedido += l.cantidadPedido * l.pesoKg;
    totalLima += l.cantidadPedido * puLima;
    if (tieneMercado) {
      totalMercado += c.totalMercado;
      limaConMercado += l.cantidadPedido * puLima;
    }
  }

  return {
    lineas,
    fobRef,
    pesoRef: cuatro(pesoRef),
    porKg: cuatro(porKg),
    difPeso: estado.pesoDeclarado > 0 ? cuatro(pesoRef - estado.pesoDeclarado) : null,
    fobPedido: dos(fobPedido),
    pesoPedido: cuatro(pesoPedido),
    envioPedido: dos(pesoPedido * porKg),
    totalLima: dos(totalLima),
    totalMercado: dos(totalMercado),
    // El rinde y el margen del pedido se miden solo con las líneas que tienen
    // precio de mercado: con las otras, dividir diría un margen que no existe.
    rinde: limaConMercado > 0 ? totalMercado / limaConMercado : null,
    margen: limaConMercado > 0 ? (totalMercado - limaConMercado) / limaConMercado : null,
    sinPeso: estado.lineas.filter((l) => !(l.pesoKg > 0)).map((l) => l.key),
    sinMercado: estado.lineas.filter((l) => !(l.precioMercado > 0)).map((l) => l.key),
  };
}

/** Por qué no se puede guardar todavía. */
export function bloqueos(estado: EstadoAnalisis): string[] {
  const b: string[] = [];
  if (!estado.proveedorId) b.push("Falta el proveedor que cotiza.");
  if (estado.lineas.length === 0) b.push("Añade los productos de la proforma.");
  if (estado.lineas.some((l) => l.codigo.trim() === "")) b.push("Hay una línea sin código.");
  return b;
}

/** Lo que espera `guardar_analisis`. */
export function aPayload(estado: EstadoAnalisis, id?: string) {
  return {
    id: id ?? null,
    proveedor_id: estado.proveedorId,
    fecha: estado.fecha,
    referencia: estado.referencia.trim() || null,
    costo_envio: estado.costoEnvio,
    peso_declarado: estado.pesoDeclarado > 0 ? estado.pesoDeclarado : null,
    notas: estado.notas.trim() || null,
    items: estado.lineas.map((l) => ({
      producto_id: l.productoId,
      codigo: l.codigo.trim(),
      marca: l.marca.trim() || null,
      descripcion: l.descripcion.trim() || null,
      cantidad_ref: l.cantidadRef,
      cantidad_pedido: l.cantidadPedido,
      precio_fob: l.precioFob,
      peso_kg: l.pesoKg,
      precio_mercado: l.precioMercado,
      proveedor_mercado: l.proveedorMercado.trim() || null,
      frecuencia: l.frecuencia,
    })),
  };
}
