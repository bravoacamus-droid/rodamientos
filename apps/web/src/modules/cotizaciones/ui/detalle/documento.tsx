import type { CotizacionImpresa } from "../../dominio/impresion";
import { formatoFecha } from "../../dominio/whatsapp";

/**
 * La cotización, en papel.
 *
 * Server Component sin nada de JavaScript: es un documento, no una aplicación.
 * El PDF sale por «Imprimir → Guardar como PDF» del navegador, que compone
 * mejor que cualquier librería que metiéramos en el bundle y respeta el tamaño
 * de hoja que el usuario tenga configurado.
 *
 * Las clases `print:` de Tailwind son las que hacen que al imprimir
 * desaparezca todo lo que no es el documento.
 */

const dinero = (n: number) =>
  n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function Documento({ c }: { c: CotizacionImpresa }) {
  return (
    <article className="mx-auto w-full max-w-[210mm] bg-white p-4 text-[#111] sm:p-8 print:max-w-none print:p-0 print:text-xs">
      {/* ------------------------------------------------------ Cabecera */}
      <header className="flex flex-col items-start justify-between gap-4 border-b-2 border-[#0E4C73] pb-4 sm:flex-row sm:gap-6 print:flex-row">
        <div className="flex items-start gap-4">
          {c.emisor.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.emisor.logoUrl} alt="" className="h-16 w-auto object-contain" />
          ) : null}
          <div>
            <h1 className="text-lg font-bold text-[#0E4C73]">
              {c.emisor.nombreComercial ?? c.emisor.razonSocial}
            </h1>
            <p className="text-xs text-[#444]">{c.emisor.razonSocial}</p>
            <p className="text-xs text-[#444]">RUC {c.emisor.ruc}</p>
            {c.emisor.direccion ? (
              <p className="text-xs text-[#444]">{c.emisor.direccion}</p>
            ) : null}
            <p className="text-xs text-[#444]">
              {[c.emisor.telefono, c.emisor.email, c.emisor.web]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>

        <div className="shrink-0 rounded border-2 border-[#0E4C73] px-5 py-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#0E4C73]">
            Cotización
          </p>
          <p className="text-base font-bold tabular">{c.numero}</p>
        </div>
      </header>

      {/* -------------------------------------------------------- Cliente */}
      <section className="mt-4 grid grid-cols-1 gap-x-8 gap-y-1 text-xs sm:grid-cols-2 print:grid-cols-2">
        <Dato etiqueta="Señores" valor={c.cliente.razonSocial} />
        <Dato etiqueta="Fecha" valor={formatoFecha(c.fecha)} />
        <Dato
          etiqueta={c.cliente.tipoDocumento ?? "Doc."}
          valor={c.cliente.documento ?? "—"}
        />
        <Dato
          etiqueta="Válida hasta"
          valor={`${formatoFecha(c.validaHasta)} (${c.validezDias} días)`}
        />
        {c.cliente.direccion ? (
          <Dato etiqueta="Dirección" valor={c.cliente.direccion} />
        ) : (
          <span />
        )}
        <Dato etiqueta="Entrega" valor={c.tiempoEntrega ?? "Por confirmar"} />
        <Dato etiqueta="Atención" valor={c.cliente.contacto ?? "—"} />
        {c.ordenCompraCliente ? (
          <Dato etiqueta="O/C del cliente" valor={c.ordenCompraCliente} />
        ) : (
          <span />
        )}
      </section>

      {/* --------------------------------------------------------- Líneas */}
      {/* C4: este orden exacto de columnas. C1: NO hay precio con IGV. */}
      <div className="mt-4 -mx-4 overflow-x-auto px-4 sm:-mx-8 sm:px-8 print:mx-0 print:overflow-visible print:px-0">
      <table className="w-full min-w-[38rem] border-collapse text-xs print:min-w-0">
        <thead>
          <tr className="bg-[#0E4C73] text-white">
            <th className="border border-[#0E4C73] px-1.5 py-1.5 text-center">#</th>
            <th className="border border-[#0E4C73] px-1.5 py-1.5 text-left">Código</th>
            <th className="border border-[#0E4C73] px-1.5 py-1.5 text-left">Marca</th>
            <th className="border border-[#0E4C73] px-1.5 py-1.5 text-left">
              Descripción
            </th>
            <th className="border border-[#0E4C73] px-1.5 py-1.5 text-right">Cant.</th>
            <th className="border border-[#0E4C73] px-1.5 py-1.5 text-center">U.M.</th>
            {/* C7 (01/09): cierra el bloque de «qué y cuándo» antes de empezar
                el de «cuánto». Solo si hay algo que no sea inmediato. */}
            {c.mostrarDisponibilidad ? (
              <th className="border border-[#0E4C73] px-1.5 py-1.5 text-left">
                Entrega
              </th>
            ) : null}
            <th className="border border-[#0E4C73] px-1.5 py-1.5 text-right">
              Valor unit.
            </th>
            {c.mostrarDescuento ? (
              <th className="border border-[#0E4C73] px-1.5 py-1.5 text-right">
                Dscto.
              </th>
            ) : null}
            <th className="border border-[#0E4C73] px-1.5 py-1.5 text-right">
              Importe
            </th>
          </tr>
        </thead>
        <tbody>
          {c.lineas.map((l) => (
            <tr key={l.n} className="break-inside-avoid">
              <td className="border border-[#ccc] px-1.5 py-1 text-center tabular">
                {l.n}
              </td>
              <td className="border border-[#ccc] px-1.5 py-1 font-medium">
                {l.codigo}
              </td>
              <td className="border border-[#ccc] px-1.5 py-1">{l.marca}</td>
              <td className="border border-[#ccc] px-1.5 py-1">{l.descripcion}</td>
              <td className="border border-[#ccc] px-1.5 py-1 text-right tabular">
                {l.cantidad}
              </td>
              <td className="border border-[#ccc] px-1.5 py-1 text-center">
                {l.unidad}
              </td>
              {c.mostrarDisponibilidad ? (
                <td className="border border-[#ccc] px-1.5 py-1 whitespace-nowrap">
                  {l.entrega}
                </td>
              ) : null}
              <td className="border border-[#ccc] px-1.5 py-1 text-right tabular">
                {dinero(l.valorUnitario)}
              </td>
              {c.mostrarDescuento ? (
                <td className="border border-[#ccc] px-1.5 py-1 text-right tabular">
                  {l.descuentoPct > 0 ? `${l.descuentoPct}%` : "—"}
                </td>
              ) : null}
              <td className="border border-[#ccc] px-1.5 py-1 text-right tabular">
                {dinero(l.importe)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {/* -------------------------------------------------------- Totales */}
      <section className="mt-3 flex justify-end break-inside-avoid">
        <table className="text-xs">
          <tbody>
            <Total etiqueta="Valor de venta" valor={dinero(c.subtotal)} simbolo={c.simbolo} />
            {c.mostrarDescuento && c.descuento > 0 ? (
              <Total
                etiqueta="Descuento"
                valor={`− ${dinero(c.descuento)}`}
                simbolo={c.simbolo}
              />
            ) : null}
            <Total
              etiqueta={`IGV (${(c.tasaIgv * 100).toFixed(0)}%)`}
              valor={dinero(c.igv)}
              simbolo={c.simbolo}
            />
            <Total
              etiqueta="Total"
              valor={dinero(c.total)}
              simbolo={c.simbolo}
              destacado
            />
          </tbody>
        </table>
      </section>

      <p className="mt-2 text-right text-xs uppercase text-[#444]">
        Son: {c.enLetras}
      </p>

      {/* ------------------------------------------------------- Al pie */}
      <footer className="mt-6 break-inside-avoid border-t border-[#ccc] pt-3 text-xs text-[#444]">
        {c.condiciones ? (
          <p className="mb-1">
            <strong>Condiciones:</strong> {c.condiciones}
          </p>
        ) : null}
        {c.observaciones ? (
          <p className="mb-1 whitespace-pre-line">{c.observaciones}</p>
        ) : null}
        <p className="mb-1">
          Los precios están expresados en <strong>dólares americanos</strong> y
          no incluyen IGV en la columna de valor unitario.
        </p>
        <div className="mt-3 flex items-end justify-between">
          <span>
            {c.vendedor ? `Atendido por ${c.vendedor}` : ""}
          </span>
          {c.emisor.email ? <span>{c.emisor.email}</span> : null}
        </div>
      </footer>
    </article>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <p className="flex gap-2">
      <span className="w-28 shrink-0 font-semibold text-[#0E4C73]">{etiqueta}</span>
      <span className="min-w-0 flex-1">{valor}</span>
    </p>
  );
}

function Total({
  etiqueta,
  valor,
  simbolo,
  destacado = false,
}: {
  etiqueta: string;
  valor: string;
  simbolo: string;
  destacado?: boolean;
}) {
  return (
    <tr className={destacado ? "bg-[#0E4C73] text-white" : ""}>
      <td
        className={`border border-[#ccc] px-3 py-1 text-right ${
          destacado ? "font-bold" : ""
        }`}
      >
        {etiqueta}
      </td>
      <td
        className={`border border-[#ccc] px-3 py-1 text-right tabular ${
          destacado ? "font-bold" : ""
        }`}
      >
        {simbolo} {valor}
      </td>
    </tr>
  );
}
