import { IGV, importeExacto, redondear2, redondear4 } from "@rodatech/config";

import type { TipoCompra } from "./tipos";
import {
  CONCEPTOS_SUGERIDOS,
  gastosParaEnviar,
  hayGastosEscritos,
  tipoYVia,
  totalGastos,
  type GastoEditable,
  type Modalidad,
  type ViaImportacion,
} from "./gastos";

/** Las dos monedas que admite `compras.moneda` (042). */
export type Moneda = "USD" | "PEN";

/** Lo que se lee en el desplegable. */
export const ETIQUETA_MONEDA: Record<Moneda, string> = {
  USD: "Dólares (US$)",
  PEN: "Soles (S/)",
};

/** El símbolo, para las cifras de la pantalla. */
export const SIMBOLO_MONEDA: Record<Moneda, string> = {
  USD: "US$",
  PEN: "S/",
};

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
  /** Costo promedio del KARDEX. Vale 0 si el producto nunca entró al almacén. */
  costo_promedio?: number;
  /** `productos.ultimo_costo`: lo que dice la FICHA que costó. El respaldo. */
  ultimo_costo?: number;
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
  /**
   * El costo lo puso el sistema, no una persona.
   *
   * Nace en `true` —se propone el promedio del maestro al añadir la línea— y
   * pasa a `false` en cuanto alguien lo escribe. Sirve para dos cosas: para
   * decirlo en pantalla, y para que al elegir proveedor se puedan pisar las
   * propuestas con lo que ESE proveedor cobró, sin tocar lo tecleado.
   *
   * Un número propuesto es una ayuda; uno escrito es una decisión, y una
   * decisión no se pisa sola.
   */
  costoPropuesto: boolean;
  /**
   * De dónde salió el costo propuesto: del KARDEX o de la FICHA.
   *
   * Desde el 25/09 el costo cae a `ultimo_costo` cuando el producto nunca
   * entró al almacén, y eso pasa en casi todo el catálogo. Los dos números se
   * escriben igual y valen cosas distintas: uno es lo que de verdad se pagó,
   * el otro lo que alguien anotó. Decir «del promedio» cuando viene de la
   * ficha es peor que no decir nada.
   */
  costoDelKardex: boolean;
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
  /**
   * La moneda de la FACTURA DEL PROVEEDOR (042).
   *
   * Willy compra local casi siempre (01/09, 28:05) y en Lima se factura
   * en soles, pero todo el sistema vende y valoriza en dólares. Se guarda
   * lo que dice el papel que tiene delante, y la conversión ocurre una
   * sola vez: al recibir la mercadería, que es cuando el costo entra al
   * kardex.
   */
  moneda: Moneda;
  /**
   * Soles por dólar. Solo cuando la moneda no es USD.
   *
   * 0 significa «todavía no se ha puesto» y NO se manda: la base rechaza
   * una compra en soles sin tipo de cambio, que es exactamente lo que
   * queremos que pase.
   */
  tipoCambio: number;
  /**
   * Por dónde vino, si es importación (095). Se guarda aunque la compra sea
   * local para que volver a «importación» recuerde la que se había elegido;
   * al enviar, en local no viaja.
   */
  via: ViaImportacion;
  /**
   * Los gastos, DETALLADOS (§AO.4). Antes era un solo número y solo en
   * importación; ahora son filas —concepto y monto— en las tres
   * modalidades, porque la compra local también tiene su transporte.
   *
   * Todos entran al costo: la base los suma (022) y la recepción los
   * prorratea sobre el valor de la compra (094).
   */
  gastos: GastoEditable[];
  /** Contador propio de los gastos, para no mover las claves de las líneas. */
  proximoGasto: number;
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
  | { tipo: "modalidad"; valor: Modalidad }
  | { tipo: "gastoAgregar"; concepto?: string }
  | { tipo: "gastoQuitar"; key: string }
  | { tipo: "gastoConcepto"; key: string; valor: string }
  | { tipo: "gastoMonto"; key: string; valor: number }
  | { tipo: "moneda"; valor: Moneda }
  | { tipo: "tipoCambio"; valor: number }
  | { tipo: "afectoIgv"; valor: boolean }
  | { tipo: "agregar"; producto: ProductoParaComprar; cantidad?: number }
  | { tipo: "quitar"; key: string }
  | { tipo: "cantidad"; key: string; valor: number }
  | { tipo: "costo"; key: string; valor: number }
  // Lo que este proveedor cobró la última vez, por producto. Llega al
  // elegirlo, y solo pisa lo que el sistema había propuesto.
  | { tipo: "costosDelProveedor"; costos: Readonly<Record<string, number>> }
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
    // Dólares por defecto porque es la moneda del sistema, no porque sea
    // la más frecuente en sus compras. Cambiarlo a soles es un clic; lo
    // que no puede pasar es que se escriban soles "sin querer" en un
    // campo que el resto del sistema lee como dólares.
    moneda: "USD",
    tipoCambio: 0,
    via: "aerea",
    // Nace con los gastos propuestos de una compra local —el transporte—
    // vacíos. Así se ve dónde va el gasto sin que haya que buscarlo.
    ...gastosPropuestos("local", 1),
    tracking: "",
    courier: "",
    observaciones: "",
    lineas: [],
    proximaKey: 1,
  };
}

/** Las filas vacías que se proponen para una modalidad, con sus claves. */
function gastosPropuestos(
  m: Modalidad,
  desde: number,
): { gastos: GastoEditable[]; proximoGasto: number } {
  const conceptos = CONCEPTOS_SUGERIDOS[m];
  return {
    gastos: conceptos.map((concepto, i) => ({ key: `g${desde + i}`, concepto, monto: 0 })),
    proximoGasto: desde + conceptos.length,
  };
}

function cambiarModalidad(estado: EstadoCompra, m: Modalidad): EstadoCompra {
  const { tipo, via } = tipoYVia(m);

  /*
    Los gastos propuestos se cambian por los de la nueva modalidad SOLO si
    nadie ha escrito dinero todavía. Si hay un monto puesto, se quedan como
    están: borrar en silencio un gasto que alguien tecleó —porque cambió de
    opinión sobre la vía— es perder dinero del costo sin que nadie se entere.
    Lo que sobre, se quita a mano.
  */
  const gastos = hayGastosEscritos(estado.gastos)
    ? { gastos: estado.gastos, proximoGasto: estado.proximoGasto }
    : gastosPropuestos(m, estado.proximoGasto);

  return {
    ...estado,
    tipo,
    via: via ?? estado.via,
    ...gastos,
    // Al pasar a local se sueltan los campos que solo tienen sentido en una
    // importación. Dejarlos puestos guarda un tracking de DHL en una compra a
    // un proveedor de Lima, y eso ensucia el histórico para siempre.
    ...(tipo === "local" ? { tracking: "", courier: "" } : {}),
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

    case "tipoCompra":
      // Se conserva por compatibilidad: «importación» a secas recupera la vía
      // que se tenía elegida.
      return cambiarModalidad(estado, accion.valor === "local" ? "local" : estado.via);

    case "modalidad":
      return cambiarModalidad(estado, accion.valor);

    case "gastoAgregar":
      return {
        ...estado,
        gastos: [
          ...estado.gastos,
          { key: `g${estado.proximoGasto}`, concepto: accion.concepto ?? "", monto: 0 },
        ],
        proximoGasto: estado.proximoGasto + 1,
      };

    case "gastoQuitar":
      return { ...estado, gastos: estado.gastos.filter((g) => g.key !== accion.key) };

    case "gastoConcepto":
      return {
        ...estado,
        gastos: estado.gastos.map((g) =>
          g.key === accion.key ? { ...g, concepto: accion.valor.slice(0, 80) } : g,
        ),
      };

    case "gastoMonto":
      return {
        ...estado,
        gastos: estado.gastos.map((g) =>
          g.key === accion.key ? { ...g, monto: montoValido(accion.valor) } : g,
        ),
      };

    case "moneda":
      return {
        ...estado,
        moneda: accion.valor,
        // Volver a dólares limpia el tipo de cambio. Dejarlo puesto haría
        // que un cambio de opinión guardara un dato que ya no significa
        // nada, y la base lo rechazaría al enviar.
        tipoCambio: accion.valor === "USD" ? 0 : estado.tipoCambio,
      };

    case "tipoCambio":
      return {
        ...estado,
        // Cuatro decimales: es lo que publica SUNAT y lo que admite la
        // columna `numeric(9,4)`.
        tipoCambio:
          Number.isFinite(accion.valor) && accion.valor > 0
            ? redondear4(accion.valor)
            : 0,
      };

    case "afectoIgv":
      return { ...estado, afectoIgv: accion.valor };

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

      /*
        El del KARDEX manda; el de la FICHA es el respaldo.

        Willy, 24/09 (18:00), registrando una compra: *«tendría que jalarme
        aquí el precio y el costo, no me lo estás jalando, pero debería
        jalarme aquí los 2.50 que hemos puesto anteriormente»*. Y tenía razón:
        había escrito 2.50 en el «P.C. — costo» de la ficha —que se guarda en
        `ultimo_costo`— y aquí solo se leía `costo_promedio`, que vale 0 en los
        793 productos que entraron del Excel sin una sola recepción. O sea, en
        casi todos.

        Es exactamente la misma caída que ya hace la cotización
        (`cotizaciones/dominio/constructor.ts`), y por el mismo motivo: un cero
        propuesto no es «no sé cuánto cuesta», es una compra a coste nulo
        esperando a que alguien le dé a guardar sin mirar.
      */
      const costo =
        accion.producto.costo_promedio || accion.producto.ultimo_costo || 0;
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
            costoPropuesto: true,
            costoDelKardex: (accion.producto.costo_promedio ?? 0) > 0,
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
        // Lo escribió una persona: deja de ser una propuesta y ya no se pisa.
        costoPropuesto: false,
      }));

    case "costosDelProveedor": {
      // El sistema ya sabe lo que este proveedor cobró la última vez —lo
      // enseñaba debajo del campo— y aun así había que teclearlo. Con cinco
      // líneas eso son cinco números copiados a mano de un sitio a otro de
      // la misma pantalla.
      //
      // Se rellenan SOLO las propuestas. Lo que alguien escribió se queda,
      // aunque se cambie de proveedor: puede haber tecleado el precio que
      // acaba de darle por teléfono, y ese manda sobre cualquier histórico.
      return {
        ...estado,
        lineas: estado.lineas.map((l) => {
          if (!l.costoPropuesto) return l;
          const costo = accion.costos[l.productoId];
          if (costo === undefined || !(costo > 0)) return l;
          return { ...l, costoUnitario: costoValido(costo) };
        }),
      };
    }

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
  // En las TRES modalidades desde el 25/09: el transporte de una compra local
  // también es costo (§AO.4). Antes solo contaban en importación.
  const gastos = totalGastos(estado.gastos);

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
    moneda: estado.moneda,
    // En dólares no se manda: la base exige que sea null y la RPC lo
    // limpiaría igual, pero mandarlo sugeriría que significa algo.
    tipo_cambio: estado.moneda === "USD" ? null : estado.tipoCambio || null,
    // La vía solo en importación (095). La base la descartaría igual en una
    // local, pero mandarla sugeriría que significa algo.
    via_importacion: esImportacion ? estado.via : null,
    // El DETALLE, que es lo que manda: la base lo suma (022). El total se
    // manda también por si alguien llama a la RPC vieja, y coincide.
    gastos: gastosParaEnviar(estado.gastos),
    gastos_importacion: totalGastos(estado.gastos),
    // Tracking y courier NO viajan en una compra local, aunque el estado los
    // tuviera de antes de cambiar la modalidad.
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
