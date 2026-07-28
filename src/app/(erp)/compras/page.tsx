import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ShoppingCart, Ship, Truck, PackageCheck, CircleDollarSign } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Contenedor } from "@/components/layout/shell";
import { SearchBox, FiltroSelect, Paginacion } from "@/components/ui/client";
import { Card, Table, THead, TBody, Badge, EmptyState, SkeletonTable } from "@/components/ui/primitives";
import { EstadoBadge } from "@/components/ui/estados";
import { MiniStat } from "@/components/ui/kpi";
import { money, num, fecha, inicioDeMesISO } from "@/lib/utils";

export const metadata: Metadata = { title: "Órdenes de compra" };
export const dynamic = "force-dynamic";

const POR_PAGINA = 25;
type Params = Promise<{ [k: string]: string | undefined }>;

async function Resumen() {
  const supabase = await createClient();
  const [{ data: mes }, { data: abiertas }] = await Promise.all([
    supabase.from("ordenes_compra").select("total, tipo, moneda").gte("fecha", inicioDeMesISO()).neq("estado", "anulada"),
    supabase.from("ordenes_compra").select("total, estado, tipo").in("estado", ["enviada", "confirmada", "transito", "recibida_parcial"]),
  ]);

  const compradoMes = (mes ?? []).reduce((s, o) => s + Number(o.total) * (o.moneda === "USD" ? 3.755 : 1), 0);
  const enCurso = (abiertas ?? []).reduce((s, o) => s + Number(o.total), 0);
  const importaciones = (abiertas ?? []).filter((o) => o.tipo === "importacion").length;

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      <MiniStat label="Comprado en el mes" valor={money(compradoMes)} icon={<CircleDollarSign />} tono="brand" />
      <MiniStat label="Órdenes abiertas" valor={num((abiertas ?? []).length, 0)} icon={<ShoppingCart />} />
      <MiniStat label="Monto en curso" valor={money(enCurso)} icon={<Truck />} tono="warning" />
      <MiniStat label="Importaciones en curso" valor={num(importaciones, 0)} icon={<Ship />} href="/importaciones" />
    </div>
  );
}

async function Tabla({ params }: { params: Params }) {
  const sp = await params;
  const supabase = await createClient();

  const page = Math.max(Number(sp.page ?? 1), 1);
  const q = (sp.q ?? "").trim();
  const tipo = sp.tipo ?? "";
  const estado = sp.estado ?? "";

  let consulta = supabase
    .from("ordenes_compra")
    .select(
      "id, numero, tipo, fecha, fecha_estimada, moneda, total, estado, incoterm, proveedores(razon_social, pais, tipo), profiles(nombre)",
      { count: "exact" }
    );

  if (q) consulta = consulta.ilike("numero", `%${q.toUpperCase()}%`);
  if (tipo) consulta = consulta.eq("tipo", tipo);
  if (estado) consulta = consulta.eq("estado", estado);

  const { data, count } = await consulta
    .order("fecha", { ascending: false })
    .range((page - 1) * POR_PAGINA, page * POR_PAGINA - 1);

  const total = count ?? 0;

  if (!data?.length) {
    return (
      <Card>
        <EmptyState icon={<ShoppingCart />} titulo="Sin órdenes de compra" descripcion="No hay órdenes con los filtros aplicados." />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <Table>
        <THead>
          <tr>
            <th>Número</th>
            <th>Proveedor</th>
            <th>Tipo</th>
            <th>Fecha</th>
            <th>Llegada estimada</th>
            <th className="text-right">Total</th>
            <th>Estado</th>
            <th>Comprador</th>
          </tr>
        </THead>
        <TBody>
          {data.map((o) => {
            const prov = o.proveedores as unknown as { razon_social: string; pais: string; tipo: string } | null;
            const usr = o.profiles as unknown as { nombre: string } | null;
            return (
              <tr key={o.id}>
                <td>
                  <Link href={`/compras/${o.id}`} className="text-[12.5px] font-semibold text-brand-700 tabular hover:underline">
                    {o.numero}
                  </Link>
                </td>
                <td className="max-w-[260px]">
                  <span className="block truncate text-[12.5px] text-fg">{prov?.razon_social}</span>
                  <span className="block text-[10.5px] text-subtle">{prov?.pais}</span>
                </td>
                <td>
                  <Badge tone={o.tipo === "importacion" ? "accent" : "neutral"} size="xs">
                    {o.tipo === "importacion" ? `Importación${o.incoterm ? ` · ${o.incoterm}` : ""}` : "Local"}
                  </Badge>
                </td>
                <td className="whitespace-nowrap text-[12px] text-muted tabular">{fecha(o.fecha)}</td>
                <td className="whitespace-nowrap text-[12px] text-muted tabular">{fecha(o.fecha_estimada)}</td>
                <td className="text-right text-[12.5px] font-semibold text-fg tabular">
                  {money(o.total, o.moneda)}
                </td>
                <td><EstadoBadge tipo="oc" valor={o.estado} size="xs" /></td>
                <td className="text-[11.5px] text-muted">{usr?.nombre?.split(" ")[0] ?? "—"}</td>
              </tr>
            );
          })}
        </TBody>
      </Table>
      <Paginacion page={page} totalPages={Math.ceil(total / POR_PAGINA)} total={total} porPagina={POR_PAGINA} />
    </Card>
  );
}

export default async function ComprasPage({ searchParams }: { searchParams: Params }) {
  return (
    <>
      <PageHeader
        titulo="Órdenes de compra"
        descripcion="Abastecimiento local y del exterior con seguimiento de recepción. Las compras del exterior derivan al expediente de importación con cálculo de costo puesto en almacén."
        acciones={
          <Link
            href="/importaciones"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-brand-600 px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-700"
          >
            <Ship className="size-4" />
            Ver importaciones
          </Link>
        }
      >
        <div className="flex flex-wrap items-center gap-2 px-4 pb-4 sm:px-6">
          <SearchBox placeholder="Buscar por número de orden…" className="min-w-[220px] flex-1 sm:max-w-sm" />
          <FiltroSelect
            param="tipo"
            placeholder="Local e importación"
            opciones={[
              { value: "local", label: "Compras locales" },
              { value: "importacion", label: "Importaciones" },
            ]}
          />
          <FiltroSelect
            param="estado"
            placeholder="Todos los estados"
            opciones={[
              { value: "borrador", label: "Borrador" },
              { value: "enviada", label: "Enviada" },
              { value: "confirmada", label: "Confirmada" },
              { value: "transito", label: "En tránsito" },
              { value: "recibida", label: "Recibida" },
              { value: "anulada", label: "Anulada" },
            ]}
          />
        </div>
      </PageHeader>

      <Contenedor className="space-y-4">
        <Suspense fallback={<div className="grid gap-3 grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="card h-[62px]" />)}</div>}>
          <Resumen />
        </Suspense>
        <Suspense fallback={<SkeletonTable rows={12} cols={8} />}>
          <Tabla params={searchParams} />
        </Suspense>
      </Contenedor>
    </>
  );
}
