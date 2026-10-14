import { CuentasParaPagar, type CuentaParaPagar } from "@/componentes/cuentas-para-pagar";
import { HojaDocumento, type EmisorHoja } from "@/componentes/hoja-documento";

import { ETIQUETA_TIPO, type ComprobanteDetalle } from "../dominio/tipos";
import { enMonedaDelDocumento, nombreMoneda, simboloDe } from "../dominio/moneda-documento";
import { COLUMNAS_COMPROBANTE, imprimeCuotas, precioConIgv, totalesDelPapel, cuotasDelPapel, datosDeComprobante, infoRetencion, referenciasDelPapel, tituloCuotas } from "./papel";

/**
 * La factura, la boleta y las notas, en papel.
 *
 * Hasta el 03/09 el botón «Imprimir» de un comprobante apuntaba a una ruta que
 * **no existía**: daba 404. Se descubrió recorriendo la cadena entera.
 *
 * Usa la misma hoja que la cotización porque Willy la vio y pidió que fuera el
 * formato de todo. Lo propio de un comprobante es lo de abajo: el título dice
 * qué documento es —una boleta no es una factura, y quien la recibe tiene que
 * verlo de un vistazo—, las notas dicen a qué documento corrigen, y el pie
 * lleva detracción, retención y la leyenda de que es un documento electrónico.
 */

const dinero = (n: number) =>
  n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fecha = (f: string) => {
  const [a, m, d] = f.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : f;
};

export function DocumentoComprobante({
  c: original,
  emisor,
  cuentas = [],
  qr = null,
}: {
  c: ComprobanteDetalle;
  emisor: EmisorHoja;
  /** El QR y el hash (15/10), armados en el servidor. Sin él, no sale. */
  qr?: { svg: string; hash: string | null } | null;
  /**
   * Las cuentas a las que se le paga (064).
   *
   * Aquí SÍ hay interruptor, y la cotización no lo tiene. Willy, 13:21:
   * *«al momento de elaborar la factura tiene un botón que se puede activar
   * o no, según tú desees, para que figure en la factura los números de
   * cuenta»* — *«a veces ocupa mucho espacio, a veces no es necesario»*.
   * Lo guarda `comprobantes.mostrar_cuenta` desde la 029.
   */
  cuentas?: readonly CuentaParaPagar[];
}) {
  // En soles, todo en soles (116): líneas, totales y cuotas.
  const c = enMonedaDelDocumento(original);
  const sim = simboloDe(c.moneda);

  return (
    <HojaDocumento
      emisor={emisor}
      // «Factura electrónica», no «Factura»: es lo que dice el documento que
      // SUNAT espera, y lo que distingue a este papel de uno preimpreso.
      titulo={`${ETIQUETA_TIPO[c.tipo]} electrónica${c.estado === "anulado" ? " · ANULADA, sin validez" : ""}`}
      numero={c.numero}
      datos={datosDeComprobante(c)}
      // Las mismas del PDF (papel.ts), con el precio unitario con IGV (15/10).
      columnas={COLUMNAS_COMPROBANTE}
      filas={c.lineas.map((l, i) => ({
        n: i + 1,
        codigo: <span className="font-medium">{l.codigo}</span>,
        marca: l.marca ?? "—",
        descripcion: l.descripcion,
        cantidad: <span className="tabular">{l.cantidad}</span>,
        unidad: l.unidad,
        valorUnitario: <span className="tabular">{dinero(l.valor_unitario)}</span>,
        precioUnitario: <span className="tabular">{precioConIgv(l.valor_unitario, l.descuento_pct)}</span>,
        importe: <span className="tabular">{dinero(l.importe)}</span>,
      }))}
      totales={totalesDelPapel(c)}
      enLetras={c.total_letras}
      pie={
        <>
          {/* La detracción cambia CUÁNTO cobra Rodatech y cuánto deposita el
              cliente en el Banco de la Nación. Va impreso porque es la
              instrucción de pago. */}
          {c.detraccion_aplica ? (
            <p className="mb-1">
              <strong>Detracción {c.detraccion_porcentaje}%:</strong> ${" "}
              {dinero(c.detraccion_monto)}
              {c.detraccion_codigo ? ` (código ${c.detraccion_codigo})` : ""}. El
              cliente paga {sim} {dinero(c.total - c.detraccion_monto)} y deposita el
              resto en la cuenta de detracciones.
            </p>
          ) : null}
          {/*
            En el orden de su F002-564 (Luis, 15/10: *«pero te pasé cómo lo
            tiene»*): debajo del importe en letras, los documentos de la venta,
            la retención y las observaciones a la izquierda; el hash y el QR a
            la derecha. Luego las cuotas, y abajo las cuentas.
          */}
          <div className="mb-2 flex break-inside-avoid flex-col gap-4 sm:flex-row sm:items-start sm:justify-between print:flex-row">
            <div className="min-w-0 flex-1 space-y-0.5">
              {referenciasDelPapel(c).map((r) => (
                <p key={r.etiqueta}>
                  <strong>{r.etiqueta}:</strong> {r.valor}
                </p>
              ))}
              {c.retencion_aplica ? (
                <>
                  <p className="pt-1">
                    <strong>Información de la retención:</strong>
                  </p>
                  {infoRetencion(c).map((l) => (
                    <p key={l}>{l}</p>
                  ))}
                </>
              ) : null}
              {c.observaciones ? (
                <>
                  <p className="pt-1">
                    <strong>OBSERVACIONES:</strong>
                  </p>
                  <p className="whitespace-pre-line">{c.observaciones}</p>
                </>
              ) : null}
            </div>
            {/* El QR y el hash, a la derecha, como su formato (15/10). */}
            {qr ? (
              <div className="flex shrink-0 flex-col items-start gap-1 sm:max-w-[16rem] sm:items-end print:max-w-[16rem] print:items-end">
                {qr.hash ? (
                  <p className="break-all text-[#333]">
                    <strong>Hash:</strong> {qr.hash}
                  </p>
                ) : null}
                <div className="size-28 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: qr.svg }} />
              </div>
            ) : null}
          </div>

          {imprimeCuotas(c) ? (
            <div className="mb-2 break-inside-avoid">
              <p className="mb-1 uppercase">{tituloCuotas(c)}:</p>
              <table className="w-full max-w-sm border-collapse border border-[#ccc]">
                <thead>
                  <tr className="bg-[#eee] text-left uppercase">
                    <th className="px-2 py-0.5 font-semibold">Cuota</th>
                    <th className="px-2 py-0.5 font-semibold">Fecha</th>
                    <th className="px-2 py-0.5 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {cuotasDelPapel(c).map((q) => (
                    <tr key={q.numero} className="border-t border-[#ccc]">
                      <td className="px-2 py-0.5 tabular">{q.numero}</td>
                      <td className="px-2 py-0.5 tabular">{fecha(q.fecha_vencimiento)}</td>
                      <td className="px-2 py-0.5 text-right tabular">
                        {c.moneda === "PEN" ? "S/" : "USD"} {dinero(q.monto)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <p className="mb-1">
            Los importes están expresados en <strong>{nombreMoneda(c.moneda)}</strong>.
          </p>
          {/* La leyenda que exige SUNAT para el documento impreso. */}
          <p className="mb-1">
            Representación impresa del comprobante electrónico. Consulte su validez
            en el portal de SUNAT.
          </p>

          {c.mostrar_cuenta ? (
            <CuentasParaPagar cuentas={cuentas} />
          ) : null}

          {/*
            El pie de la factura se queda VACÍO, y las dos cosas que había son
            pedido de Willy del 16/09 (50:07).

            «Atendido por» —el vendedor—: *«en la factura no debe aparecer el
            nombre del vendedor. Eso en la cotización, sí»*. Y tiene su lógica:
            la cotización es una conversación con una persona detrás, a la que
            se llama para negociar. La factura es un documento tributario que
            va a contabilidad del cliente, y ahí el nombre no sirve de nada.

            El correo: *«sale un correo debajo del número de cuentas… eso
            quítalo»*. Ya está en el membrete, arriba, junto al teléfono y la
            web. Repetirlo al pie era decirlo dos veces en el mismo papel.

            Se quita SOLO aquí: el documento de la cotización sigue llevando su
            vendedor, que es lo que él pidió el mismo día por la mañana.
          */}
        </>
      }
    />
  );
}
