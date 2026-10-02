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
  /** Para quién se trae (CLIENTE, la columna A de su hoja). */
  cliente: string;
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
  /**
   * El desaduanaje ESTIMADO, en soles, como lo da Willy (*«como 700, 800
   * soles»*). Entra en la K (101).
   */
  desaduanajeSoles: number;
  /** Soles por dólar, para pasar el desaduanaje a dólares. 0 = no se sabe. */
  tipoCambio: number;
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
  | {
      tipo: "texto";
      key: string;
      campo: "codigo" | "marca" | "descripcion" | "proveedorMercado" | "cliente";
      valor: string;
    }
  /**
   * Su hoja de Excel entera, ya leída y cruzada con el catálogo. REEMPLAZA las
   * líneas: la hoja es la proforma completa, y mezclarla con lo escrito antes
   * duplicaría productos y descuadraría el $/kg.
   */
  | {
      tipo: "cargarHoja";
      lineas: Omit<LineaAnalisis, "key" | "fobAnterior">[];
      costoEnvio: number | null;
    }
  /** Lo que llega del servidor después de añadir: la «f» y el último FOB. */
  | {
      tipo: "propuestas";
      frecuencias: Readonly<Record<string, number>>;
      fobs: Readonly<Record<string, { precio: number; numero: string }>>;
    }
  /** Todas las cantidades finales iguales a las cotizadas. */
  | { tipo: "pedirLoCotizado" }
  /**
   * Una fila vacía, para escribirla como en su hoja. Luis, 02/10: *«eso lo
   * quiere rellenar acá para no usar el excel»*.
   */
  | { tipo: "agregarFila" }
  /**
   * Lo que dijo el catálogo del código escrito en una fila: el producto, o
   * null si no está. Llega del servidor al salir del campo.
   */
  | { tipo: "enlazar"; key: string; producto: ProductoParaAnalizar | null };

export function estadoInicial(fecha: string): EstadoAnalisis {
  return {
    proveedorId: null,
    fecha,
    referencia: "",
    costoEnvio: 0,
    pesoDeclarado: 0,
    notas: "",
    desaduanajeSoles: 0,
    tipoCambio: 0,
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
    cliente: "",
    fobAnterior: null,
    ...parcial,
  };
}

export function reducir(estado: EstadoAnalisis, accion: Accion): EstadoAnalisis {
  switch (accion.tipo) {
    case "cabecera": {
      const v = accion.valor;
      if (
        accion.campo === "costoEnvio" ||
        accion.campo === "pesoDeclarado" ||
        accion.campo === "desaduanajeSoles" ||
        accion.campo === "tipoCambio"
      ) {
        return { ...estado, [accion.campo]: positivo(Number(v), accion.campo === "tipoCambio" ? 4 : 3) };
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
      // Si hay filas vacías para escribir, la primera se queda con él: si no,
      // quedaría un hueco encima del producto elegido.
      const hueco = estado.lineas.findIndex(enBlanco);
      const lineas = hueco < 0 ? estado.lineas : estado.lineas.filter((_, i) => i !== hueco);
      const nueva = nuevaLinea(hueco < 0 ? `a${estado.proximaKey}` : estado.lineas[hueco]!.key, {
        productoId: p.id,
        codigo: p.codigo,
        marca: p.marca ?? "",
        descripcion: p.descripcion,
        pesoKg: p.peso_kg ?? 0,
        precioMercado: p.precio_mercado ?? 0,
      });
      if (hueco >= 0) {
        return { ...estado, lineas: [...lineas.slice(0, hueco), nueva, ...lineas.slice(hueco)] };
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
        lineas: estado.lineas.map((l) => {
          if (l.key !== accion.key) return l;
          const valor = accion.valor.slice(0, 300);
          // Cambiar el código suelta el producto: hasta que el catálogo diga
          // otra cosa, ese código no se sabe si está.
          if (accion.campo === "codigo" && valor.trim().toUpperCase() !== l.codigo.trim().toUpperCase()) {
            return { ...l, codigo: valor.toUpperCase(), productoId: null, descripcion: "" };
          }
          return { ...l, [accion.campo]: accion.campo === "marca" ? valor.toUpperCase() : valor };
        }),
      };

    case "agregarFila":
      return {
        ...estado,
        // Cantidades en 0: se escriben, como en su hoja. Mientras sean
        // iguales, el pedido sigue a lo cotizado.
        lineas: [...estado.lineas, nuevaLinea(`a${estado.proximaKey}`, { cantidadRef: 0, cantidadPedido: 0 })],
        proximaKey: estado.proximaKey + 1,
      };

    case "enlazar": {
      const p = accion.producto;
      return {
        ...estado,
        lineas: estado.lineas.map((l) => {
          if (l.key !== accion.key) return l;
          if (!p) return { ...l, productoId: null, descripcion: "" };
          return {
            ...l,
            productoId: p.id,
            codigo: p.codigo,
            marca: l.marca || (p.marca ?? "").toUpperCase(),
            descripcion: p.descripcion,
            // Lo escrito manda; el catálogo solo llena lo vacío.
            pesoKg: l.pesoKg || p.peso_kg || 0,
            precioMercado: l.precioMercado || p.precio_mercado || 0,
          };
        }),
      };
    }

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

    case "cargarHoja": {
      let k = estado.proximaKey;
      return {
        ...estado,
        costoEnvio: accion.costoEnvio !== null && accion.costoEnvio > 0 ? accion.costoEnvio : estado.costoEnvio,
        lineas: accion.lineas.map((l) => nuevaLinea(`a${k++}`, l)),
        proximaKey: k,
      };
    }

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

/**
 * El $/kg que se usa: DHL ÷ peso, CORTADO a dos decimales.
 *
 * Así lo hace Willy: su hoja calcula 1039 ÷ 102.3054 = 10.1559 (E40), pero en
 * cada PU LIMA escribió el factor a mano: `=+F2+10.15*H2`. Cortado, no
 * redondeado —redondear daría 10.16—. Con el exacto, el total del pedido salía
 * 1279.95 y en su hoja dice 1279.57: Luis lo vio el 02/10 y por eso «no salía
 * lo mismo». Con 10.15, las 29 filas cuadran al céntimo.
 */
export const porKgDeLaHoja = (exacto: number) =>
  exacto > 0 ? Math.floor(exacto * 100 + 1e-9) / 100 : 0;
const cuatro = (n: number) => Math.round(n * 1e4) / 1e4;

export interface LineaCalculada {
  key: string;
  /** PARC.$ = cantidad cotizada × FOB. */
  parcialRef: number;
  /** PESO PARC. = cantidad cotizada × peso. */
  pesoRef: number;
  /** DHL y desaduanaje por unidad = peso × $/kg. */
  envioUnitario: number;
  /** PU LIMA = FOB + peso × $/kg. */
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
  /** (DHL + desaduanaje) ÷ peso cotizado, sin cortar (su E40). */
  porKgExacto: number;
  /** El que se usa en cada PU Lima: el exacto cortado a dos decimales. */
  porKg: number;
  /** Unidades cotizadas, sumadas. */
  cantidadRef: number;
  /** W. REAL de su hoja: el peso más un 10 % (=1.1*E38). Solo se enseña. */
  pesoRealRef: number;
  /** Su «K» de lo cotizado: mercado ÷ costo total. Null si no hay mercado. */
  rindeRef: number | null;
  /** El desaduanaje estimado, ya en dólares. 0 sin tipo de cambio. */
  desaduanaje: number;

  /** Hay desaduanaje en soles pero no tipo de cambio: no se pudo sumar. */
  faltaTipoCambio: boolean;
  /** Costo total de importación de lo cotizado: FOB + DHL + desaduanaje. */
  costoTotalRef: number;
  /** Lo cotizado a precio de mercado. */
  totalMercadoRef: number;
  /** Diferencia con el peso que dice el proveedor, en kg. Null si no lo dijo. */
  difPeso: number | null;
  /** Lo que se va a pedir. */
  cantidadPedido: number;
  fobPedido: number;
  pesoPedido: number;
  pesoRealPedido: number;
  /** DHL y desaduanaje que tocan a lo pedido: $/kg × peso pedido. */
  envioPedido: number;
  /** De eso, la parte de DHL y la de desaduanaje (en la proporción de la carga). */
  dhlPedido: number;
  desaduanajePedido: number;
  totalLima: number;
  /** Costo total de importación de lo que pides: la suma de los TOT. $. */
  costoTotal: number;
  totalMercado: number;
  /**
   * La K. Willy, 02/10: *«el índice que me indica la utilidad de la
   * operación, considerando los precios en origen + gastos de envío + gastos
   * de desaduanaje vs el importe […] de los precios de venta de mercado»*.
   *
   * Se calcula como su hoja (F41 = TOT.PM ÷ TOT.$): MERCADO ÷ COSTO, más de 1
   * es ganar. Él lo escribió al revés («costo / total PM»); está preguntado.
   * Lo nuevo es que el costo lleva el desaduanaje, que su hoja no tenía.
   */
  rinde: number | null;
  /** Margen del pedido entero, sobre el costo. */
  margen: number | null;
  /** Líneas sin peso: con ellas el $/kg sale de más. */
  sinPeso: string[];
  /** Líneas sin precio de mercado: sin margen. */
  sinMercado: string[];
}

export function calcular(
  estado: Pick<EstadoAnalisis, "lineas" | "costoEnvio" | "pesoDeclarado"> &
    Partial<Pick<EstadoAnalisis, "desaduanajeSoles" | "tipoCambio">>,
): Calculo {
  const soles = estado.desaduanajeSoles ?? 0;
  const tc = estado.tipoCambio ?? 0;
  // Uno por carga: el mismo para lo cotizado y para lo que se pide.
  const desaduanaje = soles > 0 && tc > 0 ? soles / tc : 0;
  const fobRef = dos(estado.lineas.reduce((a, l) => a + l.cantidadRef * l.precioFob, 0));
  const pesoRef = estado.lineas.reduce((a, l) => a + l.cantidadRef * l.pesoKg, 0);

  /*
    El $/kg lleva el DHL Y el desaduanaje. Willy, 02/10: *«DHL + desaduanaje
    ÷ peso total, cortado a 2 decimales […] después ya se divide por el
    peso»*. Un solo factor, como su 10.15: el desaduanaje (en soles, pasado a
    dólares) se reparte POR PESO igual que el DHL, sobre el peso de lo
    cotizado. Sin desaduanaje, es exactamente el de su hoja.
  */
  const aRepartir = estado.costoEnvio + desaduanaje;
  const porKgExacto = pesoRef > 0 && aRepartir > 0 ? aRepartir / pesoRef : 0;
  const porKg = porKgDeLaHoja(porKgExacto);

  const lineas: Record<string, LineaCalculada> = {};
  let fobPedido = 0;
  let pesoPedido = 0;
  let totalLima = 0;
  let totalMercado = 0;
  let limaConMercado = 0;
  let mercadoRef = 0;
  let limaRefConMercado = 0;
  let cantidadRef = 0;
  let cantidadPedido = 0;

  for (const l of estado.lineas) {
    const envioUnitario = l.pesoKg * porKg;
    const puLima = l.precioFob + envioUnitario;
    const tieneMercado = l.precioMercado > 0 && puLima > 0;
    const c: LineaCalculada = {
      key: l.key,
      parcialRef: cuatro(l.cantidadRef * l.precioFob),
      pesoRef: cuatro(l.cantidadRef * l.pesoKg),
      envioUnitario: cuatro(envioUnitario),
      puLima: cuatro(puLima),
      margen: tieneMercado ? (l.precioMercado - puLima) / puLima : null,
      rinde: tieneMercado ? l.precioMercado / puLima : null,
      parcialPedido: cuatro(l.cantidadPedido * l.precioFob),
      pesoPedido: cuatro(l.cantidadPedido * l.pesoKg),
      totalLima: dos(l.cantidadPedido * puLima),
      totalMercado: dos(l.cantidadPedido * l.precioMercado),
    };
    lineas[l.key] = c;
    cantidadRef += l.cantidadRef;
    cantidadPedido += l.cantidadPedido;
    fobPedido += l.cantidadPedido * l.precioFob;
    pesoPedido += l.cantidadPedido * l.pesoKg;
    totalLima += l.cantidadPedido * puLima;
    if (tieneMercado) {
      totalMercado += c.totalMercado;
      limaConMercado += l.cantidadPedido * puLima;
      mercadoRef += l.cantidadRef * l.precioMercado;
      limaRefConMercado += l.cantidadRef * puLima;
    }
  }

  return {
    lineas,
    fobRef,
    pesoRef: cuatro(pesoRef),
    porKgExacto: cuatro(porKgExacto),
    porKg,
    cantidadRef,
    pesoRealRef: cuatro(pesoRef * 1.1),
    // Como la del pedido: mercado ÷ Σ cantidad × PU LIMA, que ya lleva todo.
    rindeRef: limaRefConMercado > 0 ? mercadoRef / limaRefConMercado : null,
    desaduanaje: dos(desaduanaje),
    faltaTipoCambio: soles > 0 && !(tc > 0),
    costoTotalRef: dos(fobRef + estado.costoEnvio + desaduanaje),
    totalMercadoRef: dos(mercadoRef),
    difPeso: estado.pesoDeclarado > 0 ? cuatro(pesoRef - estado.pesoDeclarado) : null,
    cantidadPedido,
    // Con tres decimales, como su K31 (611.115): el FOB lleva cuatro.
    fobPedido: Math.round(fobPedido * 1000) / 1000,
    pesoPedido: cuatro(pesoPedido),
    pesoRealPedido: cuatro(pesoPedido * 1.1),
    envioPedido: dos(pesoPedido * porKg),
    // Partido en la proporción de la carga, para que DHL + desaduanaje del
    // pedido sumen justo el envío por kilo (y sin desaduanaje, el DHL de su
    // hoja: 65.857 × 10.15 = 668.45).
    dhlPedido: dos(aRepartir > 0 ? (pesoPedido * porKg * estado.costoEnvio) / aRepartir : 0),
    desaduanajePedido: dos(aRepartir > 0 ? (pesoPedido * porKg * desaduanaje) / aRepartir : 0),
    totalLima: dos(totalLima),
    // Los PU ya llevan DHL y desaduanaje: el costo es la suma de los TOT. $.
    costoTotal: dos(totalLima),
    totalMercado: dos(totalMercado),
    // El rinde y el margen del pedido se miden solo con las líneas que tienen
    // precio de mercado: con las otras, dividir diría un margen que no existe.
    rinde: limaConMercado > 0 ? totalMercado / limaConMercado : null,
    margen: limaConMercado > 0 ? (totalMercado - limaConMercado) / limaConMercado : null,
    sinPeso: estado.lineas.filter((l) => !enBlanco(l) && !(l.pesoKg > 0)).map((l) => l.key),
    sinMercado: estado.lineas.filter((l) => !enBlanco(l) && !(l.precioMercado > 0)).map((l) => l.key),
  };
}

/**
 * Una fila sin código: la que se añadió para escribir y se dejó vacía. No se
 * guarda ni impide guardar —como una fila vacía en Excel—.
 */
export const enBlanco = (l: LineaAnalisis) => l.codigo.trim() === "";

/** Por qué no se puede guardar todavía. */
export function bloqueos(estado: EstadoAnalisis): string[] {
  const b: string[] = [];
  if (!estado.proveedorId) b.push("Falta el proveedor que cotiza.");
  if (estado.lineas.every(enBlanco)) b.push("Escribe los productos de la proforma.");
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
    desaduanaje_soles: estado.desaduanajeSoles,
    tipo_cambio: estado.tipoCambio > 0 ? estado.tipoCambio : null,
    items: estado.lineas.filter((l) => !enBlanco(l)).map((l) => ({
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
      cliente: l.cliente.trim() || null,
    })),
  };
}
