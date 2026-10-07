/**
 * La hoja de precios (07/10): productos en filas, proveedores en columnas, y
 * en cada casilla lo que dijo cada uno.
 *
 * Luis, 07/10: *«recuerda que voy a pedir precio, no voy a comprar nada
 * todavía. Yo quiero seleccionar mis proveedores y los productos […] registrar
 * qué cantidad quiero comprar y el precio de compra, fácil y sencillo; si no
 * tiene, pues no pasa nada […] y mientras lleno, el análisis de margen: si me
 * conviene comprar, a quién comprar»*.
 *
 * Aquí vive todo lo que se calcula mientras se llena: quién da el mejor
 * precio de cada producto, el margen contra el precio de venta, cuánto sale
 * comprando repartido contra comprándole todo a uno, y qué compras salen.
 * Lógica pura: sin React, sin fetch, sin reloj.
 */

import { aUsdSinIgv, costoParaCompra, type Moneda } from "./comparador";

export interface ProductoHoja {
  productoId: string;
  codigo: string;
  descripcion: string;
  marca: string | null;
  unidad: string;
  /** Cuántas se quieren comprar. Entera, como en la compra. */
  cantidad: number;
  /** A cuánto se vende (P.V. del catálogo), en dólares sin IGV. Null si no tiene. */
  precioVenta: number | null;
  /** Lo último que costó, en dólares. Para saber si el precio nuevo es caro. */
  ultimoCosto: number | null;
  /** De dónde entró: «ANA-26-00001» si se trajo de un análisis. */
  origen?: string | null;
}

export interface ProveedorHoja {
  proveedorId: string;
  nombre: string;
  /** Decide si la compra que salga es local o de importación. */
  tipo: "local" | "importacion";
  moneda: Moneda;
  tipoCambio: number | null;
  incluyeIgv: boolean;
}

/** Lo que dijo un proveedor de un producto. Vacía = todavía no se sabe. */
export interface Casilla {
  /** En la moneda del proveedor, tal como lo dijo (con o sin IGV). */
  precio: number | null;
  noTiene: boolean;
  /** Cuántas tiene, si no tiene todas. Null = las que se piden. */
  tiene: number | null;
}

export interface Hoja {
  consultaId: string | null;
  numero: string | null;
  nota: string;
  productos: ProductoHoja[];
  proveedores: ProveedorHoja[];
  /** Por `clave(proveedorId, productoId)`. */
  casillas: Record<string, Casilla>;
  /**
   * A quién se le compra cada producto, cuando no es al más barato.
   * Sin entrada, se elige solo el más barato.
   */
  elegidos: Record<string, string>;
}

export const clave = (proveedorId: string, productoId: string) => `${proveedorId}|${productoId}`;

export const CASILLA_VACIA: Casilla = { precio: null, noTiene: false, tiene: null };

export function hojaVacia(): Hoja {
  return { consultaId: null, numero: null, nota: "", productos: [], proveedores: [], casillas: {}, elegidos: {} };
}

// ---------------------------------------------------------------------------
// Cambios
// ---------------------------------------------------------------------------

export type Accion =
  | { tipo: "productos"; productos: ProductoHoja[] }
  | { tipo: "quitarProducto"; productoId: string }
  | { tipo: "cantidad"; productoId: string; cantidad: number }
  | { tipo: "proveedor"; proveedor: ProveedorHoja }
  | { tipo: "quitarProveedor"; proveedorId: string }
  | { tipo: "moneda"; proveedorId: string; moneda: Moneda; tipoCambio: number | null }
  | { tipo: "igv"; proveedorId: string; incluyeIgv: boolean }
  | { tipo: "precio"; proveedorId: string; productoId: string; precio: number | null }
  | { tipo: "noTiene"; proveedorId: string; productoId: string; noTiene: boolean }
  | { tipo: "tiene"; proveedorId: string; productoId: string; tiene: number | null }
  | { tipo: "elegir"; productoId: string; proveedorId: string | null }
  | { tipo: "nota"; nota: string }
  /** El precio de venta y el último costo, que llegan después de añadir el producto. */
  | { tipo: "referencias"; datos: Record<string, { precioVenta: number | null; ultimoCosto: number | null }> }
  | {
      /** Lo que viene de un análisis de importación: sus productos y, si se quiere, su proveedor con sus precios. */
      tipo: "importar";
      productos: ProductoHoja[];
      proveedor: ProveedorHoja | null;
      precios: Record<string, number>;
    }
  | { tipo: "reemplazar"; hoja: Hoja };

const entera = (n: number) => (Number.isFinite(n) && n > 0 ? Math.max(1, Math.round(n)) : 1);

/** Añade productos; si ya estaba, SUMA la cantidad en vez de repetir la fila. */
function conProductos(hoja: Hoja, nuevos: ProductoHoja[]): ProductoHoja[] {
  const lista = hoja.productos.map((p) => ({ ...p }));
  for (const n of nuevos) {
    const ya = lista.find((p) => p.productoId === n.productoId);
    if (ya) ya.cantidad = entera(ya.cantidad + n.cantidad);
    else lista.push({ ...n, cantidad: entera(n.cantidad) });
  }
  return lista;
}

function sinClaves(casillas: Record<string, Casilla>, quitar: (k: string) => boolean) {
  return Object.fromEntries(Object.entries(casillas).filter(([k]) => !quitar(k)));
}

function casilla(hoja: Hoja, proveedorId: string, productoId: string): Casilla {
  return hoja.casillas[clave(proveedorId, productoId)] ?? CASILLA_VACIA;
}

function conCasilla(hoja: Hoja, proveedorId: string, productoId: string, c: Casilla): Hoja {
  const k = clave(proveedorId, productoId);
  const casillas = { ...hoja.casillas };
  if (c.precio === null && !c.noTiene) delete casillas[k];
  else casillas[k] = c;
  return { ...hoja, casillas };
}

export function reducir(hoja: Hoja, a: Accion): Hoja {
  switch (a.tipo) {
    case "productos":
      return { ...hoja, productos: conProductos(hoja, a.productos) };
    case "quitarProducto": {
      const elegidos = { ...hoja.elegidos };
      delete elegidos[a.productoId];
      return {
        ...hoja,
        productos: hoja.productos.filter((p) => p.productoId !== a.productoId),
        casillas: sinClaves(hoja.casillas, (k) => k.endsWith(`|${a.productoId}`)),
        elegidos,
      };
    }
    case "cantidad":
      return {
        ...hoja,
        productos: hoja.productos.map((p) =>
          p.productoId === a.productoId ? { ...p, cantidad: entera(a.cantidad) } : p,
        ),
      };
    case "proveedor":
      if (hoja.proveedores.some((p) => p.proveedorId === a.proveedor.proveedorId)) return hoja;
      // En orden alfabético, como los devuelve la consulta guardada: si no,
      // las columnas cambiaban de sitio al guardar.
      return {
        ...hoja,
        proveedores: [...hoja.proveedores, a.proveedor].sort((x, y) => x.nombre.localeCompare(y.nombre)),
      };
    case "quitarProveedor":
      return {
        ...hoja,
        proveedores: hoja.proveedores.filter((p) => p.proveedorId !== a.proveedorId),
        casillas: sinClaves(hoja.casillas, (k) => k.startsWith(`${a.proveedorId}|`)),
        elegidos: Object.fromEntries(Object.entries(hoja.elegidos).filter(([, v]) => v !== a.proveedorId)),
      };
    case "moneda":
      return {
        ...hoja,
        proveedores: hoja.proveedores.map((p) =>
          p.proveedorId === a.proveedorId
            ? { ...p, moneda: a.moneda, tipoCambio: a.moneda === "USD" ? null : a.tipoCambio }
            : p,
        ),
      };
    case "igv":
      return {
        ...hoja,
        proveedores: hoja.proveedores.map((p) =>
          p.proveedorId === a.proveedorId ? { ...p, incluyeIgv: a.incluyeIgv } : p,
        ),
      };
    case "precio": {
      const c = casilla(hoja, a.proveedorId, a.productoId);
      const precio = a.precio !== null && Number.isFinite(a.precio) && a.precio >= 0 ? a.precio : null;
      // Escribir un precio es decir que sí lo tiene.
      return conCasilla(hoja, a.proveedorId, a.productoId, { ...c, precio, noTiene: precio === null ? c.noTiene : false });
    }
    case "noTiene": {
      const c = casilla(hoja, a.proveedorId, a.productoId);
      return conCasilla(
        hoja,
        a.proveedorId,
        a.productoId,
        a.noTiene ? { precio: null, noTiene: true, tiene: null } : { ...c, noTiene: false },
      );
    }
    case "tiene": {
      const c = casilla(hoja, a.proveedorId, a.productoId);
      const tiene = a.tiene !== null && Number.isFinite(a.tiene) && a.tiene > 0 ? Math.round(a.tiene) : null;
      return conCasilla(hoja, a.proveedorId, a.productoId, { ...c, tiene });
    }
    case "elegir": {
      const elegidos = { ...hoja.elegidos };
      if (a.proveedorId) elegidos[a.productoId] = a.proveedorId;
      else delete elegidos[a.productoId];
      return { ...hoja, elegidos };
    }
    case "nota":
      return { ...hoja, nota: a.nota };
    case "referencias":
      return {
        ...hoja,
        productos: hoja.productos.map((p) => {
          const r = a.datos[p.productoId];
          return r ? { ...p, precioVenta: p.precioVenta ?? r.precioVenta, ultimoCosto: p.ultimoCosto ?? r.ultimoCosto } : p;
        }),
      };
    case "importar": {
      let h: Hoja = { ...hoja, productos: conProductos(hoja, a.productos) };
      if (a.proveedor) {
        h = reducir(h, { tipo: "proveedor", proveedor: a.proveedor });
        for (const [productoId, precio] of Object.entries(a.precios)) {
          h = reducir(h, { tipo: "precio", proveedorId: a.proveedor.proveedorId, productoId, precio });
        }
      }
      return h;
    }
    case "reemplazar":
      return a.hoja;
  }
}

// ---------------------------------------------------------------------------
// El análisis, mientras se llena
// ---------------------------------------------------------------------------

/** El margen sobre el COSTO, como todo el sistema (023): (venta − costo) ÷ costo. */
export function margenSobreCosto(venta: number | null, costo: number | null): number | null {
  if (venta === null || costo === null || costo <= 0 || venta <= 0) return null;
  return (venta - costo) / costo;
}

export interface Oferta {
  proveedorId: string;
  /** Dólares sin IGV, para poder comparar. */
  usd: number;
  /** Cuántas puede dar: las que tiene o, si no lo dijo, todas las pedidas. */
  puede: number;
}

export interface FilaAnalizada {
  productoId: string;
  ofertas: Oferta[];
  /** El más barato. Null si nadie dio precio. */
  masBarato: Oferta | null;
  /** A quién se le compra: el elegido a mano o, si no, el más barato. */
  elegido: Oferta | null;
  /** Elegido a mano y no es el más barato: se avisa de cuánto cuesta. */
  elegidoAMano: boolean;
  /** Cuántos dijeron «no tiene». */
  noTienen: number;
  /** Casillas que siguen vacías. */
  sinRespuesta: number;
  /** Margen comprando al elegido. */
  margen: number | null;
  /** Costo de la fila con el elegido: cantidad × precio. */
  total: number;
  /** El elegido no tiene todas las que se piden. */
  faltan: number;
  /** El precio elegido pasa al último costo conocido. */
  masCaroQueAntes: boolean;
}

export interface ColumnaAnalizada {
  proveedorId: string;
  /** Productos a los que dio precio. */
  conPrecio: number;
  noTiene: number;
  sinRespuesta: number;
  /** Si le compraras a él todo lo que tiene. */
  totalLoQueTiene: number;
  /** Lo que se le compra de verdad (los productos donde es el elegido). */
  productosElegidos: number;
  totalElegido: number;
  /** Tiene precio de todos los productos de la hoja. */
  tieneTodo: boolean;
  /** En la moneda conocida: no hay tipo de cambio en soles y no se puede comparar. */
  faltaTipoCambio: boolean;
}

export interface Analisis {
  filas: Record<string, FilaAnalizada>;
  columnas: Record<string, ColumnaAnalizada>;
  /** Productos con al menos un precio. */
  conPrecio: number;
  /** Productos sin ningún precio todavía. */
  sinPrecio: number;
  /** Comprando a los elegidos. */
  total: number;
  /** Lo que se vendería eso, a precio de lista, de los que tienen precio de venta. */
  venta: number;
  /** Costo de las filas que tienen precio de venta, para el margen global. */
  costoConVenta: number;
  margen: number | null;
  /** El que da todo más barato, si alguno tiene todo. */
  todoAUno: { proveedorId: string; total: number } | null;
  /** Cuánto se ahorra repartiendo contra todo a ese uno. */
  ahorro: number;
  /** A cuántos proveedores se les compra. */
  proveedoresElegidos: number;
}

const dos = (n: number) => Math.round(n * 100) / 100;

export function analizar(hoja: Hoja): Analisis {
  const filas: Record<string, FilaAnalizada> = {};
  const columnas: Record<string, ColumnaAnalizada> = {};

  for (const pv of hoja.proveedores) {
    columnas[pv.proveedorId] = {
      proveedorId: pv.proveedorId,
      conPrecio: 0,
      noTiene: 0,
      sinRespuesta: 0,
      totalLoQueTiene: 0,
      productosElegidos: 0,
      totalElegido: 0,
      tieneTodo: hoja.productos.length > 0,
      faltaTipoCambio: pv.moneda === "PEN" && !(pv.tipoCambio && pv.tipoCambio > 0),
    };
  }

  let total = 0;
  let venta = 0;
  let costoConVenta = 0;
  let conPrecio = 0;

  for (const p of hoja.productos) {
    const ofertas: Oferta[] = [];
    let noTienen = 0;
    let sinRespuesta = 0;
    for (const pv of hoja.proveedores) {
      const c = casilla(hoja, pv.proveedorId, p.productoId);
      const col = columnas[pv.proveedorId]!;
      if (c.noTiene) {
        noTienen++;
        col.noTiene++;
        col.tieneTodo = false;
        continue;
      }
      const usd = aUsdSinIgv(c.precio, pv.moneda, pv.tipoCambio, pv.incluyeIgv);
      if (usd === null) {
        if (c.precio === null) {
          sinRespuesta++;
          col.sinRespuesta++;
        }
        col.tieneTodo = false;
        continue;
      }
      const puede = c.tiene ? Math.min(c.tiene, p.cantidad) : p.cantidad;
      ofertas.push({ proveedorId: pv.proveedorId, usd, puede });
      col.conPrecio++;
      col.totalLoQueTiene += usd * puede;
      if (puede < p.cantidad) col.tieneTodo = false;
    }

    const masBarato = ofertas.reduce<Oferta | null>((m, o) => (m === null || o.usd < m.usd ? o : m), null);
    const aMano = hoja.elegidos[p.productoId];
    const elegido = (aMano && ofertas.find((o) => o.proveedorId === aMano)) || masBarato;
    const filaTotal = elegido ? elegido.usd * Math.min(elegido.puede, p.cantidad) : 0;
    if (elegido) {
      conPrecio++;
      total += filaTotal;
      const col = columnas[elegido.proveedorId]!;
      col.productosElegidos++;
      col.totalElegido += filaTotal;
      if (p.precioVenta && p.precioVenta > 0) {
        venta += p.precioVenta * Math.min(elegido.puede, p.cantidad);
        costoConVenta += filaTotal;
      }
    }

    filas[p.productoId] = {
      productoId: p.productoId,
      ofertas,
      masBarato,
      elegido,
      elegidoAMano: Boolean(elegido && masBarato && elegido.proveedorId !== masBarato.proveedorId),
      noTienen,
      sinRespuesta,
      margen: margenSobreCosto(p.precioVenta, elegido?.usd ?? null),
      total: dos(filaTotal),
      faltan: elegido ? Math.max(0, p.cantidad - elegido.puede) : 0,
      masCaroQueAntes: Boolean(elegido && p.ultimoCosto && p.ultimoCosto > 0 && elegido.usd > p.ultimoCosto * 1.005),
    };
  }

  for (const col of Object.values(columnas)) {
    col.totalLoQueTiene = dos(col.totalLoQueTiene);
    col.totalElegido = dos(col.totalElegido);
  }

  // Todo a uno: de los que tienen todo, el más barato.
  let todoAUno: Analisis["todoAUno"] = null;
  for (const col of Object.values(columnas)) {
    if (!col.tieneTodo) continue;
    if (todoAUno === null || col.totalLoQueTiene < todoAUno.total) {
      todoAUno = { proveedorId: col.proveedorId, total: col.totalLoQueTiene };
    }
  }

  return {
    filas,
    columnas,
    conPrecio,
    sinPrecio: hoja.productos.length - conPrecio,
    total: dos(total),
    venta: dos(venta),
    costoConVenta: dos(costoConVenta),
    margen: margenSobreCosto(venta, costoConVenta),
    todoAUno,
    ahorro: todoAUno ? dos(Math.max(0, todoAUno.total - total)) : 0,
    proveedoresElegidos: Object.values(columnas).filter((c) => c.productosElegidos > 0).length,
  };
}

// ---------------------------------------------------------------------------
// Lo que sale de la hoja
// ---------------------------------------------------------------------------

/** Lo que se manda a `guardar_hoja_precios` (110). */
export function aPayload(hoja: Hoja) {
  return {
    consulta_id: hoja.consultaId,
    nota: hoja.nota.trim() || null,
    items: hoja.productos.map((p) => ({ producto_id: p.productoId, cantidad: entera(p.cantidad) })),
    proveedores: hoja.proveedores.map((pv) => ({
      proveedor_id: pv.proveedorId,
      moneda: pv.moneda,
      tipo_cambio: pv.moneda === "PEN" ? pv.tipoCambio : null,
      incluye_igv: pv.incluyeIgv,
      precios: hoja.productos
        .map((p) => ({ p, c: casilla(hoja, pv.proveedorId, p.productoId) }))
        .filter(({ c }) => c.noTiene || c.precio !== null)
        .map(({ p, c }) => ({
          producto_id: p.productoId,
          costo_unitario: c.noTiene ? null : c.precio,
          disponible: !c.noTiene,
          cantidad_disponible: c.noTiene ? null : c.tiene,
        })),
    })),
  };
}

export interface CompraDeLaHoja {
  proveedorId: string;
  proveedor: string;
  tipo: "local" | "importacion";
  moneda: Moneda;
  tipoCambio: number | null;
  /** Si su factura lleva IGV: un proveedor de Lima, normalmente sí. */
  afectoIgv: boolean;
  lineas: { productoId: string; codigo: string; cantidad: number; costoUnitario: number }[];
  /** En su moneda, sin IGV. */
  subtotal: number;
}

/**
 * Una compra por proveedor, con lo que se le eligió a cada uno.
 *
 * El costo va en SU moneda y sin IGV (`costoParaCompra`): es lo que espera la
 * compra, que suma el IGV en la cabecera y se cuadra contra su factura (044).
 */
export function comprasDeLaHoja(hoja: Hoja, analisis: Analisis = analizar(hoja)): CompraDeLaHoja[] {
  const porProveedor = new Map<string, CompraDeLaHoja>();
  for (const p of hoja.productos) {
    const e = analisis.filas[p.productoId]?.elegido;
    if (!e) continue;
    const pv = hoja.proveedores.find((x) => x.proveedorId === e.proveedorId);
    if (!pv) continue;
    const costo = costoParaCompra(casilla(hoja, pv.proveedorId, p.productoId).precio, pv.incluyeIgv);
    if (costo === null) continue;
    const cantidad = Math.min(e.puede, p.cantidad);
    let compra = porProveedor.get(pv.proveedorId);
    if (!compra) {
      compra = {
        proveedorId: pv.proveedorId,
        proveedor: pv.nombre,
        tipo: pv.tipo,
        moneda: pv.moneda,
        tipoCambio: pv.tipoCambio,
        afectoIgv: pv.tipo === "local",
        lineas: [],
        subtotal: 0,
      };
      porProveedor.set(pv.proveedorId, compra);
    }
    compra.lineas.push({ productoId: p.productoId, codigo: p.codigo, cantidad, costoUnitario: costo });
    compra.subtotal = dos(compra.subtotal + costo * cantidad);
  }
  return [...porProveedor.values()];
}

/** Lo que impide guardar, dicho para quien lo lee. */
export function bloqueosAlGuardar(hoja: Hoja): string[] {
  const b: string[] = [];
  if (hoja.productos.length === 0) b.push("Añade al menos un producto.");
  for (const pv of hoja.proveedores) {
    if (pv.moneda === "PEN" && !(pv.tipoCambio && pv.tipoCambio > 0)) {
      b.push(`${pv.nombre} está en soles: falta el tipo de cambio.`);
    }
  }
  return b;
}
