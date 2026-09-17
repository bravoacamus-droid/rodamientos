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
  /**
   * La operación está sujeta a RETENCIÓN del IGV.
   *
   * Willy, 16/09 (45:03): *«si hay detracción… digo la retención. Para mi caso
   * es retención porque yo vendo productos»*.
   *
   * No se puede deducir: depende de que el CLIENTE sea agente de retención
   * designado por SUNAT, y eso no está en la ficha del cliente todavía. Por
   * eso es una casilla y no un automatismo.
   */
  retencion: boolean;
  /**
   * Las guías de remisión que ampara este comprobante.
   *
   * Willy, 16/09 (48:10): *«a veces hay que hacer una factura de dos guías;
   * no puede estar dos guías asociadas, ¿cómo saldría?»*. Van los ids; los
   * números los pone el documento.
   */
  guias: string[];
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
  ordenCompra,
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
  /**
   * La O/C tecleada al facturar, que manda sobre la de la cotización.
   *
   * Se pasa aparte y no se lee de `cot` porque `cot` es lo que se cotizó y
   * esto es lo que se está escribiendo ahora. Sin este cable, la previa
   * enseñaba la de la cotización —casi siempre vacía— mientras el comprobante
   * se emitía con la buena: una previa que no enseña lo que va a salir es
   * peor que no tenerla.
   */
  ordenCompra: string;
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
    La boleta no retiene NUNCA, y la pantalla lo respeta antes de preguntarlo.

    `comp_boleta_sin_spot` lo prohíbe en la tabla y `emitir_comprobante` fuerza
    el `false` para boletas, así que enseñar la casilla en una boleta sería
    ofrecer algo que la base va a ignorar. Se calcula aquí y no se manda: la
    regla sigue viviendo abajo.
  */
  const puedeRetener = tipo === "factura";
  const retiene = puedeRetener && opciones.retencion;

  /** Como en el documento: la moneda la pone el rótulo, no el número. */
  const dinero = (n: number) =>
    `USD ${n.toLocaleString("es-PE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  /*
    El 3 % está fijo en la pantalla y sale de la configuración al emitir.

    Es el porcentaje del régimen de retenciones del IGV y lleva ahí desde 2014,
    pero está en `configuracion.retencion_porcentaje` porque cambia por norma —
    igual que el umbral de la detracción—. Aquí se usa solo para enseñar el
    número en la previa; el que cuenta es el de la base.
  */
  const retencionPct = 3;

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
    orden_compra_cliente: ordenCompra.trim() || cot.orden_compra_cliente,
    referencia_id: null,
    referencia_numero: null,
    motivo_nota_codigo: null,
    fecha_emision: fecha,
    fecha_vencimiento: vencimiento,
    condicion_pago: condicion,
    dias_credito: dias,
    moneda: "USD",
    mostrar_cuenta: opciones.mostrarCuenta,
    // En la previa se arman los números de las marcadas; al emitir salen de
    // la base. El documento los pinta igual en los dos casos.
    guia_numero:
      cot.guias
        .filter((g) => opciones.guias.includes(g.id))
        .map((g) => g.numero)
        .join(", ") || null,
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
    /*
      En la PREVIA el monto se calcula aquí; al emitir lo calcula la base.

      Son dos sitios para la misma fórmula y es a propósito: el documento
      todavía no existe, así que no hay nada que leer. Lo que se manda a
      emitir sigue siendo solo `aplica` —el porcentaje y el monto los pone
      `emitir_comprobante` con el 3 % de la configuración—, de modo que esta
      cuenta no puede cambiar lo que se guarda. Solo lo que se ve antes.
    */
    retencion_aplica: retiene,
    retencion_monto: retiene ? Math.round(totales.total * retencionPct) / 100 : 0,
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

      {/*
        Las guías que ampara, arriba del todo.

        Willy, 16/09 (48:10): *«a veces hay que hacer una factura de dos
        guías: seis o dos guías y tienen una sola factura»*. Es el caso normal
        de esta casa —el pedido sale en dos despachos y se factura una vez— y
        hasta hoy no había dónde anotarlo. Peor: `guia_id` existía desde la
        002 y la Server Action **no la mandaba nunca**, así que ninguna
        factura tenía guía y el rótulo del documento no salía jamás.

        Van marcadas de entrada, no sin marcar: lo normal es facturar lo que
        se despachó. Y van como una LISTA y no como un desplegable con «+
        agregar otra», porque con dos o tres guías la lista se lee de un
        vistazo y el desplegable obliga a abrirlo para saber cuáles hay.

        Si no hay ninguna emitida, esto no aparece: no todas las ventas pasan
        por guía —la de mostrador se factura y se lleva—.
      */}
      {cot.guias.length > 0 ? (
        <div className="rounded-md border border-[var(--border)] p-3">
          <p className="text-sm font-medium">
            {cot.guias.length === 1
              ? "Guía de remisión que ampara"
              : "Guías de remisión que ampara"}
          </p>
          <p className="mt-0.5 text-sm text-[var(--fg-muted)]">
            Sus números salen impresos en el comprobante.
          </p>
          <div className="mt-2 flex flex-col gap-1">
            {cot.guias.map((g) => {
              const marcada = opciones.guias.includes(g.id);
              return (
                <label
                  key={g.id}
                  className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-sm px-1 text-sm hover:bg-[var(--surface-2)]"
                >
                  <input
                    type="checkbox"
                    checked={marcada}
                    onChange={(e) =>
                      onCambiar({
                        ...opciones,
                        guias: e.target.checked
                          ? [...opciones.guias, g.id]
                          : opciones.guias.filter((x) => x !== g.id),
                      })
                    }
                    className="size-4 shrink-0 accent-brand-600"
                  />
                  <span className="font-medium">{g.numero}</span>
                  <span className="text-[var(--fg-muted)]">{g.fecha}</span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}

      {/*
        La retención, primero: es la única de las tres que cambia el DINERO.

        Willy, 16/09 (45:03): *«si hay detracción… digo la retención. Para mi
        caso es retención porque yo vendo productos»*.

        Las otras dos casillas deciden cómo se imprime y si se manda; esta
        decide cuánto va a cobrar. Y no se puede corregir después: la
        retención va en el comprobante, y un comprobante emitido solo se
        arregla con una nota de crédito.

        Solo en facturas. En boletas ni se enseña — ver `puedeRetener`.
      */}
      {puedeRetener ? (
        <Casilla
          marcada={opciones.retencion}
          onCambiar={(v) => onCambiar({ ...opciones, retencion: v })}
          titulo={`Sujeta a retención del IGV (${retencionPct} %)`}
          detalle={
            opciones.retencion
              ? `El cliente retiene ${dinero(
                  Math.round(totales.total * retencionPct) / 100,
                )} y te paga ${dinero(
                  totales.total - Math.round(totales.total * retencionPct) / 100,
                )}. Sale impreso en el documento.`
              : "Márcalo si el cliente es agente de retención designado por SUNAT. Te pagará el total menos el 3 %."
          }
        />
      ) : null}

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
