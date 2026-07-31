import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  ShoppingCart, AlertTriangle, PackageX, TrendingUp, Truck, Info, ArrowLeft,
} from "lucide-react";
import { createClient, getEmpresa } from "@/lib/supabase/server";
import { PageHeader, Contenedor } from "@/components/layout/shell";
import {
  Card, CardHeader, CardTitle, CardContent, Table, THead, TBody, Badge,
  EmptyState, SkeletonTable,
} from "@/components/ui/primitives";
import { MiniStat } from "@/components/ui/kpi";
import { GraficoBarrasH, BarraParticipacion } from "@/components/charts/graficos";
import {
  ExplicacionReposicion, CRITICIDAD, type FilaReposicion,
} from "@/components/comercial/explicacion-reposicion";
import { BotonExcel } from "@/components/comercial/acciones-documento";
import type { EmpresaPdf } from "@/lib/pdf/documentos";
import { money, num, moneyShort } from "@/lib/utils";

export const metadata: Metadata = { title: "Análisis de reposición" };
export const dynamic = "force-dynamic";

async function Panel() {
  const supabase = await createClient();
  const empresa = (await getEmpresa()) as unknown as EmpresaPdf;

  const [{ data: filas }, { data: resumen }] = await Promise.all([
    supabase.rpc("analisis_reposicion", { p_horizonte_dias: 45, p_limite: 120 }),
    supabase.rpc("resumen_reposicion", { p_horizonte_dias: 45 }),
  ]);

  const datos = (filas ?? []) as FilaReposicion[];
  const r = (resumen ?? {}) as Record<string, number>;

  if (!datos.length) {
    return (
      <Card>
        <EmptyState
          icon={<ShoppingCart />}
          titulo="Nada por reponer"
          descripcion="Todos los ítems con rotación tienen cobertura suficiente para el horizonte definido."
        />
      </Card>
    );
  }

  const porInversion = datos
    .slice()
    .sort((a, b) => b.inversion - a.inversion)
    .slice(0, 10)
    .map((f) => ({ nombre: f.sku, valor: f.inversion }));

  const porCategoria = Object.entries(
    datos.reduce<Record<string, number>>((acc, f) => {
      const k = f.categoria ?? "Sin línea";
      acc[k] = (acc[k] ?? 0) + f.inversion;
      return acc;
    }, {})
  )
    .map(([nombre, valor]) => ({ nombre, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 6);

  return (
    <>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Ítems por reponer" valor={num(r.items ?? 0, 0)} icon={<ShoppingCart />} tono="brand" />
        <MiniStat
          label="En quiebre"
          valor={num(r.quiebre ?? 0, 0)}
          icon={<PackageX />}
          tono={r.quiebre ? "danger" : "success"}
        />
        <MiniStat label="Inversión sugerida" valor={money(r.inversion ?? 0)} icon={<TrendingUp />} tono="warning" />
        <MiniStat
          label="Venta mensual en riesgo"
          valor={money(r.venta_riesgo ?? 0)}
          icon={<AlertTriangle />}
          tono="danger"
        />
      </div>

      <div className="flex items-start gap-2.5 rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-2.5">
        <Info className="mt-0.5 size-4 shrink-0 text-brand-600" />
        <p className="text-[11.5px] leading-relaxed text-brand-800">
          Cada sugerencia parte del consumo real de los últimos 90 días, el tiempo que tarda su
          proveedor habitual en entregar y lo que ya está pedido y no ha llegado. El botón{" "}
          <strong>Por qué</strong> de cada fila abre el cálculo completo con la tendencia del ítem, para
          que pueda contrastarlo con lo que sabe del negocio antes de comprar.
        </p>
      </div>

      <div className="grid gap-3 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader>
            <div>
              <CardTitle>Dónde se concentra la inversión</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted">Los 10 ítems que más capital demandan</p>
            </div>
          </CardHeader>
          <CardContent>
            <GraficoBarrasH data={porInversion} anchoEje={140} />
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Reposición por línea</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted">Familias que exigen abastecimiento</p>
            </div>
          </CardHeader>
          <CardContent>
            <BarraParticipacion segmentos={porCategoria} />
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <div>
            <CardTitle>Detalle de la reposición sugerida</CardTitle>
            <p className="mt-0.5 text-[11.5px] text-muted">
              Ordenado por criticidad y por el valor que mueve cada ítem
            </p>
          </div>
          <div className="flex items-center gap-2">
            <BotonExcel
              empresa={empresa}
              titulo="Análisis de reposición"
              subtitulo="Horizonte de 45 días · consumo de los últimos 90 días"
              nombreArchivo={`Rodatech-Reposicion-${new Date().toISOString().slice(0, 10)}`}
              variante="subtle"
              filas={datos.map((f) => ({
                sku: f.sku,
                descripcion: f.descripcion,
                marca: f.marca ?? "",
                categoria: f.categoria ?? "",
                stock: f.stock_actual,
                transito: f.en_transito,
                salidas_90: f.salidas_90,
                consumo_diario: f.consumo_diario,
                cobertura: f.cobertura_dias,
                lead: f.lead_time_dias,
                reorden: f.punto_reorden,
                sugerida: f.cantidad_sugerida,
                costo: f.costo_promedio,
                inversion: f.inversion,
                criticidad: CRITICIDAD[f.criticidad]?.label ?? f.criticidad,
              }))}
              columnas={[
                { titulo: "SKU", clave: "sku", ancho: 20 },
                { titulo: "Descripción", clave: "descripcion", ancho: 48 },
                { titulo: "Marca", clave: "marca", ancho: 12 },
                { titulo: "Línea", clave: "categoria", ancho: 18 },
                { titulo: "Stock", clave: "stock", formato: "entero", ancho: 10 },
                { titulo: "En tránsito", clave: "transito", formato: "entero", ancho: 11 },
                { titulo: "Salidas 90d", clave: "salidas_90", formato: "entero", ancho: 12 },
                { titulo: "Consumo diario", clave: "consumo_diario", formato: "numero", ancho: 13 },
                { titulo: "Cobertura (días)", clave: "cobertura", formato: "numero", ancho: 14 },
                { titulo: "Lead time", clave: "lead", formato: "entero", ancho: 10 },
                { titulo: "Punto de reorden", clave: "reorden", formato: "entero", ancho: 14 },
                { titulo: "Sugerido", clave: "sugerida", formato: "entero", ancho: 11, total: true },
                { titulo: "Costo unitario", clave: "costo", formato: "moneda", ancho: 14 },
                { titulo: "Inversión", clave: "inversion", formato: "moneda", ancho: 15, total: true },
                { titulo: "Criticidad", clave: "criticidad", ancho: 12 },
              ]}
              nota="Cantidades calculadas para 45 días de cobertura más el lead time del proveedor"
            />
            <Link
              href="/compras/nueva"
              className="inline-flex h-9.5 items-center gap-2 rounded-md bg-brand-600 px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-700"
            >
              <Truck className="size-4" />
              Generar orden
            </Link>
          </div>
        </CardHeader>

        <Table>
          <THead>
            <tr>
              <th>Producto</th>
              <th>Criticidad</th>
              <th className="text-right">Stock</th>
              <th className="text-right">Consumo/día</th>
              <th className="text-right">Cobertura</th>
              <th className="text-right">Lead time</th>
              <th className="text-right">En tránsito</th>
              <th className="text-right">Sugerido</th>
              <th className="text-right">Inversión</th>
              <th className="w-10" />
            </tr>
          </THead>
          <TBody>
            {datos.map((f) => {
              const crit = CRITICIDAD[f.criticidad] ?? CRITICIDAD.holgado;
              return (
                <tr key={f.producto_id}>
                  <td className="max-w-[280px]">
                    <Link
                      href={`/productos/${f.producto_id}`}
                      className="block text-[12.5px] font-semibold text-brand-700 hover:underline"
                    >
                      {f.sku}
                    </Link>
                    <span className="block truncate text-[10.5px] text-subtle">
                      {f.marca} · {f.categoria}
                    </span>
                  </td>
                  <td><Badge tone={crit.tone} size="xs">{crit.label}</Badge></td>
                  <td className="text-right text-[12px] font-medium tabular">
                    <span style={{ color: f.stock_actual <= 0 ? "var(--danger)" : undefined }}>
                      {num(f.stock_actual, 0)}
                    </span>
                  </td>
                  <td className="text-right text-[12px] text-muted tabular">{num(f.consumo_diario, 2)}</td>
                  <td className="text-right text-[12px] font-medium tabular">
                    <span
                      style={{
                        color:
                          f.cobertura_dias < f.lead_time_dias ? "var(--danger)" : "var(--warn)",
                      }}
                    >
                      {f.cobertura_dias > 900 ? "—" : `${num(f.cobertura_dias, 0)} d`}
                    </span>
                  </td>
                  <td className="text-right text-[12px] text-muted tabular">{f.lead_time_dias} d</td>
                  <td className="text-right text-[12px] text-muted tabular">{num(f.en_transito, 0)}</td>
                  <td className="text-right text-[13px] font-bold text-brand-700 tabular">
                    {num(f.cantidad_sugerida, 0)}
                  </td>
                  <td className="text-right text-[12.5px] font-semibold text-fg tabular">
                    {moneyShort(f.inversion)}
                  </td>
                  <td>
                    <ExplicacionReposicion fila={f} compacto />
                  </td>
                </tr>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </>
  );
}

export default function ReposicionPage() {
  return (
    <>
      <PageHeader
        titulo="Análisis de reposición"
        descripcion="Qué comprar, cuánto y por qué. Cada sugerencia se sustenta en el consumo real del ítem, el tiempo de entrega del proveedor y lo que ya está pedido."
        acciones={
          <Link
            href="/inventario"
            className="inline-flex h-9 items-center gap-2 rounded-md border bg-[var(--surface)] px-3.5 text-[13px] font-medium text-fg transition-colors hover:border-brand-300"
          >
            <ArrowLeft className="size-4" />
            Volver a stock
          </Link>
        }
      />
      <Contenedor className="space-y-4">
        <Suspense fallback={<SkeletonTable rows={12} cols={9} />}>
          <Panel />
        </Suspense>
      </Contenedor>
    </>
  );
}
