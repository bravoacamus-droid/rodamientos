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
        // «Inicio de traslado» y no «fecha de traslado». Willy, 40:34:
        // *«inicio de traslado, porque puede que lo prepare ahora, pero lo
        // llegue mañana»*. Es el día que sale la mercadería, no el día que se
        // escribió el papel — y son dos fechas distintas que estaban con el
        // mismo nombre.
        { etiqueta: "Inicio de traslado", valor: fecha(g.fecha_traslado) },
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
      /*
        Sin columna de peso por línea. Willy, 41:44, repasando el impreso:
        *«los pesos parciales, ahí sí está un problema: debería ser el peso
        total nomás. La columna peso en kilogramos que sale, no, eso está de
        más»*.

        Y tiene razón por dos motivos. El peso que importa en un control de
        carretera es el bruto, que ya va arriba; y el parcial casi nunca se
        sabe —de 790 productos, la mayoría no tiene peso en el catálogo—, así
        que la columna salía llena de rayas. Una columna que casi siempre dice
        «—» no informa, ocupa.
      */
      columnas={[
        { clave: "n", titulo: "#", alinear: "centro" },
        { clave: "codigo", titulo: "Código" },
        { clave: "descripcion", titulo: "Descripción" },
        { clave: "cantidad", titulo: "Cant.", alinear: "derecha" },
        { clave: "unidad", titulo: "U.M.", alinear: "centro" },
      ]}
      filas={g.lineas.map((l, i) => ({
        n: i + 1,
        codigo: <span className="font-medium">{l.codigo}</span>,
        descripcion: l.descripcion,
        cantidad: <span className="tabular">{l.cantidad}</span>,
        unidad: l.unidad,
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
            {/*
              A pie no se imprime placa ni licencia (062). Poner «Placa: —» en
              un traslado peatonal no informa de nada y deja al que lee el
              papel buscando un vehículo que no existe; decir que va a pie sí
              explica por qué no lo hay.
            */}
            {g.a_pie ? (
              <p>
                <strong>Traslado:</strong> a pie, sin vehículo
              </p>
            ) : (
              <p>
                <strong>Placa:</strong> {g.transportista_placa ?? "—"}
              </p>
            )}
            <p>
              <strong>{g.a_pie ? "Lo lleva" : "Conductor"}:</strong>{" "}
              {g.conductor_nombre ?? "—"}
            </p>
            <p>
              <strong>DNI:</strong> {g.conductor_documento ?? "—"}
            </p>
            {g.a_pie ? (
              g.conductor_telefono ? (
                <p>
                  <strong>Celular:</strong> {g.conductor_telefono}
                </p>
              ) : null
            ) : (
              <p>
                <strong>Licencia:</strong> {g.conductor_licencia ?? "—"}
              </p>
            )}
          </div>

          {g.observaciones ? (
            <p className="mb-1 whitespace-pre-line">{g.observaciones}</p>
          ) : null}

          {/*
            Un solo espacio para el sello, sin «entregado por» ni «recibido
            por».

            Willy, 42:50: *«esto aquí, entregado y recibido… mi formato no
            tiene eso; ellos le ponen una firma y un sello donde quieran»*.

            Y encaja con por qué la guía va ANTES que la factura (33:00):
            *«los productos están sujetos a revisión. Yo lo llevo con guía, y
            si todo está conforme me ponen un sello y firma de almacén, y con
            la guía sellada recién puedo facturar»*. Lo que hace falta es sitio
            en blanco para ese sello, no dos rótulos diciéndole al almacén del
            cliente dónde firmar.
          */}
          <div className="mt-10 break-inside-avoid">
            <div className="ml-auto w-1/2 border-t border-[#666] pt-1 text-center">
              Sello y firma de recepción
            </div>
          </div>
        </>
      }
    />
  );
}
