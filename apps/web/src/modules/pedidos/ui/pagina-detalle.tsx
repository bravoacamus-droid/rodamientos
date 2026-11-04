import type * as React from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Ban, Building2, FileText, Receipt, Truck, Wallet } from "lucide-react";
import { EstadoError, Moneda, buttonVariants, cn, formatearFecha } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { Volver } from "@/componentes/volver";
import { emisorParaImprimir } from "@/lib/emisor";
import { misPermisos } from "@/lib/permisos";
import { HistorialDocumento } from "@/modules/bitacora/ui/historial-documento";
import { ordenesDelPedido } from "@/modules/compras/api/consultas";
import {
  cotizacionPorId,
  despachoDelPedido,
  ordenesDelPedido as ordenesDeLaCotizacion,
} from "@/modules/cotizaciones/api/consultas";
import { demandaDeProductos } from "@/modules/cotizaciones/api/demanda";
import { proveedoresGuardados } from "@/modules/cotizaciones/dominio/compra-linea";
import { unidadLegible } from "@/modules/cotizaciones/dominio/unidades";
import { GenerarOrdenes } from "@/modules/cotizaciones/ui/detalle/ordenes-compra";
import { VistaPreviaDocumento } from "@/modules/cotizaciones/ui/detalle/vista-previa";

import { comprasSinRecibir, detallePedido, recepcionesDeLasOrdenes } from "../api/consultas";
import { cubiertaPorElAlmacen } from "@/modules/cotizaciones/dominio/compra-linea";
import type { StockUsable } from "./usar-stock";
import { textoEtapa } from "../dominio/etapa";
import { papelDelPedido } from "../dominio/hoja";
import { OtroPedido } from "@/modules/cotizaciones/ui/detalle/otro-pedido";
import { AccionesPedido } from "./acciones";
import { ComprasDelPedido } from "./compras-del-pedido";
import { CuadreDelPedido } from "./cuadre";
import { DescargarHojaPedido } from "./descargar-hoja";
import { DocumentoPedido } from "./documento";
import { InsigniaEtapa } from "./insignia";

/**
 * La ficha del pedido (130): todo lo que cuelga de UNA confirmación del
 * cliente, en el orden del trabajo — qué pidió, sus compras, su guía, su
 * factura y su cobro.
 *
 * Los botones de lo que sigue solo salen en el pedido VIGENTE (el último de
 * su cotización): una guía o una factura nuevas cuelgan siempre de ese, así
 * que ofrecerlas desde uno anterior las colgaría donde no se mira.
 */
export default async function PaginaDetallePedido({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  // Desde el menú «Acciones» de la lista (15/10): la hoja o repetir, abiertos.
  const sp = (await searchParams) ?? {};
  const abrirHoja = sp.hoja === "1";
  const abrirRepetir = sp.repetir === "1";
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) redirect("/login");
  // Cada paso del pedido es de un módulo distinto (143).
  const permisos = await misPermisos();
  const puedeComprar = permisos.tiene("compras", "crear");
  const puedeDespachar = permisos.tiene("guias", "crear");
  const puedeFacturar = permisos.tiene("facturacion", "crear");
  const puedeCobrar = permisos.tiene("cobranzas", "crear");

  // Y con qué recepción entró cada orden (TR-13).
  const [r, ordenes, emisor, recepciones] = await Promise.all([
    detallePedido(id),
    ordenesDelPedido(id),
    emisorParaImprimir(),
    recepcionesDeLasOrdenes(id),
  ]);
  if (!r.ok) return <EstadoError titulo="No se pudo cargar el pedido" detalle={r.error} />;
  if (!r.datos) notFound();
  const p = r.datos;
  // 188: el vigente es el último que no está anulado; uno anulado no lo es nunca.
  const vivos = p.hermanos.filter((h) => !h.anulado);
  const vigente = !p.anulado && (vivos.length === 0 || vivos[vivos.length - 1]?.id === p.id);
  const guiaEmitida = p.guias.find((g) => g.estado === "emitida");
  const borrador = p.guias.find((g) => g.estado === "borrador");
  const papel = papelDelPedido(p, unidadLegible);
  const puedeEditarCompras = permisos.tiene("compras", "editar");

  /*
    Ordenar las compras desde aquí (Luis, 15/10: «de ahí se hace todo»): lo
    analizado al cotizar, menos lo ya pedido. Solo en el pedido vigente y
    para quien compra; es lo mismo que ofrece la ficha de la cotización.
  */
  let generar: React.ReactNode = null;
  let repetir: React.ReactNode = null;
  const [cot, despacho] = vigente
    ? await Promise.all([cotizacionPorId(p.cotizacion.id), despachoDelPedido(p.cotizacion.id)])
    : [null, null];
  // Con la guía emitida y algo por despachar: otra guía (revisión del 15/10).
  const otraGuia = Boolean(guiaEmitida && despacho?.pendiente && !borrador);
  if (cot?.ok && abrirRepetir && p.facturas.length > 0) {
    repetir = (
      <OtroPedido
        cotizacionId={p.cotizacion.id}
        sinBoton
        abiertoInicial
        alCerrarIr={`/pedidos/${p.id}`}
        lineas={cot.datos.lineas.map((l) => ({
          id: l.id,
          codigo: l.codigo,
          descripcion: l.descripcion,
          cantidad: l.cantidad,
          cantidadConfirmada: l.cantidad_aprobada ?? null,
          unidad: l.unidad_codigo,
          valorUnitario: l.valor_unitario,
          descuentoPct: l.descuento_pct,
        }))}
      />
    );
  }
  if (vigente && puedeComprar) {
    if (cot?.ok) {
      const lineas = cot.datos.lineas
        .filter((l) => l.producto_id !== null)
        .map((l) => ({
          productoId: l.producto_id as string,
          codigo: l.codigo,
          cantidad: Number(l.cantidad),
          confirmada: Number(l.cantidad_aprobada ?? 0),
          unidad: l.unidad_codigo,
          proveedores: proveedoresGuardados(l.cotizacion_item_proveedores),
          // Lo que llegó después del análisis no se vuelve a comprar (04/11).
          stock: l.stock,
          atendida: Number(l.cantidad_atendida ?? 0),
          comprarIgual: l.comprar_igual,
        }));
      const [existentes, demanda] = await Promise.all([
        ordenesDeLaCotizacion(p.cotizacion.id),
        demandaDeProductos(lineas.map((l) => l.productoId)),
      ]);
      generar = (
        <GenerarOrdenes
          cotizacionId={p.cotizacion.id}
          lineas={lineas}
          existentes={existentes}
          demanda={[...demanda.values()]}
        />
      );
    }
  }

  /*
    Lo que llegó después del análisis (04/11). Por cada orden del pedido que
    todavía no se compró, los productos que el almacén ya cubre: ahí sale
    «Usar el stock». Solo en el vigente, con su cotización a mano.
  */
  const usables = new Map<string, StockUsable[]>();
  if (vigente && cot?.ok && ordenes.ok && puedeEditarCompras) {
    for (const o of ordenes.datos) {
      if (!(o.falta_factura && o.estado === "registrada")) continue;
      for (const x of o.productos) {
        const l = cot.datos.lineas.find((y) => y.producto_id === x.producto_id && Number(y.cantidad_aprobada ?? 0) > 0);
        if (!l || !l.producto_id) continue;
        const linea = {
          productoId: l.producto_id,
          codigo: l.codigo,
          cantidad: Number(l.cantidad),
          confirmada: Number(l.cantidad_aprobada ?? 0),
          unidad: l.unidad_codigo,
          proveedores: [],
          stock: l.stock,
          atendida: Number(l.cantidad_atendida ?? 0),
          // Aquí manda lo que hay: la orden ya existe y la pregunta es si
          // hace falta. «Comprar igual» no esconde el botón.
          comprarIgual: false,
        };
        if (!cubiertaPorElAlmacen(linea)) continue;
        const lista = usables.get(o.id) ?? [];
        lista.push({
          itemId: l.id,
          codigo: l.codigo,
          stock: l.stock,
          necesita: Math.max(0, linea.confirmada - linea.atendida),
        });
        usables.set(o.id, lista);
      }
    }
  }
  const productosDelPedido = p.lineas.map((l) => l.productoId).filter((x): x is string => x !== null);
  const sinRecibir = await comprasSinRecibir(productosDelPedido, p.id);

  return (
    <>
    <div className="flex flex-col gap-5 print:hidden">
      <Volver href="/pedidos">Volver a pedidos</Volver>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
            Pedido {p.secuencia > 1 ? `${p.secuencia} ` : ""}de la cotización{" "}
            <Link href={`/cotizaciones/${p.cotizacion.id}`} className="text-brand-600 hover:underline">
              {p.cotizacion.numero}
            </Link>
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {p.numero} · {p.cliente}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p className="text-sm text-[var(--fg-muted)]">
              Confirmado el {formatearFecha(p.fecha)}
              {p.cotizacion.ordenCompraCliente && vigente ? ` · O/C del cliente ${p.cotizacion.ordenCompraCliente}` : ""}
            </p>
            {/* Al cliente, para corregir sus datos sin buscarlo (FS-08). */}
            {p.clienteId ? (
              <Link
                href={`/clientes/${p.clienteId}`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "px-3")}
              >
                <Building2 className="size-4" aria-hidden="true" />
                Ficha del cliente
              </Link>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {p.anulado ? (
            <span className="inline-flex h-control-md items-center gap-2 rounded-md border-2 border-[var(--danger)] bg-[var(--danger-bg)] px-3 text-base font-semibold text-[var(--danger)]">
              <Ban className="size-5" aria-hidden="true" />
              Anulado
            </span>
          ) : (
            <InsigniaEtapa etapa={p.etapa} despacho={p.despacho} grande />
          )}
          {/* La hoja de pedido (Luis, 15/10: «se puede imprimir, igual
              descargar la hoja de pedido»). */}
          {p.lineas.length > 0 ? (
            <>
              <VistaPreviaDocumento
                key={abrirHoja ? "hoja" : "ficha"}
                abiertaInicial={abrirHoja}
                alCerrarIr={abrirHoja ? `/pedidos/${p.id}` : undefined}
                numero={p.numero}
                junto={<DescargarHojaPedido numero={p.numero} cliente={p.cliente} papel={papel} emisor={emisor} />}
              >
                <DocumentoPedido numero={p.numero} papel={papel} emisor={emisor} />
              </VistaPreviaDocumento>
              <DescargarHojaPedido numero={p.numero} cliente={p.cliente} papel={papel} emisor={emisor} />
            </>
          ) : null}
          <AccionesPedido
            enFicha
            p={{
              id: p.id,
              numero: p.numero,
              cotizacionId: p.cotizacion.id,
              cotizacion: p.cotizacion.numero,
              vigente,
              guia: guiaEmitida
                ? { id: guiaEmitida.id, emitida: true }
                : borrador
                  ? { id: borrador.id, emitida: false }
                  : null,
              facturado: p.facturas.length > 0,
              conCompras: ordenes.ok ? ordenes.datos.some((o) => o.estado !== "anulada") : true,
              otraGuia,
              anulado: Boolean(p.anulado),
            }}
          />
          {repetir}
        </div>
      </header>

      {/*
        Anulado (188). Luis, 04/11: «tiene que quedar… para que quede ahí
        registro». Lo que pedía es la foto que se guardó al anularlo.
      */}
      {p.anulado ? (
        <div className="flex gap-3 rounded-md border-2 border-[var(--danger)] bg-[var(--danger-bg)] px-4 py-3">
          <Ban className="mt-0.5 size-5 shrink-0 text-[var(--danger)]" aria-hidden="true" />
          <div>
            <p className="text-base font-semibold">
              Pedido anulado
              {p.anulado.en ? ` el ${formatearFecha(p.anulado.en.slice(0, 10))}` : ""}
              {p.anulado.por ? ` por ${p.anulado.por}` : ""}
            </p>
            {p.anulado.motivo ? <p className="text-base">Motivo: {p.anulado.motivo}</p> : null}
            <p className="mt-1 text-sm text-[var(--fg-muted)]">
              Se queda aquí para el registro: no lleva compras, guía ni factura. Si se vuelve a aprobar la cotización{" "}
              {p.cotizacion.numero}, sale un pedido nuevo con el número siguiente.
            </p>
          </div>
        </div>
      ) : null}

      {/* Los otros pedidos de la misma cotización: el cliente repite. */}
      {p.hermanos.length > 1 ? (
        <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label="Pedidos de la misma cotización">
          <span className="text-[var(--fg-muted)]">Pedidos de {p.cotizacion.numero}:</span>
          {p.hermanos.map((h) =>
            h.id === p.id ? (
              <span key={h.id} className="rounded-md border-2 border-brand-600 px-2.5 py-1 font-semibold">
                {h.numero}
                {h.anulado ? " (anulado)" : ""}
              </span>
            ) : (
              <Link
                key={h.id}
                href={`/pedidos/${h.id}`}
                className="rounded-md border border-[var(--border-strong)] px-2.5 py-1 hover:bg-[var(--surface-2)]"
              >
                {h.numero}
                {h.anulado ? " (anulado)" : ""}
              </Link>
            ),
          )}
        </nav>
      ) : null}

      {/* 161: lo despachado, lo facturado y lo cobrado, de un vistazo. */}
      {p.anulado ? null : <CuadreDelPedido despacho={p.despacho} facturas={p.facturas} />}

      {/* ------------------------------------------------ Qué pidió */}
      <section className="card p-4">
        <h2 className="mb-2 text-lg font-semibold">Qué pidió</h2>
        {p.lineas.length === 0 ? (
          <p className="text-sm text-[var(--fg-muted)]">Sin productos.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
            {p.lineas.map((l) => (
              <li key={l.codigo} className="flex items-baseline gap-3 py-2">
                <span className="w-32 shrink-0 font-mono text-sm font-semibold">{l.codigo}</span>
                <span className="min-w-0 flex-1 text-sm">{l.descripcion}</span>
                <span className="shrink-0 text-base font-semibold tabular">
                  {l.cantidad} <span className="text-sm font-normal text-[var(--fg-muted)]">{unidadLegible(l.unidad)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {p.anulado ? null : (
      <>
      {/* ------------------------------------------------ Compras */}
      {ordenes.ok ? (
        <ComprasDelPedido
          ordenes={ordenes.datos}
          puede={puedeComprar}
          cotizacionId={p.cotizacion.id}
          generar={generar}
          recepciones={recepciones}
          usables={usables}
          sinRecibir={sinRecibir}
          pedidoId={p.id}
        />
      ) : (
        <EstadoError titulo="No se pudieron cargar las compras" detalle={ordenes.error} />
      )}

      {/* ------------------------------------------------ Guía */}
      <section className="card flex flex-col gap-2 p-4">
        <h2 className="text-lg font-semibold">Guía de remisión</h2>
        {p.guias.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {p.guias.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-x-3 text-sm">
                <Truck className="size-4 text-[var(--fg-muted)]" aria-hidden="true" />
                <Link href={`/guias/${g.id}`} className="font-mono font-semibold text-brand-600 hover:underline">
                  {g.numero}
                </Link>
                <span>{g.estado === "emitida" ? "Emitida" : "Borrador, todavía no sale"}</span>
                <span className="text-[var(--fg-muted)]">{formatearFecha(g.fecha)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--fg-muted)]">Todavía no se ha despachado.</p>
        )}
        {vigente && puedeDespachar && !guiaEmitida ? (
          <Link
            href={borrador ? `/guias/${borrador.id}` : `/guias/nueva?cotizacion=${p.cotizacion.id}`}
            className={cn(buttonVariants(), "mt-1 w-fit px-4")}
          >
            <Truck className="size-4" aria-hidden="true" />
            {borrador ? "Seguir con la guía" : "Hacer la guía"}
          </Link>
        ) : vigente && puedeDespachar && otraGuia ? (
          <Link
            href={`/guias/nueva?cotizacion=${p.cotizacion.id}`}
            className={cn(buttonVariants({ variant: "outline" }), "mt-1 w-fit px-4")}
          >
            <Truck className="size-4" aria-hidden="true" />
            Hacer otra guía · queda algo por despachar
          </Link>
        ) : null}
      </section>

      {/* ------------------------------------------------ Factura y cobro */}
      <section className="card flex flex-col gap-2 p-4">
        <h2 className="text-lg font-semibold">Factura y cobro</h2>
        {p.facturas.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {p.facturas.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <FileText className="size-4 text-[var(--fg-muted)]" aria-hidden="true" />
                <Link href={`/facturacion/${f.id}`} className="font-mono font-semibold text-brand-600 hover:underline">
                  {f.numero}
                </Link>
                <Moneda valor={f.total} moneda={f.moneda} tamano="sm" />
                {f.saldo > 0.005 ? (
                  <span className="font-medium">
                    falta cobrar <Moneda valor={f.saldo} moneda={f.moneda} tamano="sm" className="text-inherit" />
                  </span>
                ) : (
                  <span className="font-medium text-[var(--ok)]">cobrada</span>
                )}
                {f.saldo > 0.005 && puedeCobrar ? (
                  <Link
                    href={`/cobranzas?q=${encodeURIComponent(f.numero)}`}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "px-3")}
                  >
                    <Wallet className="size-4" aria-hidden="true" />
                    Registrar cobro
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--fg-muted)]">
            {guiaEmitida ? "Despachado y sin facturar." : "Se factura después de la guía."}
          </p>
        )}
        {vigente && puedeFacturar && guiaEmitida && p.facturas.length === 0 ? (
          <Link
            href={`/facturacion/nueva?cotizacion=${p.cotizacion.id}&guia=${guiaEmitida.id}`}
            className={cn(buttonVariants(), "mt-1 w-fit px-4")}
          >
            <Receipt className="size-4" aria-hidden="true" />
            Facturar
          </Link>
        ) : null}
      </section>

      <p className="text-sm text-[var(--fg-subtle)]">Etapa: {textoEtapa(p.etapa, p.despacho)}.</p>
      </>
      )}

      {/* Quién lo creó o lo cambió (TR-03). */}
      <HistorialDocumento entidad="pedidos" id={p.id} />
    </div>

    {/* El papel: montado siempre, visible solo al imprimir (como la cotización). */}
    <div className="hidden print:block">
      <DocumentoPedido numero={p.numero} papel={papel} emisor={emisor} />
    </div>
    </>
  );
}
