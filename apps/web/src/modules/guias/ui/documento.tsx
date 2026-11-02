import { HojaDocumento, type EmisorHoja } from "@/componentes/hoja-documento";

import type { GuiaDetalle } from "../dominio/tipos";
import { bloquesDeGuia, transporteDeGuia } from "./papel";

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

export function DocumentoGuia({
  g,
  emisor,
}: {
  g: GuiaDetalle;
  emisor: EmisorHoja;
}) {

  return (
    <HojaDocumento
      emisor={emisor}
      titulo={g.estado === "borrador" ? "Guía de remisión · BORRADOR, sin validez" : "Guía de remisión electrónica remitente"}
      numero={g.numero}
      bloques={bloquesDeGuia(g)}
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
      antesDeLineas={
        <>
        {/*
          El transporte, impreso, en su recuadro «DATOS DEL TRANSPORTE»
          (02/11), como el formato de SIMPLE que usaba Willy. En el público
          manda el transportista; en el privado, la placa y el conductor; si
          es peatonal, quién la lleva (062). Es lo que se pide en un control
          de carretera. Va ARRIBA de los productos (Willy, 02/11). La lista sale de `transporteDeGuia`, la misma del PDF.
        */}
        <div className="break-inside-avoid border border-[#999]">
          <p className="border-b border-[#999] bg-[#eceff3] px-2 py-0.5 font-semibold uppercase">
            Datos del transporte
          </p>
          <div className="grid grid-cols-1 gap-x-8 gap-y-0.5 px-2 py-1.5 sm:grid-cols-2 print:grid-cols-2">
            {transporteDeGuia(g).map((c) => (
              <p key={c.etiqueta}>
                <strong>{c.etiqueta}:</strong> {c.valor}
              </p>
            ))}
          </div>
        </div>
        </>
      }
      pie={
        <>
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
