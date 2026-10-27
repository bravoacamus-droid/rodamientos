"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { abreviaturaUnidad, importeConDescuento } from "@rodatech/config";
import {
  Combobox,
  Badge,
  Button,
  Input,
  Moneda,
  SelectNativo,
  Switch,
  Textarea,
  formatearFecha,
} from "@rodatech/ui";
import { Eye } from "lucide-react";
import { tipoCambioParaFacturar } from "../acciones/tipo-cambio";
import {
  alcanzaUmbral,
  conLeyendaSpot,
  cuotasNetas,
  montoRetencion,
  netoAPagar,
  RETENCION_PCT,
  seRetiene,
  UMBRAL_RETENCION_SOLES,
} from "../dominio/retencion";

import type { CuentaParaPagar } from "@/componentes/cuentas-para-pagar";
import type { EmisorHoja } from "@/componentes/hoja-documento";

import { AntesDeEmitir, type OpcionesEmision } from "./antes-de-emitir";
import { cargarCotizacion } from "../acciones/cargar";
import { emitirComprobante, type ResultadoEmision } from "../acciones/emitir";
import {
  bloqueosEmision,
  cuotasDe,
  enMonedaDocumento,
  totalesDe,
  vencimientoDe,
} from "../dominio/emision";
import type { CotizacionFacturable, TipoComprobante } from "../dominio/tipos";
import { sinEnvioConEnter } from "@/lib/formularios";
import { useBorrador } from "@/componentes/borrador";
import { distinto } from "@/lib/borrador";

/** Lo que se teclea o se elige al emitir; lo que guarda el borrador. */
interface DatosEmision {
  cotizacionId: string;
  tipo: TipoComprobante;
  condicion: "contado" | "credito";
  dias: number;
  observaciones: string;
  ordenCompra: string;
  cantidades: number[];
  opciones: OpcionesEmision;
  /** Con o sin retención (14/10). Ausente en borradores de antes. */
  eleccion?: "con" | "sin" | null;
}

/** Lo que propone la carga de la cotización, para no guardar lo no tocado. */
interface BaseEmision {
  cotizacionId: string;
  tipo: TipoComprobante;
  condicion: "contado" | "credito";
  dias: number;
  ordenCompra: string;
  cantidades: number[];
  guias: string[];
}

/**
 * Emisión de un comprobante a partir de una cotización aprobada.
 *
 * La pantalla NO deja tocar PRECIOS. Se elige la cotización, el tipo y la
 * forma de pago; los importes vienen de lo que ya se aprobó. Poder editarlos
 * aquí sería tener dos verdades sobre la misma venta, y la que acabaría en el
 * comprobante no sería la que el cliente aceptó.
 *
 * Las CANTIDADES sí se pueden bajar (047), nunca subir: el cliente confirmó 6,
 * hay 4 en almacén, se le entregan 4 ahora y 2 cuando llegue la compra. Lo que
 * no se factura sigue vivo en la cotización y en la bandeja «Por comprar». El
 * techo lo vuelve a aplicar el servidor: desde aquí solo se puede pedir menos.
 *
 * Los totales que se ven son la misma cuenta que hace Postgres al emitir. Si
 * en pantalla saliera otro número, el operador vería uno y se grabaría otro.
 */
export function EmisorComprobante({
  cotizaciones,
  hoy,
  serieFactura,
  serieBoleta,
  cotizacionInicial,
  guiaInicial,
  emisor,
  cuentas,
  puedeEnviar,
}: {
  cotizaciones: { id: string; numero: string; fecha: string; cliente: string; total: number }[];
  /** La fecha la fija el servidor: el dominio no lee reloj. */
  hoy: string;
  serieFactura: string;
  serieBoleta: string;
  cotizacionInicial?: string | null;
  /**
   * Se llega desde «Facturar» en una guía: se marca SOLO esa. Con «Atender
   * otro pedido» (121) la cotización tiene guías de pedidos ya facturados,
   * y marcarlas todas volvería a poner en esta factura las de antes.
   */
  guiaInicial?: string | null;
  /** Para la vista previa: es la misma hoja que se imprime. */
  emisor: EmisorHoja;
  cuentas: readonly CuentaParaPagar[];
  /** Hay certificado y credenciales SOL, así que se puede mandar a SUNAT. */
  puedeEnviar: boolean;
}) {
  const router = useRouter();

  const [cotizacionId, setCotizacionId] = useState(cotizacionInicial ?? "");
  const [cot, setCot] = useState<CotizacionFacturable | null>(null);
  const [cargando, cargar] = useTransition();
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [tipo, setTipo] = useState<TipoComprobante>("factura");
  const [fecha, setFecha] = useState(hoy);
  const [condicion, setCondicion] = useState<"contado" | "credito">("contado");
  const [dias, setDias] = useState(0);
  const [observaciones, setObservaciones] = useState("");
  /*
    La orden de compra del cliente, TECLEABLE al facturar.

    Venía de la cotización y solo de ahí. Pero Willy, 16/09 (46:40): *«sí, me
    da campos para digitar a mano el número de guía y el número de orden de
    compra»* — y el motivo es de calendario: la O/C la manda el cliente CUANDO
    CONFIRMA, o sea después de que se cotizó. Al cotizar casi nunca existe.

    Y admite escribir solo un trozo: *«una orden de compra es 2026-000-345, y
    algunos piden que le registre solamente los números significativos, los
    últimos, el 345 nada más»*. Por eso es texto libre y no se valida el
    formato: quien decide qué se imprime es el cliente que la manda.

    Arranca con la de la cotización si la hubiera, que es lo que se hacía.
  */
  const [ordenCompra, setOrdenCompra] = useState("");
  /*
    El stock NUNCA sale con la factura: sale con la guía de remisión, y sin
    guía no se factura (17/09). Desde el 21/10 la acción ni siquiera acepta
    el campo, así que tampoco se manda.
  */

  /*
    Lo que se decide antes de gastar el correlativo.

    `mostrarCuenta` arranca APAGADA desde el 14/10. Willy, 13/10: *«esas
    cuentas de banco deben ser un botón que se puede activar o no»* — que
    salgan cuando se piden, no siempre. `enviarSunat` arranca en lo que se pueda hacer — marcarlo por
    defecto cuando no hay certificado sería ofrecer algo que no va a pasar.
  */
  const [previaAbierta, setPreviaAbierta] = useState(false);
  /*
    La retención, un INTERRUPTOR que se enciende solo (14/10). Primero fueron
    dos botones a elegir antes que nada (§BV); Luis, al verlo: *«yo quería un
    botón así movible, como encendido/apagado… si pasa los 700 soles o
    convertido a dólares se le aplica retención… debería aparecer activado
    por defecto; si no, igual puedes desactivarlo»*.

    `eleccion` es solo lo que la persona TOCÓ; `null` = lo que diga el
    umbral. Por debajo de S/ 700 no se retiene nunca (es la ley), así que ahí
    el interruptor queda apagado y no se puede encender.
  */
  const [eleccion, setEleccion] = useState<"con" | "sin" | null>(null);
  // El tipo de cambio venta del día de la factura: la retención va desde S/ 700.
  const [tc, setTc] = useState<number | null>(null);
  const [tcAviso, setTcAviso] = useState<string | null>(null);
  const [opciones, setOpciones] = useState<OpcionesEmision>({
    mostrarCuenta: false,
    // Apagada por defecto: la mayoría de clientes NO son agentes de retención,
    // y marcarla de más le haría cobrar un 3 % menos sin que nadie se lo pida.
    retencion: false,
    /*
      Las guías arrancan VACÍAS y se rellenan al cargar la cotización.

      Aquí todavía no se sabe cuáles hay: la cotización se pide después. El
      efecto que la carga las marca todas, que es lo que pasa el 90 % de las
      veces —se despachó y se factura eso—; quien facture solo una parte las
      desmarca.
    */
    guias: [],
    enviarSunat: puedeEnviar,
  });
  /**
   * Cuánto se factura de cada línea, en el orden en que vienen.
   *
   * Arranca en lo pendiente —lo normal es facturarlo todo— y se puede
   * bajar. Es el caso de Willy: el cliente confirmó 6, hay 4, se le
   * entregan 4 ahora y 2 cuando llegue la compra.
   */
  const [cantidades, setCantidades] = useState<number[]>([]);

  /** Con techo en lo pendiente (047) y suelo en cero. Lo usan la tarjeta y la fila. */
  const cambiarCantidad = (i: number, n: number, tope: number) =>
    setCantidades((previas) =>
      previas.map((c, j) =>
        j === i ? Math.min(Math.max(Number.isFinite(n) ? n : 0, 0), tope) : c,
      ),
    );

  const [resultado, emitir, emitiendo] = useActionState<ResultadoEmision | null, FormData>(
    async (previo, formData) => {
      const r = await emitirComprobante(previo, formData);
      /*
        Se va a la ficha salvo que el envío a SUNAT haya fallado.

        Si falla y redirigimos igual, el operador aterriza en un documento
        con un botón de «Enviar a SUNAT» sin saber que ya se intentó ni por
        qué no salió. Quedándose aquí lo lee, y el enlace a la ficha sigue a
        un clic. El comprobante está emitido en los dos casos: eso no
        depende del envío.
      */
      // Emitido es emitido, aunque SUNAT no lo haya aceptado: el borrador sobra
      // y ofrecerlo otra vez invitaría a gastar un segundo número.
      if (r.ok) olvidarBorrador();
      // Se emite desde la previa (20/10): si algo falla, se cierra para que se
      // lea el mensaje, que está en la pantalla y no dentro del diálogo.
      if (!r.ok || (r.envio && !r.envio.ok)) setPreviaAbierta(false);
      if (r.ok && !(r.envio && !r.envio.ok)) router.push(`/facturacion/${r.id}`);
      return r;
    },
    null,
  );

  /*
    Lo que se está llenando, guardado solo en el navegador (13/10). Luis:
    *«cuando esté creando un usuario o rellenando algo, que me salga seguir o
    comenzar desde cero»*.

    La FECHA no entra: es fiscal, y un borrador de hace tres días la traería
    de vuelta sin que nadie la mire. Arranca en hoy, como siempre.

    La cotización en sí tampoco: se relee del servidor, porque los importes
    que van a un documento fiscal no se toman de una copia. Lo recuperado se
    aplica encima cuando llega (`recuperadoPendiente`), en lugar de lo que la
    carga propone por defecto.

    `base` es lo que propuso la carga: lo que coincida con eso no es nada que
    se pierda, y no se guarda.
  */
  const base = useRef<BaseEmision | null>(null);
  const recuperadoPendiente = useRef<DatosEmision | null>(null);
  const datosBorrador: DatosEmision = {
    cotizacionId,
    tipo,
    condicion,
    dias,
    observaciones,
    ordenCompra,
    cantidades,
    opciones,
    eleccion,
  };
  const { aviso: avisoBorrador, olvidar: olvidarBorrador } = useBorrador({
    formulario: "comprobante",
    id: cotizacionInicial ?? null,
    datos: datosBorrador,
    valeLaPena: (d) => {
      const b = base.current;
      // Al abrir todavía no hay carga con la que comparar: si se guardó, valía.
      if (!b) return true;
      return (
        d.cotizacionId !== b.cotizacionId ||
        d.tipo !== b.tipo ||
        d.condicion !== b.condicion ||
        d.dias !== b.dias ||
        d.ordenCompra !== b.ordenCompra ||
        d.observaciones.trim() !== "" ||
        distinto(d.cantidades, b.cantidades) ||
        distinto(d.opciones.guias, b.guias) ||
        d.opciones.mostrarCuenta ||
        d.eleccion != null ||
        d.opciones.retencion ||
        d.opciones.enviarSunat !== puedeEnviar
      );
    },
    recuperar: (d) => {
      if (d.cotizacionId === cotizacionId && cot?.id === d.cotizacionId && !cargando) {
        // La cotización ya está en pantalla: se aplica directamente.
        aplicarRecuperado(d, cot.lineas.length);
      } else {
        // Se aplica cuando llegue la cotización (la que ya va en camino, o la
        // que dispara el cambio de `cotizacionId`).
        recuperadoPendiente.current = d;
        setCotizacionId(d.cotizacionId);
      }
    },
  });

  function aplicarRecuperado(d: DatosEmision, lineas: number) {
    // Las boletas se quitaron (14/10): un borrador viejo de boleta vuelve
    // como factura.
    setTipo(d.tipo === "boleta" ? "factura" : d.tipo);
    setEleccion(d.eleccion ?? null);
    setCondicion(d.condicion);
    setDias(d.dias);
    setObservaciones(d.observaciones);
    setOrdenCompra(d.ordenCompra);
    // Si la cotización cambió de líneas desde entonces, las cantidades guardadas
    // ya no casan con ellas: se quedan las que propone la carga.
    if (d.cantidades.length === lineas) setCantidades(d.cantidades);
    setOpciones(d.opciones);
  }

  // Al elegir cotización se trae entera del servidor. No se fía de lo que
  // tenga el listado: los importes que van a un documento fiscal se releen.
  useEffect(() => {
    if (!cotizacionId) {
      setCot(null);
      setCantidades([]);
      return;
    }
    setErrorCarga(null);
    cargar(async () => {
      const r = await cargarCotizacion(cotizacionId);
      if (!r.ok) {
        setCot(null);
        setErrorCarga(r.error);
        return;
      }
      if (!r.datos) {
        setCot(null);
        setErrorCarga("La cotización ya no está disponible.");
        return;
      }
      setCot(r.datos);
      setCantidades(r.datos.lineas.map((l) => l.cantidad));
      // El tipo y la condición se proponen desde el cliente, que es quien los
      // determina. Se pueden cambiar, pero por defecto aciertan.
      // Solo facturas (14/10). Willy: *«boletas no emito… sáquelo»*.
      setTipo("factura");
      setCondicion(r.datos.condicion_pago === "credito" ? "credito" : "contado");
      setDias(r.datos.dias_credito ?? 0);
      setOrdenCompra(r.datos.orden_compra_cliente ?? "");
      /*
        Todas las guías de la cotización, marcadas.

        Es lo que pasa casi siempre: se despachó y se factura eso. Dejarlas
        sin marcar obligaría a marcarlas una por una en el caso normal, y ya
        se sabe cómo acaban las casillas que hay que acordarse de marcar —la
        de las cuentas para cobrar tardó dos migraciones en aparecer.

        `guias` ya viene filtrada a las EMITIDAS: una en borrador no tiene
        número, y lo que la factura ampara es un número.
      */
      const todas = r.datos.guias.map((g) => g.id);
      const ids =
        cotizacionId === cotizacionInicial && guiaInicial && todas.includes(guiaInicial) ? [guiaInicial] : todas;
      setOpciones((o) => ({ ...o, guias: ids }));

      base.current = {
        cotizacionId,
        tipo: "factura",
        condicion: r.datos.condicion_pago === "credito" ? "credito" : "contado",
        dias: r.datos.dias_credito ?? 0,
        ordenCompra: r.datos.orden_compra_cliente ?? "",
        cantidades: r.datos.lineas.map((l) => l.cantidad),
        guias: ids,
      };

      // «Seguir donde me quedé» llegó antes que la cotización: va encima.
      const pendiente = recuperadoPendiente.current;
      if (pendiente && pendiente.cotizacionId === cotizacionId) {
        recuperadoPendiente.current = null;
        aplicarRecuperado(pendiente, r.datos.lineas.length);
      }
    });
  }, [cotizacionId, cotizacionInicial, guiaInicial]);

  // Lo que se va a emitir de verdad. El servidor lo vuelve a recortar
  // contra lo pendiente: esto es para que los totales de la pantalla
  // coincidan con los del comprobante antes de pulsar.
  const aEmitir = useMemo(
    () =>
      (cot?.lineas ?? [])
        .map((l, i) => ({ ...l, cantidad: cantidades[i] ?? l.cantidad }))
        .filter((l) => l.cantidad > 0),
    [cot, cantidades],
  );

  const totales = useMemo(
    () => totalesDe(aEmitir),
    [aEmitir],
  );

  /*
    La venta en soles (116): la factura sale en soles con el cambio que se
    congeló al aprobar la cotización. Aquí todo se ENSEÑA en la moneda del
    documento; lo que viaja sigue en dólares y la base lo convierte con la
    misma cuenta (`enMonedaDocumento`).
  */
  const tcDoc = cot?.moneda === "PEN" && cot.tipo_cambio ? cot.tipo_cambio : null;
  const monedaDoc: "USD" | "PEN" = tcDoc ? "PEN" : "USD";
  const sim = tcDoc ? "S/" : "$";
  const totalesDoc = useMemo(
    () => (tcDoc ? totalesDe(enMonedaDocumento(aEmitir, tcDoc)) : totales),
    [aEmitir, tcDoc, totales],
  );
  const unitDoc = (u: number) => (tcDoc ? Math.round(u * tcDoc * 100) / 100 : u);

  const bloqueos = useMemo(
    () =>
      cot
        ? bloqueosEmision(
            // Con las líneas y el total de lo que se emite, no los de la
            // cotización: si se bajan todas a cero hay que bloquear, y el
            // umbral de la boleta se mira contra lo que se cobra.
            { ...cot, lineas: aEmitir, total: totales.total },
            tipo,
            // Y contra las guías marcadas (157): la Server Action rechaza lo
            // que no cuadre, así que se avisa aquí antes de pulsar.
            opciones.guias,
          )
        : [],
    [cot, aEmitir, totales.total, tipo, opciones.guias],
  );

  const serie = tipo === "factura" ? serieFactura : serieBoleta;

  // En soles el umbral se mira directo; en dólares, al cambio del día.
  const llegaAlUmbral = tcDoc ? totalesDoc.total >= UMBRAL_RETENCION_SOLES : alcanzaUmbral(totales.total, tc);
  const clienteEsAgente = Boolean(cot?.cliente_agente_retencion);
  const retiene = seRetiene(llegaAlUmbral, eleccion, clienteEsAgente);

  /*
    La frase de observaciones sigue al interruptor, sola y arriba (Willy:
    «literalmente debe salir esa frase»): «OPERACION SUJETA A SPOT: RETENCION
    (3%)» o «OPERACION NO SUJETA A SPOT.», como en su F002-564 y F002-565. Lo
    que se escriba debajo se respeta. Solo con una cotización elegida.
  */
  useEffect(() => {
    if (!cot) return;
    setObservaciones((o) => conLeyendaSpot(o, retiene));
    setOpciones((o) => (o.retencion === retiene ? o : { ...o, retencion: retiene }));
  }, [cot, retiene]);

  // El tipo de cambio del día de la factura, al cargar y al cambiar la fecha.
  useEffect(() => {
    if (!cot) return;
    let vigente = true;
    setTcAviso(null);
    void tipoCambioParaFacturar(fecha).then((r) => {
      if (!vigente) return;
      if (r.ok) setTc(r.venta);
      else {
        setTc(null);
        setTcAviso(`Sin tipo de cambio (${r.error}). Revisa tú si llega a S/ ${UMBRAL_RETENCION_SOLES}.`);
      }
    });
    return () => {
      vigente = false;
    };
  }, [cot, fecha]);
  const alCredito = condicion === "credito" && dias > 0;
  const vencimiento = alCredito ? vencimientoDe(fecha, dias) : null;
  const cuotas = alCredito ? cuotasDe(totales.total, dias, fecha) : [];
  // Las que se enseñan, en la moneda del documento.
  const cuotasVista = alCredito ? cuotasDe(totalesDoc.total, dias, fecha) : [];

  const payload = JSON.stringify({
    cotizacion_id: cotizacionId,
    tipo,
    serie,
    fecha_emision: fecha,
    condicion_pago: condicion,
    dias_credito: alCredito ? dias : 0,
    observaciones: observaciones.trim() || null,
    orden_compra_cliente: ordenCompra.trim() || null,
    cantidades,
    mostrar_cuenta: opciones.mostrarCuenta,
    retencion_aplica: retiene,
    /*
      Las guías que ampara. ESTE ERA EL CABLE QUE FALTABA.

      El 17/09 se añadió la casilla, se añadió al esquema de la Server Action y
      se añadió al payload de la RPC. Todo menos esto: el formulario nunca las
      mandaba, así que `guias` llegaba ausente, Zod lo rechazaba por
      «Required» y **no se podía emitir ninguna factura desde ese día**.

      No se vio porque emitir gasta un correlativo de verdad y se dejó
      apuntado como «escrito pero sin probar en pantalla». Es exactamente el
      caso que esa lista existe para cazar, y tardó cuatro días.
    */
    guias: opciones.guias,
    // Nunca se manda lo que no se puede mandar: sin certificado la casilla
    // ni se marca, y aquí se vuelve a cortar por si el estado se quedó
    // marcado de antes de que la configuración cambiara.
    enviar_sunat: opciones.enviarSunat && puedeEnviar,
  });

  const listo =
    Boolean(cot) &&
    bloqueos.length === 0 &&
    !emitiendo;

  return (
    <form id="form-emitir" action={emitir} onKeyDown={sinEnvioConEnter} className="flex flex-col gap-5">
      <input type="hidden" name="comprobante" value={payload} />

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Emitir comprobante</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Nace de una cotización aprobada. El stock sale con la guía, no aquí.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              // Cancelar es decidir no seguir: no se ofrece otra vez.
              olvidarBorrador();
              router.push("/facturacion");
            }}
          >
            Cancelar
          </Button>
          {/*
            Ver el papel ANTES de gastar el correlativo, a la vista (14/10).
            Luis: *«en facturas falta vista previa antes de emitir»*. La
            previa existía, pero al final de la columna de la derecha y solo
            cuando ya no faltaba nada: no se encontraba.
          */}
          {/* La previa, en cuanto hay cotización: también con la guía
              pendiente, para ver cómo sale el papel (20/10). */}
          {cot ? (
            <Button type="button" variant="outline" onClick={() => setPreviaAbierta(true)}>
              <Eye className="size-[18px] shrink-0" aria-hidden="true" />
              Vista previa
            </Button>
          ) : null}
          {/* No emite: abre la previa, y se emite desde ahí (20/10, Luis:
              «antes de emitir… así vea la vista previa»). */}
          <Button type="button" disabled={!listo} onClick={() => setPreviaAbierta(true)}>
            {emitiendo ? "Emitiendo…" : `Emitir ${serie}`}
          </Button>
        </div>
      </header>

      {avisoBorrador}

      {/*
        Emitido, pero SUNAT no lo aceptó.

        En ámbar y no en rojo, y el matiz importa: el documento existe, el
        correlativo se gastó y la venta está registrada. Lo único que falta es
        el envío, que se reintenta. Pintarlo como un error llevaría a emitirlo
        otra vez, y eso sí gastaría un segundo número por nada.
      */}
      {resultado?.ok && resultado.envio && !resultado.envio.ok ? (
        <div className="anim-entrada rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm">
          <p className="font-medium text-[var(--warn)]">
            {resultado.numero} se emitió, pero SUNAT no lo aceptó todavía.
          </p>
          <p className="mt-0.5 text-[var(--fg-muted)]">{resultado.envio.mensaje}</p>
          <p className="mt-1.5">
            El comprobante está guardado y la venta registrada.{" "}
            <a
              href={`/facturacion/${resultado.id}`}
              className="font-medium text-brand-700 underline"
            >
              Abrir {resultado.numero} para reintentar el envío
            </a>
            .
          </p>
        </div>
      ) : null}

      {resultado && !resultado.ok ? (
        <div className="anim-entrada rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger)]">
          <p className="font-medium">{resultado.error}</p>
          {resultado.bloqueos ? (
            <ul className="mt-1 flex flex-col gap-0.5">
              {resultado.bloqueos.map((b) => (
                <li key={b}>· {b}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-5 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {/* ------------------------------------------------- Cabecera */}
          {/*
            La cabecera, compacta (Luis y Willy, 14/10): la cotización y la
            orden de compra del cliente MITAD Y MITAD arriba —la O/C viene de
            la guía—, y debajo comprobante, fecha, pago y plazo en una fila.
            La O/C vivía sola al fondo, en una tarjeta entera.
          */}
          <section className="card p-4">
            <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="fac-cotizacion" className="text-sm font-medium">
                Cotización aprobada <span className="text-[var(--danger)]">*</span>
              </label>
              {/* Con buscador (07/10): se encuentra por número o por cliente. */}
              <Combobox
                id="fac-cotizacion"
                opciones={cotizaciones.map((c) => ({
                  valor: c.id,
                  etiqueta: `${c.numero} · ${c.cliente}`,
                  detalle: `$\u00a0${c.total.toFixed(2)}`,
                }))}
                valor={cotizacionId || null}
                onCambio={(v) => setCotizacionId(v ?? "")}
                placeholder="Elige una cotización…"
                placeholderBusqueda="Número o cliente…"
                textoVacio="Ninguna cotización coincide."
              />
              {cotizaciones.length === 0 ? (
                <span className="text-sm text-[var(--fg-muted)]">
                  No hay cotizaciones aprobadas sin facturar. Aprueba una primero.
                </span>
              ) : null}
            </div>

            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-sm font-medium">Orden de compra del cliente</span>
              <Input
                value={ordenCompra}
                onChange={(e) => setOrdenCompra(e.target.value)}
                placeholder={cot ? "La que vino en la guía" : "Elige primero la cotización"}
                disabled={!cot}
              />
              <span className="text-sm text-[var(--fg-muted)]">
                {cot && ordenCompra.trim() ? "Viene de la guía; sale impresa en la factura." : "Sale impresa en la factura."}
              </span>
            </label>
            </div>

            {cargando ? (
              <p className="anim-latido mt-3 text-sm text-[var(--fg-muted)]">
                Trayendo la cotización…
              </p>
            ) : null}

            {errorCarga ? (
              <p className="mt-3 rounded-sm border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm text-[var(--danger)]">
                {errorCarga}
              </p>
            ) : null}

            {cot ? (
              <div className="anim-entrada mt-4 grid gap-3 border-t border-[var(--border-soft)] pt-4 sm:grid-cols-4">
                {/* Solo facturas (14/10): Willy no emite boletas. */}
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Comprobante</span>
                  <p className="flex h-control-md items-center gap-2 rounded-md bg-[var(--surface-2)] px-3 text-base font-semibold">
                    Factura
                    <span className="font-mono text-sm font-semibold text-[var(--fg-muted)]">{serie}</span>
                  </p>
                </div>

                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Fecha</span>
                  <Input
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Pago</span>
                  <SelectNativo
                    value={condicion}
                    onChange={(e) => {
                      const v = e.target.value as "contado" | "credito";
                      setCondicion(v);
                      if (v === "contado") setDias(0);
                      else if (dias === 0) setDias(cot.dias_credito || 30);
                    }}
                  >
                    <option value="contado">Al contado</option>
                    <option value="credito">A crédito</option>
                  </SelectNativo>
                </label>

                {/*
                  Los días, solo al crédito. Al contado era una casilla gris
                  deshabilitada con un 0 —de las que «parecían rotas», Luis
                  02/10—; ahora no sale (revisión por módulos del 02/10).
                */}
                {condicion === "credito" ? (
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium">Días de crédito</span>
                    <Input
                      type="number"
                      min={0}
                      max={365}
                      value={dias}
                      onChange={(e) => setDias(Number(e.target.value))}
                      className="tabular"
                    />
                    {vencimiento ? (
                      <span className="text-sm text-[var(--fg-muted)]">
                        vence {formatearFecha(vencimiento)}
                      </span>
                    ) : null}
                  </label>
                ) : null}
              </div>
            ) : null}
          </section>

          {/* ------------------------------------------------ Retención */}
          {cot ? (
            <section className="anim-entrada card p-4" aria-labelledby="fac-retencion">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <label htmlFor="fac-retencion-sw" id="fac-retencion" className="cursor-pointer text-base font-semibold">
                    Retención del IGV ({RETENCION_PCT} %)
                  </label>
                  <p className="text-sm text-[var(--fg-muted)]">
                    {clienteEsAgente ? (
                      <>
                        <strong>Este cliente es agente de retención:</strong> se enciende sola desde S/{" "}
                        {UMBRAL_RETENCION_SOLES}. Si esta vez no retiene, apágala.
                      </>
                    ) : (
                      <>
                        {/* Ya no se marca en la ficha del cliente (Willy, 20/10:
                            «eso se define en la factura»). */}
                        Sale apagada. <strong>Si este cliente te retiene, enciéndela.</strong>

                      </>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`text-sm font-semibold ${retiene ? "text-brand-700 dark:text-brand-300" : "text-[var(--fg-muted)]"}`}
                  >
                    {retiene ? "Con retención" : "Sin retención"}
                  </span>
                  <Switch
                    id="fac-retencion-sw"
                    tamano="lg"
                    checked={retiene}
                    disabled={llegaAlUmbral === false}
                    onCheckedChange={(v) => setEleccion(v ? "con" : "sin")}
                  />
                </div>
              </div>
              <p className="mt-2 text-sm">
                {tcDoc ? (
                  <>
                    Venta en soles: total <strong>S/ {totalesDoc.total.toFixed(2)}</strong>, al cambio{" "}
                    {tcDoc.toFixed(3)} fijado al aprobar la cotización.
                  </>
                ) : tc ? (
                  <>
                    Total $ {totales.total.toFixed(2)} ≈ <strong>S/ {(totales.total * tc).toFixed(2)}</strong> al tipo
                    de cambio venta de SUNAT ({tc.toFixed(3)}).
                  </>
                ) : (
                  (tcAviso ?? "Consultando el tipo de cambio…")
                )}
                {llegaAlUmbral === false ? (
                  <span className="block text-[var(--fg-muted)]">
                    No llega a S/ {UMBRAL_RETENCION_SOLES}: esta factura no se retiene.
                  </span>
                ) : null}
              </p>
              {retiene ? (
                <p className="mt-2 rounded-md bg-[var(--surface-2)] p-3 text-sm">
                  Retención: <strong>{sim} {montoRetencion(totalesDoc.total).toFixed(2)}</strong>
                  {tc && !tcDoc ? <> (S/ {(montoRetencion(totales.total) * tc).toFixed(2)})</> : null} · Te pagan:{" "}
                  <strong>{sim} {netoAPagar(totalesDoc.total).toFixed(2)}</strong>
                </p>
              ) : null}
            </section>
          ) : null}

          <div className="flex flex-col gap-5">
          {/* --------------------------------------------------- Líneas */}
          {cot ? (
            <section className="anim-entrada card @container p-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold">
                  Qué se factura
                  <span className="ml-2 font-normal text-[var(--fg-muted)]">
                    de {cot.numero}
                  </span>
                </h2>
                <span className="text-sm text-[var(--fg-muted)]">
                  {cot.cliente} · {cot.cliente_documento ?? "sin documento"}
                </span>
              </div>

              {/* Los importes NO se pueden tocar: son los que el cliente aprobó.
                  Cambiarlos aquí sería tener dos verdades sobre la misma venta.

                  Tarjetas o tabla según el ancho de ESTA caja (`@container`
                  en la sección). Revisión por módulos del 02/10: era una
                  tabla de seis columnas a cualquier ancho, y a 390 px solo se
                  veían el código y media descripción —la cantidad que se
                  edita y el importe quedaban fuera—; a 1280, con el resumen
                  al lado, el importe también. Ahora el código va encima de la
                  descripción y el descuento debajo del valor unitario. */}
              <ul className="flex flex-col divide-y divide-[var(--border-soft)] @lg:hidden">
                {cot.lineas.map((l, i) => (
                  <li key={`${l.producto_id}-${i}`} className="flex flex-col gap-2 py-3">
                    <div>
                      <span className="block break-all font-mono text-sm font-semibold">
                        {l.codigo}
                      </span>
                      <span className="block text-sm text-[var(--fg-muted)]">
                        {l.descripcion}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <span className="mb-1 block text-sm text-[var(--fg-muted)]">
                          Cantidad a facturar
                        </span>
                        <CantidadLinea
                          linea={l}
                          valor={cantidades[i] ?? l.cantidad}
                          onCambiar={(n) => cambiarCantidad(i, n, l.cantidad)}
                        />
                      </div>
                      <div className="text-right text-sm">
                        <span className="block text-[var(--fg-muted)]">
                          × <span className="tabular">{tcDoc ? unitDoc(l.valor_unitario).toFixed(2) : l.valor_unitario.toFixed(4)}</span>
                          {l.descuento_pct > 0 ? ` −${l.descuento_pct}%` : ""}
                        </span>
                        <Moneda
                          valor={importeConDescuento(
                            cantidades[i] ?? l.cantidad,
                            unitDoc(l.valor_unitario),
                            l.descuento_pct,
                          )}
                          moneda={monedaDoc}
                          className="text-base font-semibold"
                        />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="scroll-x hidden @lg:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-sm uppercase tracking-wide text-[var(--fg-subtle)]">
                      <th className="py-2 pr-3 font-medium">Producto</th>
                      <th className="py-2 pr-3 text-right font-medium">Cant.</th>
                      <th className="py-2 pr-3 text-right font-medium">V. unit.</th>
                      <th className="py-2 text-right font-medium">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cot.lineas.map((l, i) => (
                      <tr
                        key={`${l.producto_id}-${i}`}
                        className="anim-entrada border-b border-[var(--border-soft)] align-top last:border-0"
                        style={{ animationDelay: `${Math.min(i, 6) * 24}ms` }}
                      >
                        <td className="py-2 pr-3">
                          <span className="block font-mono text-sm font-semibold">{l.codigo}</span>
                          <span className="block text-[var(--fg-muted)]">{l.descripcion}</span>
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <CantidadLinea
                            linea={l}
                            valor={cantidades[i] ?? l.cantidad}
                            onCambiar={(n) => cambiarCantidad(i, n, l.cantidad)}
                          />
                        </td>
                        <td className="whitespace-nowrap py-2 pr-3 text-right tabular">
                          {tcDoc ? unitDoc(l.valor_unitario).toFixed(2) : l.valor_unitario.toFixed(4)}
                          {l.descuento_pct > 0 ? (
                            <span className="block text-sm text-[var(--fg-subtle)]">
                              −{l.descuento_pct}%
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 text-right">
                          {/* Sobre la cantidad que se está emitiendo, no sobre
                              `l.importe`: si no, la suma de la columna no
                              cuadraría con el total de abajo. */}
                          <Moneda
                            valor={importeConDescuento(
                              cantidades[i] ?? l.cantidad,
                              unitDoc(l.valor_unitario),
                              l.descuento_pct,
                            )}
                            moneda={monedaDoc}
                            tamano="sm"
                            enfasis="fuerte"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {cot ? (
            <section className="anim-entrada card flex flex-col gap-4 p-4">
              {/*
                La casilla «la mercadería sale con esta factura» YA NO SE
                ENSEÑA, y es consecuencia directa de la regla del 17/09.

                Existía para la venta de mostrador: sin guía previa, el stock
                salía con la factura. Pero desde que **sin guía no se factura**
                —Luis: *«no debería emitir la factura si no tengo la guía
                hecha»*—, ese caso no existe: cuando se llega hasta aquí, la
                mercadería SIEMPRE salió ya con la guía.

                Y entonces la casilla dejó de ser una opción para convertirse
                en una trampa: marcarla restaría el stock dos veces, y no
                quedaba ni un solo caso en que fuera correcta. Una casilla cuya
                única función posible es equivocarse no se deja «por si acaso».

                El estado se queda en `false` y viaja igual en el payload, así
                que la base sigue recibiendo lo mismo. Si algún día vuelve la
                venta sin guía, se vuelve a enseñar aquí y ya está.
              */}

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Observaciones</span>
                <Textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  rows={2}
                  placeholder="Lo que salga impreso al pie del comprobante."
                />
              </label>
            </section>
          ) : null}
          </div>
        </div>

        {/* -------------------------------------------------- Resumen */}
        <aside className="w-full shrink-0 lg:w-80">
          <div className="card sticky top-4 flex flex-col gap-3 p-4">
            <h2 className="text-sm font-semibold">Resumen</h2>

            <dl className="flex flex-col gap-1.5 text-sm">
              <Fila etiqueta="Gravada" valor={`${sim}\u00a0${totalesDoc.gravada.toFixed(2)}`} />
              {totalesDoc.descuento > 0 ? (
                <Fila etiqueta="Descuento" valor={`−\u00a0${sim}\u00a0${totalesDoc.descuento.toFixed(2)}`} />
              ) : null}
              <Fila etiqueta="IGV (18 %)" valor={`${sim}\u00a0${totalesDoc.igv.toFixed(2)}`} />
              <Fila etiqueta="Total" valor={`${sim}\u00a0${totalesDoc.total.toFixed(2)}`} fuerte />
              {retiene ? (
                <>
                  <Fila
                    etiqueta={`Retenci\u00f3n (${RETENCION_PCT} %)`}
                    valor={`\u2212\u00a0${sim}\u00a0${montoRetencion(totalesDoc.total).toFixed(2)}`}
                  />
                  <Fila etiqueta="Te pagan" valor={`${sim}\u00a0${netoAPagar(totalesDoc.total).toFixed(2)}`} fuerte />
                </>
              ) : null}
            </dl>

            {cuotas.length > 0 ? (
              <div className="rounded-sm border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
                {/* SUNAT exige el cronograma desde 2022: sin él, un comprobante
                    al crédito se rechaza con el error 3251. */}
                {/* «Cuotas de pago» y no «Cronograma para SUNAT»: Willy lee
                    qué es, no para quién (revisión por módulos del 02/10). */}
                <p className="mb-1 text-sm font-medium">Cuotas de pago</p>
                <ul className="flex flex-col gap-0.5 text-sm text-[var(--fg-muted)]">
                  {/* Con retención, lo PENDIENTE: el total menos lo retenido,
                      como su F002-564. */}
                  {cuotasNetas(cuotasVista, retiene ? montoRetencion(totalesDoc.total) : 0).map((q) => (
                    <li key={q.numero} className="flex justify-between gap-2">
                      <span>Cuota {q.numero}</span>
                      <span className="tabular">
                        <Moneda valor={q.monto} moneda={monedaDoc} tamano="sm" className="text-inherit" /> · vence{" "}
                        {formatearFecha(q.vencimiento)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/*
              La falta de guía va SEPARADA del resto, y no bajo «SUNAT lo
              rechazaría».

              Porque no es lo mismo ni se arregla igual. Los otros bloqueos son
              datos del cliente que hay que corregir en su ficha; este es un
              paso del flujo que falta hacer — Luis, 17/09: *«no debería emitir
              la factura si no tengo la guía hecha»*— y lo único útil aquí es
              el botón que lleva a hacerlo. Meterlo en la lista de SUNAT diría
              además una cosa falsa: SUNAT no rechaza una factura sin guía;
              quien no la admite es Willy.
            */}
            {bloqueos.some((b) => b.campo === "guia") && cot ? (
              <div className="anim-entrada rounded-md border border-[var(--warn)] bg-[var(--surface-2)] p-3">
                {/*
                  Dos casos muy distintos, y el segundo casi se me escapa.

                  Si la guía está HECHA pero en borrador, decir «no hay ninguna
                  guía» manda a crear una segunda — y la pantalla de guías
                  contestaría que esa cotización ya está despachada entera. Un
                  callejón sin salida construido en dos pasos.

                  Lo único útil ahí es: emite la que ya tienes.
                */}
                {cot.guias_borrador.length > 0 ? (
                  <>
                    <p className="text-sm font-medium text-[var(--warn)]">
                      La guía está sin emitir
                    </p>
                    <p className="mt-0.5 text-sm">
                      {cot.guias_borrador.length === 1
                        ? `La guía ${cot.guias_borrador[0]!.numero} está en borrador: la mercadería todavía no ha salido del almacén.`
                        : `Sus guías (${cot.guias_borrador.map((g) => g.numero).join(", ")}) están en borrador: la mercadería todavía no ha salido del almacén.`}{" "}
                      Emítela y vuelve — su número va impreso en la factura.
                    </p>
                    <Link
                      href={`/guias/${cot.guias_borrador[0]!.id}`}
                      className="mt-2 inline-flex h-control-md items-center rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-700"
                    >
                      Ir a {cot.guias_borrador[0]!.numero}
                    </Link>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-[var(--warn)]">
                      Falta la guía de remisión
                    </p>
                    <p className="mt-0.5 text-sm">
                      {bloqueos.find((b) => b.campo === "guia")!.mensaje} Su
                      número va impreso en la factura.
                    </p>
                    <Link
                      href={`/guias/nueva?cotizacion=${cot.id}`}
                      className="mt-2 inline-flex h-control-md items-center rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-700"
                    >
                      Generar la guía
                    </Link>
                  </>
                )}
              </div>
            ) : null}

            {/*
              El descuadre con las guías marcadas (157) tampoco es de SUNAT:
              es la regla de Willy de facturar lo que salió. Va aparte y con
              lo que hay que hacer en cada línea.
            */}
            {bloqueos.some((b) => b.campo === "cantidades") ? (
              <div className="anim-entrada rounded-md border border-[var(--warn)] bg-[var(--surface-2)] p-3">
                <p className="text-sm font-medium text-[var(--warn)]">
                  La factura no cuadra con la guía
                </p>
                <ul className="mt-1 flex flex-col gap-1 text-sm">
                  {bloqueos
                    .filter((b) => b.campo === "cantidades")
                    .map((b) => (
                      <li key={b.mensaje}>· {b.mensaje}</li>
                    ))}
                </ul>
              </div>
            ) : null}

            {bloqueos.some((b) => b.campo !== "guia" && b.campo !== "cantidades") ? (
              <div className="anim-entrada rounded-sm border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5">
                <p className="mb-1 text-sm font-medium text-[var(--danger)]">
                  SUNAT lo rechazaría:
                </p>
                {/* `text-sm` y no `text-sm`: es un mensaje que hay que LEER
                    para saber qué corregir, y la regla de la casa es que eso
                    no baja de 14 px (17/09). */}
                <ul className="flex flex-col gap-1 text-sm">
                  {bloqueos
                    .filter((b) => b.campo !== "guia" && b.campo !== "cantidades")
                    .map((b) => (
                      <li key={b.mensaje}>· {b.mensaje}</li>
                    ))}
                </ul>
              </div>
            ) : null}

            {cot && bloqueos.length === 0 ? (
              <p className="text-sm text-[var(--fg-muted)]">
                Se emite como <Badge tone="neutral" size="xs">{serie}</Badge>
                {opciones.enviarSunat && puedeEnviar
                  ? " y se manda a SUNAT en el mismo paso."
                  : " y queda pendiente de enviar a SUNAT, que se hace desde su ficha."}
              </p>
            ) : null}
          </div>

          {/* Debajo del resumen, no encima: primero se mira lo que se cobra y
              después cómo sale el papel. Y pegado al botón de emitir, que es
              lo siguiente que se pulsa. */}
          {/* Con cotización, aunque falte la guía: la casilla de las cuentas y
              la previa no dependen de ella, y escondidas no existían (20/10,
              Luis: «falta un botón de activar o desactivar si quiere que vaya
              su número de cuenta» — estaba, pero no salía sin la guía). */}
          {cot ? (
            <div className="mt-4">
              <AntesDeEmitir
                cot={cot}
                lineas={aEmitir}
                tipo={tipo}
                serie={serie}
                fecha={fecha}
                condicion={condicion}
                dias={alCredito ? dias : 0}
                vencimiento={vencimiento}
                cuotas={cuotas}
                totales={totales}
                observaciones={observaciones}
                ordenCompra={ordenCompra}
                emisor={emisor}
                cuentas={cuentas}
                puedeEnviar={puedeEnviar}
                opciones={opciones}
                onCambiar={setOpciones}
                previaAbierta={previaAbierta}
                onPrevia={setPreviaAbierta}
                emitir={{
                  formId: "form-emitir",
                  listo,
                  emitiendo,
                  motivo: bloqueos.some((b) => b.campo === "guia")
                    ? "Falta la guía: emítela primero y vuelve."
                    : bloqueos.length > 0
                      ? "Hay algo que corregir antes de emitir."
                      : null,
                }}
              />
            </div>
          ) : null}
        </aside>
      </div>
    </form>
  );
}

/**
 * La cantidad editable de una línea, con su unidad y lo que queda.
 *
 * Editable, con techo en lo pendiente (047). Es el caso de Willy: el cliente
 * confirmó 6, hay 4, se le entregan 4 ahora y 2 cuando llegue la compra. El
 * servidor lo vuelve a recortar; esto es para poder hacerlo, no para que sea
 * seguro.
 *
 * La unidad, abreviada como en el resto del ERP: aquí salía el código de
 * SUNAT, «NIU», que Willy no tiene por qué saber que es «unidad» (revisión
 * por módulos del 02/10).
 */
function CantidadLinea({
  linea: l,
  valor,
  onCambiar,
}: {
  linea: CotizacionFacturable["lineas"][number];
  valor: number;
  onCambiar: (n: number) => void;
}) {
  const nota =
    valor < l.cantidad
      ? `quedarían ${l.cantidad - valor} sin facturar`
      : l.cantidad !== l.cantidad_cotizada
        ? `de ${l.cantidad_cotizada} cotizadas` +
          (l.cantidad_atendida > 0 ? ` · ${l.cantidad_atendida} ya facturadas` : "")
        : null;
  return (
    <div className="inline-flex flex-col items-end gap-0.5">
      <span className="inline-flex items-center gap-1.5">
        <Input
          type="number"
          min={0}
          max={l.cantidad}
          step="0.01"
          numerico
          className="w-24 text-right"
          value={valor}
          onChange={(e) => onCambiar(Number(e.target.value))}
          aria-label={`Cantidad a facturar de ${l.codigo}`}
        />
        <span className="text-sm text-[var(--fg-muted)]">{abreviaturaUnidad(l.unidad)}</span>
      </span>
      {/* Solo cuando dice algo: «1 pendientes» debajo de cada línea entera
          era ruido, y además mal concordado. */}
      {nota ? <span className="text-sm text-[var(--fg-muted)]">{nota}</span> : null}
    </div>
  );
}

function Fila({
  etiqueta,
  valor,
  fuerte,
}: {
  etiqueta: string;
  valor: string;
  fuerte?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[var(--fg-muted)]">{etiqueta}</dt>
      <dd className={`tabular ${fuerte ? "text-base font-semibold" : ""}`}>{valor}</dd>
    </div>
  );
}
