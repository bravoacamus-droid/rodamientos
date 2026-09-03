import type { ReactNode } from "react";

/**
 * La hoja en la que salen TODOS los documentos que se imprimen.
 *
 * Willy vio la cotización en papel el 03/09 y dijo que así la quería: *«le
 * gustó cómo quedó, así que podemos replicar para todo — pedidos, cotización,
 * boletas, facturas»*. Esto es ese formato, sacado de la cotización y hecho
 * uno solo.
 *
 * ---------------------------------------------------------------------------
 * Por qué un componente y no cuatro copias
 * ---------------------------------------------------------------------------
 * Porque cuatro copias se separan. Este proyecto ya lo vivió dos veces en dos
 * días: la regla de a quién va dirigido un documento estaba duplicada y una de
 * las copias no se enteró de que la 035 movía los contactos de sitio; y el
 * tope de lo confirmado se arregló en la factura (047) y no en la guía, que
 * siguió despachando de más tres semanas.
 *
 * Un cambio de formato —el logo, el color, una columna— se hace aquí y sale en
 * los cuatro documentos el mismo día.
 *
 * ---------------------------------------------------------------------------
 * Es un Server Component, sin una línea de JavaScript
 * ---------------------------------------------------------------------------
 * Es un documento, no una aplicación. El PDF sale por «Imprimir → Guardar como
 * PDF» del navegador, que compone mejor que cualquier librería que metiéramos
 * en el bundle y respeta el tamaño de hoja que la persona tenga puesto.
 *
 * Lo que hace que en el papel quede solo la hoja está en tres sitios y
 * conviene saberlo: `@page` y el bloque `@media print` de `tokens.css` ponen
 * el margen, fuerzan los fondos de color y repiten la cabecera de la tabla en
 * cada hoja; el layout del ERP lleva `print:hidden` en su barra y su menú; y
 * lo que sea de pantalla dentro de una página lleva `no-print`.
 */

/** El azul de Rodatech. Va literal porque en papel no hay tema oscuro. */
const AZUL = "#0E4C73";

export interface EmisorHoja {
  razonSocial: string;
  nombreComercial: string | null;
  ruc: string;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  web: string | null;
  logoUrl: string | null;
}

export interface ColumnaHoja {
  clave: string;
  titulo: string;
  alinear?: "izquierda" | "centro" | "derecha";
  /** `whitespace-nowrap` para las que no deben partirse, como un plazo. */
  sinCortar?: boolean;
}

export interface TotalHoja {
  etiqueta: string;
  valor: string;
  destacado?: boolean;
}

const ALINEACION = {
  izquierda: "text-left",
  centro: "text-center",
  derecha: "text-right",
} as const;

export function HojaDocumento({
  emisor,
  titulo,
  numero,
  datos,
  columnas,
  filas,
  totales,
  enLetras,
  pie,
}: {
  emisor: EmisorHoja;
  /** «COTIZACIÓN», «FACTURA ELECTRÓNICA», «GUÍA DE REMISIÓN»… */
  titulo: string;
  numero: string;
  /** Los pares del bloque de arriba. Un `null` deja el hueco y mantiene las
   *  dos columnas alineadas, que es para lo que existe. */
  datos: ({ etiqueta: string; valor: string } | null)[];
  columnas: ColumnaHoja[];
  /** Una fila es un valor por clave de columna. */
  filas: Record<string, ReactNode>[];
  totales?: TotalHoja[];
  enLetras?: string | null;
  pie?: ReactNode;
}) {
  return (
    <article className="mx-auto w-full max-w-[210mm] bg-white p-4 text-[#111] sm:p-8 print:max-w-none print:p-0 print:text-xs">
      {/* ------------------------------------------------------ Cabecera */}
      <header
        className="flex flex-col items-start justify-between gap-4 border-b-2 pb-4 sm:flex-row sm:gap-6 print:flex-row"
        style={{ borderColor: AZUL }}
      >
        <div className="flex items-start gap-4">
          {emisor.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={emisor.logoUrl} alt="" className="h-16 w-auto object-contain" />
          ) : null}
          <div>
            <h1 className="text-lg font-bold" style={{ color: AZUL }}>
              {emisor.nombreComercial ?? emisor.razonSocial}
            </h1>
            <p className="text-xs text-[#444]">{emisor.razonSocial}</p>
            <p className="text-xs text-[#444]">RUC {emisor.ruc}</p>
            {emisor.direccion ? (
              <p className="text-xs text-[#444]">{emisor.direccion}</p>
            ) : null}
            <p className="text-xs text-[#444]">
              {[emisor.telefono, emisor.email, emisor.web].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>

        {/* El recuadro del número. En una factura es lo primero que busca
            quien la recibe, y por eso va enmarcado y a la derecha. */}
        <div
          className="shrink-0 rounded border-2 px-5 py-3 text-center"
          style={{ borderColor: AZUL }}
        >
          <p
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: AZUL }}
          >
            {titulo}
          </p>
          <p className="text-base font-bold tabular">{numero}</p>
        </div>
      </header>

      {/* -------------------------------------------------------- Los datos */}
      <section className="mt-4 grid grid-cols-1 gap-x-8 gap-y-1 text-xs sm:grid-cols-2 print:grid-cols-2">
        {datos.map((d, i) =>
          d ? (
            <p key={`${d.etiqueta}-${i}`} className="flex gap-2">
              <span className="w-28 shrink-0 font-semibold" style={{ color: AZUL }}>
                {d.etiqueta}
              </span>
              <span className="min-w-0 flex-1">{d.valor}</span>
            </p>
          ) : (
            <span key={`hueco-${i}`} />
          ),
        )}
      </section>

      {/* --------------------------------------------------------- Líneas */}
      <div className="mt-4 -mx-4 overflow-x-auto px-4 sm:-mx-8 sm:px-8 print:mx-0 print:overflow-visible print:px-0">
        <table className="w-full min-w-[38rem] border-collapse text-xs print:min-w-0">
          <thead>
            <tr className="text-white" style={{ backgroundColor: AZUL }}>
              {columnas.map((c) => (
                <th
                  key={c.clave}
                  className={`border px-1.5 py-1.5 ${ALINEACION[c.alinear ?? "izquierda"]}`}
                  style={{ borderColor: AZUL }}
                >
                  {c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              // `break-inside-avoid`: una línea no se parte por la mitad entre
              // dos hojas. Con descripciones de dos renglones pasa a menudo.
              <tr key={i} className="break-inside-avoid">
                {columnas.map((c) => (
                  <td
                    key={c.clave}
                    className={`border border-[#ccc] px-1.5 py-1 ${
                      ALINEACION[c.alinear ?? "izquierda"]
                    } ${c.sinCortar ? "whitespace-nowrap" : ""}`}
                  >
                    {f[c.clave]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* -------------------------------------------------------- Totales */}
      {totales && totales.length > 0 ? (
        <section className="mt-3 flex justify-end break-inside-avoid">
          <table className="text-xs">
            <tbody>
              {totales.map((t) => (
                <tr
                  key={t.etiqueta}
                  className={t.destacado ? "text-white" : ""}
                  style={t.destacado ? { backgroundColor: AZUL } : undefined}
                >
                  <td
                    className={`border border-[#ccc] px-3 py-1 text-right ${
                      t.destacado ? "font-bold" : ""
                    }`}
                  >
                    {t.etiqueta}
                  </td>
                  <td
                    className={`border border-[#ccc] px-3 py-1 text-right tabular ${
                      t.destacado ? "font-bold" : ""
                    }`}
                  >
                    {t.valor}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {enLetras ? (
        <p className="mt-2 text-right text-xs uppercase text-[#444]">Son: {enLetras}</p>
      ) : null}

      {pie ? (
        <footer className="mt-6 break-inside-avoid border-t border-[#ccc] pt-3 text-xs text-[#444]">
          {pie}
        </footer>
      ) : null}
    </article>
  );
}
