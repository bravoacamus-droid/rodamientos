import Link from "next/link";
import { redirect } from "next/navigation";
import { AlarmClock, CalendarClock, FileSpreadsheet, HandCoins, Printer, Wallet } from "lucide-react";
import { EstadoError, formatearFecha, formatearMoneda } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { BotonesDocumento } from "@/componentes/botones-documento";
import { CuentasParaPagar, type CuentaParaPagar } from "@/componentes/cuentas-para-pagar";
import { HojaDocumento, type EmisorHoja } from "@/componentes/hoja-documento";
import { Volver } from "@/componentes/volver";
import { cuentasParaCobrar, emisorParaImprimir } from "@/lib/emisor";

import { FilaIndicadores } from "@/componentes/indicadores";

import {
  DIAS_DE_PAGOS,
  clientesConFacturas,
  estadosDeCuenta,
  leerEleccionCuenta,
  type EstadoDeCuenta,
} from "../api/estado-cuenta";
import {
  PERIODOS_CUENTA,
  plazoEnPapel,
  resumirCuenta,
  type PeriodoCuenta,
} from "../dominio/estado-cuenta";
import { ETIQUETA_MEDIO } from "../dominio/tipos";
import { SelectorEstadoCuenta } from "./selector-estado-cuenta";

/**
 * El estado de cuenta, en papel: de un cliente, de varios o de todos.
 *
 * Willy, 06/10 (10:20): *«hay clientes que a veces juntan 6, 7 facturas, y
 * hay que enviar el reporte de su estado de cuenta para que lo tengan
 * presente, para que hagan el pago»*. Y (10:58): *«todos los lunes envío
 * reporte de los morosos»*. Hasta hoy lo armaba en Excel.
 *
 * Desde el 03/11 (Luis: *«cuando entre, que decida si quiere de todos los
 * clientes o clientes específicos»*) se elige a quién: con varios, sale un
 * resumen al principio y la hoja de cada uno detrás, cada una en su página
 * al imprimir, que es como se manda a cada cliente la suya.
 *
 * Es la misma hoja que la cotización y la factura (`HojaDocumento`), con sus
 * cuentas de banco al pie: quien la recibe tiene en el mismo papel cuánto
 * debe, desde cuándo y dónde pagar. El PDF sale de «Descargar», como en los
 * demás documentos.
 */

export default async function PaginaEstadoDeCuenta({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) redirect("/login");

  const sp = await searchParams;
  // La dirección tal cual, para el Excel y para la vista de papel.
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "vista" || k === "auto") continue;
    for (const x of Array.isArray(v) ? v : v ? [v] : []) query.append(k, x);
  }
  const papel = sp.vista === "papel";
  const auto = sp.auto === "1";
  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());
  const eleccion = leerEleccionCuenta(query);
  const { modo, periodo } = eleccion;

  const [conFacturas, emisor, cuentas] = await Promise.all([
    clientesConFacturas(hoy),
    emisorParaImprimir(),
    cuentasParaCobrar(),
  ]);
  // Todos los clientes con facturas, no solo los que deben (03/11): el que
  // está al día también pide su estado de cuenta.
  const clientes = conFacturas.ok ? conFacturas.datos : [];
  const r = await estadosDeCuenta(eleccion, clientes, hoy);

  const selector = (
    <SelectorEstadoCuenta
      clientes={clientes}
      modoInicial={modo}
      clienteInicial={eleccion.clienteId}
      marcadosIniciales={eleccion.marcados}
      periodoInicial={periodo}
    />
  );

  const cabecera = (
    <div className="flex flex-wrap items-start justify-between gap-3 no-print">
      <div>
        <Volver href={papel ? `/cobranzas/estado-de-cuenta?${query.toString()}` : "/cobranzas"}>
          {papel ? "Volver al estado de cuenta" : "Volver a cobranzas"}
        </Volver>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Estado de cuenta</h1>
        <p className="text-base text-[var(--fg-muted)]">
          Lo que pagó y lo que debe cada cliente, factura por factura. Se descarga en Excel; si hay que
          mandárselo al cliente, también sale para imprimir o en PDF.
        </p>
      </div>
      {papel && r.ok && r.hojas.length > 0 ? <BotonesDocumento auto={auto} /> : null}
    </div>
  );

  if (!r.ok) {
    return (
      <div className="flex flex-col gap-4">
        {cabecera}
        {selector}
        <EstadoError titulo="No se pudo cargar el estado de cuenta" detalle={r.error} />
      </div>
    );
  }

  if (r.ids.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {cabecera}
        {selector}
      </div>
    );
  }

  if (r.hojas.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {cabecera}
        {selector}
        <p className="card p-4 text-base">
          {modo === "uno" ? "Ese cliente no existe." : "Ninguno de esos clientes tiene facturas en lo que elegiste."}
        </p>
      </div>
    );
  }

  const { hojas } = r;
  const unaSola = modo === "uno" ? hojas[0] : undefined;

  // La hoja para imprimir o guardar en PDF: lo de antes, a un clic.
  if (papel) {
    return (
      <div className="flex flex-col gap-4">
        {cabecera}
        {unaSola ? null : (
          <div className="overflow-x-auto rounded-md bg-white elev-2 print:overflow-visible print:rounded-none print:shadow-none">
            <HojaResumenClientes emisor={emisor} hoy={hoy} hojas={hojas} periodo={periodo} />
          </div>
        )}
        {hojas.map((datos, i) => (
          <div
            key={datos.cliente.id}
            className={`overflow-x-auto rounded-md bg-white elev-2 print:overflow-visible print:rounded-none print:shadow-none ${unaSola && i === 0 ? "" : "print:break-before-page"}`}
          >
            <HojaEstadoCuenta emisor={emisor} cuentas={cuentas} hoy={hoy} datos={datos} periodo={periodo} />
          </div>
        ))}
      </div>
    );
  }

  const sumas = hojas.map((h) => ({ h, s: resumirCuenta(h.documentos) }));
  const total = (f: (s: ReturnType<typeof resumirCuenta>) => number) =>
    Math.round(sumas.reduce((a, x) => a + f(x.s), 0) * 100) / 100;

  return (
    <div className="flex flex-col gap-4">
      {cabecera}
      {selector}

      {/* Lo que se vino a buscar, arriba y grande (03/11): el Excel. */}
      <section className="card flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">
              {unaSola ? unaSola.cliente.razonSocial : `${hojas.length} clientes`}
            </h2>
            <p className="text-base text-[var(--fg-muted)]">
              Al {formatearFecha(hoy)} · {PERIODOS_CUENTA[periodo]}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`/cobranzas/estado-de-cuenta/excel?${query.toString()}`}
              download
              className="inline-flex h-12 items-center gap-2 rounded-md bg-brand-600 px-5 text-base font-semibold text-white hover:bg-brand-700"
            >
              <FileSpreadsheet className="size-5" aria-hidden="true" />
              Descargar en Excel
            </a>
            <Link
              href={`/cobranzas/estado-de-cuenta?${query.toString()}&vista=papel`}
              className="inline-flex h-12 items-center gap-2 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-base font-semibold hover:bg-[var(--surface-2)]"
            >
              <Printer className="size-5" aria-hidden="true" />
              Para imprimir o mandar en PDF
            </Link>
          </div>
        </div>

        <FilaIndicadores
          items={[
            { etiqueta: "Total pendiente", valor: formatearMoneda(total((s) => s.total)), icono: <Wallet aria-hidden="true" /> },
            {
              etiqueta: "Vencido",
              valor: formatearMoneda(total((s) => s.vencido)),
              detalle: `${total((s) => s.documentosVencidos)} facturas`,
              tono: total((s) => s.vencido) > 0 ? "urgente" : "ok",
              icono: <AlarmClock aria-hidden="true" />,
            },
            {
              etiqueta: "Por vencer",
              valor: formatearMoneda(total((s) => s.porVencer)),
              icono: <CalendarClock aria-hidden="true" />,
            },
            {
              etiqueta: "Pagado",
              valor: formatearMoneda(total((s) => s.pagado)),
              detalle: periodo === "pendiente" ? "no se piden las pagadas" : `${total((s) => s.pagadas)} facturas pagadas`,
              tono: "ok",
              icono: <HandCoins aria-hidden="true" />,
            },
          ]}
        />

        {unaSola ? (
          <TablaFacturasPantalla documentos={unaSola.documentos} />
        ) : (
          <TablaClientesPantalla filas={sumas} query={query} />
        )}
      </section>

      {unaSola ? (
        <div className="flex flex-wrap gap-2 no-print">
          <Link
            href={`/cobranzas?cliente=${unaSola.cliente.id}`}
            className="inline-flex h-10 items-center rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm font-semibold hover:bg-[var(--surface-2)]"
          >
            Ver sus documentos en cobranzas
          </Link>
          <Link
            href={`/clientes/${unaSola.cliente.id}`}
            className="inline-flex h-10 items-center rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm font-semibold hover:bg-[var(--surface-2)]"
          >
            Ficha del cliente
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/** Las facturas de un cliente en pantalla: lo que se debe arriba, en rojo lo vencido. */
function TablaFacturasPantalla({ documentos }: { documentos: readonly EstadoDeCuenta["documentos"][number][] }) {
  if (documentos.length === 0) return <p className="text-base text-[var(--fg-muted)]">No tiene facturas en lo elegido.</p>;
  return (
    <div className="scroll-x">
      <table className="w-full text-base">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-sm uppercase tracking-wide text-[var(--fg-subtle)]">
            <th className="px-3 py-2 font-medium">Factura</th>
            <th className="px-3 py-2 font-medium">Emisión</th>
            <th className="px-3 py-2 font-medium">Vence</th>
            <th className="px-3 py-2 font-medium">Situación</th>
            <th className="px-3 py-2 text-right font-medium">Total</th>
            <th className="px-3 py-2 text-right font-medium">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {documentos.map((d) => {
            const pagada = !(d.saldo > 0);
            const vencida = !pagada && d.fecha_vencimiento !== null && d.dias_vencido > 0;
            const tono = vencida ? "font-bold text-[var(--danger)]" : pagada ? "text-[var(--fg-muted)]" : "";
            return (
              <tr key={d.id} className={`border-b border-[var(--border-soft)] ${vencida ? "bg-[var(--danger-bg)]" : ""}`}>
                <td className={`px-3 py-2 font-mono ${tono}`}>
                  <Link href={`/facturacion/${d.id}`} className="hover:underline">
                    {d.numero}
                  </Link>
                </td>
                <td className={`tabular px-3 py-2 ${tono}`}>{formatearFecha(d.fecha_emision)}</td>
                <td className={`tabular px-3 py-2 ${tono}`}>{d.fecha_vencimiento ? formatearFecha(d.fecha_vencimiento) : "—"}</td>
                <td className={`px-3 py-2 ${tono}`}>
                  {pagada ? (
                    <span className="font-semibold text-[var(--ok)]">Pagada</span>
                  ) : (
                    plazoEnPapel(d.dias_vencido, d.fecha_vencimiento)
                  )}
                </td>
                <td className={`tabular px-3 py-2 text-right ${tono}`}>{formatearMoneda(d.total_doc, d.moneda)}</td>
                <td className={`tabular px-3 py-2 text-right font-semibold ${tono}`}>
                  {pagada ? "—" : formatearMoneda(d.saldo_doc, d.moneda)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Varios clientes en pantalla: quién debe cuánto. Quien más debe, arriba. */
function TablaClientesPantalla({
  filas,
  query,
}: {
  filas: { h: EstadoDeCuenta; s: ReturnType<typeof resumirCuenta> }[];
  query: URLSearchParams;
}) {
  const orden = [...filas].sort((a, b) => b.s.total - a.s.total || a.h.cliente.razonSocial.localeCompare(b.h.cliente.razonSocial));
  const periodo = query.get("periodo");
  return (
    <div className="scroll-x">
      <table className="w-full text-base">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-sm uppercase tracking-wide text-[var(--fg-subtle)]">
            <th className="px-3 py-2 font-medium">Cliente</th>
            <th className="px-3 py-2 text-center font-medium">Pendientes</th>
            <th className="px-3 py-2 text-right font-medium">Vencido</th>
            <th className="px-3 py-2 text-right font-medium">Por vencer</th>
            <th className="px-3 py-2 text-right font-medium">Total pendiente</th>
            <th className="px-3 py-2 text-right font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {orden.map(({ h, s }) => (
            <tr key={h.cliente.id} className="border-b border-[var(--border-soft)]">
              <td className="px-3 py-2">
                <span className="block">{h.cliente.razonSocial}</span>
                <span className="block font-mono text-sm text-[var(--fg-subtle)]">{h.cliente.documento ?? ""}</span>
              </td>
              <td className="tabular px-3 py-2 text-center">{s.documentos}</td>
              <td className={`tabular px-3 py-2 text-right ${s.vencido > 0 ? "font-bold text-[var(--danger)]" : "text-[var(--fg-muted)]"}`}>
                {s.vencido > 0 ? formatearMoneda(s.vencido) : "—"}
                {s.mayorAtraso > 0 ? (
                  <span className="block whitespace-nowrap text-sm">
                    atraso: {s.mayorAtraso} {s.mayorAtraso === 1 ? "día" : "días"}
                  </span>
                ) : null}
              </td>
              <td className="tabular px-3 py-2 text-right">{s.porVencer > 0 ? formatearMoneda(s.porVencer) : "—"}</td>
              <td className="tabular px-3 py-2 text-right font-semibold">{formatearMoneda(s.total)}</td>
              <td className="px-3 py-2 text-right">
                <Link
                  href={`/cobranzas/estado-de-cuenta?cliente=${h.cliente.id}${periodo ? `&periodo=${periodo}` : ""}`}
                  className="inline-flex h-10 items-center whitespace-nowrap rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm font-semibold hover:bg-[var(--surface-2)]"
                >
                  Ver su detalle
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * El resumen de varios clientes, primera página (03/11): quién debe cuánto,
 * cuánto vencido y cuánto por vencer. Es el reporte de morosos de los lunes.
 */
function HojaResumenClientes({
  emisor,
  hoy,
  hojas,
  periodo,
}: {
  emisor: EmisorHoja;
  hoy: string;
  hojas: readonly EstadoDeCuenta[];
  periodo: PeriodoCuenta;
}) {
  const filas = hojas.map((h) => ({ h, r: resumirCuenta(h.documentos) }));
  const suma = (f: (r: ReturnType<typeof resumirCuenta>) => number) =>
    Math.round(filas.reduce((a, x) => a + f(x.r), 0) * 100) / 100;
  return (
    <HojaDocumento
      emisor={emisor}
      titulo="ESTADO DE CUENTA DE CLIENTES"
      numero={`al ${formatearFecha(hoy)}`}
      datos={[
        { etiqueta: "Clientes", valor: String(hojas.length) },
        { etiqueta: "Fecha de corte", valor: formatearFecha(hoy) },
        { etiqueta: "Qué facturas salen", valor: PERIODOS_CUENTA[periodo], ancho: true },
      ]}
      columnas={[
        { clave: "cliente", titulo: "Cliente" },
        { clave: "ruc", titulo: "RUC / DNI", sinCortar: true },
        { clave: "pendientes", titulo: "Pendientes", alinear: "centro", sinCortar: true },
        { clave: "vencido", titulo: "Vencido", alinear: "derecha", sinCortar: true },
        { clave: "porVencer", titulo: "Por vencer", alinear: "derecha", sinCortar: true },
        { clave: "total", titulo: "Total pendiente", alinear: "derecha", sinCortar: true },
      ]}
      filas={filas.map(({ h, r }) => ({
        cliente: h.cliente.razonSocial,
        ruc: h.cliente.documento ?? "—",
        pendientes: String(r.documentos),
        vencido:
          r.vencido > 0 ? <span className="font-bold text-[#b42318]">{formatearMoneda(r.vencido)}</span> : "—",
        porVencer: r.porVencer > 0 ? formatearMoneda(r.porVencer) : "—",
        total: <span className="font-semibold">{formatearMoneda(r.total)}</span>,
      }))}
      totales={[
        { etiqueta: "Por vencer", valor: formatearMoneda(suma((r) => r.porVencer)) },
        { etiqueta: "Vencido", valor: formatearMoneda(suma((r) => r.vencido)) },
        { etiqueta: "TOTAL PENDIENTE", valor: formatearMoneda(suma((r) => r.total)), destacado: true },
      ]}
    />
  );
}

/**
 * La hoja en sí, aparte de la página: se puede pintar con cualquier dato, y
 * así se revisó con facturas pendientes de muestra (06/10), porque la cartera
 * real está vacía —las facturas cargadas están todas cobradas—.
 */
export function HojaEstadoCuenta({
  emisor,
  cuentas,
  hoy,
  datos,
  periodo = "pendiente",
}: {
  emisor: EmisorHoja;
  cuentas: CuentaParaPagar[];
  hoy: string;
  datos: EstadoDeCuenta;
  periodo?: PeriodoCuenta;
}) {
  const { cliente, documentos, pagos } = datos;
  const r = resumirCuenta(documentos);
  return (
    <HojaDocumento
      emisor={emisor}
      titulo="ESTADO DE CUENTA"
      numero={`al ${formatearFecha(hoy)}`}
      datos={[
        { etiqueta: "Señores", valor: cliente.razonSocial, ancho: true },
        { etiqueta: "Dirección", valor: cliente.direccion ?? "—", ancho: true },
        { etiqueta: "RUC / DNI", valor: cliente.documento ?? "—" },
        { etiqueta: "Fecha de corte", valor: formatearFecha(hoy) },
        { etiqueta: "Pendientes", valor: `${r.documentos} ${r.documentos === 1 ? "documento" : "documentos"}` },
        ...(periodo === "pendiente"
          ? []
          : [{ etiqueta: "Pagadas", valor: `${r.pagadas} ${r.pagadas === 1 ? "factura" : "facturas"} · ${PERIODO_EN_PAPEL[periodo]}` }]),
        {
          etiqueta: "Vencidos",
          valor:
            r.documentosVencidos > 0
              ? `${r.documentosVencidos} · el más antiguo, ${r.mayorAtraso} ${r.mayorAtraso === 1 ? "día" : "días"} de atraso`
              : "ninguno",
        },
      ]}
      columnas={[
        { clave: "numero", titulo: "Comprobante", sinCortar: true },
        { clave: "oc", titulo: "Orden de compra" },
        { clave: "emision", titulo: "Emisión", alinear: "centro", sinCortar: true },
        { clave: "vence", titulo: "Vence", alinear: "centro", sinCortar: true },
        { clave: "plazo", titulo: "Situación", sinCortar: true },
        { clave: "total", titulo: "Total", alinear: "derecha", sinCortar: true },
        { clave: "pagado", titulo: "Pagado", alinear: "derecha", sinCortar: true },
        { clave: "saldo", titulo: "Saldo", alinear: "derecha", sinCortar: true },
      ]}
      filas={
        documentos.length === 0
          ? [{ numero: periodo === "pendiente" ? "No tiene documentos pendientes de pago." : "No tiene facturas en este periodo." }]
          : documentos.map((d) => {
              const pagada = !(d.saldo > 0);
              const vencido = !pagada && d.fecha_vencimiento !== null && d.dias_vencido > 0;
              return {
                numero: <span className="font-mono">{d.numero}</span>,
                oc: d.orden_compra_cliente ?? "",
                emision: formatearFecha(d.fecha_emision),
                vence: d.fecha_vencimiento ? formatearFecha(d.fecha_vencimiento) : "—",
                // En rojo y en negrita lo vencido: en el papel es lo que
                // el cliente tiene que ver primero.
                plazo: pagada ? (
                  <span className="font-semibold text-[#067647]">Pagada</span>
                ) : (
                  <span className={vencido ? "font-bold text-[#b42318]" : ""}>
                    {plazoEnPapel(d.dias_vencido, d.fecha_vencimiento)}
                  </span>
                ),
                // En la moneda de cada factura (116).
                total: formatearMoneda(d.total_doc, d.moneda),
                pagado: d.pagado_doc > 0 ? formatearMoneda(d.pagado_doc, d.moneda) : "—",
                saldo: pagada ? "—" : <span className="font-semibold">{formatearMoneda(d.saldo_doc, d.moneda)}</span>,
              };
            })
      }
      totales={[
        ...(periodo === "pendiente" ? [] : [{ etiqueta: "Pagado", valor: formatearMoneda(r.pagado) }]),
        { etiqueta: "Por vencer", valor: formatearMoneda(r.porVencer) },
        { etiqueta: "Vencido", valor: formatearMoneda(r.vencido) },
        { etiqueta: "TOTAL PENDIENTE", valor: formatearMoneda(r.total), destacado: true },
      ]}
      pie={
        <div className="flex flex-col gap-4">
          {/* Con alguna en soles (116), el total en dólares lo dice. */}
          {documentos.some((d) => d.moneda === "PEN") ? (
            <p className="text-sm text-[#111]">
              Los totales están en dólares: las facturas en soles suman a su tipo de cambio.
            </p>
          ) : null}
          {r.vencido > 0 ? (
            <p className="text-sm text-[#111]">
              Le agradeceremos regularizar el saldo vencido de{" "}
              <strong>{formatearMoneda(r.vencido)}</strong>. Si ya realizó el pago, por favor
              envíenos la constancia y no tome en cuenta este aviso.
            </p>
          ) : null}

          {pagos.length > 0 ? (
            <div>
              <p className="mb-1 font-semibold text-[#0E4C73]">
                {periodo === "pendiente"
                  ? `Pagos recibidos en los últimos ${DIAS_DE_PAGOS} días`
                  : `Pagos recibidos · ${PERIODO_EN_PAPEL[periodo]}`}
              </p>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-left">
                    <th className="border border-[#ccc] px-1.5 py-1">Fecha</th>
                    <th className="border border-[#ccc] px-1.5 py-1">Comprobante</th>
                    <th className="border border-[#ccc] px-1.5 py-1">Medio</th>
                    <th className="border border-[#ccc] px-1.5 py-1">Operación</th>
                    <th className="border border-[#ccc] px-1.5 py-1 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {pagos.map((p, i) => (
                    <tr key={i}>
                      <td className="border border-[#ccc] px-1.5 py-1">{formatearFecha(p.fecha)}</td>
                      <td className="border border-[#ccc] px-1.5 py-1 font-mono">{p.numero}</td>
                      <td className="border border-[#ccc] px-1.5 py-1">{ETIQUETA_MEDIO[p.medio] ?? p.medio}</td>
                      <td className="border border-[#ccc] px-1.5 py-1">{p.referencia ?? ""}</td>
                      <td className="border border-[#ccc] px-1.5 py-1 text-right tabular">{formatearMoneda(p.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <CuentasParaPagar cuentas={cuentas} />
        </div>
      }
    />
  );
}

/** Cómo se dice el periodo en el papel que recibe el cliente. */
const PERIODO_EN_PAPEL: Record<PeriodoCuenta, string> = {
  pendiente: "solo lo pendiente",
  "3m": "últimos 3 meses",
  "12m": "últimos 12 meses",
  todo: "todo el historial",
};
