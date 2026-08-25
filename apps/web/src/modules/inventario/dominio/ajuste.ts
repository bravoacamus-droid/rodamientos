import type { ProductoContable, TipoAjuste } from "./tipos";

/**
 * La hoja de conteo del cuadre de inventario, como reducer PURO.
 *
 * Willy lo describió como *"un botón que lo va a usar con cuidado"* (26:49), y
 * el diseño lo toma en serio: esto NO escribe el saldo. Registra un ajuste con
 * su documento, su motivo y su responsable, y deja que el kardex recalcule.
 * El saldo de almacén es la suma de sus movimientos; si se pudiera escribir a
 * mano se perdería la trazabilidad justo donde más falta hace — que es
 * exactamente el fallo que dejó el costo promedio del 6205 mintiendo.
 *
 * Lo que aporta esta capa sobre lo que ya hace Postgres: enseñar el IMPACTO
 * antes de confirmar. Cuántas unidades sobran o faltan, y cuánto dinero
 * representa el descuadre. Un cuadre de inventario mueve valor, y quien lo
 * firma tiene derecho a ver cuánto antes de firmarlo.
 */

/** Redondeos, con la misma tolerancia al error binario que el resto del ERP. */
const redondear2 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;

export interface LineaConteo {
  productoId: string;
  codigo: string;
  descripcion: string;
  marca: string;
  subfamilia: string;
  unidad: string;
  /** Lo que dice el sistema AHORA. Solo lectura: es el saldo del kardex. */
  cantidadSistema: number;
  /**
   * Lo que se ha contado. `null` mientras nadie haya escrito nada, que NO es
   * lo mismo que haber contado cero: un cero declarado vacía el producto.
   */
  cantidadFisica: number | null;
  costoUnitario: number;
}

export interface EstadoConteo {
  tipo: TipoAjuste;
  motivo: string;
  /** ISO `yyyy-mm-dd`. La fija la pantalla; el dominio no lee reloj. */
  fecha: string;
  lineas: LineaConteo[];
}

export type Accion =
  | { tipo: "cabecera"; campo: "tipo" | "motivo" | "fecha"; valor: string }
  | { tipo: "cargar"; productos: readonly ProductoContable[]; fecha?: string }
  | { tipo: "contar"; productoId: string; valor: number | null }
  | { tipo: "contarTodoConforme" }
  | { tipo: "limpiar" };

export function estadoInicial(fecha: string): EstadoConteo {
  return { tipo: "descuadre", motivo: "", fecha, lineas: [] };
}

const contadaValida = (n: number | null): number | null => {
  if (n === null) return null;
  // Un negativo contado no existe: o hay cero, o hay algo. El saldo del
  // sistema sí puede ser negativo, pero eso es un descuadre, no un conteo.
  if (!Number.isFinite(n) || n < 0) return 0;
  return redondear2(n);
};

function desdeProducto(p: ProductoContable): LineaConteo {
  return {
    productoId: p.id,
    codigo: p.codigo,
    descripcion: p.descripcion,
    marca: p.marca,
    subfamilia: p.subfamilia,
    unidad: p.unidad,
    cantidadSistema: p.stock,
    cantidadFisica: null,
    costoUnitario: p.costo_promedio,
  };
}

export function reducir(estado: EstadoConteo, accion: Accion): EstadoConteo {
  switch (accion.tipo) {
    case "cabecera":
      return { ...estado, [accion.campo]: accion.valor } as EstadoConteo;

    case "cargar": {
      // Se conserva lo YA CONTADO de los productos que siguen en la hoja.
      // Recargar con otro filtro después de contar media estantería y perder
      // el conteo es de las cosas que hacen que nadie vuelva a usar la
      // pantalla.
      const contado = new Map(
        estado.lineas
          .filter((l) => l.cantidadFisica !== null)
          .map((l) => [l.productoId, l.cantidadFisica]),
      );

      return {
        ...estado,
        fecha: accion.fecha ?? estado.fecha,
        lineas: accion.productos.map((p) => {
          const previo = contado.get(p.id);
          const linea = desdeProducto(p);
          return previo === undefined ? linea : { ...linea, cantidadFisica: previo };
        }),
      };
    }

    case "contar": {
      const valor = contadaValida(accion.valor);
      const lineas = estado.lineas.map((l) =>
        l.productoId === accion.productoId ? { ...l, cantidadFisica: valor } : l,
      );
      return { ...estado, lineas };
    }

    case "contarTodoConforme":
      // Atajo para el caso habitual: casi todo cuadra y solo dos referencias
      // están mal. Se declara todo conforme y se corrigen esas dos.
      return {
        ...estado,
        lineas: estado.lineas.map((l) => ({
          ...l,
          cantidadFisica: l.cantidadFisica ?? l.cantidadSistema,
        })),
      };

    case "limpiar":
      return { ...estado, lineas: [] };

    default:
      return estado;
  }
}

// ---------------------------------------------------------------------------
// Selectores
// ---------------------------------------------------------------------------

/** La diferencia de una línea. `null` si todavía no se ha contado. */
export function diferenciaDe(linea: LineaConteo): number | null {
  if (linea.cantidadFisica === null) return null;
  return redondear2(linea.cantidadFisica - linea.cantidadSistema);
}

export interface ImpactoConteo {
  /** Cuántas líneas se han contado, de las que hay en la hoja. */
  contadas: number;
  pendientes: number;
  /** Contadas cuya diferencia no es cero: las únicas que generan movimiento. */
  conDiferencia: number;
  unidadesSobran: number;
  unidadesFaltan: number;
  /** Valor de lo que aparece de más. Positivo. */
  valorSobrante: number;
  /** Valor de lo que falta. Positivo, aunque sea una pérdida. */
  valorFaltante: number;
  /** Sobrante menos faltante. Negativo = el almacén vale menos que en libros. */
  impactoNeto: number;
}

/**
 * Cuánto mueve este cuadre.
 *
 * Se valora al costo promedio vigente, que es a lo que la base va a registrar
 * el movimiento: `registrar_ajuste_inventario` toma
 * `coalesce(costo_unitario del ítem, productos.costo_promedio)`.
 */
export function impactoDe(estado: EstadoConteo): ImpactoConteo {
  let contadas = 0;
  let conDiferencia = 0;
  let unidadesSobran = 0;
  let unidadesFaltan = 0;
  let valorSobrante = 0;
  let valorFaltante = 0;

  for (const l of estado.lineas) {
    const d = diferenciaDe(l);
    if (d === null) continue;
    contadas++;
    if (d === 0) continue;
    conDiferencia++;

    if (d > 0) {
      unidadesSobran += d;
      valorSobrante += d * l.costoUnitario;
    } else {
      unidadesFaltan += -d;
      valorFaltante += -d * l.costoUnitario;
    }
  }

  const sobrante = redondear2(valorSobrante);
  const faltante = redondear2(valorFaltante);

  return {
    contadas,
    pendientes: estado.lineas.length - contadas,
    conDiferencia,
    unidadesSobran: redondear2(unidadesSobran),
    unidadesFaltan: redondear2(unidadesFaltan),
    valorSobrante: sobrante,
    valorFaltante: faltante,
    impactoNeto: redondear2(sobrante - faltante),
  };
}

export interface Bloqueo {
  campo: "motivo" | "lineas" | "fecha" | "diferencias";
  mensaje: string;
}

/**
 * Por qué NO se puede confirmar todavía.
 *
 * Devuelve motivos, no un booleano: un botón deshabilitado sin explicación es
 * de las cosas que más se odian de un ERP.
 */
export function bloqueos(estado: EstadoConteo): Bloqueo[] {
  const lista: Bloqueo[] = [];
  const impacto = impactoDe(estado);

  // El motivo es obligatorio y no por formalismo: un ajuste sin explicación es
  // un descuadre que nadie va a poder auditar en tres meses.
  if (estado.motivo.trim().length < 4) {
    lista.push({ campo: "motivo", mensaje: "Explica el motivo del ajuste." });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(estado.fecha)) {
    lista.push({ campo: "fecha", mensaje: "La fecha del ajuste no es válida." });
  }
  if (estado.lineas.length === 0) {
    lista.push({ campo: "lineas", mensaje: "No hay nada que contar: carga productos." });
  } else if (impacto.conDiferencia === 0) {
    lista.push({
      campo: "diferencias",
      mensaje:
        impacto.contadas === 0
          ? "Todavía no has contado nada."
          : "Todo lo contado coincide con el sistema: no hay nada que ajustar.",
    });
  }

  return lista;
}

/**
 * El payload que espera `registrar_ajuste_inventario()`.
 *
 * Solo van las líneas CONTADAS. Mandar las que nadie tocó sería declarar que
 * su saldo físico es el del sistema, que es una afirmación que nadie ha hecho.
 * Las que cuadran sí van: la base solo genera movimiento cuando la diferencia
 * no es cero, y dejarlas deja constancia de qué se contó.
 */
export function aPayload(estado: EstadoConteo) {
  return {
    tipo: estado.tipo,
    motivo: estado.motivo.trim(),
    fecha: estado.fecha,
    items: estado.lineas
      .filter((l) => l.cantidadFisica !== null)
      .map((l) => ({
        producto_id: l.productoId,
        cantidad_fisica: l.cantidadFisica as number,
        // `costo_unitario` NO se manda: la base lo toma del maestro. Aceptarlo
        // de quien llama sería dejar que el navegador decidiera a qué precio
        // se valora el descuadre.
      })),
  };
}
