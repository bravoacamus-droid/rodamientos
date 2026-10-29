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

/** Un par «etiqueta: valor» del bloque de arriba. */
export interface DatoHoja {
  etiqueta: string;
  valor: string;
  ancho?: boolean;
}

/**
 * Un bloque de dos columnas que NO se cruzan: cada una es su propia lista,
 * y un valor largo salta de renglón dentro de su mitad.
 *
 * Nace con la guía (Luis, 15/10: *«tiene que ser dos columnas… no pasarse,
 * sino respetar su espacio y saltar línea»*). Con la rejilla de pares, una
 * dirección a lo ancho dejaba huecos y empujaba lo de al lado a la columna
 * contraria: «Inicio de traslado» acababa solo a la derecha, bajo nada.
 */
export interface BloqueDatos {
  izquierda: DatoHoja[];
  derecha: DatoHoja[];
}

/**
 * La letra de la hoja: 14 px en pantalla estrecha, 12 px en la hoja ancha y
 * en el papel.
 *
 * Luis, 29/10: *«la vista previa por celular rompe el diseño… que se vean bien
 * en móvil y tablet»*. En el teléfono la hoja mide ~320 px y a 12 px no se leía
 * sin pellizcar —y Willy no ve bien (CLAUDE.md §1)—. Desde `@2xl` (672 px de
 * CONTENIDO, sin el padding: la hoja del escritorio) se queda la de siempre,
 * y `print:` la fija para el papel pase lo que pase con el contenedor.
 *
 * Es el mismo umbral para todo lo «estrecho» —letra, tarjetas, cuentas en
 * bloques, totales a lo ancho— y el mismo en el que el membrete y los datos
 * ya pasaban a una columna. Se probó a 576 para dejar la tabla a la tablet:
 * a 1024 con el menú abierto el estado de cuenta (637 px) cortaba el saldo
 * y solo se veía deslizando. Una tarjeta se lee; una columna cortada, no.
 */
const LETRA = "text-sm @2xl:text-xs print:text-xs";

/**
 * La sombra que avisa de que la tabla sigue a la derecha.
 *
 * Desde 672 px de contenido la tabla cabe casi siempre, pero una con muchas
 * columnas que no se parten (el estado de cuenta pide ~675) puede pasarse por
 * unos píxeles: se desliza dentro de su caja, nunca la página. Sin pista, la última columna —el importe— se
 * quedaba cortada sin que nada dijera que había más. CSS puro (fondos `local`
 * que tapan la sombra cuando no queda nada por ver), porque la hoja es un
 * Server Component sin JavaScript. En el papel la caja no desliza, así que
 * las tapas quedan justo encima de las sombras y no se ve nada.
 */
const SOMBRA_DESLIZA = {
  background:
    "linear-gradient(to right, #fff 50%, rgba(255,255,255,0)), " +
    "linear-gradient(to left, #fff 50%, rgba(255,255,255,0)) 100% 0, " +
    "radial-gradient(farthest-side at 0 50%, rgba(0,0,0,.18), rgba(0,0,0,0)), " +
    "radial-gradient(farthest-side at 100% 50%, rgba(0,0,0,.18), rgba(0,0,0,0)) 100% 0",
  backgroundRepeat: "no-repeat",
  backgroundSize: "40px 100%, 40px 100%, 14px 100%, 14px 100%",
  backgroundAttachment: "local, local, scroll, scroll",
} as const;

/** Un valor vacío no merece renglón en la tarjeta. */
const vacio = (v: ReactNode) => v === null || v === undefined || v === "" || v === false;

const ALINEACION = {
  izquierda: "text-left",
  centro: "text-center",
  derecha: "text-right",
} as const;

export function HojaDocumento({
  emisor,
  titulo,
  numero,
  datos = [],
  bloques,
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
  /**
   * Los pares del bloque de arriba. Un `null` deja el hueco y mantiene las
   * dos columnas alineadas, que es para lo que existe.
   *
   * `ancho` ocupa las DOS columnas. Willy, 16/09: *«la fila de la
   * "Dirección" debe estar libre, porque la razón social es siempre
   * amplia»*. Una dirección de Lima —«AV. NÉSTOR GAMBETTA NRO. 6448 Z.I.
   * ZONA GRAN INDUSTRIA I3. CALLAO - PROV. CONST. DEL CALLAO»— partida en
   * media hoja son cinco renglones que empujan todo lo de al lado.
   */
  datos?: (DatoHoja | null)[];
  /** En vez de `datos`: bloques de dos columnas independientes. */
  bloques?: BloqueDatos[];
  columnas: ColumnaHoja[];
  /** Una fila es un valor por clave de columna. */
  filas: Record<string, ReactNode>[];
  totales?: TotalHoja[];
  enLetras?: string | null;
  pie?: ReactNode;
}) {
  return (
    // `@container`: el membrete y el bloque del cliente se ponen en dos
    // columnas según el ancho de la HOJA, no de la pantalla. A 820 con el
    // menú abierto la hoja medía ~500 px, «sm:» ya valía y el recuadro del
    // documento se montaba encima de la razón social (revisión del 02/10).
    // El papel impreso no cambia: manda `print:`.
    <article className="@container mx-auto w-full max-w-[210mm] bg-white p-4 text-[#111] sm:p-8 print:max-w-none print:p-0 print:text-xs">
      {/* ------------------------------------------------------ Cabecera */}
      <header
        className="flex flex-col items-start justify-between gap-4 border-b-2 pb-4 @2xl:flex-row @2xl:gap-6 print:flex-row"
        style={{ borderColor: AZUL }}
      >
        {/* En el teléfono el logo va ENCIMA de la razón social: al lado le
            dejaba ~200 px, y el correo, que no se parte, se salía de la hoja
            (29/10). Con 448 px de hoja ya caben juntos; en papel, siempre. */}
        <div className="flex min-w-0 flex-col items-start gap-3 @md:flex-row @md:gap-4 print:flex-row print:gap-4">
          {emisor.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={emisor.logoUrl} alt="" className="h-16 w-auto object-contain" />
          ) : null}
          {/*
            La razón social, y nada encima.

            Aquí iba «RODATECH» en grande y azul —el nombre comercial— y debajo
            «INVERSIONES RODATECH E.I.R.L.» en gris pequeño. Willy, 16/09:
            *«la palabra RODATECH (primera línea en azul) está de más, solo la
            siguiente fila (INVERSIONES RODATECH EIRL) resaltado en azul»*.

            Y tiene razón: el nombre comercial ya está EN EL LOGO, que va al
            lado. Repetirlo en texto era decir dos veces lo mismo y dejar el
            nombre que de verdad identifica a la empresa ante SUNAT —el que
            tiene que leer quien recibe el papel— en letra de pie de página.
          */}
          <div className="min-w-0 break-words">
            <h1 className="text-base font-bold" style={{ color: AZUL }}>
              {emisor.razonSocial}
            </h1>
            <p className={`${LETRA} text-[#444]`}>RUC {emisor.ruc}</p>
            {emisor.direccion ? (
              <p className={`${LETRA} text-[#444]`}>{emisor.direccion}</p>
            ) : null}
            <p className={`${LETRA} text-[#444]`}>
              {[emisor.telefono, emisor.email, emisor.web].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>

        {/* El recuadro del número. En una factura es lo primero que busca
            quien la recibe, y por eso va enmarcado y a la derecha. En el
            teléfono, a todo el ancho: suelto a la izquierda parecía un botón
            olvidado. */}
        <div
          className="shrink-0 self-stretch rounded border-2 px-5 py-3 text-center @2xl:self-auto print:self-auto"
          style={{ borderColor: AZUL }}
        >
          {/* El RUC dentro del recuadro, como todo comprobante SUNAT: dice de
              quién es ese número (Luis, 15/10). */}
          <p className="text-sm font-bold tabular">R.U.C. N.° {emisor.ruc}</p>
          <p
            className={`mt-0.5 ${LETRA} font-semibold uppercase tracking-wide`}
            style={{ color: AZUL }}
          >
            {titulo}
          </p>
          <p className="text-base font-bold tabular">{numero}</p>
        </div>
      </header>

      {/* -------------------------------------------------------- Los datos */}
      {bloques?.map((b, i) => (
        <section
          key={`bloque-${i}`}
          className={`grid grid-cols-1 gap-x-8 gap-y-1 ${LETRA} @2xl:grid-cols-2 print:grid-cols-2 ${
            i === 0 ? "mt-4" : "mt-2 border-t border-[#ddd] pt-2"
          }`}
        >
          {[b.izquierda, b.derecha].map((columna, j) => (
            <div key={j} className="flex min-w-0 flex-col gap-1">
              {columna.map((d) => (
                <p key={d.etiqueta} className="flex gap-2">
                  <span className="w-28 shrink-0 font-semibold" style={{ color: AZUL }}>
                    {d.etiqueta}
                  </span>
                  <span className="min-w-0 flex-1 break-words">{d.valor}</span>
                </p>
              ))}
            </div>
          ))}
        </section>
      ))}
      {datos.length > 0 ? (
      <section className={`mt-4 grid grid-cols-1 gap-x-8 gap-y-1 ${LETRA} @2xl:grid-cols-2 print:grid-cols-2`}>
        {datos.map((d, i) =>
          d ? (
            <p
              key={`${d.etiqueta}-${i}`}
              className={`flex gap-2 ${d.ancho ? "@2xl:col-span-2 print:col-span-2" : ""}`}
            >
              <span className="w-28 shrink-0 font-semibold" style={{ color: AZUL }}>
                {d.etiqueta}
              </span>
              <span className="min-w-0 flex-1 break-words">{d.valor}</span>
            </p>
          ) : (
            <span key={`hueco-${i}`} />
          ),
        )}
      </section>
      ) : null}

      {/* --------------------------------------------------------- Líneas */}
      {/*
        En la hoja estrecha, una tarjeta por línea.

        Luis, 29/10: *«la vista previa por celular rompe el diseño»*. Era esto:
        la tabla de nueve columnas en 320 px se deslizaba a escondidas y en
        pantalla quedaban el número, el código partido en tres renglones y
        media descripción («RESORTE DE TRACCION F»). Lo que importa —cuántas,
        a cuánto, cuánto suma— estaba fuera de la vista, y nada decía que
        hubiera más a la derecha.

        Las tarjetas son la misma fila con cada valor bajo su título, a 14 px.
        Desde 672 px de contenido vuelve la tabla, que es lo que se imprime:
        `print:hidden` aquí y `print:block` en la tabla, porque en el papel
        manda el formato que vio Willy y no el ancho del contenedor.
      */}
      <TarjetasDeLineas columnas={columnas} filas={filas} />

      <div
        className="mt-4 -mx-4 hidden overflow-x-auto px-4 sm:-mx-8 sm:px-8 @2xl:block print:mx-0 print:block print:overflow-visible print:px-0"
        style={SOMBRA_DESLIZA}
      >
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
          {/* A todo el ancho en el teléfono: el total es lo que el cliente
              busca, y pegado a la derecha en 14 px quedaba apretado. */}
          <table className={`w-full ${LETRA} @2xl:w-auto print:w-auto`}>
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
        <p className={`mt-2 text-right ${LETRA} uppercase text-[#444]`}>Son: {enLetras}</p>
      ) : null}

      {pie ? (
        <footer className={`mt-6 break-inside-avoid border-t border-[#ccc] pt-3 ${LETRA} text-[#444]`}>
          {pie}
        </footer>
      ) : null}
    </article>
  );
}

/**
 * Las líneas del documento como tarjetas, para la hoja estrecha.
 *
 * Genérica, porque la hoja la comparten la cotización, la factura, la guía,
 * el pedido, la orden de compra y el estado de cuenta, cada uno con sus
 * columnas. Lo único que se reconoce por su clave:
 *
 *   · `n`, el número de ítem, va delante del título de la tarjeta;
 *   · la primera columna que no sea `n` es el título (el código, o el número
 *     del comprobante en el estado de cuenta);
 *   · `descripcion` va entera, a lo ancho, debajo del título;
 *   · la ÚLTIMA columna —el importe, el saldo— en negrita, que es la cifra
 *     que se busca;
 *   · el resto, título encima y valor debajo, de dos en dos.
 *
 * Un valor vacío no ocupa renglón: la fila de «No tiene documentos
 * pendientes» del estado de cuenta es solo un título.
 */
function TarjetasDeLineas({
  columnas,
  filas,
}: {
  columnas: ColumnaHoja[];
  filas: Record<string, ReactNode>[];
}) {
  const colN = columnas.find((c) => c.clave === "n");
  const titulo = columnas.find((c) => c.clave !== "n");
  const descripcion = columnas.find((c) => c.clave === "descripcion" && c !== titulo);
  const ultima = columnas[columnas.length - 1];
  const resto = columnas.filter((c) => c !== colN && c !== titulo && c !== descripcion);

  return (
    <ol className="mt-4 flex flex-col gap-2 text-sm @2xl:hidden print:hidden">
      {filas.map((f, i) => (
        <li
          key={i}
          className="rounded border border-t-2 border-[#ccc] px-3 py-2"
          style={{ borderTopColor: AZUL }}
        >
          <p className="flex min-w-0 items-baseline gap-2 font-semibold break-words">
            {colN && !vacio(f[colN.clave]) ? (
              <span className="shrink-0" style={{ color: AZUL }}>
                {f[colN.clave]}.
              </span>
            ) : null}
            {titulo ? <span className="min-w-0">{f[titulo.clave]}</span> : null}
          </p>
          {descripcion && !vacio(f[descripcion.clave]) ? (
            <div className="mt-0.5 break-words">{f[descripcion.clave]}</div>
          ) : null}
          {resto.some((c) => !vacio(f[c.clave])) ? (
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 @md:grid-cols-[repeat(auto-fit,minmax(6rem,1fr))]">
              {resto.map((c) =>
                vacio(f[c.clave]) ? null : (
                  <div key={c.clave} className="min-w-0">
                    <dt className="text-[#555]">{c.titulo}</dt>
                    <dd className={`break-words ${c === ultima ? "font-bold" : ""}`}>
                      {f[c.clave]}
                    </dd>
                  </div>
                ),
              )}
            </dl>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
