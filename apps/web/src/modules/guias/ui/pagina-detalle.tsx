import Link from "next/link";
import { notFound } from "next/navigation";
import { mensajeParaPersona } from "@rodatech/sunat/red";
import {
  Ban,
  Boxes,
  Building2,
  CalendarDays,
  FileArchive,
  FileCode,
  FileText,
  Landmark,
  MapPin,
  Package,
  PackageOpen,
  Pencil,
  Printer,
  Truck,
  Weight,
} from "lucide-react";
import { EstadoBadge, EstadoError, KpiCard, buttonVariants, cn, formatearFecha } from "@rodatech/ui";
import {
  AvisoFicha,
  CabeceraFicha,
  DatoFicha,
  PasosDelFlujo,
  TituloBloque,
} from "@/modules/facturacion/ui/ficha";
import { BotonBloqueado } from "@/componentes/sin-permiso";
import { misPermisos } from "@/lib/permisos";
import { HistorialDocumento } from "@/modules/bitacora/ui/historial-documento";
import { avisoSinPermiso } from "@/lib/permisos-comun";

import { BotonDescargarPdf } from "@/componentes/boton-pdf";
import { emisorParaImprimir } from "@/lib/emisor";
import { nombreArchivo } from "@/lib/pdf-hoja";
import { VistaPreviaDocumento } from "@/modules/cotizaciones/ui/detalle/vista-previa";

import { archivosSunatDeGuia, detalleGuia } from "../api/consultas";
import { ETIQUETA_ESTADO, ETIQUETA_MODALIDAD } from "../dominio/tipos";
import { unidadLegible } from "@/modules/cotizaciones/dominio/unidades";
import { AnularGuia } from "./anular-guia";
import { EmitirGuia } from "./emitir-guia";
import { DocumentoGuia } from "./documento";
import { hojaDeGuia } from "./papel";
import { Volver } from "@/componentes/volver";
import { estadoConfiguracion } from "@/modules/facturacion/api/configuracion";
import { faltaParaSunat } from "../dominio/sunat";
import { formatoPeso } from "../dominio/constructor";
import { SunatGuia } from "./sunat-guia";
import { BajaSunatGuia } from "./baja-sunat-guia";

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
  const [resultado, perfil, emisor, config] = await Promise.all([
    detalleGuia(id),
    misPermisos(),
    emisorParaImprimir(),
    estadoConfiguracion(),
  ]);

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
  // El XML y el CDR, si los hay (07/11): solo en las guías que SUNAT tiene.
  const archivos =
    g && (g.estado_sunat === "aceptado" || g.estado_sunat === "observado")
      ? await archivosSunatDeGuia(g.id)
      : { xml: false, cdr: false };
  // Corregir y emitir un borrador es «editar» la guía; anularla, «eliminar» (143).
  const puedeEmitir = perfil.tiene("guias", "editar");
  const puedeAnular = perfil.tiene("guias", "eliminar");
  const puedeFacturar = perfil.tiene("facturacion", "crear");
  // Emitida, sin factura y de una cotización: lo siguiente es facturarla.
  const porFacturar = g.estado === "emitida" && !g.comprobante && Boolean(g.cotizacion_id);

  const unidades = g.lineas.reduce((a, l) => a + l.cantidad, 0);

  // El PDF, armado aquí con lo mismo que pinta el papel (14/10).
  const hoja = hojaDeGuia(g, emisor);
  const archivo = nombreArchivo(g.numero, g.cliente);

  return (
    <>
    {/*
      La ficha, en pantalla; al imprimir, solo el papel (14/10). El «Imprimir»
      de la vista previa saca la PÁGINA, y sin esto sacaba la ficha.
    */}
    <div className="flex flex-col gap-5 print:hidden">
      {/*
        La cabecera de ficha del rediseño (27/11), la misma que la factura:
        número grande, estado grande, a quién va, y como cifra héroe lo que
        sale del almacén. Debajo, el paso del flujo: la guía va ANTES que la
        factura, y aquí se ve qué toca después.
      */}
      <CabeceraFicha
        ruta="/guias"
        volver={<Volver href="/guias">Volver a guías</Volver>}
        tipo="Guía de remisión"
        numero={g.numero}
        estados={
          <>
            {/* El mismo badge que el listado, que pasó a `EstadoBadge` el
                11/09. La ficha de al lado se quedó con `Badge` y `TONO_ESTADO`
                —plano, sin punto—, así que la misma guía se veía de dos formas
                según se mirara en la lista o dentro. */}
            <EstadoBadge size="md" className="text-base" estado={g.estado} etiqueta={ETIQUETA_ESTADO[g.estado]} />
            {g.comprobante ? (
              <EstadoBadge size="md" className="text-base" estado="aceptado" etiqueta={`Facturada · ${g.comprobante.numero}`} />
            ) : null}
          </>
        }
        quien={g.cliente ?? "—"}
        quienDetalle={g.cliente_documento}
        junto={
          /* Para corregir su dirección antes de despachar (FS-08). */
          g.cliente_id ? (
            <Link
              href={`/clientes/${g.cliente_id}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "px-3 no-print")}
            >
              <Building2 className="size-4" aria-hidden="true" />
              Ficha del cliente
            </Link>
          ) : null
        }
        cifra={{
          rotulo: "Sale del almacén",
          valor: (
            <>
              {unidades.toLocaleString("es-PE")} {unidades === 1 ? "unidad" : "unidades"}
            </>
          ),
          pie: `${g.lineas.length} ${g.lineas.length === 1 ? "producto" : "productos"} · traslado el ${formatearFecha(g.fecha_traslado)}`,
        }}
        pasos={g.estado !== "anulada" ? <PasosDelFlujo actual={g.comprobante ? "factura" : "guia"} /> : null}
        acciones={
        /* `flex-wrap`: sin él, en el teléfono los cinco botones iban en
            una fila que se salía de la pantalla (revisión por módulos del
            02/10). */
        <>
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
          {/*
            Vista previa y «Descargar PDF» de verdad (14/10). Luis: *«tanto
            en facturas y guías de remisión falta vista previa antes de
            emitir, así como en cotización, y el botón directo también de
            descargar PDF»*. Con la guía en borrador, la previa es justo eso:
            ver el papel antes de pulsar «Emitir y despachar».
          */}
          {/*
            En borrador, SOLO la vista previa (Willy, 05/11, 7:45: descargó el
            PDF antes de emitir e imprimió una guía «borrador sin validez»).
            Moisés: *«no pueda descargar el PDF hasta emitir, solamente va a
            poder vista previa… una vez que esté emitido recién podrá
            descargar»*.
          */}
          <VistaPreviaDocumento
            numero={g.numero}
            junto={g.estado === "borrador" ? undefined : <BotonDescargarPdf hoja={hoja} nombre={archivo} />}
            sinImprimir={g.estado === "borrador"}
          >
            <DocumentoGuia g={g} emisor={emisor} />
          </VistaPreviaDocumento>
          {/* En azul solo ya emitida: en un borrador lo principal es
              «Emitir y despachar», y dos botones azules no dicen cuál. */}
          {/*
            «Facturar» desde la guía (Luis, 15/10: *«una vez en la guía ponemos
            el botón de facturar por ahí también»*). Es el paso que sigue —la
            guía va antes que la factura— y abre la factura con ESTA guía
            marcada. Con él, el azul es suyo y el PDF pasa a contorno.
          */}
          {puedeFacturar && porFacturar ? (
            <Link
              href={`/facturacion/nueva?cotizacion=${g.cotizacion_id}&guia=${g.id}`}
              className={cn(buttonVariants(), "px-3")}
            >
              <FileText className="size-4" aria-hidden="true" />
              Facturar
            </Link>
          ) : null}
          {g.estado === "borrador" ? (
            <>
              <BotonBloqueado mensaje={"Es un borrador: primero pulsa «Emitir y despachar». El PDF y la impresión salen ya con su validez; un borrador impreso dice «sin validez»."} className="md:h-control-md">
                Descargar PDF
              </BotonBloqueado>
              <BotonBloqueado mensaje={"Es un borrador: primero pulsa «Emitir y despachar». El PDF y la impresión salen ya con su validez; un borrador impreso dice «sin validez»."} className="md:h-control-md">
                <IconoImprimir />
                Imprimir
              </BotonBloqueado>
            </>
          ) : (
            <>
              <BotonDescargarPdf
                hoja={hoja}
                nombre={archivo}
                variante={puedeFacturar && porFacturar ? "outline" : "primary"}
              />
              <Link
                href={`/guias/${g.id}/imprimir?auto=1`}
                className={cn(buttonVariants({ variant: "outline" }), "px-3")}
              >
                <IconoImprimir />
                Imprimir
              </Link>
            </>
          )}
          {/*
            Editar, solo en borrador. Se llamó «Corregir» hasta el 14/10; Luis:
            *«en vez de corregir, ¿no sería editar?»*. Abre el mismo formulario
            con el que se preparó la guía.

            Willy, 40:43, al ver que el inicio de traslado se había quedado en
            hoy: *«tengo que poner aquí un botón también de editar la guía,
            para que pueda actualizar los datos»*. Hasta hoy lo único que se
            podía hacer con un borrador equivocado era anularlo y volver a
            empezar, quemando un correlativo por una fecha mal puesta.
          */}
          {puedeEmitir && g.estado === "borrador" ? (
            <Link
              href={`/guias/${g.id}/editar`}
              className={cn(buttonVariants({ variant: "outline" }), "px-3")}
            >
              <Pencil className="size-4" aria-hidden="true" />
              Editar
            </Link>
          ) : g.estado === "borrador" ? (
            <BotonBloqueado
              mensaje={avisoSinPermiso("guias", "editar", perfil.nombreRol)}
              className="md:h-control-md"
            >
              Editar
            </BotonBloqueado>
          ) : null}
          {puedeEmitir ? <EmitirGuia guia={g} /> : null}
          {puedeAnular ? (
            <AnularGuia
              id={g.id}
              numero={g.numero}
              estado={g.estado}
              comprobante={g.comprobante}
              vivaEnSunat={g.estado_sunat === "aceptado" || g.estado_sunat === "observado"}
            />
          ) : g.estado !== "anulada" ? (
            <BotonBloqueado
              mensaje={avisoSinPermiso("guias", "eliminar", perfil.nombreRol)}
              className="md:h-control-md"
            >
              Anular
            </BotonBloqueado>
          ) : null}
        </>
        }
      />

      {g.estado === "borrador" ? (
        <div className="no-print">
          <AvisoFicha tono="aviso" icono={<PackageOpen />} titulo="Es un borrador.">
            La mercadería todavía NO ha salido del almacén. Sale cuando pulses «Emitir y despachar».
          </AvisoFicha>
        </div>
      ) : null}

      {/*
        Emitida y sin factura: lo que toca ahora es facturar (27/11). El botón
        «Facturar» ya estaba arriba; aquí se dice POR QUÉ es lo siguiente,
        que es lo que la guía antes que la factura significa para Willy.
      */}
      {porFacturar ? (
        <div className="no-print">
          <AvisoFicha tono="info" icono={<FileText />} titulo="Lo siguiente: facturar esta guía.">
            La mercadería ya salió. Con la guía emitida ya se puede hacer la factura, y su número irá impreso en ella.
          </AvisoFicha>
        </div>
      ) : null}

      {/* Quién, cuándo y por qué (TR-07). Decía el motivo y nada más, y si
          no había motivo, ni el aviso. */}
      {g.estado === "anulada" ? (
        <AvisoFicha
          tono="peligro"
          icono={<Ban />}
          titulo={
            <>
              Anulada{g.anulada_en ? ` el ${formatearFecha(g.anulada_en)}` : ""}
              {g.anulada_por ? ` por ${g.anulada_por}` : ""}.
            </>
          }
        >
          {g.motivo_anulacion ? <>Motivo: {g.motivo_anulacion}</> : null}
        </AvisoFicha>
      ) : null}

      {/* El segundo paso: la baja en SUNAT (190, Willy 04/11). */}
      {g.estado === "anulada" ? (
        <div className="no-print">
          <BajaSunatGuia
            id={g.id}
            numero={g.numero}
            estadoSunat={g.estado_sunat}
            baja={g.baja_sunat}
            puede={puedeAnular}
          />
        </div>
      ) : null}

      {/* --------------------------------------------------------- Cifras */}
      {/* Las tarjetas de cifras del tablero (`KpiCard`, 27/11): en azul,
          que es «informativo» en el código de colores del rediseño. */}
      <div className="@container">
        <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @4xl:grid-cols-4">
          <KpiCard etiqueta="Peso bruto" icono={<Weight />} tono="sale" valor={`${formatoPeso(g.peso_bruto_kg)} kg`} />
          <KpiCard etiqueta="Bultos" icono={<Boxes />} tono="sale" valor={String(g.numero_bultos)} />
          <KpiCard
            etiqueta="Unidades"
            icono={<Package />}
            tono="sale"
            valor={unidades.toLocaleString("es-PE")}
            detalle={`${g.lineas.length} ${g.lineas.length === 1 ? "línea" : "líneas"}`}
          />
          {/* El pie partido y no cortado: es el motivo del traslado, y en el
              celular «Traslado entre establecimientos de la misma empresa» se
              quedaba en «Traslado entre…», que es justo lo que no dice nada. */}
          <KpiCard
            etiqueta="Traslado"
            icono={<CalendarDays />}
            tono="sale"
            valor={formatearFecha(g.fecha_traslado)}
            detalle={g.motivo_descripcion ?? undefined}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* ------------------------------------------------------ Líneas */}
        {/* `min-w-0`, como en la ficha de la factura: un hijo de rejilla no
            baja de lo que mide su tabla, y empujaba la página de lado. */}
        <section className="card elev-1 min-w-0 p-5">
          <TituloBloque icono={<Package />} extra={<span className="rounded-full bg-[var(--surface-2)] px-3 py-1 text-sm font-semibold text-[var(--fg-muted)] ring-1 ring-inset ring-[var(--border)]">{g.lineas.length} {g.lineas.length === 1 ? "producto" : "productos"}</span>}>Qué se traslada</TituloBloque>
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
                <tr className="cabecera-tabla">
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
                        className="font-mono text-sm font-medium text-brand-600 hover:underline"
                      >
                        {l.codigo}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">
                      {/* Entera: con tres columnas no hay con quién competir, y
                          cortada no se distinguía un rodamiento de otro. */}
                      <span className="block">{l.descripcion}</span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular">
                      {l.cantidad}{" "}
                      <span className="text-sm text-[var(--fg-subtle)]">
                        {unidadLegible(l.unidad)}
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
                    <span className="text-[var(--fg-subtle)]">{unidadLegible(l.unidad)}</span>
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
          <section className="card elev-1 p-5">
            <TituloBloque icono={<MapPin />}>Traslado</TituloBloque>
            <div className="@container"><dl className="grid grid-cols-1 gap-x-5 gap-y-4 @xs:grid-cols-2">
              <Dato etiqueta="Parte de" valor={g.direccion_partida ?? "—"} />
              <Dato etiqueta="Llega a" valor={g.direccion_llegada ?? "—"} />
              <Dato etiqueta="Código del distrito" valor={g.ubigeo_llegada ?? "—"} />
              <Dato etiqueta="Emisión" valor={formatearFecha(g.fecha_emision)} />
              {/* Enlazada, como el pedido (TR-05): era texto suelto. */}
              {g.cotizacion_id && g.cotizacion_numero ? (
                <Dato
                  etiqueta="Cotización"
                  valor={
                    <Link
                      href={`/cotizaciones/${g.cotizacion_id}`}
                      className="font-mono font-semibold text-brand-600 underline underline-offset-4"
                    >
                      {g.cotizacion_numero}
                    </Link>
                  }
                />
              ) : (
                <Dato etiqueta="Cotización" valor={g.cotizacion_numero ?? "—"} />
              )}
              {/* Al pedido del que sale (revisión del 15/10): desde la guía no
                  se llegaba, y el pedido es donde se hace lo que sigue. */}
              {g.pedido ? (
                <Dato
                  etiqueta="Pedido"
                  valor={
                    /* Subrayado, como la cotización de arriba: un enlace
                       que solo se subraya al pasar el ratón no se ve. */
                    <Link href={`/pedidos/${g.pedido.id}`} className="font-mono font-semibold text-brand-600 underline underline-offset-4">
                      {g.pedido.numero}
                    </Link>
                  }
                />
              ) : null}
              <Dato etiqueta="Orden de compra" valor={g.orden_compra_cliente ?? "—"} />
            </dl></div>
          </section>

          <section className="card elev-1 p-5">
            <TituloBloque icono={<Truck />}>Transporte</TituloBloque>
            <div className="@container"><dl className="grid grid-cols-1 gap-x-5 gap-y-4 @xs:grid-cols-2">
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
                  <Dato etiqueta="Traslado" valor="Peatonal" />
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
            </dl></div>

            {g.observaciones ? (
              <p className="mt-3 border-t border-[var(--border-soft)] pt-3 text-sm text-[var(--fg-muted)]">
                {g.observaciones}
              </p>
            ) : null}
          </section>

          {/* La guía ante SUNAT (15/10): tiene que estar aceptada antes de
              que salga la mercadería. */}
          <section className="card elev-1 p-5 no-print">
            <TituloBloque icono={<Landmark />}>SUNAT</TituloBloque>
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
            <SunatGuia
              id={g.id}
              estado={g.estado}
              estadoSunat={g.estado_sunat}
              /* Los cortes guardados en crudo («fetch failed») se leen en cristiano (21/10). */
              mensaje={mensajeParaPersona(g.sunat_mensaje)}
              configurado={config.guias.listo}
              faltaConfig={config.guias.faltan}
              faltaGuia={faltaParaSunat(g).filter((f) => !f.startsWith("Solo se manda"))}
              puede={puedeEmitir}
            />
            {/* El XML y la constancia (CDR), como en la factura (07/11).
                Moisés: «las guías de remitente también deberían descargar el
                XML y el CDR?». Solo lo que esté guardado. */}
            {archivos.xml || archivos.cdr ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {archivos.xml ? (
                  <a
                    href={`/guias/${g.id}/sunat?que=xml`}
                    download
                    className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
                  >
                    <FileCode className="size-4" aria-hidden />
                    Descargar XML
                  </a>
                ) : null}
                {archivos.cdr ? (
                  <a
                    href={`/guias/${g.id}/sunat?que=cdr`}
                    download
                    className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
                  >
                    <FileArchive className="size-4" aria-hidden />
                    Descargar CDR
                  </a>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
      </div>

      {/* Quién la hizo, la emitió o la anuló (TR-03). */}
      <HistorialDocumento entidad="guias_remision" id={g.id} />
    </div>
    <div className="hidden print:block">
      <DocumentoGuia g={g} emisor={emisor} />
    </div>
    </>
  );
}

/*
  Las cifras de arriba eran una `Tarjeta` propia hasta el 27/11:

    Mismo formato que las tarjetas de la cotización.

    Luis, 09/09: *«mira cómo juega con las tipografías y las palabras en
    negrita, para que se vea lo más importante»*. La jerarquía la hace el
    contraste: la etiqueta en versalitas y en gris, el dato grande y en
    seguida, el pie pequeño. Así el ojo cae en la cifra y no en el rótulo.

    Y nada por debajo de 14 px: la etiqueta y el pie iban a 12.

  Ahora son `KpiCard`, la tarjeta del tablero: la misma idea llevada más
  lejos —cifra en 30 px, icono en su chip, filo de color—, y la misma en
  todo el sistema.
*/

/*
  Etiqueta a la izquierda solo si cabe; si no, encima del valor.

  Luis, 29/10: «que se vean bien en móvil y tablet». La etiqueta mide 8 rem
  fijos, y a 1024 px la columna de la derecha deja a la caja unos 190 px:
  al valor le quedaban 60, y salía «05/10 /2026», «Crédit o a 30 días» y el
  vencimiento asomando fuera de la tarjeta (scrollWidth 1058 en una ventana
  de 1024). Se decide por el ancho de la LISTA (`@container` en el `dl`) y
  no por el de la pantalla, porque la columna es estrecha justo en tableta y
  ancha en el celular.

  27/11: el rótulo arriba (`etiqueta-dato`) y el valor debajo en semibold,
  en rejilla de dos columnas desde 20 rem de CAJA: el patrón de ficha del
  rediseño, igual que en la factura.
*/
function Dato({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return <DatoFicha etiqueta={etiqueta} valor={valor} />;
}

function IconoImprimir() {
  return <Printer aria-hidden="true" className="size-[18px] shrink-0" />;
}
