import { CuentasParaPagar, type CuentaParaPagar } from "@/componentes/cuentas-para-pagar";
import { HojaDocumento, type EmisorHoja } from "@/componentes/hoja-documento";

import { ETIQUETA_TIPO, type ComprobanteDetalle } from "../dominio/tipos";

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
  c,
  emisor,
  cuentas = [],
}: {
  c: ComprobanteDetalle;
  emisor: EmisorHoja;
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
  const esNota = c.tipo === "nota_credito" || c.tipo === "nota_debito";
  const alCredito = c.condicion_pago === "credito";
  // Un descuento en cero no merece una fila: en un documento fiscal, cada
  // línea de más es una pregunta de más de quien lo revisa.
  const hayDescuento = c.descuento_global > 0;

  return (
    <HojaDocumento
      emisor={emisor}
      // «Factura electrónica», no «Factura»: es lo que dice el documento que
      // SUNAT espera, y lo que distingue a este papel de uno preimpreso.
      titulo={`${ETIQUETA_TIPO[c.tipo]} electrónica`}
      numero={c.numero}
      datos={[
        { etiqueta: "Señores", valor: c.cliente ?? "—" },
        { etiqueta: "Fecha de emisión", valor: fecha(c.fecha_emision) },
        {
          etiqueta: c.cliente_tipo_documento ?? "Doc.",
          valor: c.cliente_documento ?? "—",
        },
        {
          etiqueta: "Condición",
          valor: alCredito ? `Crédito a ${c.dias_credito} días` : "Contado",
        },
        c.cliente_direccion
          ? { etiqueta: "Dirección", valor: c.cliente_direccion }
          : null,
        alCredito && c.fecha_vencimiento
          ? { etiqueta: "Vence", valor: fecha(c.fecha_vencimiento) }
          : null,
        // Una nota sin decir qué corrige no sirve de nada: es el dato por el
        // que se busca, tanto en el ERP como en la contabilidad del cliente.
        esNota && c.referencia_numero
          ? { etiqueta: "Modifica a", valor: c.referencia_numero }
          : null,
        c.orden_compra_cliente
          ? { etiqueta: "O/C del cliente", valor: c.orden_compra_cliente }
          : null,
        c.cotizacion_numero
          ? { etiqueta: "Cotización", valor: c.cotizacion_numero }
          : null,
        // Con qué guía salió la mercadería. Su formato la imprime, y es la
        // que ata el papel que firmó el almacén del cliente con la factura
        // que tiene que pagar: la guía sellada es lo que autoriza a facturar.
        c.guia_numero
          ? { etiqueta: "Guía de remisión", valor: c.guia_numero }
          : null,
      ]}
      columnas={[
        { clave: "n", titulo: "#", alinear: "centro" },
        { clave: "codigo", titulo: "Código" },
        // La marca aparte, como en la cotización. Willy, 11:07: *«junta la
        // descripción con la marca, y no debe estar así: una columna para la
        // descripción y una columna para la marca»*. Su factura las lleva
        // pegadas —«RODAMIENTO CONICO MM__SKF»— y por eso no se copia.
        { clave: "marca", titulo: "Marca" },
        { clave: "descripcion", titulo: "Descripción" },
        { clave: "cantidad", titulo: "Cant.", alinear: "derecha" },
        { clave: "unidad", titulo: "U.M.", alinear: "centro" },
        { clave: "valorUnitario", titulo: "Valor unit.", alinear: "derecha" },
        { clave: "importe", titulo: "Importe", alinear: "derecha" },
      ]}
      filas={c.lineas.map((l, i) => ({
        n: i + 1,
        codigo: <span className="font-medium">{l.codigo}</span>,
        marca: l.marca ?? "—",
        descripcion: l.descripcion,
        cantidad: <span className="tabular">{l.cantidad}</span>,
        unidad: l.unidad,
        valorUnitario: <span className="tabular">{dinero(l.valor_unitario)}</span>,
        importe: <span className="tabular">{dinero(l.importe)}</span>,
      }))}
      totales={[
        { etiqueta: "Op. gravada", valor: `$ ${dinero(c.op_gravada)}` },
        ...(c.op_exonerada > 0
          ? [{ etiqueta: "Op. exonerada", valor: `$ ${dinero(c.op_exonerada)}` }]
          : []),
        ...(c.op_inafecta > 0
          ? [{ etiqueta: "Op. inafecta", valor: `$ ${dinero(c.op_inafecta)}` }]
          : []),
        ...(hayDescuento
          ? [{ etiqueta: "Descuento", valor: `$ − ${dinero(c.descuento_global)}` }]
          : []),
        { etiqueta: "IGV (18%)", valor: `$ ${dinero(c.igv)}` },
        { etiqueta: "Total", valor: `$ ${dinero(c.total)}`, destacado: true },
      ]}
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
              cliente paga $ {dinero(c.total - c.detraccion_monto)} y deposita el
              resto en la cuenta de detracciones.
            </p>
          ) : null}
          {c.retencion_aplica ? (
            <p className="mb-1">
              <strong>Retención:</strong> $ {dinero(c.retencion_monto)}. Sujeto al
              régimen de retenciones del IGV.
            </p>
          ) : null}
          {c.observaciones ? (
            <p className="mb-1 whitespace-pre-line">{c.observaciones}</p>
          ) : null}
          <p className="mb-1">
            Los importes están expresados en <strong>dólares americanos</strong>.
          </p>
          {/* La leyenda que exige SUNAT para el documento impreso. */}
          <p className="mb-1">
            Representación impresa del comprobante electrónico. Consulte su validez
            en el portal de SUNAT.
          </p>
          {/*
            Cuándo vence cada parte de lo que debe.

            El formato de Willy la lleva —«DETALLE CUOTAS PAGO PENDIENTE»— y
            nosotros guardábamos las cuotas en `comprobante_cuotas` desde el
            principio sin imprimirlas nunca. El cliente veía «Crédito a 30
            días» y ninguna fecha.

            Solo si hay MÁS DE UNA. Con una sola cuota, la tabla repite el
            vencimiento y el total que ya están arriba, y en un documento
            fiscal cada línea de más es una pregunta de más de quien lo revisa.
          */}
          {c.cuotas.length > 1 ? (
            <div className="mb-2 break-inside-avoid">
              <p className="mb-1 font-semibold">Cuotas</p>
              <table className="w-full max-w-xs">
                <thead>
                  <tr className="border-b border-[#ccc] text-left">
                    <th className="py-0.5 font-medium">Cuota</th>
                    <th className="py-0.5 font-medium">Vence</th>
                    <th className="py-0.5 text-right font-medium">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {c.cuotas.map((q) => (
                    <tr key={q.numero}>
                      <td className="py-0.5 tabular">{q.numero}</td>
                      <td className="py-0.5 tabular">{fecha(q.fecha_vencimiento)}</td>
                      <td className="py-0.5 text-right tabular">
                        $ {dinero(q.monto)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {c.mostrar_cuenta ? (
            <CuentasParaPagar cuentas={cuentas} moneda={c.moneda} />
          ) : null}

          <div className="mt-3 flex items-end justify-between">
            <span>{c.vendedor ? `Atendido por ${c.vendedor}` : ""}</span>
            {emisor.email ? <span>{emisor.email}</span> : null}
          </div>
        </>
      }
    />
  );
}
