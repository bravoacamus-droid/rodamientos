import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import {
  Wallet, Package, FileText, TrendingUp, AlertTriangle, Boxes, Users,
  ShoppingCart, Siren, ArrowRight, CircleDollarSign, Receipt, Truck, Activity,
} from "lucide-react";
import { createClient, getSesion } from "@/lib/supabase/server";
import { PageHeader, Contenedor } from "@/components/layout/shell";
import { KpiCard, MiniStat, SeccionTitulo } from "@/components/ui/kpi";
import { Card, CardContent, CardHeader, CardTitle, Badge, Skeleton, EmptyState, Progress } from "@/components/ui/primitives";
import { EstadoBadge } from "@/components/ui/estados";
import { GraficoVentas, GraficoProyeccion, GraficoBarrasH, GraficoAging } from "@/components/charts/graficos";
import { money, moneyShort, num, pct, fecha, haceTiempo, variacion, inicioDeMesISO, hoyISO } from "@/lib/utils";

export const metadata: Metadata = { title: "Tablero" };
export const dynamic = "force-dynamic";

/* ============================================================== KPIs */

async function BloqueKpis() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("kpis_dashboard", {
    p_desde: inicioDeMesISO(),
    p_hasta: hoyISO(),
  });
  const k = (data ?? {}) as Record<string, number>;

  const conversion = k.cotizaciones ? (k.convertidas / k.cotizaciones) * 100 : 0;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          titulo="Ventas del mes"
          valor={money(k.ventas)}
          variacion={variacion(k.ventas, k.ventas_prev)}
          sub="vs. periodo anterior"
          icon={<CircleDollarSign />}
          acento="brand"
          href="/facturacion"
        />
        <KpiCard
          titulo="Margen bruto"
          valor={money(k.margen)}
          variacion={variacion(k.margen, k.margen_prev)}
          sub={`${pct(k.venta_neta ? (k.margen / k.venta_neta) * 100 : 0)} sobre venta neta`}
          icon={<TrendingUp />}
          acento="success"
          href="/reportes"
        />
        <KpiCard
          titulo="Cartera por cobrar"
          valor={money(k.cartera)}
          sub={`${money(k.cartera_vencida)} vencido`}
          icon={<Wallet />}
          acento={k.cartera_vencida > k.cartera * 0.4 ? "danger" : "warning"}
          href="/cobranzas"
        >
          <Progress
            value={k.cartera - k.cartera_vencida}
            max={k.cartera || 1}
            tone={k.cartera_vencida > k.cartera * 0.4 ? "danger" : "success"}
          />
        </KpiCard>
        <KpiCard
          titulo="Inventario valorizado"
          valor={money(k.valorizado)}
          sub={`${num(k.skus, 0)} SKU activos · ${num(k.skus_criticos, 0)} críticos`}
          icon={<Boxes />}
          acento="neutral"
          href="/inventario"
        />
      </div>

      <div className="mt-3 grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MiniStat
          label="Cotizaciones del mes"
          valor={num(k.cotizaciones, 0)}
          icon={<FileText />}
          href="/cotizaciones"
        />
        <MiniStat
          label="Tasa de conversión"
          valor={pct(conversion, 0)}
          tono={conversion >= 35 ? "success" : "warning"}
          icon={<Activity />}
          href="/cotizaciones"
        />
        <MiniStat
          label="Pedidos en curso"
          valor={num(k.pedidos_pendientes, 0)}
          icon={<ShoppingCart />}
          href="/pedidos"
        />
        <MiniStat
          label="Emergencias por aprobar"
          valor={num(k.emergencias, 0)}
          tono={k.emergencias > 0 ? "danger" : "success"}
          icon={<Siren />}
          href="/pedidos?emergencia=1"
        />
        <MiniStat
          label="Compras del mes"
          valor={moneyShort(k.compras)}
          icon={<Truck />}
          href="/compras"
        />
        <MiniStat
          label="Alertas activas"
          valor={num(k.alertas, 0)}
          tono={k.alertas_criticas > 0 ? "warning" : "success"}
          icon={<AlertTriangle />}
          href="/alertas"
        />
      </div>
    </>
  );
}

/* ============================================================== Ventas */

async function BloqueVentas() {
  const supabase = await createClient();
  const [{ data: mensual }, { data: proy }] = await Promise.all([
    supabase.from("v_ventas_mensuales").select("*").order("mes", { ascending: true }).limit(13),
    supabase.rpc("proyeccion_ventas", { p_meses: 3 }),
  ]);

  const serie = (mensual ?? []).map((m) => ({
    etiqueta: String(m.etiqueta).replace(".", ""),
    venta: Number(m.venta_total ?? 0),
    margen: Number(m.margen ?? 0),
  }));

  const proyeccion = (
    (proy ?? []) as { etiqueta: string; valor_real: number | null; proyectado: number | null }[]
  ).map((p) => ({
    etiqueta: String(p.etiqueta).replace(".", ""),
    real: p.valor_real === null ? null : Number(p.valor_real),
    proyectado: p.proyectado === null ? null : Number(p.proyectado),
  }));

  const ultimo = serie.at(-1);
  const margenPct = ultimo && ultimo.venta ? (ultimo.margen / ultimo.venta) * 100 : 0;

  return (
    <div className="grid gap-3 xl:grid-cols-5">
      <Card className="xl:col-span-3">
        <CardHeader>
          <div>
            <CardTitle>Evolución de ventas y margen</CardTitle>
            <p className="mt-0.5 text-[11.5px] text-muted">
              Facturación mensual y margen bruto en soles · últimos 13 meses
            </p>
          </div>
          <Badge tone="brand" size="sm">
            Margen actual {pct(margenPct, 1)}
          </Badge>
        </CardHeader>
        <CardContent>
          {serie.length ? (
            <GraficoVentas data={serie} />
          ) : (
            <EmptyState titulo="Sin ventas registradas" icon={<Receipt />} />
          )}
        </CardContent>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader>
          <div>
            <CardTitle>Proyección de ventas</CardTitle>
            <p className="mt-0.5 text-[11.5px] text-muted">
              Tendencia lineal sobre los últimos 12 meses · 3 meses hacia adelante
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {proyeccion.length ? (
            <GraficoProyeccion data={proyeccion} />
          ) : (
            <EmptyState titulo="Datos insuficientes para proyectar" icon={<TrendingUp />} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ============================================================== Cartera */

async function BloqueCartera() {
  const supabase = await createClient();
  const [{ data: cartera }, { data: top }] = await Promise.all([
    supabase.from("v_cartera").select("tramo, saldo, cliente"),
    supabase.from("v_top_productos").select("*").order("venta", { ascending: false }).limit(8),
  ]);

  const orden = ["vigente", "1-15", "16-30", "31-60", "60+"];
  const etiquetas: Record<string, string> = {
    vigente: "Vigente",
    "1-15": "1-15 d",
    "16-30": "16-30 d",
    "31-60": "31-60 d",
    "60+": "+60 d",
  };
  const agrupado = orden.map((t) => ({
    tramo: etiquetas[t],
    monto: (cartera ?? [])
      .filter((c) => c.tramo === t)
      .reduce((s, c) => s + Number(c.saldo ?? 0), 0),
  }));

  const productos = (top ?? []).map((p) => ({
    nombre: String(p.sku),
    valor: Number(p.venta ?? 0),
  }));

  return (
    <div className="grid gap-3 xl:grid-cols-5">
      <Card className="xl:col-span-2">
        <CardHeader>
          <div>
            <CardTitle>Antigüedad de la cartera</CardTitle>
            <p className="mt-0.5 text-[11.5px] text-muted">Saldo por cobrar según días de vencimiento</p>
          </div>
          <Link href="/cobranzas" className="text-[11.5px] font-medium text-brand-600 hover:underline">
            Ver cartera
          </Link>
        </CardHeader>
        <CardContent>
          <GraficoAging data={agrupado} />
        </CardContent>
      </Card>

      <Card className="xl:col-span-3">
        <CardHeader>
          <div>
            <CardTitle>Productos más vendidos</CardTitle>
            <p className="mt-0.5 text-[11.5px] text-muted">Venta acumulada por SKU en el histórico</p>
          </div>
          <Link href="/reportes" className="text-[11.5px] font-medium text-brand-600 hover:underline">
            Reportería
          </Link>
        </CardHeader>
        <CardContent>
          {productos.length ? (
            <GraficoBarrasH data={productos} anchoEje={132} />
          ) : (
            <EmptyState titulo="Sin ventas por producto" icon={<Package />} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ============================================================== Paneles */

async function BloqueOperacion() {
  const supabase = await createClient();
  const [{ data: alertas }, { data: cotiz }, { data: actividad }] = await Promise.all([
    supabase
      .from("alertas")
      .select("id, tipo, severidad, titulo, mensaje, accion_url, valor")
      .eq("archivada", false)
      .in("severidad", ["critica", "alta"])
      .order("generada_en", { ascending: false })
      .limit(6),
    supabase
      .from("cotizaciones")
      .select("id, numero, fecha, total, estado, margen_pct, clientes(razon_social)")
      .order("fecha", { ascending: false })
      .limit(7),
    supabase
      .from("actividad")
      .select("id, usuario_nombre, accion, descripcion, creado_en")
      .order("creado_en", { ascending: false })
      .limit(8),
  ]);

  const iconoAlerta: Record<string, React.ReactNode> = {
    stock_bajo: <Package />,
    stock_negativo: <AlertTriangle />,
    credito_vencido: <Wallet />,
    credito_vence: <Wallet />,
    linea_credito: <Users />,
    emergencia: <Siren />,
    margen_bajo: <TrendingUp />,
    reposicion: <ShoppingCart />,
    sin_rotacion: <Boxes />,
  };

  return (
    <div className="grid gap-3 xl:grid-cols-3">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Alertas prioritarias</CardTitle>
            <p className="mt-0.5 text-[11.5px] text-muted">Requieren decisión inmediata</p>
          </div>
          <Link href="/alertas" className="text-[11.5px] font-medium text-brand-600 hover:underline">
            Ver todas
          </Link>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {alertas?.length ? (
            <ul className="divide-y divide-[var(--border-soft)]">
              {alertas.map((a) => (
                <li key={a.id}>
                  <Link
                    href={a.accion_url ?? "/alertas"}
                    className="flex items-start gap-3 px-5 py-2.5 transition-colors hover:bg-[var(--surface-2)]"
                  >
                    <span
                      className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg [&_svg]:size-3.5"
                      style={{
                        backgroundColor:
                          a.severidad === "critica" ? "var(--danger-bg)" : "var(--warn-bg)",
                        color: a.severidad === "critica" ? "var(--danger)" : "var(--warn)",
                      }}
                    >
                      {iconoAlerta[a.tipo] ?? <AlertTriangle />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium text-fg">
                        {a.titulo}
                      </span>
                      <span className="mt-0.5 block line-clamp-2 text-[11px] leading-snug text-muted">
                        {a.mensaje}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState titulo="Sin alertas críticas" descripcion="La operación está bajo control." />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Últimas cotizaciones</CardTitle>
            <p className="mt-0.5 text-[11.5px] text-muted">Seguimiento comercial reciente</p>
          </div>
          <Link href="/cotizaciones" className="text-[11.5px] font-medium text-brand-600 hover:underline">
            Ver todas
          </Link>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <ul className="divide-y divide-[var(--border-soft)]">
            {(cotiz ?? []).map((c) => {
              const cli = c.clientes as unknown as { razon_social: string } | null;
              return (
                <li key={c.id}>
                  <Link
                    href={`/cotizaciones/${c.id}`}
                    className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-[var(--surface-2)]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-[12.5px] font-semibold text-fg tabular">{c.numero}</span>
                        <EstadoBadge tipo="cotizacion" valor={c.estado} size="xs" />
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted">
                        {cli?.razon_social} · {fecha(c.fecha)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[12.5px] font-semibold text-fg tabular">
                        {money(c.total)}
                      </span>
                      <span
                        className="block text-[10.5px] tabular"
                        style={{
                          color: Number(c.margen_pct) < 15 ? "var(--danger)" : "var(--fg-subtle)",
                        }}
                      >
                        margen {pct(c.margen_pct, 0)}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Actividad del equipo</CardTitle>
            <p className="mt-0.5 text-[11.5px] text-muted">Bitácora operativa</p>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <ul className="divide-y divide-[var(--border-soft)]">
            {(actividad ?? []).map((a) => (
              <li key={a.id} className="flex items-start gap-3 px-5 py-2.5">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-400" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] leading-snug text-fg">{a.descripcion}</span>
                  <span className="mt-0.5 block text-[10.5px] text-subtle">
                    {a.usuario_nombre} · {haceTiempo(a.creado_en)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

/* ============================================================== Página */

export default async function DashboardPage() {
  const sesion = await getSesion();
  const nombre = sesion?.perfil?.nombre?.split(" ")[0] ?? "";
  const hora = new Date().getHours();
  const saludo = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";

  return (
    <>
      <PageHeader
        titulo={`${saludo}, ${nombre}`}
        descripcion="Resumen operativo y comercial de Inversiones Rodatech al día de hoy."
        badge={<Badge tone="brand" size="sm">{fecha(new Date())}</Badge>}
        acciones={
          <>
            <Link
              href="/cotizaciones/nueva"
              className="inline-flex h-9 items-center gap-2 rounded-md border bg-[var(--surface)] px-3.5 text-[13px] font-medium text-fg transition-colors hover:border-brand-300"
            >
              <FileText className="size-4" />
              Nueva cotización
            </Link>
            <Link
              href="/reportes"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-brand-600 px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-700"
            >
              Reportería
              <ArrowRight className="size-4" />
            </Link>
          </>
        }
      />

      <Contenedor className="space-y-4">
        <Suspense fallback={<EsqueletoKpis />}>
          <BloqueKpis />
        </Suspense>

        <Suspense fallback={<EsqueletoGrafico />}>
          <BloqueVentas />
        </Suspense>

        <Suspense fallback={<EsqueletoGrafico />}>
          <BloqueCartera />
        </Suspense>

        <div>
          <SeccionTitulo
            titulo="Panel operativo"
            descripcion="Alertas del sistema, pipeline comercial y bitácora del equipo"
          />
          <Suspense fallback={<EsqueletoPaneles />}>
            <BloqueOperacion />
          </Suspense>
        </div>
      </Contenedor>
    </>
  );
}

/* ---------------------------------------------------------- Esqueletos */

function EsqueletoKpis() {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card elev-1 p-4">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="mt-3 h-7 w-36" />
            <Skeleton className="mt-3 h-2.5 w-28" />
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card elev-1 flex items-center gap-3 p-3">
            <Skeleton className="size-9 rounded-lg" />
            <div className="flex-1">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="mt-1.5 h-2 w-20" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function EsqueletoGrafico() {
  return (
    <div className="grid gap-3 xl:grid-cols-5">
      <div className="card elev-1 p-5 xl:col-span-3">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="mt-2 h-2 w-64" />
        <Skeleton className="mt-5 h-[240px] w-full rounded-lg" />
      </div>
      <div className="card elev-1 p-5 xl:col-span-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-2 h-2 w-56" />
        <Skeleton className="mt-5 h-[220px] w-full rounded-lg" />
      </div>
    </div>
  );
}

function EsqueletoPaneles() {
  return (
    <div className="grid gap-3 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="card elev-1 p-5">
          <Skeleton className="h-3 w-36" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 6 }).map((_, j) => (
              <div key={j} className="flex gap-3">
                <Skeleton className="size-7 shrink-0 rounded-lg" />
                <div className="flex-1">
                  <Skeleton className="h-2.5 w-full" />
                  <Skeleton className="mt-1.5 h-2 w-3/5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
