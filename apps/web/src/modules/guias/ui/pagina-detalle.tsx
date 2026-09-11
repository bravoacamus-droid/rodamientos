import Link from "next/link";
import { notFound } from "next/navigation";
import { EstadoBadge, EstadoError } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { detalleGuia } from "../api/consultas";
import { ETIQUETA_ESTADO, ETIQUETA_MODALIDAD } from "../dominio/tipos";
import { AnularGuia } from "./anular-guia";
import { EmitirGuia } from "./emitir-guia";

/**
 * Ficha de una guía de remisión.
 *
 * Es el documento que viaja con la mercadería, así que la ficha está pensada
 * para imprimirse: los bloques que solo sirven en pantalla llevan `no-print`.
 *
 * En borrador se puede corregir y emitir; emitida, solo anular. Una guía
 * emitida ya movió stock, y cambiarle las cantidades dejaría el kardex
 * contando una cosa y el papel diciendo otra.
 */
export default async function PaginaDetalleGuia({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [resultado, perfil] = await Promise.all([detalleGuia(id), perfilActual()]);

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No se pudo cargar la guía"
        descripcion="La consulta no llegó a completarse."
        detalle={resultado.error}
      />
    );
  }
  if (!resultado.datos) notFound();

  const g = resultado.datos;
  const rol = perfil?.activo ? perfil.rol : null;
  const puedeEmitir =
    rol !== null && ["gerencia", "admin", "ventas", "almacen"].includes(rol);
  const esGerencia = rol !== null && ["gerencia", "admin"].includes(rol);

  const unidades = g.lineas.reduce((a, l) => a + l.cantidad, 0);

  return (
    <div className="flex flex-col gap-5">
      <header className="anim-entrada flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/guias" className="text-sm text-[var(--fg-muted)] underline no-print">
            ← Guías de remisión
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-xl font-semibold tracking-tight sm:text-2xl">
              {g.numero}
            </h1>
            {/* El mismo badge que el listado, que pasó a `EstadoBadge` el
                11/09. La ficha de al lado se quedó con `Badge` y `TONO_ESTADO`
                —plano, sin punto—, así que la misma guía se veía de dos formas
                según se mirara en la lista o dentro. */}
            <EstadoBadge estado={g.estado} etiqueta={ETIQUETA_ESTADO[g.estado]} />
          </div>
          <p className="mt-0.5 text-sm text-[var(--fg-muted)]">
            {g.cliente ?? "—"}
            {g.cliente_documento ? ` · ${g.cliente_documento}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-2 no-print">
          {/*
            Descargar e imprimir, los dos con icono y a 36 px.

            Luis, 09/09: *«en cotización, guía y factura, un botón de descargar
            el documento… y mejora el de imprimir y anular, dale color»*.

            Los dos llevan a la hoja con `auto=1`, que abre la ventana de
            imprimir sola. Antes «Imprimir» traía a la hoja y ahí se acababa:
            había que acordarse de Ctrl+P.

            Descargar va en azul porque es lo que más se hace con una guía hoy
            —mandarla por WhatsApp al cliente o al transportista— y en el
            diálogo del navegador «Guardar como PDF» es uno de los destinos.
          */}
          <Link
            href={`/guias/${g.id}/imprimir?auto=1`}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand-600 px-3 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            <IconoDescargar />
            Descargar
          </Link>
          <Link
            href={`/guias/${g.id}/imprimir?auto=1`}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--border-strong)] px-3 text-sm font-medium transition-colors hover:bg-[var(--surface-2)]"
          >
            <IconoImprimir />
            Imprimir
          </Link>
          {/*
            Corregir, solo en borrador.

            Willy, 40:43, al ver que el inicio de traslado se había quedado en
            hoy: *«tengo que poner aquí un botón también de editar la guía,
            para que pueda actualizar los datos»*. Hasta hoy lo único que se
            podía hacer con un borrador equivocado era anularlo y volver a
            empezar, quemando un correlativo por una fecha mal puesta.
          */}
          {puedeEmitir && g.estado === "borrador" ? (
            <Link
              href={`/guias/${g.id}/editar`}
              className="inline-flex h-9 items-center rounded-sm border border-[var(--border)] px-3 text-sm font-medium hover:bg-[var(--surface-2)]"
            >
              Corregir
            </Link>
          ) : null}
          {puedeEmitir ? <EmitirGuia guia={g} /> : null}
          {esGerencia ? (
            <AnularGuia
              id={g.id}
              numero={g.numero}
              estado={g.estado}
              comprobante={g.comprobante}
            />
          ) : null}
        </div>
      </header>

      {g.estado === "borrador" ? (
        <p className="anim-entrada rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm no-print">
          <strong>Es un borrador.</strong> La mercadería todavía NO ha salido del
          almacén. Sale cuando pulses «Emitir y despachar».
        </p>
      ) : null}

      {g.estado === "anulada" && g.motivo_anulacion ? (
        <p className="anim-entrada rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm">
          <strong>Anulada:</strong> {g.motivo_anulacion}
        </p>
      ) : null}

      {/* --------------------------------------------------------- Cifras */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tarjeta etiqueta="Peso bruto" valor={`${g.peso_bruto_kg.toFixed(3)} kg`} />
        <Tarjeta etiqueta="Bultos" valor={String(g.numero_bultos)} />
        <Tarjeta
          etiqueta="Unidades"
          valor={unidades.toLocaleString("es-PE")}
          pie={`${g.lineas.length} ${g.lineas.length === 1 ? "línea" : "líneas"}`}
        />
        <Tarjeta etiqueta="Traslado" valor={g.fecha_traslado} pie={g.motivo_descripcion ?? ""} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* ------------------------------------------------------ Líneas */}
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">Qué se traslada</h2>
          {/*
            La tabla, solo de `md` para arriba.

            Luis, 11/09: *«mejorar de ver cómo arreglar las tablas de
            información de los productos, ponerlos como card podría ser, para
            verlo bien»*. En 414 px la descripción se cortaba y había que
            arrastrar para ver la cantidad.

            Esto NO es el papel que se imprime: la guía impresa vive en
            `/guias/[id]/imprimir` y sigue siendo una tabla, porque es un
            documento. Aquí solo se consulta.
          */}
          <div className="scroll-x hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
                  <th className="py-2 pr-3 font-medium">Código</th>
                  <th className="py-2 pr-3 font-medium">Descripción</th>
                  <th className="py-2 pr-3 text-right font-medium">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {g.lineas.map((l, i) => (
                  <tr
                    key={l.id}
                    className="anim-entrada border-b border-[var(--border-soft)] last:border-0"
                    style={{ animationDelay: `${Math.min(i, 6) * 24}ms` }}
                  >
                    <td className="py-2 pr-3">
                      <Link
                        href={`/productos/${l.producto_id}`}
                        className="font-mono text-[0.8rem] font-medium text-brand-600 hover:underline"
                      >
                        {l.codigo}
                      </Link>
                    </td>
                    <td className="max-w-xs py-2 pr-3">
                      <span className="block truncate" title={l.descripcion}>
                        {l.descripcion}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular">
                      {l.cantidad}{" "}
                      <span className="text-xs text-[var(--fg-subtle)]">
                        {l.unidad}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* --------------------------------------------------- Móvil */}
          <ul className="flex flex-col divide-y divide-[var(--border-soft)] md:hidden">
            {g.lineas.map((l) => (
              <li key={l.id} className="flex flex-col gap-1 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <Link
                    href={`/productos/${l.producto_id}`}
                    className="font-mono text-sm font-semibold text-brand-600"
                  >
                    {l.codigo}
                  </Link>
                  <span className="shrink-0 tabular text-sm font-medium">
                    {l.cantidad}{" "}
                    <span className="text-[var(--fg-subtle)]">{l.unidad}</span>
                  </span>
                </div>
                {/* Sin `truncate`: en la tabla la descripción compite con dos
                    columnas más; aquí tiene la tarjeta entera. */}
                <p className="text-sm text-[var(--fg-muted)]">{l.descripcion}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* ------------------------------------------------- Datos */}
        <div className="flex flex-col gap-4">
          <section className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">Traslado</h2>
            <dl className="flex flex-col gap-2 text-sm">
              <Dato etiqueta="Parte de" valor={g.direccion_partida ?? "—"} />
              <Dato etiqueta="Llega a" valor={g.direccion_llegada ?? "—"} />
              <Dato etiqueta="Ubigeo" valor={g.ubigeo_llegada ?? "—"} />
              <Dato etiqueta="Emisión" valor={g.fecha_emision} />
              <Dato etiqueta="Cotización" valor={g.cotizacion_numero ?? "—"} />
              <Dato etiqueta="Orden de compra" valor={g.orden_compra_cliente ?? "—"} />
            </dl>
          </section>

          <section className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">Transporte</h2>
            <dl className="flex flex-col gap-2 text-sm">
              <Dato
                etiqueta="Modalidad"
                valor={ETIQUETA_MODALIDAD[g.modalidad_traslado] ?? g.modalidad_traslado}
              />
              {/*
                Cada modalidad enseña LO SUYO, y nada más.

                Aquí seguían saliendo «Conductor: —» y «Licencia: —» en las
                guías públicas, que es justo lo que Luis pidió quitar (07/09):
                cuando despacha una agencia, quién conduce lo declara ella en
                su guía de transportista. Se arregló en el formulario y en el
                impreso y esta ficha se quedó atrás — dos rayas diciendo que
                falta un dato que nunca se va a saber.
              */}
              {g.modalidad_traslado === "01" ? (
                <>
                  <Dato etiqueta="Transportista" valor={g.transportista_razon_social ?? "—"} />
                  <Dato etiqueta="RUC" valor={g.transportista_documento ?? "—"} />
                </>
              ) : g.a_pie ? (
                <>
                  <Dato etiqueta="Traslado" valor="A pie, sin vehículo" />
                  <Dato etiqueta="Lo lleva" valor={g.conductor_nombre ?? "—"} />
                  <Dato etiqueta="DNI" valor={g.conductor_documento ?? "—"} />
                  {g.conductor_telefono ? (
                    <Dato etiqueta="Celular" valor={g.conductor_telefono} />
                  ) : null}
                </>
              ) : (
                <>
                  <Dato etiqueta="Placa" valor={g.transportista_placa ?? "—"} />
                  <Dato etiqueta="Conductor" valor={g.conductor_nombre ?? "—"} />
                  <Dato etiqueta="DNI" valor={g.conductor_documento ?? "—"} />
                  <Dato etiqueta="Licencia" valor={g.conductor_licencia ?? "—"} />
                </>
              )}
            </dl>

            {g.observaciones ? (
              <p className="mt-3 border-t border-[var(--border-soft)] pt-3 text-sm text-[var(--fg-muted)]">
                {g.observaciones}
              </p>
            ) : null}
          </section>

          {/* La GRE todavía no se envía: el conector REST + OAuth2 está por
              escribir. Se dice aquí en vez de dejar un botón que falla. */}
          <section className="card p-4 no-print">
            <h2 className="mb-1 text-sm font-semibold">SUNAT</h2>
            {g.comprobante ? (
              <p className="mb-2 text-sm">
                Facturada con{" "}
                <Link
                  href={`/facturacion/${g.comprobante.id}`}
                  className="font-mono font-medium text-brand-600 hover:underline"
                >
                  {g.comprobante.numero}
                </Link>
              </p>
            ) : null}
            <p className="text-sm text-[var(--fg-muted)]">
              El envío de la guía electrónica (GRE) todavía no está disponible: SUNAT lo
              cambió a un servicio REST con OAuth2 que hay que escribir aparte. La guía
              es válida como documento interno y mueve el stock igual.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function Tarjeta({
  etiqueta,
  valor,
  pie,
}: {
  etiqueta: string;
  valor: string;
  pie?: string;
}) {
  /*
    Mismo formato que las tarjetas de la cotización.

    Luis, 09/09: *«mira cómo juega con las tipografías y las palabras en
    negrita, para que se vea lo más importante»*. La jerarquía la hace el
    contraste: la etiqueta en versalitas y en gris, el dato grande y en
    seguida, el pie pequeño. Así el ojo cae en la cifra y no en el rótulo.

    Y nada por debajo de 14 px: la etiqueta y el pie iban a 12.
  */
  return (
    <div className="card anim-entrada p-4">
      <p className="text-sm font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
        {etiqueta}
      </p>
      <p className="mt-1 truncate text-xl font-semibold tabular">{valor}</p>
      {pie ? <p className="mt-0.5 truncate text-sm text-[var(--fg-muted)]">{pie}</p> : null}
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-32 shrink-0 text-[var(--fg-muted)]">{etiqueta}</dt>
      <dd className="min-w-0 flex-1 break-words">{valor}</dd>
    </div>
  );
}

function IconoDescargar() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] shrink-0"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
      <path d="M4 19h16" />
    </svg>
  );
}

function IconoImprimir() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] shrink-0"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9V3h12v6" />
      <rect x="3" y="9" width="18" height="7" rx="1" />
      <path d="M6 14h12v7H6z" />
    </svg>
  );
}
