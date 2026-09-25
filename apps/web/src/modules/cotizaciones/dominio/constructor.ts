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
  /** Referencia de a cuánto se ve el mercado (025). Para el modal de precios. */
  precio_mercado?: number;
  /**
   * Lo que alguien anotó en la ficha, frente a `costo_promedio`, que lo lleva
   * el kardex con cada recepción. Es lo ÚNICO que hay mientras el producto no
   * haya entrado nunca al almacén — el caso de casi todo el catálogo.
   */
  ultimo_costo?: number;
}

import { entregaDelDocumento, type Disponibilidad } from "./disponibilidad";

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
  /**
   * ¿El costo sale de una recepción real o de lo anotado en la ficha?
   *
   * No cambia ningún cálculo; cambia lo que la pantalla puede afirmar. «Lo
   * que costó la última vez que entró» y «lo que alguien escribió» no pesan
   * igual cuando se está decidiendo un precio.
   */
  costoDelKardex: boolean;
  /** Piso del maestro. 0 = el producto no tiene P.M. cargado. */
  precioMinimo: number;
  /**
   * A cuánto se ve el mercado (025). 0 = no cargado.
   *
   * No entra en ningún cálculo: es una referencia para negociar, y por eso
   * vive en el modal de precios y no en la fila. Puede estar por encima o por
   * debajo del precio de lista y seguir siendo verdad.
   */
  precioMercado: number;
  /** P.V. del maestro, para poder volver a él tras negociar. */
  precioLista: number;
  stock: number;
  /**
   * Cuándo puede entregarse ESTA línea (040).
   *
   * Nace `inmediata` siempre, incluso sin stock, y es lo que pidió Willy:
   * *«podemos ponerle por defecto stock inmediato, que son los que más
   * venden ustedes, y los que no, se les puede cambiar»* (7:56). Él
   * consigue en el día casi todo lo que no tiene, así que suponer
   * «exterior» porque el almacén está en cero sería equivocarse casi
   * siempre. Cuando no cuadra, la pantalla lo dice sin bloquear.
   */
  disponibilidad: Disponibilidad;
  /** Plazo propio de la línea. Null = el habitual de su tipo. */
  diasEntrega: number | null;
}

export interface EstadoConstructor {
  clienteId: string | null;
  validezDias: number;
  /**
   * La promesa general del documento.
   *
   * Se recalcula sola desde las líneas mientras nadie la toque. Nació antes
   * que la disponibilidad por línea (040) y se quedaba en «Stock inmediato»
   * aunque hubiera ítems de importación: el mismo papel decía dos cosas y las
   * dos salían impresas.
   */
  tiempoEntrega: string;
  /** Alguien la eligió a mano: el sistema deja de proponer. */
  entregaAMano: boolean;
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
  /**
   * Igual que el descuento, y por el mismo motivo que dio él (8:38):
   * *«esa columna se puede incluir o no según el caso, porque rara vez es
   * importación; por lo general todo es de entrada inmediata»*. Una columna
   * que dice «Inmediata» seis veces es ruido en un documento que el cliente
   * compara contra el de la competencia.
   */
  mostrarDisponibilidad: boolean;
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
  | "mostrarDescuento"
  | "mostrarDisponibilidad";

export type Accion =
  | { tipo: "cabecera"; campo: CampoCabecera; valor: string | number | boolean | null }
  | { tipo: "agregar"; producto: ProductoParaCotizar; cantidad?: number }
  | { tipo: "quitar"; key: string }
  | { tipo: "cantidad"; key: string; valor: number }
  | { tipo: "precio"; key: string; valor: number }
  | { tipo: "descuento"; key: string; valor: number }
  /**
   * La marca de ESTA línea, que no tiene por qué ser la del maestro.
   *
   * Willy, 16/09, con un retén: *«aparece sin marca, no me da opción a editar
   * para grabarlo con una marca determinada… en el mercado de retenes los
   * códigos se guardan con las medidas, como 45x60x8TC, pero puede ser
   * diversas marcas: LYO, NQK, PHK, NAK… solo SKF tiene una codificación
   * particular»*.
   *
   * Eso cambia dónde va el arreglo. El código NO identifica una marca: un
   * 45X60X8TC es cualquiera de ellas, y cuál se entrega se decide al cotizar,
   * según lo que se vaya a conseguir. Grabarla en el maestro sería mentir
   * sobre las otras cuatro, y el maestro tiene UNA fila para las cinco.
   *
   * Por eso se edita en la línea: `cotizacion_items.marca` es una copia propia
   * desde la 002 —«snapshot: lo que se imprimió en el PDF no puede cambiar
   * porque después se editó el maestro»— y viaja en el payload desde siempre.
   * Lo único que faltaba era poder escribirla.
   */
  | { tipo: "marca"; key: string; valor: string | null }
  /**
   * El código y la descripción de ESTA línea.
   *
   * Por el mismo motivo que la marca: las tres columnas de `cotizacion_items`
   * son una copia de lo que se imprimió, no un espejo del maestro. Y hacen
   * falta las tres —Luis, 16/09: *«en la opción de editar artículo deben
   * aparecer todos los campos editables: código, marca, descripción… lo quiere
   * así»*—.
   *
   * Cambiarlas NO toca el catálogo: un retén que se cotiza como NQK sigue
   * siendo la misma fila del maestro, y el cliente siguiente puede pedir el
   * mismo código de otra marca.
   */
  | { tipo: "codigo"; key: string; valor: string }
  | { tipo: "descripcion"; key: string; valor: string }
  /**
   * La ficha del catálogo cambió: la línea se pone al día de una vez.
   *
   * Desde el 17/09 «Editar artículo» también escribe el COSTO y el PRECIO
   * MÍNIMO (Luis: *«en editar no puedo poner el precio de costo, precio
   * mínimo y el precio de lista pues»*), y eso mueve dos cosas que la línea
   * lleva copiadas del maestro y usa para decidir: el margen y el aviso del
   * piso.
   *
   * Va en UNA acción y no en cinco despachos sueltos porque es un solo hecho
   * —«se guardó la ficha»— y porque cinco reducciones seguidas dejan cuatro
   * estados intermedios donde el margen y el piso no se corresponden.
   */
  | {
      tipo: "fichaActualizada";
      key: string;
      datos: {
        codigo: string;
        marca: string | null;
        descripcion: string;
        costoUnitario: number;
        precioMinimo: number;
        precioLista: number;
      };
    }
  | { tipo: "bajarAlPiso"; key: string }
  | { tipo: "volverALista"; key: string }
  | { tipo: "disponibilidad"; key: string; valor: Disponibilidad }
  | { tipo: "diasEntrega"; key: string; valor: number | null }
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
    entregaAMano: false,
    ordenCompraCliente: "",
    contacto: "",
    contactoId: null,
    condiciones: "",
    observaciones: "",
    mostrarDescuento: false,
    mostrarDisponibilidad: false,
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
/**
 * El plazo escrito a mano en una línea.
 *
 * Null es un valor legítimo y significa «usa el habitual de su tipo», así que
 * vaciar la caja no puede convertirse en un 0: el check de la base rechaza el
 * 0 y el PDF imprimiría «0 días · exterior».
 */
const diasValidos = (n: number | null): number | null =>
  n === null || !Number.isFinite(n) || n <= 0 ? null : Math.min(365, Math.round(n));

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
    /*
      El del KARDEX manda; el de la ficha es el respaldo.

      Un producto que nunca entró al almacén tiene el costo promedio en cero
      aunque su ficha diga a cuánto se compró. Quedarse con ese cero deja sin
      margen a casi todo el catálogo —790 productos entraron del Excel sin una
      sola recepción—, y un margen que no se puede calcular no ayuda a
      negociar, que es justo para lo que se mira.

      Cuál de los dos se está usando lo dice el modal de precios, con todas
      las letras.
    */
    costoUnitario: producto.costo_promedio || producto.ultimo_costo || 0,
    costoDelKardex: (producto.costo_promedio ?? 0) > 0,
    precioMinimo: producto.precio_minimo ?? 0,
    precioMercado: producto.precio_mercado ?? 0,
    precioLista: producto.precio_venta,
    stock: producto.stock ?? 0,
    disponibilidad: "inmediata",
    diasEntrega: null,
  };
}

/**
 * El reducer, y encima de él la sincronización del tiempo de entrega.
 *
 * Va en UN solo sitio a propósito. Estaba hecho con un `useEffect` en la
 * pantalla que despachaba al ver un desajuste, y eso colgó el navegador: el
 * efecto se dispara con el estado que acaba de cambiar y vuelve a cambiarlo.
 * En un reducer no hay ciclo posible — se calcula una vez, con el estado ya
 * resuelto, y se devuelve.
 *
 * Y así ningún caso nuevo se puede olvidar de recalcularlo.
 */
export function reducir(estado: EstadoConstructor, accion: Accion): EstadoConstructor {
  const siguiente = reducirCrudo(estado, accion);

  // Elegirla a mano apaga la propuesta. A partir de ahí manda la persona.
  if (accion.tipo === "cabecera" && accion.campo === "tiempoEntrega") {
    return { ...siguiente, entregaAMano: true };
  }

  // Un borrador que se recupera ya trae una decisión tomada: recalcularla
  // sería pisar lo que alguien escribió hace tres días.
  if (accion.tipo === "cargar") return { ...siguiente, entregaAMano: true };

  if (siguiente.entregaAMano) return siguiente;

  const propuesta = entregaDelDocumento(siguiente.lineas);
  return siguiente.tiempoEntrega === propuesta
    ? siguiente
    : { ...siguiente, tiempoEntrega: propuesta };
}

function reducirCrudo(estado: EstadoConstructor, accion: Accion): EstadoConstructor {
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

    case "marca":
      return mapear(estado, accion.key, (l) => ({
        ...l,
        // Vacío es «sin marca», no una cadena vacía: es lo que el papel
        // imprime como un guion y lo que la base guarda como nulo.
        marca: accion.valor?.trim() ? accion.valor.trim() : null,
      }));

    case "codigo":
      return mapear(estado, accion.key, (l) => ({
        ...l,
        // Si se borra entero se conserva el que tenía: el código es lo que el
        // cliente busca en su orden de compra, y una línea sin código en el
        // papel no la puede reclamar nadie. La base además lo exige.
        codigo: accion.valor.trim() ? accion.valor.trim() : l.codigo,
      }));

    case "descripcion":
      return mapear(estado, accion.key, (l) => ({
        ...l,
        // Igual: es lo que el cliente LEE para saber qué está comprando.
        descripcion: accion.valor.trim() ? accion.valor.trim() : l.descripcion,
      }));

    case "fichaActualizada":
      return mapear(estado, accion.key, (l) => ({
        ...l,
        codigo: accion.datos.codigo,
        marca: accion.datos.marca,
        descripcion: accion.datos.descripcion,
        costoUnitario: accion.datos.costoUnitario,
        // Acaba de escribirse a mano en la ficha, no salió de una recepción.
        // Decirlo mal haría que el modal afirmara que ese costo se pagó.
        costoDelKardex: false,
        precioMinimo: accion.datos.precioMinimo,
        precioLista: accion.datos.precioLista,
        /*
          El valor que se está cobrando NO se toca.

          Es lo único de la línea que no vino del maestro: lo puso quien está
          negociando. Pisarlo porque cambió el precio de lista borraría el
          descuento que se acaba de pactar — y el motivo de tocar la ficha
          suele ser justo el contrario, cargar el costo para ver si ese
          precio da margen.
        */
      }));

    case "disponibilidad":
      return mapear(estado, accion.key, (l) => ({
        ...l,
        disponibilidad: accion.valor,
        // Cambiar a inmediata borra el plazo. Sin esto, un ítem que estaba
        // en «exterior 30 días» y pasa a inmediato conservaría el 30 y la
        // base lo rechazaría (check `cotiz_item_dias_ok`) al guardar — o
        // peor, imprimiría «Inmediata» con 30 días guardados detrás.
        diasEntrega: accion.valor === "inmediata" ? null : l.diasEntrega,
      }));

    case "diasEntrega":
      return mapear(estado, accion.key, (l) =>
        // En inmediata no se acepta plazo, venga de donde venga.
        l.disponibilidad === "inmediata"
          ? l
          : { ...l, diasEntrega: diasValidos(accion.valor) },
      );

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
  /** `costo` desde el 25/09: vender bajo costo no es lo mismo que bajar del
   *  piso, y puede pasar con el piso respetado (ver `avisosDeCosto`). */
  campo: "cliente" | "lineas" | "piso" | "costo";
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

  /*
    El precio mínimo NO está aquí, y es deliberado desde el 17/09.

    Estuvo: una línea bajo el mínimo entraba en esta lista y apagaba el botón
    de guardar. Y eso contradice lo único que Willy dijo del precio en la
    reunión del 16/09 (4:29): *«a un cliente puede que le dé con 20, a otro
    puede que le dé con el doble o con 50 % de margen. Eso yo lo manejo»*.

    No se notaba porque de los 790 productos casi ninguno tiene mínimo
    cargado, así que el piso era 0 y no saltaba nunca. Habría empezado a
    frenarle cotizaciones justo la semana que cargara sus precios reales.

    Se convierte en AVISO —`avisosDeVenta`, aquí debajo— y no se pierde nada:
    la fila sigue en rojo, se sigue diciendo cuánto falta y el botón «Dejar en
    el mínimo» sigue estando. Lo que desaparece es la puerta cerrada.

    Y el registro tampoco se pierde: `cotizacion_items.precio_minimo_ref`
    guarda, línea a línea, cuál era el mínimo cuando se cotizó. Saber quién
    bajó del piso y cuánto es una consulta, no una función nueva.

    Decisión de Luis, 17/09, con las tres opciones delante.
  */
  return lista;
}

/**
 * Lo que conviene mirar antes de guardar, pero no impide guardar.
 *
 * Distinto de `bloqueos()` a propósito: aquello es «no se puede», esto es «¿lo
 * sabes?». Mezclarlos fue el error que se corrigió el 17/09 — un aviso con
 * forma de puerta cerrada obliga a falsear el dato para poder seguir.
 *
 * Va aparte de la fila porque una cotización de veinte líneas no se revisa
 * entera antes de guardar: si la catorce va bajo el mínimo, el rojo de esa
 * fila está fuera de la pantalla.
 */
export function avisosDeVenta(estado: EstadoConstructor): Bloqueo[] {
  const bajas = lineasBajoPiso(
    estado.lineas.map((l) => ({
      cantidad: l.cantidad,
      valorUnitario: l.valorUnitario,
      descuentoPct: l.descuentoPct,
      precioMinimo: l.precioMinimo,
    })),
  );
  if (bajas.length === 0) return [];

  const codigos = bajas
    .map((b) => estado.lineas[b.indice]?.codigo)
    .filter(Boolean)
    .join(", ");

  return [
    {
      campo: "piso",
      mensaje:
        bajas.length === 1
          ? `${codigos} va por debajo de su precio mínimo de venta.`
          : `${bajas.length} líneas van por debajo de su precio mínimo de venta: ${codigos}.`,
    },
  ];
}

/**
 * Líneas que se están vendiendo POR DEBAJO DEL COSTO.
 *
 * El piso no basta, y se comprobó con números el 25/09. El UCF208D1 tenía el
 * mínimo en 29.53, calculado cuando costaba 28.12. Entró una importación y el
 * costo real subió a 30.00 — pero **el mínimo se quedó donde estaba**. La
 * pantalla decía que 29.53 era correcto, el botón «dejar en el mínimo» llevaba
 * ahí de un clic, y esa venta pierde 0.47 por unidad.
 *
 * Es estructural, no un caso raro: `precio_minimo` es un número que alguien
 * escribió un día, y el costo se mueve solo con cada compra, con el tipo de
 * cambio y con los gastos de importación. En cuanto el costo pasa al piso, el
 * piso deja de proteger sin avisar a nadie.
 *
 * Willy, del maestro (21/08): *«es el precio mínimo que se puede vender […]
 * porque si no no es rentable»*. Esto es lo que hace que esa frase siga siendo
 * verdad cuando el costo cambia.
 *
 * Se mira el precio NETO, ya con el descuento, por lo mismo que el piso:
 * descontar un 30 % sobre un precio que cubre el costo es la forma exacta de
 * vender perdiendo sin darse cuenta.
 *
 * Los productos sin costo cargado no se juzgan: 790 entraron del Excel sin él,
 * y un cero no significa «es gratis», significa «no se sabe».
 */
export function lineasBajoCosto(estado: EstadoConstructor): LineaConstructor[] {
  return estado.lineas.filter((l) => {
    if (l.costoUnitario <= 0) return false;
    const neto = redondear4(l.valorUnitario * (1 - l.descuentoPct / 100));
    return neto < l.costoUnitario;
  });
}

/** El aviso de vender bajo costo, con el mismo formato que los demás. */
export function avisosDeCosto(estado: EstadoConstructor): Bloqueo[] {
  const bajas = lineasBajoCosto(estado);
  if (bajas.length === 0) return [];

  const codigos = bajas.map((l) => l.codigo).join(", ");
  return [
    {
      campo: "costo",
      mensaje:
        bajas.length === 1
          ? `${codigos} se está vendiendo POR DEBAJO DE SU COSTO. Esa línea pierde dinero.`
          : `${bajas.length} líneas se están vendiendo por debajo de su costo: ${codigos}. Esas líneas pierden dinero.`,
    },
  ];
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
    mostrar_disponibilidad: estado.mostrarDisponibilidad,
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
      disponibilidad: l.disponibilidad,
      // Se manda solo el escrito a mano. El habitual del tipo NO se copia:
      // si mañana el exterior pasa a 20 días, las cotizaciones que no
      // pusieron plazo propio tienen que decir 20, no quedarse en 15.
      dias_entrega: l.diasEntrega,
      // OJO: `precio_minimo_ref` NO va aquí. Lo impone el trigger
      // `trg_cotiz_items_piso` desde el maestro. Mandarlo sería ofrecerle a
      // quien llame la posibilidad de desactivar el piso.
    })),
  };
}
