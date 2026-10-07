import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { EstadoError, formatearFecha, formatearMoneda } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { BotonesDocumento } from "@/componentes/botones-documento";
import { ComboboxEnFormulario } from "@/componentes/combobox-en-formulario";
import { CuentasParaPagar, type CuentaParaPagar } from "@/componentes/cuentas-para-pagar";
import { HojaDocumento, type EmisorHoja } from "@/componentes/hoja-documento";
import { Volver } from "@/componentes/volver";
import { cuentasParaCobrar, emisorParaImprimir } from "@/lib/emisor";

import { carteraPorCliente } from "../api/consultas";
import { DIAS_DE_PAGOS, estadoDeCuenta, type EstadoDeCuenta } from "../api/estado-cuenta";
import { plazoEnPapel, resumirCuenta } from "../dominio/estado-cuenta";
import { ETIQUETA_MEDIO } from "../dominio/tipos";

/**
 * El estado de cuenta de un cliente, en papel.
 *
 * Willy, 06/10 (10:20): *«hay clientes que a veces juntan 6, 7 facturas, y
 * hay que enviar el reporte de su estado de cuenta para que lo tengan
 * presente, para que hagan el pago»*. Y (10:58): *«todos los lunes envío
 * reporte de los morosos»*. Hasta hoy lo armaba en Excel.
 *
 * Es la misma hoja que la cotización y la factura (`HojaDocumento`), con sus
 * cuentas de banco al pie: quien la recibe tiene en el mismo papel cuánto
 * debe, desde cuándo y dónde pagar. El PDF sale de «Descargar», como en los
 * demás documentos.
 *
 * El cliente va en `?cliente=` y no en la ruta, para que el selector de
 * arriba sea un formulario normal: se elige y se pulsa, sin JavaScript.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PaginaEstadoDeCuenta({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) redirect("/login");

  const sp = await searchParams;
  const valor = Array.isArray(sp.cliente) ? sp.cliente[0] : sp.cliente;
  const clienteId = valor && UUID.test(valor) ? valor : null;
  const auto = (Array.isArray(sp.auto) ? sp.auto[0] : sp.auto) === "1";
  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());

  const [conDeuda, estado, emisor, cuentas] = await Promise.all([
    carteraPorCliente(),
    clienteId ? estadoDeCuenta(clienteId, hoy) : Promise.resolve(null),
    emisorParaImprimir(),
    cuentasParaCobrar(),
  ]);

  const deudores = conDeuda.ok ? conDeuda.datos : [];

  const selector = (
    <form
      method="get"
      action="/cobranzas/estado-de-cuenta"
      className="card flex flex-col gap-3 p-4 no-print sm:flex-row sm:items-end"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label htmlFor="ec-cliente" className="text-sm font-medium text-[var(--fg-muted)]">
          Cliente
        </label>
        {/* Con buscador (07/10): se escribe el nombre o el RUC. Lo que debe
            va debajo del nombre, para elegir sin abrir la cuenta. */}
        <ComboboxEnFormulario
          id="ec-cliente"
          name="cliente"
          valorInicial={clienteId ?? null}
          opciones={deudores.map((c) => ({
            valor: c.cliente_id,
            etiqueta: c.cliente,
            detalle: `debe ${formatearMoneda(c.saldo)}${c.vencido > 0 ? ` · vencido ${formatearMoneda(c.vencido)}` : ""}`,
          }))}
          placeholder={deudores.length > 0 ? "Elige un cliente con saldo pendiente" : "Ningún cliente debe nada ahora mismo"}
          placeholderBusqueda="Escribe parte del nombre…"
          textoVacio="Ningún cliente con deuda coincide."
        />
      </div>
      <button
        type="submit"
        className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-brand-600 px-4 text-base font-semibold text-white hover:bg-brand-700"
      >
        Ver estado de cuenta
        <ArrowRight className="size-5" aria-hidden="true" />
      </button>
    </form>
  );

  const cabecera = (
    <div className="flex flex-wrap items-start justify-between gap-3 no-print">
      <div>
        <Volver href="/cobranzas">Volver a cobranzas</Volver>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Estado de cuenta</h1>
        <p className="text-base text-[var(--fg-muted)]">
          Lo que debe un cliente, factura por factura, listo para imprimir o mandar en PDF.
        </p>
      </div>
      {estado?.ok && estado.datos ? <BotonesDocumento auto={auto} /> : null}
    </div>
  );

  if (!clienteId) {
    return (
      <div className="flex flex-col gap-4">
        {cabecera}
        {selector}
      </div>
    );
  }

  if (!estado || !estado.ok) {
    return (
      <div className="flex flex-col gap-4">
        {cabecera}
        {selector}
        <EstadoError
          titulo="No se pudo cargar el estado de cuenta"
          detalle={estado && !estado.ok ? estado.error : undefined}
        />
      </div>
    );
  }

  if (!estado.datos) {
    return (
      <div className="flex flex-col gap-4">
        {cabecera}
        {selector}
        <p className="card p-4 text-base">Ese cliente no existe.</p>
      </div>
    );
  }

  const { cliente } = estado.datos;
  const enDeuda = deudores.some((d) => d.cliente_id === cliente.id);

  return (
    <div className="flex flex-col gap-4">
      {cabecera}
      {/* Si el cliente no está en la lista (no debe nada), el selector lo
          perdería de vista: se queda la hoja, que es lo que se pidió. */}
      {enDeuda || deudores.length > 0 ? selector : null}

      <div className="flex flex-wrap gap-2 no-print">
        <Link
          href={`/cobranzas?cliente=${cliente.id}`}
          className="inline-flex h-10 items-center rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm font-semibold hover:bg-[var(--surface-2)]"
        >
          Ver sus documentos en cobranzas
        </Link>
        <Link
          href={`/clientes/${cliente.id}`}
          className="inline-flex h-10 items-center rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm font-semibold hover:bg-[var(--surface-2)]"
        >
          Ficha del cliente
        </Link>
      </div>

      <div className="overflow-x-auto rounded-md bg-white elev-2 print:overflow-visible print:rounded-none print:shadow-none">
        <HojaEstadoCuenta emisor={emisor} cuentas={cuentas} hoy={hoy} datos={estado.datos} />
      </div>
    </div>
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
}: {
  emisor: EmisorHoja;
  cuentas: CuentaParaPagar[];
  hoy: string;
  datos: EstadoDeCuenta;
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
          ? [{ numero: "No tiene documentos pendientes de pago." }]
          : documentos.map((d) => {
              const vencido = d.fecha_vencimiento !== null && d.dias_vencido > 0;
              return {
                numero: <span className="font-mono">{d.numero}</span>,
                oc: d.orden_compra_cliente ?? "",
                emision: formatearFecha(d.fecha_emision),
                vence: d.fecha_vencimiento ? formatearFecha(d.fecha_vencimiento) : "—",
                // En rojo y en negrita lo vencido: en el papel es lo que
                // el cliente tiene que ver primero.
                plazo: (
                  <span className={vencido ? "font-bold text-[#b42318]" : ""}>
                    {plazoEnPapel(d.dias_vencido, d.fecha_vencimiento)}
                  </span>
                ),
                total: formatearMoneda(d.total),
                pagado: d.pagado > 0 ? formatearMoneda(d.pagado) : "—",
                saldo: <span className="font-semibold">{formatearMoneda(d.saldo)}</span>,
              };
            })
      }
      totales={[
        { etiqueta: "Por vencer", valor: formatearMoneda(r.porVencer) },
        { etiqueta: "Vencido", valor: formatearMoneda(r.vencido) },
        { etiqueta: "TOTAL PENDIENTE", valor: formatearMoneda(r.total), destacado: true },
      ]}
      pie={
        <div className="flex flex-col gap-4">
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
                Pagos recibidos en los últimos {DIAS_DE_PAGOS} días
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
