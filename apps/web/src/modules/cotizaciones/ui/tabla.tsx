import Link from "next/link";
import {
  EstadoBadge,
  EstadoError,
  EstadoVacio,
  Moneda,
  PaginacionKeyset,
} from "@rodatech/ui";

import { misPermisos } from "@/lib/permisos";
import { avisoSinPermiso } from "@/lib/permisos-comun";

import { listarCotizaciones } from "../api/consultas";
import { AccionesFilaCotizacion } from "./acciones-fila";
import {
  ETIQUETA_ESTADO,
  RIEL_ESTADO,
  type CotizacionLista,
  type FiltrosCotizaciones,
} from "../dominio/tipos";

/**
 * Listado de cotizaciones.
 *
 * Dos decisiones de forma que vale la pena explicar:
 *
 * 1. **El riel de estado, solo en la tarjeta del móvil.** En la tabla eran
 *    tres píxeles de 36 de alto en filas de 80: rayas sueltas que parecían un
 *    fallo, y el supervisor de Luis lo vio «feo» (20/11). El estado ya lo dice
 *    la pastilla, que desde el 19/11 va en su color y con borde.
 *
 * 2. **Todo número va en cifras tabulares.** Es lo que hace que dos totales
 *    se comparen mirando la columna, y que `CT02-001340` y `CT02-001347`
 *    ocupen lo mismo. Iban además en monoespaciada, una segunda letra en la
 *    misma fila; las cifras tabulares alinean igual sin ella (20/11).
 *
 * 3. **La columna de acciones.** Hasta hoy la única forma de entrar en una
 *    cotización era pulsar su número —texto azul de 13 px—, y para editar un
 *    borrador había que entrar antes a verlo. Luis, 08/09: *«una persona que
 *    no sabe que tiene que darle click ahí»*. Ahora cada fila lleva **Ver** y,
 *    cuando toca, el paso siguiente: aprobar si el cliente todavía no la ha
 *    aceptado, ir a su pedido si ya la aceptó. Lo demás —editar, duplicar,
 *    hacer la guía, facturar— va en los tres puntos (Luis, 15/10).
 *
 * En móvil no es una tabla. Ocho columnas en un teléfono no se leen ni con
 * scroll, así que por debajo de `md` cada cotización es una tarjeta con el
 * mismo riel en el borde.
 */
export async function TablaCotizaciones({
  filtros,
}: {
  filtros: FiltrosCotizaciones;
}) {
  const [resultado, permisos] = await Promise.all([listarCotizaciones(filtros), misPermisos()]);
  // «Eliminar cotización» (164) pide «Eliminar» en Cotizaciones; sin él, sale con candado.
  const eliminar = {
    puede: permisos.tiene("cotizaciones", "eliminar"),
    aviso: avisoSinPermiso("cotizaciones", "eliminar", permisos.nombreRol),
  };

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No se pudieron cargar las cotizaciones"
        descripcion="La consulta no llegó a completarse."
        detalle={resultado.error}
      />
    );
  }

  const { filas, siguiente, anterior } = resultado.datos;

  if (filas.length === 0) {
    const filtrando = Boolean(filtros.q || filtros.estado || filtros.cliente);
    return (
      <EstadoVacio
        titulo={filtrando ? "Ninguna cotización coincide" : "Todavía no hay cotizaciones"}
        descripcion={
          filtrando
            ? "Prueba con menos filtros, o busca por número u orden de compra."
            : "Crea la primera y aquí verás su número, su margen y en qué estado quedó."
        }
        accion={
          filtrando ? undefined : (
            <Link
              href="/cotizaciones/nueva"
              className="rounded-sm bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              Nueva cotización
            </Link>
          )
        }
      />
    );
  }

  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());
  const vencida = (c: CotizacionLista) =>
    c.estado === "enviada" && c.fecha_vencimiento < hoy;

  /*
    Tabla o tarjetas según el ancho de la LISTA, no de la pantalla.
    Revisión por módulos del 02/10: con `md`, a 820 con el menú abierto
    salía la tabla en 500 px; la columna fija de acciones tapaba al cliente
    y el número se partía en «COT1-» y «000001».
  */
  return (
    <div className="@container">
      {/* --------------------------------------------------- Escritorio */}
      <div className="scroll-x hidden @3xl:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="cabecera-tabla">
              <th className="px-4 py-3 font-medium">Cotización</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="hidden px-4 py-3 font-medium 2xl:table-cell">Orden de compra</th>
              <th className="hidden px-4 py-3 text-right font-medium 2xl:table-cell">
                Ítems
              </th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 text-right font-medium">Margen</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="sticky right-0 z-20 bg-[var(--surface)] px-4 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((c) => (
              <tr
                key={c.id}
                className="group fila-lista border-b border-[var(--border-soft)]"
              >
                {/* Número y fecha en una sola celda (20/11). En dos columnas
                    dejaban entre la fecha y el cliente un hueco de 150 px
                    mientras el nombre del cliente se cortaba con «…», y el
                    supervisor de Luis marcó justo ese hueco. */}
                <td className="whitespace-nowrap px-4 py-3">
                  <Link
                    href={`/cotizaciones/${c.id}`}
                    className="block tabular text-base font-semibold text-brand-700 group-hover:underline"
                  >
                    {c.numero}
                  </Link>
                  <span className="mt-0.5 flex items-center gap-1.5 tabular text-sm text-[var(--fg-muted)]">
                    {fechaCorta(c.fecha)}
                    {vencida(c) ? (
                      <span className="rounded-sm bg-[var(--warn-bg)] px-1.5 text-sm font-medium text-[var(--warn)]">
                        vencida
                      </span>
                    ) : null}
                  </span>
                </td>

                {/* El cliente toma el ancho que pide su nombre, y si no
                    cabe se parte en dos líneas en vez de cortarse: con el
                    tope de 14rem, «COMPAÑIA MINERA SIERRA C…» no decía cuál
                    de las mineras era. La inicial en círculo es para
                    encontrar a un cliente bajando la vista por la lista. */}
                <td className="min-w-[16rem] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-200"
                    >
                      {iniciales(c.cliente)}
                    </span>
                    <div className="min-w-0">
                      <span className="line-clamp-2 font-semibold text-[var(--fg)]" title={c.cliente}>
                        {c.cliente}
                      </span>
                      {/* Con «RUC» o «DNI» delante: un número de once cifras
                          suelto bajo el nombre no decía qué era (20/11). */}
                      {c.cliente_documento ? (
                        <span className="block tabular text-sm text-[var(--fg-subtle)]">
                          {tipoDocumento(c.cliente_documento)} {c.cliente_documento}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </td>

                {/* La orden de compra del cliente se busca por esta pantalla
                    —está en el marcador del buscador— y es lo que hay que
                    citar al facturar. Se lee: en 14, no en 12. */}
                <td className="hidden px-4 py-3 tabular text-[var(--fg-muted)] 2xl:table-cell">
                  {c.orden_compra_cliente ?? "—"}
                </td>
                <td className="hidden px-4 py-3 text-right tabular text-[var(--fg-muted)] 2xl:table-cell">
                  {c.items}
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <Moneda valor={c.total} tamano="md" enfasis="fuerte" />
                  {c.enSoles ? <span className="block text-sm text-[var(--fg-muted)]">venta en soles</span> : null}
                </td>

                <td className="px-4 py-3 text-right">
                  <Margen valor={c.margen_pct} costo={c.costo_total} />
                </td>

                {/* Sin partirse ni cortarse: la columna de acciones va fija a la
                    derecha y se montaba encima, dejando «Envia…» (07/10). */}
                <td className="whitespace-nowrap px-4 py-3">
                  {/*
                    El mismo badge que el resto del ERP.

                    Aquí se pintaba con un `span` y `COLOR_ESTADO`, un mapa de
                    colores propio de este módulo: rectángulo plano, sin punto
                    y con el color como ÚNICO canal. Era el tercer catálogo
                    paralelo de estados —ya cayeron el de guías y el de
                    facturación—, y encima el de la pantalla que más se mira.
                    `EstadoBadge` trae el punto (forma distinta por estado,
                    para quien no distingue verde de rojo) y el tachado de las
                    anuladas.

                    La etiqueta la sigue poniendo el módulo, igual que en la
                    ficha: el catálogo y `ETIQUETA_ESTADO` dicen lo mismo hoy,
                    pero el nombre de un estado de cotización se discute aquí.
                  */}
                  {/* Todas del mismo ancho (20/11): de 84 a 118 px según la
                      palabra, la columna se veía desigual. */}
                  <EstadoBadge
                    estado={c.estado}
                    etiqueta={ETIQUETA_ESTADO[c.estado]}
                    size="sm"
                    className="min-w-[7.5rem] justify-center py-1"
                  />
                </td>

                {/* Un solo botón, «Acciones», con todo dentro (Luis, 15/10:
                    «la idea es que esté adentro todo»). Mide lo mismo en
                    todas las filas, así que la columna queda a plomo. */}
                <td className="sticky right-0 z-10 bg-[var(--surface)] px-4 py-3">
                  <div className="flex justify-end">
                    <AccionesFilaCotizacion c={c} eliminar={eliminar} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --------------------------------------------------------- Móvil */}
      <ul className="flex flex-col gap-2 px-3 py-1 @3xl:hidden">
        {filas.map((c) => (
          <li key={c.id} className="flex overflow-hidden rounded-md border border-[var(--border)]">
            <span
              aria-hidden="true"
              className={`w-1 shrink-0 ${RIEL_ESTADO[c.estado]}`}
            />
            {/* La tarjeta ya NO es un enlace entera.

                Lo era, y por eso no podía llevar botones: un `<a>` dentro de
                otro `<a>` es HTML inválido y el navegador lo deshace por su
                cuenta. Ahora los botones son los de la fila de escritorio, y
                se pulsan igual en un teléfono. */}
            <div className="min-w-0 flex-1 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="tabular text-sm font-semibold text-brand-700">
                  {c.numero}
                </span>
                <span className="text-right">
                  <Moneda valor={c.total} tamano="sm" enfasis="fuerte" />
                  {c.enSoles ? <span className="block text-sm text-[var(--fg-muted)]">en soles</span> : null}
                </span>
              </div>

              <p className="mt-0.5 truncate text-sm">{c.cliente}</p>

              {/* El estado y «vencida» arriba, que es lo primero que se mira. */}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <EstadoBadge
                  estado={c.estado}
                  etiqueta={ETIQUETA_ESTADO[c.estado]}
                  size="xs"
                />
                {vencida(c) ? (
                  <span className="font-medium text-[var(--warn)]">vencida</span>
                ) : null}
              </div>

              {/* Cada cifra con su etiqueta encima, como en facturación, guías
                  y pedidos. Iban sueltas en una línea —«17/10/26 115.88%»— sin
                  decir cuál era cuál, y el margen es el número por el que
                  Willy abre esta pantalla. «Ítems» no baja: en una tarjeta
                  pequeña es lo que menos dice, y se ve al abrirla. */}
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                <div className="min-w-0">
                  <dt className="text-sm text-[var(--fg-subtle)]">Fecha</dt>
                  <dd className="tabular">{fechaCorta(c.fecha)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-sm text-[var(--fg-subtle)]">Margen</dt>
                  <dd>
                    <Margen valor={c.margen_pct} costo={c.costo_total} />
                  </dd>
                </div>
                {c.orden_compra_cliente ? (
                  <div className="col-span-2 min-w-0">
                    <dt className="text-sm text-[var(--fg-subtle)]">Orden de compra</dt>
                    <dd className="break-words tabular">{c.orden_compra_cliente}</dd>
                  </div>
                ) : null}
              </dl>

              <div className="mt-3">
                <AccionesFilaCotizacion c={c} ancho eliminar={eliminar} />
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="px-3 py-3 sm:px-4">
        <PaginacionKeyset
          porPagina={filtros.limite}
          cantidadEnPagina={filas.length}
          cursorSiguiente={siguiente}
          cursorAnterior={anterior}
        />
      </div>
    </div>
  );
}

/**
 * El margen.
 *
 * Es el número por el que Willy abre esta pantalla, así que se pinta con
 * color y no en gris pequeño: por debajo de 10 % la operación casi no deja
 * nada, y entre 10 y 15 conviene mirarla. Sin costo cargado se pone una raya,
 * no un cero: «no se sabe» y «cero» no son lo mismo.
 */
function Margen({ valor, costo }: { valor: number; costo: number }) {
  /*
    La raya, solo cuando NO HAY COSTO. Decidirlo por el margen fallaba por
    los dos lados (revisión por módulos del 02/10): una cotización sin costo
    sale de la base con 100 % —la venta entera como ganancia— y se pintaba
    en verde; y una que vende POR DEBAJO del costo, con margen negativo,
    salía con la raya de «no se sabe». La COT1-000001, a −1.6 %, se veía
    igual que una sin datos.
  */
  // «Sin costo» y no una raya (20/11): la raya sola, en gris, se leía como
  // un hueco en la tabla y no decía por qué faltaba el margen.
  if (costo <= 0) {
    return <span className="text-sm text-[var(--fg-subtle)]">Sin costo</span>;
  }
  // Los cortes son sobre el COSTO (023): 12 y 20 son el equivalente de los
  // 10 y 15 que había cuando el denominador era la venta, y el 20 coincide
  // con el objetivo que trae la plantilla de productos.
  // En pastilla de su color (20/11): en letra verde suelta se perdía entre
  // el total y el estado, y es la cifra que más se mira.
  const tono =
    valor < 12
      ? "bg-[var(--danger-bg)] text-[var(--danger)]"
      : valor < 20
        ? "bg-[var(--warn-bg)] text-[var(--warn)]"
        : "bg-[var(--ok-bg)] text-[var(--ok)]";
  return (
    <span className={`inline-block rounded-md px-2 py-0.5 tabular font-semibold ${tono}`}>
      {valor.toFixed(2)}%
    </span>
  );
}

/** Fecha en formato peruano con el año entero, sin depender de la zona del servidor. */
function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
}

/**
 * Dos iniciales del cliente, sin la forma societaria: de «GRUPO KLAUS S.A.C.»
 * sale «GK», no «GS». Con una sola palabra, sus dos primeras letras.
 */
function iniciales(nombre: string): string {
  const societaria = /^(S\.?A\.?C?\.?|S\.?R\.?L\.?|E\.?I\.?R\.?L\.?|SAC|SA|SRL|EIRL|S|A|C|DE|DEL|EL|LA|LOS|LAS|Y|E)$/i;
  const palabras = nombre
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}\p{N}.]/gu, ""))
    .filter((p) => p.length > 0 && !societaria.test(p));
  if (palabras.length === 0) return nombre.slice(0, 2).toUpperCase();
  if (palabras.length === 1) return palabras[0]!.slice(0, 2).toUpperCase();
  return (palabras[0]![0]! + palabras[1]![0]!).toUpperCase();
}

/** Once cifras es un RUC; ocho, un DNI. Lo demás (carné, pasaporte) sin rótulo. */
function tipoDocumento(numero: string): string {
  if (/^\d{11}$/.test(numero)) return "RUC";
  if (/^\d{8}$/.test(numero)) return "DNI";
  return "";
}
