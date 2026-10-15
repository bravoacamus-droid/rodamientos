import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AlertTriangle, Banknote, ClipboardList, Percent, ShoppingCart, Truck } from "lucide-react";
import { EstadoError, Skeleton, formatearMoneda, leerTamano } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { BarraPeriodo } from "@/componentes/barra-periodo";
import { FilaIndicadores, textoPeriodo } from "@/componentes/indicadores";
import { nombreDelCliente } from "@/modules/clientes/acciones/buscar";

import { filasDePedidos } from "../api/consultas";
import { cifras, filtrar, leerOrden, ordenar, paginar, type FiltrosPedidos } from "../dominio/lista";
import { FiltrosPedidosBarra } from "./filtros";
import { PestanasPedidos } from "./pestanas";
import { TablaPedidos } from "./tabla";

function uno(v: string | string[] | undefined): string | undefined {
  const valor = Array.isArray(v) ? v[0] : v;
  return valor && valor.length > 0 ? valor : undefined;
}

/**
 * Pedidos (130, 131). Antes «Listos para entregar», que solo enseñaba una
 * etapa.
 *
 * Luis, 15/10: *«en pedido tenemos que hacerlo tabla también, para poner ahí
 * ordenado, y los filtros también como en los demás módulos… aparte del
 * total, margen, estados, si está pagado o enviado a SUNAT o si ya tiene una
 * guía hecha… y KPIs informativos»*. Como guías y facturación: periodo
 * arriba, una fila de filtros, las cifras y la tabla.
 */
export default async function PaginaPedidos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) redirect("/login");

  const sp = await searchParams;
  const params: Record<string, string | undefined> = Object.fromEntries(
    Object.keys(sp).map((k) => [k, uno(sp[k])]),
  );
  const filtros: FiltrosPedidos = {
    q: params.q,
    cliente: params.cliente,
    etapa: params.etapa,
    cobro: params.cobro,
    sunat: params.sunat,
    guia: params.guia,
  };
  const orden = leerOrden(params.orden);
  const tamano = leerTamano(params.n);
  const cliente = filtros.cliente ? await nombreDelCliente(filtros.cliente) : null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pedidos</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Cada vez que un cliente confirma, nace un pedido: se compra lo que falta, se despacha con su guía, se
          factura y se cobra.
        </p>
      </div>

      <PestanasPedidos activa="todos" />

      <Suspense key={JSON.stringify(params)} fallback={<Skeleton className="h-[32rem] w-full" />}>
        <Contenido
          params={params}
          filtros={filtros}
          orden={orden}
          tamano={tamano}
          nombreCliente={cliente?.ok ? cliente.nombre : null}
        />
      </Suspense>
    </div>
  );
}

async function Contenido({
  params,
  filtros,
  orden,
  tamano,
  nombreCliente,
}: {
  params: Record<string, string | undefined>;
  filtros: FiltrosPedidos;
  orden: ReturnType<typeof leerOrden>;
  tamano: number;
  nombreCliente: string | null;
}) {
  const r = await filasDePedidos({ desde: params.desde, hasta: params.hasta });
  if (!r.ok) return <EstadoError titulo="No se pudieron cargar los pedidos" detalle={r.error} />;

  const filtradas = ordenar(filtrar(r.datos, filtros), orden.campo, orden.desc);
  const c = cifras(filtradas);
  const pag = paginar(filtradas, Number(params.cursor ?? 1), tamano);
  const filtrando = Object.values(filtros).some(Boolean);
  const usd = (n: number) => formatearMoneda(n, "USD");

  return (
    <>
      <FilaIndicadores
        items={[
          {
            etiqueta: "Pedidos",
            valor: c.pedidos.toLocaleString("es-PE"),
            detalle: `confirmados · ${textoPeriodo(params.desde, params.hasta)}`,
            icono: <ClipboardList aria-hidden="true" />,
          },
          {
            etiqueta: "Vendido",
            valor: usd(c.venta),
            detalle: c.margen === null ? "sin IGV · sin costo analizado" : `sin IGV · margen ${c.margen.toFixed(1)} % sobre el costo`,
            tono: c.margen !== null && c.margen < 10 ? "aviso" : undefined,
            icono: <Percent aria-hidden="true" />,
          },
          {
            etiqueta: "Por hacer",
            valor: (c.porRegistrarCompra + c.porFacturar).toLocaleString("es-PE"),
            detalle:
              c.porRegistrarCompra + c.porFacturar === 0
                ? "nada pendiente de compra ni de facturar"
                : `${c.porRegistrarCompra} sin registrar la compra · ${c.porFacturar} por facturar`,
            tono: c.porRegistrarCompra + c.porFacturar > 0 ? "aviso" : "ok",
            icono: c.porFacturar > 0 ? <Truck aria-hidden="true" /> : <ShoppingCart aria-hidden="true" />,
            href: c.porRegistrarCompra > 0 ? "/pedidos?etapa=por_registrar_compra" : c.porFacturar > 0 ? "/pedidos?etapa=por_facturar" : undefined,
          },
          {
            etiqueta: "Por cobrar",
            valor: usd(c.porCobrarUsd),
            detalle: c.vencidos > 0 ? `${c.vencidos} con la factura vencida` : "de lo facturado de estos pedidos",
            tono: c.vencidos > 0 ? "urgente" : c.porCobrarUsd > 0 ? "aviso" : "ok",
            icono: c.vencidos > 0 ? <AlertTriangle aria-hidden="true" /> : <Banknote aria-hidden="true" />,
            href: c.vencidos > 0 ? "/pedidos?cobro=vencido" : c.porCobrarUsd > 0 ? "/pedidos?cobro=pendiente" : undefined,
          },
        ]}
      />

      <section className="card pt-4">
        <div className="flex flex-col gap-3 px-4 pb-4">
          <BarraPeriodo />
          <FiltrosPedidosBarra nombreCliente={nombreCliente} />
        </div>
        <TablaPedidos
          filas={pag.filas}
          total={filtradas.length}
          params={params}
          orden={orden}
          pagina={pag}
          porPagina={tamano}
          filtrando={filtrando}
        />
      </section>
    </>
  );
}
