import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import {
  ChartNoAxesCombined, TrendingUp, Package, Users, Boxes, Wallet, Ship, Percent,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Contenedor } from "@/components/layout/shell";
import { Card, CardHeader, CardTitle, CardContent, Table, THead, TBody, Badge, SkeletonTable } from "@/components/ui/primitives";
import { MiniStat } from "@/components/ui/kpi";
import {
  GraficoVentas, GraficoProyeccion, GraficoBarrasH, GraficoComparativo, BarraParticipacion,
} from "@/components/charts/graficos";
import { money, moneyShort, num, pct } from "@/lib/utils";

export const metadata: Metadata = { title: "Reportería y BI" };
export const dynamic = "force-dynamic";

async function Tableros() {
  const supabase = await createClient();

  const [
    { data: mensual },
    { data: proy },
    { data: topProd },
    { data: clientes },
    { data: stock },
    { data: compras },
  ] = await Promise.all([
    supabase.from("v_ventas_mensuales").select("*").order("mes").limit(13),
    supabase.rpc("proyeccion_ventas", { p_meses: 3 }),
    supabase.from("v_top_productos").select("*").order("venta", { ascending: false }).limit(200),
    supabase.from("v_resumen_clientes").select("razon_social, sector, total_vendido, margen, deuda, documentos").order("total_vendido", { ascending: false }).limit(60),
    supabase.from("v_stock_productos").select("categoria, marca, valorizado, stock_total, estado_stock").eq("activo", true),
    supabase.from("ordenes_compra").select("fecha, total, moneda, tipo, estado").neq("estado", "anulada"),
  ]);

  /* ------------------------------------------------------------ Series */
  const serieVentas = (mensual ?? []).map((m) => ({
    etiqueta: String(m.etiqueta).replace(".", ""),
    venta: Number(m.venta_total ?? 0),
    margen: Number(m.margen ?? 0),
  }));

  const serieProy = ((proy ?? []) as { etiqueta: string; valor_real: number | null; proyectado: number | null }[]).map((p) => ({
    etiqueta: String(p.etiqueta).replace(".", ""),
    real: p.valor_real === null ? null : Number(p.valor_real),
    proyectado: p.proyectado === null ? null : Number(p.proyectado),
  }));

  const comprasPorMes = Object.entries(
    (compras ?? []).reduce<Record<string, number>>((acc, o) => {
      const k = String(o.fecha).slice(0, 7);
      acc[k] = (acc[k] ?? 0) + Number(o.total) * (o.moneda === "USD" ? 3.755 : 1);
      return acc;
    }, {})
  ).sort();

  const comparativo = (mensual ?? []).map((m) => {
    const k = String(m.mes).slice(0, 7);
    return {
      etiqueta: String(m.etiqueta).replace(".", ""),
      a: Number(m.venta_total ?? 0),
      b: comprasPorMes.find(([mes]) => mes === k)?.[1] ?? 0,
    };
  });

  /* ------------------------------------------------------------- Rankings */
  const topVenta = (topProd ?? []).slice(0, 10).map((p) => ({ nombre: String(p.sku), valor: Number(p.venta) }));
  const topMargen = [...(topProd ?? [])]
    .sort((a, b) => Number(b.margen) - Number(a.margen))
    .slice(0, 10)
    .map((p) => ({ nombre: String(p.sku), valor: Number(p.margen) }));
  const topClientes = (clientes ?? []).slice(0, 10).map((c) => ({
    nombre: c.razon_social.length > 24 ? `${c.razon_social.slice(0, 23)}…` : c.razon_social,
    valor: Number(c.total_vendido),
  }));

  const porSector = Object.entries(
    (clientes ?? []).reduce<Record<string, number>>((acc, c) => {
      const k = c.sector ?? "Otros";
      acc[k] = (acc[k] ?? 0) + Number(c.total_vendido);
      return acc;
    }, {})
  )
    .map(([nombre, valor]) => ({ nombre, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 6);

  const porLinea = Object.entries(
    (topProd ?? []).reduce<Record<string, number>>((acc, p) => {
      const k = p.categoria ?? "Otros";
      acc[k] = (acc[k] ?? 0) + Number(p.venta);
      return acc;
    }, {})
  )
    .map(([nombre, valor]) => ({ nombre, valor }))
    .sort((a, b) => b.valor - a.valor);

  const porMarca = Object.entries(
    (stock ?? []).reduce<Record<string, number>>((acc, s) => {
      const k = s.marca ?? "Sin marca";
      acc[k] = (acc[k] ?? 0) + Number(s.valorizado);
      return acc;
    }, {})
  )
    .map(([nombre, valor]) => ({ nombre, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);

  /* ------------------------------------------------------------ Totales */
  const ventaTotal = serieVentas.reduce((s, x) => s + x.venta, 0);
  const margenTotal = serieVentas.reduce((s, x) => s + x.margen, 0);
  const valorizado = (stock ?? []).reduce((s, x) => s + Number(x.valorizado), 0);
  const rotacion = valorizado > 0 ? (ventaTotal - margenTotal) / valorizado : 0;

  return (
    <>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Venta acumulada (13 meses)" valor={money(ventaTotal)} icon={<TrendingUp />} tono="brand" />
        <MiniStat label="Margen acumulado" valor={money(margenTotal)} icon={<Percent />} tono="success" />
        <MiniStat label="Inventario valorizado" valor={money(valorizado)} icon={<Boxes />} />
        <MiniStat label="Rotación del inventario" valor={`${rotacion.toFixed(2)}×`} icon={<Package />} tono={rotacion >= 1 ? "success" : "warning"} />
      </div>

      <div className="grid gap-3 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader>
            <div>
              <CardTitle>Ventas y margen por mes</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted">Facturación y margen bruto en soles</p>
            </div>
          </CardHeader>
          <CardContent><GraficoVentas data={serieVentas} alto={280} /></CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Proyección de ventas</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted">Tendencia lineal + 3 meses</p>
            </div>
          </CardHeader>
          <CardContent><GraficoProyeccion data={serieProy} alto={280} /></CardContent>
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader>
            <div>
              <CardTitle>Ventas frente a compras</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted">
                Contraste mensual entre lo facturado y lo abastecido
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <GraficoComparativo data={comparativo} serie1="Ventas" serie2="Compras" alto={250} />
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Participación por línea</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted">Venta acumulada por familia de producto</p>
            </div>
          </CardHeader>
          <CardContent><BarraParticipacion segmentos={porLinea.slice(0, 5)} /></CardContent>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {[
          { titulo: "Top 10 productos por venta", desc: "SKU con mayor facturación", data: topVenta, ancho: 128 },
          { titulo: "Top 10 productos por margen", desc: "SKU que más utilidad aportan", data: topMargen, ancho: 128 },
          { titulo: "Top 10 clientes", desc: "Empresas con mayor consumo", data: topClientes, ancho: 152 },
        ].map((g) => (
          <Card key={g.titulo}>
            <CardHeader>
              <div>
                <CardTitle>{g.titulo}</CardTitle>
                <p className="mt-0.5 text-[11.5px] text-muted">{g.desc}</p>
              </div>
            </CardHeader>
            <CardContent><GraficoBarrasH data={g.data} anchoEje={g.ancho} /></CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Venta por sector industrial</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted">
                Minería, papeleras, plástico, textil y demás rubros atendidos
              </p>
            </div>
            <Users className="size-4 text-subtle" />
          </CardHeader>
          <CardContent><GraficoBarrasH data={porSector} anchoEje={150} /></CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Inventario valorizado por marca</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted">Dónde está inmovilizado el capital</p>
            </div>
            <Boxes className="size-4 text-subtle" />
          </CardHeader>
          <CardContent><GraficoBarrasH data={porMarca} anchoEje={110} /></CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <div>
            <CardTitle>Rentabilidad por producto</CardTitle>
            <p className="mt-0.5 text-[11.5px] text-muted">
              Los 25 SKU con mayor venta, su margen y la cantidad de clientes que los compran
            </p>
          </div>
        </CardHeader>
        <Table>
          <THead>
            <tr>
              <th>SKU</th>
              <th>Descripción</th>
              <th>Marca</th>
              <th>Línea</th>
              <th className="text-right">Unidades</th>
              <th className="text-right">Venta</th>
              <th className="text-right">Margen</th>
              <th className="text-right">Margen %</th>
              <th className="text-right">Clientes</th>
            </tr>
          </THead>
          <TBody>
            {(topProd ?? []).slice(0, 25).map((p) => {
              const m = Number(p.venta) > 0 ? (Number(p.margen) / Number(p.venta)) * 100 : 0;
              return (
                <tr key={p.id}>
                  <td>
                    <Link href={`/productos/${p.id}`} className="text-[12px] font-semibold text-brand-700 hover:underline">
                      {p.sku}
                    </Link>
                  </td>
                  <td className="max-w-[280px] truncate text-[11.5px] text-fg">{p.descripcion}</td>
                  <td><Badge tone="neutral" size="xs">{p.marca ?? "—"}</Badge></td>
                  <td className="text-[11px] text-muted">{p.categoria ?? "—"}</td>
                  <td className="text-right text-[12px] tabular">{num(p.unidades, 0)}</td>
                  <td className="text-right text-[12px] font-medium text-fg tabular">{money(p.venta)}</td>
                  <td className="text-right text-[12px] tabular">{money(p.margen)}</td>
                  <td className="text-right text-[12px] font-medium tabular">
                    <span style={{ color: m < 15 ? "var(--danger)" : m > 30 ? "var(--ok)" : "var(--warn)" }}>
                      {pct(m, 1)}
                    </span>
                  </td>
                  <td className="text-right text-[12px] text-muted tabular">{num(p.clientes, 0)}</td>
                </tr>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </>
  );
}

export default function ReportesPage() {
  return (
    <>
      <PageHeader
        titulo="Reportería y tableros dinámicos"
        descripcion="Visibilidad financiera real: ingresos, márgenes, rotación, concentración de cartera y proyecciones para anticipar compras e importaciones en lugar de reaccionar cuando ya falta stock."
        acciones={
          <Link
            href="/alertas"
            className="inline-flex h-9 items-center gap-2 rounded-md border bg-[var(--surface)] px-3.5 text-[13px] font-medium text-fg transition-colors hover:border-brand-300"
          >
            <ChartNoAxesCombined className="size-4" />
            Ver alertas del sistema
          </Link>
        }
      />
      <Contenedor className="space-y-4">
        <Suspense fallback={<SkeletonTable rows={10} cols={6} />}>
          <Tableros />
        </Suspense>
      </Contenedor>
    </>
  );
}
