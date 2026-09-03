import { HojaDocumento, type EmisorHoja } from "@/componentes/hoja-documento";

import { ETIQUETA_MODALIDAD, type GuiaDetalle } from "../dominio/tipos";

/**
 * La guía de remisión, en papel.
 *
 * Hasta el 03/09 el botón «Imprimir» apuntaba a una ruta que **no existía**:
 * daba 404. Y es el documento que MÁS se imprime de los cuatro, porque tiene
 * que viajar físicamente con la mercadería — un camión parado en un control
 * sin guía impresa es una multa.
 *
 * Misma hoja que la cotización y la factura. Lo propio de una guía es que
 * **no lleva dinero**: ni precios, ni totales, ni importe en letras. Lo que
 * lleva es de dónde sale, a dónde va, qué pesa y quién la conduce, que es lo
 * que mira quien la para en la carretera.
 */

const fecha = (f: string) => {
  const [a, m, d] = f.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : f;
};

export function DocumentoGuia({
  g,
  emisor,
}: {
  g: GuiaDetalle;
  emisor: EmisorHoja;
}) {
  const publico = g.modalidad_traslado === "01";

  return (
    <HojaDocumento
      emisor={emisor}
      titulo="Guía de remisión · Remitente"
      numero={g.numero}
      datos={[
        { etiqueta: "Destinatario", valor: g.cliente ?? "—" },
        { etiqueta: "Fecha de emisión", valor: fecha(g.fecha_emision) },
        { etiqueta: "RUC / DNI", valor: g.cliente_documento ?? "—" },
        { etiqueta: "Fecha de traslado", valor: fecha(g.fecha_traslado) },
        {
          etiqueta: "Motivo",
          valor: g.motivo_descripcion ?? `Código ${g.motivo_codigo}`,
        },
        { etiqueta: "Modalidad", valor: ETIQUETA_MODALIDAD[g.modalidad_traslado] },
        {
          etiqueta: "Punto de partida",
          valor: [g.direccion_partida, g.ubigeo_partida].filter(Boolean).join(" · ") || "—",
        },
        {
          etiqueta: "Punto de llegada",
          valor: [g.direccion_llegada, g.ubigeo_llegada].filter(Boolean).join(" · ") || "—",
        },
        {
          etiqueta: "Peso bruto",
          valor: `${g.peso_bruto_kg} ${g.unidad_peso}`,
        },
        {
          etiqueta: "Bultos",
          valor: String(g.numero_bultos),
        },
        g.cotizacion_numero
          ? { etiqueta: "Cotización", valor: g.cotizacion_numero }
          : null,
        g.orden_compra_cliente
          ? { etiqueta: "O/C del cliente", valor: g.orden_compra_cliente }
          : null,
      ]}
      columnas={[
        { clave: "n", titulo: "#", alinear: "centro" },
        { clave: "codigo", titulo: "Código" },
        { clave: "descripcion", titulo: "Descripción" },
        { clave: "cantidad", titulo: "Cant.", alinear: "derecha" },
        { clave: "unidad", titulo: "U.M.", alinear: "centro" },
        { clave: "peso", titulo: "Peso (kg)", alinear: "derecha" },
      ]}
      filas={g.lineas.map((l, i) => ({
        n: i + 1,
        codigo: <span className="font-medium">{l.codigo}</span>,
        descripcion: l.descripcion,
        cantidad: <span className="tabular">{l.cantidad}</span>,
        unidad: l.unidad,
        peso: <span className="tabular">{l.peso_kg > 0 ? l.peso_kg : "—"}</span>,
      }))}
      pie={
        <>
          {/* El transporte, impreso. En el público manda el transportista; en
              el privado, la placa y el conductor del vehículo propio. Es lo
              que se pide en un control de carretera. */}
          <div className="mb-2 grid grid-cols-1 gap-x-8 gap-y-0.5 sm:grid-cols-2 print:grid-cols-2">
            {publico ? (
              <>
                <p>
                  <strong>Transportista:</strong>{" "}
                  {g.transportista_razon_social ?? "—"}
                </p>
                <p>
                  <strong>RUC:</strong> {g.transportista_documento ?? "—"}
                </p>
              </>
            ) : null}
            <p>
              <strong>Placa:</strong> {g.transportista_placa ?? "—"}
            </p>
            <p>
              <strong>Conductor:</strong> {g.conductor_nombre ?? "—"}
            </p>
            <p>
              <strong>DNI:</strong> {g.conductor_documento ?? "—"}
            </p>
            <p>
              <strong>Licencia:</strong> {g.conductor_licencia ?? "—"}
            </p>
          </div>

          {g.observaciones ? (
            <p className="mb-1 whitespace-pre-line">{g.observaciones}</p>
          ) : null}

          {/* Las dos firmas. Van impresas con su línea porque se firman a
              mano, en el momento de la entrega, sobre este papel. */}
          <div className="mt-8 grid grid-cols-2 gap-8 break-inside-avoid">
            <div className="border-t border-[#666] pt-1 text-center">
              Entregado por{g.entregado_por ? `: ${g.entregado_por}` : ""}
            </div>
            <div className="border-t border-[#666] pt-1 text-center">
              Recibido por{g.recibido_por ? `: ${g.recibido_por}` : ""}
            </div>
          </div>
        </>
      }
    />
  );
}
