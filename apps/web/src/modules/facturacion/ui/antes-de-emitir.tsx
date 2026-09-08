"use client";

/**
 * El paso que faltaba entre teclear la factura y gastar el correlativo.
 *
 * ---------------------------------------------------------------------------
 * Qué se decidía a ciegas
 * ---------------------------------------------------------------------------
 * Hasta el 08/09, «Emitir F001» hacía tres cosas de golpe y sin enseñar
 * ninguna: escribía el documento, decidía por su cuenta que las cuentas
 * bancarias iban impresas, y lo dejaba sin mandar a SUNAT. Lo único que se veía
 * antes de pulsar era una columna de totales.
 *
 * Y un comprobante no es un borrador: el correlativo se gasta aunque el
 * documento salga mal, y corregirlo después es una nota de crédito. Es la
 * pantalla del ERP donde más caro sale equivocarse y era la que menos
 * enseñaba.
 *
 * Luis, 08/09: *«lo que falta antes de facturar… un botón o algo por si quiere
 * mandar a SUNAT, como lo que va a imprimir, si quieres que salga las cuentas o
 * no, aparte de la vista previa, como se va a enviar o imprimir»*.
 *
 * ---------------------------------------------------------------------------
 * Las dos casillas
 * ---------------------------------------------------------------------------
 * · **Las cuentas.** Willy, 07/09 (13:21): *«al momento de elaborar la factura
 *   tiene un botón que se puede activar o no, según tú desees, para que figure
 *   en la factura los números de cuenta»* — *«a veces ocupa mucho espacio, a
 *   veces no es necesario»*. La columna existe desde la 029 y el documento la
 *   imprime desde entonces; el botón no se construyó nunca y salían siempre.
 *
 * · **El envío.** Sigue siendo un paso aparte en la base —el comprobante nace
 *   `pendiente` y se puede emitir sin certificado, que es lo que hace falta
 *   hoy—, pero encadenarlo desde aquí ahorra tener que ir a buscar el
 *   documento a otra pantalla para mandarlo.
 *
 * La vista previa es el MISMO componente que imprime (`DocumentoComprobante`),
 * no una maqueta parecida. Una previa que se pinta aparte se desincroniza del
 * papel de verdad, y entonces deja de servir justo para lo que se hizo.
 */

import * as React from "react";
import { Button, Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@rodatech/ui";

import type { CuentaParaPagar } from "@/componentes/cuentas-para-pagar";
import type { EmisorHoja } from "@/componentes/hoja-documento";

import type {
  ComprobanteDetalle,
  CotizacionFacturable,
  LineaComprobante,
  TipoComprobante,
} from "../dominio/tipos";
import { DocumentoComprobante } from "./documento";

export interface OpcionesEmision {
  mostrarCuenta: boolean;
  enviarSunat: boolean;
}

export function AntesDeEmitir({
  cot,
  lineas,
  tipo,
  serie,
  fecha,
  condicion,
  dias,
  vencimiento,
  cuotas,
  totales,
  observaciones,
  emisor,
  cuentas,
  puedeEnviar,
  opciones,
  onCambiar,
}: {
  cot: CotizacionFacturable;
  /** Lo que se va a emitir de verdad, ya recortado a lo pendiente. */
  lineas: CotizacionFacturable["lineas"];
  tipo: TipoComprobante;
  serie: string;
  fecha: string;
  condicion: string;
  dias: number;
  vencimiento: string | null;
  cuotas: { numero: number; monto: number; vencimiento: string }[];
  totales: { gravada: number; descuento: number; igv: number; total: number };
  observaciones: string;
  emisor: EmisorHoja;
  cuentas: readonly CuentaParaPagar[];
  /**
   * Hay certificado y credenciales SOL.
   *
   * Sin esto la casilla de mandar a SUNAT no se puede marcar, y en vez de
   * deshabilitarla en silencio se dice por qué: con los datos de hoy es el
   * caso normal, y una casilla apagada sin explicación se lee como un fallo.
   */
  puedeEnviar: boolean;
  opciones: OpcionesEmision;
  onCambiar: (o: OpcionesEmision) => void;
}) {
  const [viendo, setViendo] = React.useState(false);

  /*
    El borrador que se pinta.

    Es un `ComprobanteDetalle` armado a mano con lo que hay en pantalla, no
    una lectura de la base: el documento todavía no existe. Lo que sí es real
    es todo lo que lleva dentro —las mismas líneas, los mismos totales y el
    mismo componente—, así que lo que se ve es lo que va a salir.

    El número va con puntos suspensivos a propósito. El correlativo lo asigna
    Postgres al emitir, con bloqueo de fila; inventar aquí «F001-00000007»
    sería enseñar un dato que puede no ser el suyo si alguien emite entre
    medias, y en un documento fiscal eso no es un detalle.
  */
  const borrador: ComprobanteDetalle = {
    id: "",
    tipo,
    serie,
    correlativo: 0,
    numero: `${serie}-·······`,
    cliente_id: cot.cliente_id,
    cliente: cot.cliente,
    cliente_documento: cot.cliente_documento,
    cliente_tipo_documento: cot.cliente_tipo_documento,
    cliente_direccion: null,
    cliente_email: null,
    cotizacion_id: cot.id,
    cotizacion_numero: cot.numero,
    orden_compra_cliente: cot.orden_compra_cliente,
    referencia_id: null,
    referencia_numero: null,
    motivo_nota_codigo: null,
    fecha_emision: fecha,
    fecha_vencimiento: vencimiento,
    condicion_pago: condicion,
    dias_credito: dias,
    moneda: "USD",
    mostrar_cuenta: opciones.mostrarCuenta,
    guia_numero: null,
    cuotas: cuotas.map((q) => ({
      numero: q.numero,
      fecha_vencimiento: q.vencimiento,
      monto: q.monto,
      pagado: 0,
    })),
    op_gravada: totales.gravada,
    op_exonerada: 0,
    op_inafecta: 0,
    descuento_global: totales.descuento,
    igv: totales.igv,
    total: totales.total,
    // Lo pone `numero_a_letras` en Postgres al emitir. Traducirlo aquí sería
    // una segunda implementación de la misma regla, y las dos se separarían.
    total_letras: null,
    pagado: 0,
    saldo: totales.total,
    estado: "emitido",
    estado_sunat: "pendiente",
    sunat_codigo_respuesta: null,
    sunat_mensaje: null,
    sunat_enviado_en: null,
    sunat_hash_cdr: null,
    detraccion_aplica: false,
    detraccion_porcentaje: 0,
    detraccion_monto: 0,
    detraccion_codigo: null,
    retencion_aplica: false,
    retencion_monto: 0,
    vendedor: null,
    observaciones: observaciones.trim() || null,
    motivo_anulacion: null,
    creado_en: fecha,
    lineas: lineas.map((l, i): LineaComprobante => ({
      id: `previa-${i}`,
      producto_id: l.producto_id,
      codigo: l.codigo,
      marca: null,
      descripcion: l.descripcion,
      unidad: l.unidad,
      cantidad: l.cantidad,
      valor_unitario: l.valor_unitario,
      descuento_pct: l.descuento_pct,
      importe: l.importe,
    })),
  };

  return (
    <section className="card flex flex-col gap-3 p-4">
      <div>
        <h2 className="text-sm font-semibold">Antes de emitir</h2>
        <p className="text-sm text-[var(--fg-muted)]">
          Una vez emitido, el número se gasta y solo se corrige con una nota de
          crédito. Mira cómo va a quedar.
        </p>
      </div>

      <Casilla
        marcada={opciones.mostrarCuenta}
        onCambiar={(v) => onCambiar({ ...opciones, mostrarCuenta: v })}
        titulo="Imprimir los números de cuenta"
        detalle={
          cuentas.length === 0
            ? "No hay cuentas cargadas todavía: aunque lo marques, no saldría ninguna."
            : "Salen al pie del documento, para que el cliente sepa dónde pagar."
        }
      />

      <Casilla
        marcada={opciones.enviarSunat && puedeEnviar}
        deshabilitada={!puedeEnviar}
        onCambiar={(v) => onCambiar({ ...opciones, enviarSunat: v })}
        titulo="Mandarlo a SUNAT al emitir"
        detalle={
          puedeEnviar
            ? "Si no lo marcas, queda emitido y pendiente: se manda después desde su ficha."
            : "Falta el certificado y las credenciales SOL. Se emite igual y queda pendiente de envío."
        }
      />

      <Button type="button" variant="outline" onClick={() => setViendo(true)}>
        <IconoOjo />
        Ver cómo va a quedar
      </Button>

      <Dialog open={viendo} onOpenChange={setViendo}>
        {/* Ancho de hoja: la previa no sirve si el documento sale comprimido
            a la mitad, porque justo lo que se viene a comprobar es si algo
            —las cuentas, sin ir más lejos— ocupa demasiado. */}
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Así va a salir</DialogTitle>
          </DialogHeader>
          <DialogBody className="max-h-[70vh] overflow-y-auto bg-[var(--surface-2)] p-4">
            <DocumentoComprobante
              c={borrador}
              emisor={emisor}
              cuentas={opciones.mostrarCuenta ? cuentas : []}
            />
            <p className="mt-3 text-center text-sm text-[var(--fg-muted)]">
              El número y el importe en letras se asignan al emitir. Todo lo
              demás es lo que va a salir impreso.
            </p>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/**
 * Una casilla con su explicación debajo.
 *
 * Toda la fila es pulsable y mide 44 px de alto: un cuadrito de 16 px es un
 * blanco imposible para Willy, y el texto de al lado no era pulsable — así que
 * el único sitio donde funcionaba el clic era el peor de todos.
 */
function Casilla({
  marcada,
  deshabilitada,
  onCambiar,
  titulo,
  detalle,
}: {
  marcada: boolean;
  deshabilitada?: boolean;
  onCambiar: (v: boolean) => void;
  titulo: string;
  detalle: string;
}) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-[var(--border)] p-3 transition-colors ${
        deshabilitada
          ? "cursor-not-allowed opacity-60"
          : "hover:bg-[var(--surface-2)]"
      }`}
    >
      <input
        type="checkbox"
        checked={marcada}
        disabled={deshabilitada}
        onChange={(e) => onCambiar(e.target.checked)}
        // `accent-brand-600`, la clase de Tailwind. La marca es una escala de
        // Tailwind y no un token CSS: escribirla como variable la deja sin
        // declarar, y el guardián de tokens lo tumba —a mí me lo tumbó—.
        // Aquí no se puede ni citar la forma mala: ese test escanea el
        // archivo entero, comentarios incluidos.
        className="mt-0.5 size-5 shrink-0 accent-brand-600"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{titulo}</span>
        <span className="block text-sm text-[var(--fg-muted)]">{detalle}</span>
      </span>
    </label>
  );
}

function IconoOjo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] shrink-0"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
