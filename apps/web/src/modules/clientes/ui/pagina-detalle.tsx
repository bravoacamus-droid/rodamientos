import Link from "next/link";
import { Suspense } from "react";
import { HistorialCliente } from "@/modules/tablero";
import { notFound } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Badge, Button, EstadoBadge, EstadoError, Skeleton, buttonVariants, cn } from "@rodatech/ui";
import {
  ArrowRight,
  Building2,
  ChartColumn,
  Contact,
  Factory,
  FileText,
  FolderOpen,
  HandCoins,
  Lock,
  MapPin,
  NotebookPen,
  Pencil,
  Phone,
  Receipt,
  ScrollText,
  Truck,
  UserRound,
} from "lucide-react";
import { BotonBloqueado } from "@/componentes/sin-permiso";
import { misPermisos } from "@/lib/permisos";
import { avisoSinPermiso } from "@/lib/permisos-comun";

import { clientePorId } from "../api/consultas";
import { ETIQUETA_DOCUMENTO } from "../dominio/tipos";
import { AccionesFila } from "./acciones-fila";
import { Volver } from "@/componentes/volver";
import { DireccionesDelCliente } from "@/modules/guias/ui/elegir-direccion";
import { BarraAcciones, ChipIcono, CabeceraFicha, TituloBloque } from "@/modules/cotizaciones/ui/ficha/piezas";

/**
 * Ficha de un cliente.
 *
 * Es el «ver cliente» del menú: todo lo que hace falta saber antes de
 * cotizarle o de darle crédito, sin entrar a editar. Lo que se puede tocar
 * está en el mismo menú de tres puntos que en el listado, para que la acción
 * esté siempre en el mismo sitio.
 */
export default async function PaginaDetalleCliente({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /** El periodo del historial (134). */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const [resultado, permisos] = await Promise.all([clientePorId(id), misPermisos()]);

  if (!resultado.ok) {
    if (resultado.error.includes("no existe")) notFound();
    return (
      <div className="p-1">
        <EstadoError titulo="No se pudo cargar el cliente" descripcion={resultado.error} />
      </div>
    );
  }

  const c = resultado.datos;
  const puedeEditar = permisos.tiene("clientes", "editar");

  return (
    <div className="@container flex flex-col gap-5">
      <Volver href="/clientes">Volver a clientes</Volver>

      {/*
        La cabecera de marca (27/11), la misma de la cotización y el pedido:
        quién es, con su documento en grande y si está bloqueado o de baja a
        la vista, sobre el azul. Antes era un `h1` de 20 px con el RUC en una
        pastilla de 14 px.
      */}
      <CabeceraFicha
        icono={Building2}
        tipo="Cliente"
        numero={c.numero_documento ? `${ETIQUETA_DOCUMENTO[c.tipo_documento]} ${c.numero_documento}` : undefined}
        estado={
          <>
            {c.bloqueado ? (
              <span className="inline-flex items-center gap-2 rounded-md border-2 border-[var(--danger)] bg-[var(--danger-bg)] px-3 py-1.5 text-base font-semibold text-[var(--danger)]">
                <Lock className="size-5" aria-hidden="true" />
                Bloqueado
              </span>
            ) : null}
            {!c.activo ? <EstadoBadge estado="de_baja" size="md" className="px-3 py-1.5 text-base" /> : null}
          </>
        }
        /* `break-words` y no `truncate` (lo hace CabeceraFicha): la razón
           social es el dato que se viene a leer. */
        titulo={c.razon_social}
        detalle={
          c.nombre_comercial || !(c.numero_documento && c.codigo.includes(c.numero_documento)) ? (
            <p>
              {c.nombre_comercial ?? ""}
              {c.nombre_comercial && !(c.numero_documento && c.codigo.includes(c.numero_documento)) ? " · " : ""}
              {c.numero_documento && c.codigo.includes(c.numero_documento) ? null : (
                <span className="font-mono">Código {c.codigo}</span>
              )}
            </p>
          ) : null
        }
      />

      <BarraAcciones
        titulo="Qué puedes hacer"
        texto={c.bloqueado ? "Está bloqueado: no se le puede cotizar hasta desbloquearlo." : "Cotízale o corrige sus datos."}
      >
        {/* Los tres botones del mismo alto y con el mismo dibujo: «Editar»
            era un enlace sin fondo, más alto que «Cotizar» y gris sobre el
            gris de la página (revisión por módulos del 02/10). */}
        <div className="flex flex-wrap items-center gap-2">
          {puedeEditar ? (
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href={`/clientes/${c.id}/editar`}>
                <Pencil className="size-4" aria-hidden="true" />
                Editar
              </Link>
            </Button>
          ) : (
            <BotonBloqueado mensaje={avisoSinPermiso("clientes", "editar", permisos.nombreRol)}>
              Editar
            </BotonBloqueado>
          )}
          <AccionesFila
            id={c.id}
            codigo={c.codigo}
            razonSocial={c.razon_social}
            bloqueado={c.bloqueado}
            puedeEditar={puedeEditar}
            enFicha
          />
        </div>
      </BarraAcciones>

      {c.bloqueado ? (
        <p
          role="alert"
          className="card elev-2 border-l-[6px] border-l-[var(--danger)] bg-danger-bg p-4 text-base"
        >
          <strong className="text-[var(--danger)]">Cliente bloqueado.</strong>{" "}
          {c.motivo_bloqueo ?? "No se registró el motivo."} No se le puede cotizar
          ni vender a crédito hasta desbloquearlo.
        </p>
      ) : null}

      {/* Lo que se le ha vendido, en cifras (134): vendido, facturado, lo que
          debe, cuánto se le gana y sus pedidos, con su periodo.

          Justo debajo de la cabecera desde el 27/11: estaba después de la
          zona, el rubro y los enlaces, y es lo que Willy viene a mirar —
          «Willy recuerda a un cliente por sus ventas» (revisión del 02/10). */}
      <Suspense key={JSON.stringify(sp)} fallback={<Skeleton className="h-96 w-full" />}>
        <HistorialCliente id={c.id} sp={sp} />
      </Suspense>

      {/* ---------------------------------------------------- Sus ventas */}
      {/*
        Revisión de diseño del 02/10: la ficha no llevaba a lo que se le ha
        vendido, y Willy recuerda a un cliente por sus ventas. Las cuatro
        listas YA filtraban por `?cliente=` desde hace meses; faltaba la
        puerta. La pieza sin camino, otra vez.
      */}
      <section className="card elev-1 flex flex-col gap-4 p-4">
        <TituloBloque
          icono={FolderOpen}
          titulo="Sus documentos"
          ayuda="Cada botón abre la lista ya filtrada por este cliente."
        />
        <div className="grid grid-cols-1 gap-2 @xl:grid-cols-2 @4xl:grid-cols-3">
          {[
            { href: `/cotizaciones?cliente=${c.id}`, texto: "Sus cotizaciones", Icono: FileText },
            { href: `/guias?cliente=${c.id}`, texto: "Sus guías", Icono: Truck },
            { href: `/facturacion?cliente=${c.id}`, texto: "Sus facturas", Icono: Receipt },
            { href: `/cobranzas?cliente=${c.id}`, texto: "Lo que debe", Icono: HandCoins },
            // Willy, 06/10: el papel para mandarle cuando junta varias facturas.
            { href: `/cobranzas/estado-de-cuenta?cliente=${c.id}`, texto: "Su estado de cuenta", Icono: ScrollText },
            // Y cómo va: lo que compra mes a mes contra el año pasado.
            { href: `/reportes/facturacion?cliente=${c.id}&comparar=anio`, texto: "Cómo va, en reportes", Icono: ChartColumn },
          ].map(({ href, texto, Icono }) => (
            <Link
              key={href}
              href={href}
              className={cn(buttonVariants({ variant: "outline" }), "h-auto min-h-12 justify-start px-4 py-2 text-base")}
            >
              <Icono className="size-5" aria-hidden />
              <span className="min-w-0 flex-1 text-left">{texto}</span>
              <ArrowRight className="size-5" aria-hidden />
            </Link>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------- Zona y rubro */}
      {/* En lugar de condición, tope y días de gracia, que dejaron de ser del
          cliente (Willy, 20/10: «se define en la cotización y en la
          factura»). La zona y el rubro (141) llevan a la lista filtrada: es
          como se arma la ruta de visitas. */}
      <div className="grid gap-3 @3xl:grid-cols-3">
        <Tarjeta
          icono={MapPin}
          etiqueta="Zona"
          valor={c.zona_nombre ?? "Sin zona"}
          pie={
            c.zona_id ? (
              <Link href={`/clientes?zona=${c.zona_id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "px-3")}>
                Ver los clientes de esta zona
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            ) : (
              "ponla al editar"
            )
          }
        />
        <Tarjeta
          icono={Factory}
          etiqueta="Rubro"
          valor={c.rubro_nombre ?? "Sin rubro"}
          pie={
            c.rubro_id ? (
              <Link href={`/clientes?rubro=${c.rubro_id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "px-3")}>
                Ver los clientes de este rubro
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            ) : (
              "ponlo al editar"
            )
          }
        />
        <Tarjeta
          icono={UserRound}
          etiqueta="Vendedor"
          valor={c.vendedor_nombre ?? "Sin asignar"}
          pie={c.vendedor_nombre ? "lo atiende" : "nadie lo tiene asignado"}
        />
      </div>

      <div className="grid gap-4 @5xl:grid-cols-2">
        {/* ------------------------------------------------------ Contacto */}
        {/* La empresa y su gente, separadas. Antes iban en la misma caja
            llamada «Contacto» y con un solo nombre dentro; desde la 035 son
            varios, y el correo de la empresa no es el de la persona. */}
        {/* Sus locales de entrega, con su distrito (195, 06/11). */}
        <DireccionesDelCliente clienteId={c.id} puedeEditar={puedeEditar} />

        <section className="card elev-1 flex flex-col gap-3 p-4">
          <TituloBloque icono={Phone} titulo="La empresa" ayuda="Cómo se le escribe o se le llama." />
          <dl className="flex flex-col gap-2 text-base">
            <Dato etiqueta="Correo" valor={c.email} />
            <Dato etiqueta="Teléfono" valor={c.telefono} />
            <Dato etiqueta="WhatsApp" valor={c.whatsapp} />
          </dl>
        </section>

        <section className="card elev-1 flex flex-col gap-3 p-4">
          <TituloBloque
            icono={Contact}
            titulo={
              <>
                Contactos{" "}
                {c.contactos_lista.length > 0 ? (
                  <span className="font-normal text-[var(--fg-muted)]">· {c.contactos_lista.length}</span>
                ) : null}
              </>
            }
            ayuda="Las personas de la empresa a las que les llega la cotización."
          />

          {c.contactos_lista.length === 0 ? (
            <p className="rounded-md bg-[var(--surface-2)] p-3 text-base text-[var(--fg-muted)]">
              Sin contactos. La cotización sale sin nombre de destinatario;
              añádelos desde «Editar».
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
              {c.contactos_lista.map((p) => (
                <li key={p.id} className="py-2 first:pt-0 last:pb-0">
                  <p className="flex items-center gap-2 text-base font-semibold">
                    <span className="min-w-0 [overflow-wrap:anywhere]">{p.nombre}</span>
                    {p.principal ? (
                      <Badge tone="brand" size="xs">
                        Principal
                      </Badge>
                    ) : null}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-[var(--fg-muted)]">
                    {p.cargo ? <span>{p.cargo}</span> : null}
                    {p.cargo && p.area ? <span aria-hidden="true">·</span> : null}
                    {p.area ? <span>{p.area}</span> : null}
                    {p.email ? (
                      <>
                        {p.cargo || p.area ? <span aria-hidden="true">·</span> : null}
                        {/* Partido donde haga falta y no cortado: un correo
                            con puntos suspensivos no se puede copiar. */}
                        <span className="min-w-0 [overflow-wrap:anywhere]">{p.email}</span>
                      </>
                    ) : null}
                    {p.telefono ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="tabular">{p.telefono}</span>
                      </>
                    ) : null}
                    {/* El WhatsApp se pedía al darlo de alta y no salía en la
                        ficha (revisión por módulos del 02/10). */}
                    {p.whatsapp ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="tabular whitespace-nowrap">WhatsApp {p.whatsapp}</span>
                      </>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ----------------------------------------------------- Dirección */}
        <section className="card elev-1 flex flex-col gap-3 p-4">
          <TituloBloque icono={MapPin} titulo="Dirección" ayuda="La fiscal, la que va en la factura." />
          <dl className="flex flex-col gap-2 text-base">
            <Dato etiqueta="Dirección fiscal" valor={c.direccion} />
            <Dato etiqueta="Distrito" valor={c.ubigeo_nombre} />
            <Dato etiqueta="Código del distrito (SUNAT)" valor={c.ubigeo_codigo} />
            <Dato etiqueta="Referencia" valor={c.referencia_direccion} />
          </dl>
          {!c.direccion || !c.ubigeo_codigo ? (
            <p className="rounded-md border-l-4 border-l-[var(--warn)] bg-warn-bg p-3 text-base">
              Falta dirección o distrito. Se puede cotizar igual, pero la guía de
              remisión los exige: conviene completarlos antes del primer despacho.
            </p>
          ) : null}
        </section>
      </div>

      {c.notas ? (
        <section className="card elev-1 flex flex-col gap-3 p-4">
          <TituloBloque icono={NotebookPen} titulo="Notas" />
          <p className="whitespace-pre-wrap break-words text-base">{c.notas}</p>
        </section>
      ) : null}

      <p className="text-sm text-[var(--fg-subtle)]">
        Dado de alta el {new Date(c.creado_en).toLocaleDateString("es-PE", { timeZone: "America/Lima" })}.
      </p>
    </div>
  );
}

/**
 * Zona, rubro y vendedor (27/11): con su icono en chip y sin `truncate`
 * —«Agroindustria» se cortaba a 24 px de letra—. El enlace del pie pasa a
 * botón: era un subrayado azul de 14 px que Willy no leía como pulsable.
 */
function Tarjeta({
  icono,
  etiqueta,
  valor,
  pie,
}: {
  icono: LucideIcon;
  etiqueta: string;
  valor: React.ReactNode;
  pie?: React.ReactNode;
}) {
  return (
    <div className="card elev-1 flex min-w-0 flex-col gap-1 border-l-4 border-l-brand-500 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-base font-semibold">{etiqueta}</p>
        <ChipIcono icono={icono} chico />
      </div>
      <p className="break-words text-xl font-bold text-[var(--titulo)]">{valor}</p>
      {pie ? <div className="mt-1 text-sm text-[var(--fg-muted)]">{pie}</div> : null}
    </div>
  );
}

/** Un dato que puede faltar. Se dice «sin registrar», no se deja el hueco. */
function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      {/* El ancho fijo solo cuando va al lado del valor: en el teléfono va
          encima, y con `w-40` «Código del distrito (SUNAT)» se partía en
          dos líneas teniendo la fila entera libre (revisión por módulos del
          02/10). */}
      <dt className="etiqueta-dato shrink-0 sm:w-44">{etiqueta}</dt>
      <dd className="min-w-0 flex-1 break-words font-semibold">
        {valor ?? <span className="text-[var(--fg-subtle)]">Sin registrar</span>}
      </dd>
    </div>
  );
}
