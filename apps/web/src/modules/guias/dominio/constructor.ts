import { redondear2 } from "@rodatech/config";

import type { CotizacionDespachable, ModalidadTraslado } from "./tipos";

/**
 * El estado de la guía en preparación, como reducer PURO.
 *
 * Mismo patrón que cotizaciones, recepciones y compras: entra un estado y una
 * acción, sale un estado. Sin React, sin fetch, sin reloj — las claves de fila
 * salen de la línea de cotización, que ya es única.
 *
 * La guía es lo que saca el stock del almacén, así que las reglas de aquí no
 * son de formulario: despachar de más deja el kardex diciendo que salió algo
 * que nunca se vendió.
 */

/** Peso a tres decimales, que es la precisión de `guias_remision.peso_bruto_kg`. */
const redondear3 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 1000) / 1000;

export interface LineaDespacho {
  /** Clave estable: el id de la línea de cotización, que ya es única. */
  key: string;
  cotizacionItemId: string;
  productoId: string;
  codigo: string;
  descripcion: string;
  unidad: string;
  /** Lo que pide la cotización. */
  pedido: number;
  /** Lo que ya salió en guías anteriores. */
  despachado: number;
  /** Lo que va en ESTA guía. */
  cantidad: number;
  /** Peso unitario del maestro. Cero si nadie lo registró. */
  pesoUnitario: number;
}

export interface EstadoGuiaEnCurso {
  cotizacionId: string | null;
  clienteId: string | null;
  /** ISO `aaaa-mm-dd`. Lo fija la pantalla al montar; el dominio no lee reloj. */
  fechaEmision: string;
  fechaTraslado: string;
  motivoCodigo: string;
  direccionLlegada: string;
  ubigeoLlegada: string;
  modalidad: ModalidadTraslado;
  transportistaDocumento: string;
  transportistaRazonSocial: string;
  transportistaPlaca: string;
  conductorDocumento: string;
  conductorNombre: string;
  conductorLicencia: string;
  numeroBultos: number;
  /**
   * Peso bruto declarado a mano, en kilos. `null` significa «calcúlalo del
   * maestro».
   *
   * Existe porque hoy NINGÚN producto tiene peso registrado y el cálculo
   * automático daría cero — y la base rechaza una guía con peso cero
   * (`guia_peso_pos`). Willy llamó al peso *«lo más importante»* (02:46), así
   * que la salida no es quitar la validación: es dejar declararlo mientras el
   * maestro se completa.
   */
  pesoDeclarado: number | null;
  entregadoPor: string;
  observaciones: string;
  lineas: LineaDespacho[];
}

export type CampoTexto =
  | "fechaEmision"
  | "fechaTraslado"
  | "motivoCodigo"
  | "direccionLlegada"
  | "ubigeoLlegada"
  | "transportistaDocumento"
  | "transportistaRazonSocial"
  | "transportistaPlaca"
  | "conductorDocumento"
  | "conductorNombre"
  | "conductorLicencia"
  | "entregadoPor"
  | "observaciones";

export type Accion =
  | { tipo: "campo"; campo: CampoTexto; valor: string }
  | { tipo: "modalidad"; valor: ModalidadTraslado }
  | { tipo: "bultos"; valor: number }
  | { tipo: "peso"; valor: number | null }
  | { tipo: "cantidad"; key: string; valor: number }
  | { tipo: "quitar"; key: string }
  | { tipo: "cargarCotizacion"; cotizacion: CotizacionDespachable }
  | { tipo: "cargar"; estado: EstadoGuiaEnCurso };

export function estadoInicial(hoy: string): EstadoGuiaEnCurso {
  return {
    cotizacionId: null,
    clienteId: null,
    fechaEmision: hoy,
    fechaTraslado: hoy,
    // 01 = Venta. Es lo que hace Willy el 99 % de las veces.
    motivoCodigo: "01",
    direccionLlegada: "",
    ubigeoLlegada: "",
    // 02 = transporte privado: reparte él con su propio vehículo.
    modalidad: "02",
    transportistaDocumento: "",
    transportistaRazonSocial: "",
    transportistaPlaca: "",
    conductorDocumento: "",
    conductorNombre: "",
    conductorLicencia: "",
    numeroBultos: 1,
    pesoDeclarado: null,
    entregadoPor: "",
    observaciones: "",
    lineas: [],
  };
}

const cantidadValida = (n: number, tope: number) => {
  if (!Number.isFinite(n) || n <= 0) return 0;
  // Nunca por encima de lo que queda por despachar: pasarse deja el kardex
  // diciendo que salió algo que no se vendió, y eso no lo arregla ningún
  // documento posterior.
  return redondear2(Math.min(n, tope));
};

export function reducir(
  estado: EstadoGuiaEnCurso,
  accion: Accion,
): EstadoGuiaEnCurso {
  switch (accion.tipo) {
    case "cargar":
      return accion.estado;

    case "campo":
      return { ...estado, [accion.campo]: accion.valor };

    case "modalidad": {
      // Al cambiar de modalidad se sueltan los datos de la otra. Guardar la
      // placa de su camioneta en una guía de transporte público ensucia el
      // documento y confunde a quien lo lea después.
      if (accion.valor === "01") {
        return { ...estado, modalidad: "01", transportistaPlaca: "" };
      }
      return {
        ...estado,
        modalidad: "02",
        transportistaDocumento: "",
        transportistaRazonSocial: "",
      };
    }

    case "bultos":
      return {
        ...estado,
        numeroBultos:
          Number.isFinite(accion.valor) && accion.valor > 0
            ? Math.floor(accion.valor)
            : 1,
      };

    case "peso":
      return {
        ...estado,
        pesoDeclarado:
          accion.valor === null || !Number.isFinite(accion.valor) || accion.valor <= 0
            ? null
            : redondear3(accion.valor),
      };

    case "cantidad": {
      const linea = estado.lineas.find((l) => l.key === accion.key);
      if (!linea) return estado;
      const tope = redondear2(linea.pedido - linea.despachado);
      return {
        ...estado,
        lineas: estado.lineas.map((l) =>
          l.key === accion.key
            ? { ...l, cantidad: cantidadValida(accion.valor, tope) }
            : l,
        ),
      };
    }

    case "quitar":
      return { ...estado, lineas: estado.lineas.filter((l) => l.key !== accion.key) };

    case "cargarCotizacion": {
      const c = accion.cotizacion;
      // Se precarga solo lo que FALTA por salir. Despachar en dos veces es lo
      // normal, y volver a proponer lo ya entregado es la forma más fácil de
      // sacar el mismo material dos veces del almacén.
      const pendientes = c.lineas
        .map((l) => ({ ...l, falta: redondear2(l.cantidad - l.despachado) }))
        .filter((l) => l.falta > 0);

      return {
        ...estado,
        cotizacionId: c.id,
        clienteId: c.cliente_id,
        // La dirección del cliente es el destino por defecto, pero se puede
        // cambiar: se entrega en obra más veces de las que se entrega en la
        // oficina fiscal.
        direccionLlegada: c.cliente_direccion ?? "",
        ubigeoLlegada: c.cliente_ubigeo ?? "",
        lineas: pendientes.map((l) => ({
          key: l.cotizacion_item_id,
          cotizacionItemId: l.cotizacion_item_id,
          productoId: l.producto_id,
          codigo: l.codigo,
          descripcion: l.descripcion,
          unidad: l.unidad,
          pedido: l.cantidad,
          despachado: l.despachado,
          cantidad: l.falta,
          pesoUnitario: l.peso_kg,
        })),
      };
    }

    default:
      return estado;
  }
}

// ---------------------------------------------------------------------------
// Selectores
// ---------------------------------------------------------------------------

/** Peso calculado del maestro. Cero si ningún producto lo tiene registrado. */
export function pesoCalculado(estado: EstadoGuiaEnCurso): number {
  return redondear3(
    estado.lineas.reduce((a, l) => a + l.pesoUnitario * l.cantidad, 0),
  );
}

/** El peso que va a viajar: el declarado si lo hay, si no el del maestro. */
export function pesoEfectivo(estado: EstadoGuiaEnCurso): number {
  return estado.pesoDeclarado ?? pesoCalculado(estado);
}

/** ¿Hay que pedir el peso a mano porque el maestro no lo sabe? */
export function faltaPeso(estado: EstadoGuiaEnCurso): boolean {
  return estado.lineas.length > 0 && pesoEfectivo(estado) <= 0;
}

export interface Bloqueo {
  campo:
    | "cotizacion"
    | "lineas"
    | "destino"
    | "peso"
    | "fecha"
    | "transporte";
  mensaje: string;
}

/**
 * Por qué NO se puede guardar el borrador todavía.
 *
 * Es la lista corta: un borrador puede estar a medias a propósito. Lo que
 * exige la base para GUARDAR es cotización aprobada, ítems, destino y peso
 * mayor que cero.
 */
export function bloqueosBorrador(estado: EstadoGuiaEnCurso): Bloqueo[] {
  const lista: Bloqueo[] = [];

  if (!estado.cotizacionId) {
    lista.push({
      campo: "cotizacion",
      mensaje: "Elige la cotización aprobada que se va a despachar.",
    });
  }

  const conCantidad = estado.lineas.filter((l) => l.cantidad > 0);
  if (conCantidad.length === 0) {
    lista.push({
      campo: "lineas",
      mensaje: "No hay ninguna línea con cantidad a despachar.",
    });
  }

  if (!estado.direccionLlegada.trim()) {
    lista.push({ campo: "destino", mensaje: "Falta la dirección de entrega." });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(estado.fechaTraslado)) {
    lista.push({ campo: "fecha", mensaje: "La fecha de traslado no es válida." });
  }

  // `guia_peso_pos` rechaza una guía con peso cero, y con razón: es el dato
  // que el transportista necesita. Hoy ningún producto tiene peso, así que
  // esto salta siempre hasta que se declare a mano.
  if (conCantidad.length > 0 && pesoEfectivo(estado) <= 0) {
    lista.push({
      campo: "peso",
      mensaje:
        "Falta el peso bruto. Ninguno de estos productos lo tiene registrado, así que hay que declararlo aquí.",
    });
  }

  return lista;
}

/**
 * Lo que además hace falta para EMITIR.
 *
 * La base solo exige los datos del transporte cuando la guía deja de ser
 * borrador (`guia_transporte_ok`). Esa es justo la separación que pidió Willy:
 * preparar la guía cuando se cierra la venta, completarla cuando el camión ya
 * tiene placa y conductor.
 */
export function bloqueosEmision(estado: EstadoGuiaEnCurso): Bloqueo[] {
  const lista = bloqueosBorrador(estado);

  if (estado.modalidad === "01") {
    if (!estado.transportistaDocumento.trim()) {
      lista.push({
        campo: "transporte",
        mensaje: "En transporte público hace falta el RUC del transportista.",
      });
    }
  } else if (!estado.transportistaPlaca.trim()) {
    lista.push({
      campo: "transporte",
      mensaje: "En transporte privado hace falta la placa del vehículo.",
    });
  }

  return lista;
}

export interface Aviso {
  key: string;
  mensaje: string;
}

/** Lo que conviene mirar dos veces, pero NO impide guardar. */
export function avisos(estado: EstadoGuiaEnCurso): Aviso[] {
  const lista: Aviso[] = [];

  for (const l of estado.lineas) {
    const falta = redondear2(l.pedido - l.despachado);
    if (l.cantidad > 0 && l.cantidad < falta) {
      lista.push({
        key: l.key,
        mensaje: `${l.codigo}: salen ${l.cantidad} de ${falta}. Quedan ${redondear2(falta - l.cantidad)} por despachar en otra guía.`,
      });
    }
  }

  if (estado.pesoDeclarado !== null && pesoCalculado(estado) > 0) {
    lista.push({
      key: "peso",
      mensaje: `El peso se declaró a mano (${estado.pesoDeclarado} kg) y el maestro calculaba ${pesoCalculado(estado)} kg.`,
    });
  }

  if (!estado.ubigeoLlegada.trim()) {
    // No bloquea porque la base lo acepta nulo, pero SUNAT lo va a pedir
    // cuando se envíe la GRE.
    lista.push({
      key: "ubigeo",
      mensaje: "Sin ubigeo de llegada. SUNAT lo exige al enviar la guía electrónica.",
    });
  }

  return lista;
}

/** El payload que espera `generar_guia_desde_cotizacion()`. */
export function aPayload(estado: EstadoGuiaEnCurso) {
  const esPublico = estado.modalidad === "01";
  return {
    cotizacion_id: estado.cotizacionId,
    fecha_emision: estado.fechaEmision,
    fecha_traslado: estado.fechaTraslado,
    motivo_codigo: estado.motivoCodigo,
    direccion_llegada: estado.direccionLlegada.trim() || null,
    ubigeo_llegada: estado.ubigeoLlegada.trim() || null,
    // Se manda SIEMPRE el peso efectivo. Dejar que la función lo calcule
    // significaría cero mientras el maestro no tenga pesos, y el insert
    // fallaría contra `guia_peso_pos` con un mensaje que no ayuda.
    peso_bruto_kg: pesoEfectivo(estado),
    numero_bultos: estado.numeroBultos,
    modalidad_traslado: estado.modalidad,
    transportista_documento: esPublico
      ? estado.transportistaDocumento.trim() || null
      : null,
    transportista_razon_social: esPublico
      ? estado.transportistaRazonSocial.trim() || null
      : null,
    transportista_placa: esPublico ? null : estado.transportistaPlaca.trim() || null,
    conductor_documento: estado.conductorDocumento.trim() || null,
    conductor_nombre: estado.conductorNombre.trim() || null,
    conductor_licencia: estado.conductorLicencia.trim() || null,
    entregado_por: estado.entregadoPor.trim() || null,
    observaciones: estado.observaciones.trim() || null,
    // Nace en borrador SIEMPRE. Emitir es un segundo paso, y es el que mueve
    // el stock.
    estado: "borrador",
    items: estado.lineas
      .filter((l) => l.cantidad > 0)
      .map((l) => ({
        producto_id: l.productoId,
        cotizacion_item_id: l.cotizacionItemId,
        codigo: l.codigo,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        unidad_codigo: l.unidad,
        peso_kg: redondear3(l.pesoUnitario * l.cantidad),
      })),
  };
}
