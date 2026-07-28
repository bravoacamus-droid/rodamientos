import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ReceiptText, Wallet, TrendingUp, FileMinus, CircleDollarSign } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Contenedor } from "@/components/layout/shell";
import { SearchBox, FiltroSelect, Paginacion } from "@/components/ui/client";
import { Card, Table, THead, TBody, Badge, EmptyState, SkeletonTable } from "@/components/ui/primitives";
import { EstadoBadge, TIPO_COMPROBANTE } from "@/components/ui/estados";
import { MiniStat } from "@/components/ui/kpi";
import { money, num, fecha, inicioDeMesISO } from "@/lib/utils";

export const metadata: Metadata = { title: "Facturación" };
export const dynamic = "force-dynamic";

const POR_PAGINA = 25;
type Params = Promise<{ [k: string]: string | undefined }>;

async function Resumen() {
  const supabase = await createClient();
  const desde = inicioDeMesISO();
  const [{ data: mes }, { data: cartera }] = await Promise.all([
    supabase.from("comprobantes").select("tipo, total, op_gravada, costo_total, estado").gte("fecha_emision", desde),
    supabase.from("comprobantes").select("saldo").gt("saldo", 0).neq("estado", "anulado"),
  ]);

  const ventas = (mes ?? []).filter((c) => c.estado !== "anulado" && c.tipo !== "nota_credito");
  const notas = (mes ?? []).filter((c) => c.tipo === "nota_credito");
  const facturado = ventas.reduce((s, c) => s + Number(c.total), 0);
  const margen = ventas.reduce((s, c) => s + (Number(c.op_gravada) - Number(c.costo_total)), 0);

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      <MiniStat label="Facturado en el mes" valor={money(facturado)} icon={<CircleDollarSign />} tono="brand" />
      <MiniStat label="Margen del mes" valor={money(margen)} icon={<TrendingUp />} tono="success" />
      <MiniStat label="Documentos emitidos" valor={num(ventas.length, 0)} icon={<ReceiptText />} />
      <MiniStat label="Por cobrar" valor={money((cartera ?? []).reduce((s, c) => s + Number(c.saldo), 0))} icon={<Wallet />} tono="warning" href="/cobranzas" />
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
    .from("comprobantes")
    .select(
      "id, tipo, numero, fecha_emision, fecha_vencimiento, condicion_pago, total, pagado, saldo, estado, moneda, clientes(razon_social, ruc), profiles(nombre)",
      { count: "exact" }
    );

  if (q) consulta = consulta.ilike("numero", `%${q.toUpperCase()}%`);
  if (tipo) consulta = consulta.eq("tipo", tipo);
  if (estado) consulta = consulta.eq("estado", estado);

  const { data, count } = await consulta
    .order("fecha_emision", { ascending: false })
    .order("correlativo", { ascending: false })
    .range((page - 1) * POR_PAGINA, page * POR_PAGINA - 1);

  const total = count ?? 0;

  if (!data?.length) {
    return (
      <Card>
        <EmptyState icon={<ReceiptText />} titulo="Sin comprobantes" descripcion="No hay documentos con los filtros aplicados." />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <Table>
        <THead>
          <tr>
            <th>Documento</th>
            <th>Cliente</th>
            <th>Emisión</th>
            <th>Vencimiento</th>
            <th>Condición</th>
            <th className="text-right">Total</th>
            <th className="text-right">Pagado</th>
            <th className="text-right">Saldo</th>
            <th>Estado</th>
          </tr>
        </THead>
        <TBody>
          {data.map((c) => {
            const cli = c.clientes as unknown as { razon_social: string; ruc: string } | null;
            const nc = c.tipo === "nota_credito";
            return (
              <tr key={c.id}>
                <td>
                  <Link href={`/facturacion/${c.id}`} className="text-[12.5px] font-semibold text-brand-700 tabular hover:underline">
                    {c.numero}
                  </Link>
                  <span className="mt-0.5 block">
                    <Badge tone={nc ? "warning" : c.tipo === "boleta" ? "neutral" : "brand"} size="xs">
                      {TIPO_COMPROBANTE[c.tipo] ?? c.tipo}
                    </Badge>
                  </span>
                </td>
                <td className="max-w-[250px]">
                  <span className="block truncate text-[12.5px] text-fg">{cli?.razon_social}</span>
                  <span className="block text-[10.5px] text-subtle tabular">{cli?.ruc ?? "—"}</span>
                </td>
                <td className="whitespace-nowrap text-[12px] text-muted tabular">{fecha(c.fecha_emision)}</td>
                <td className="whitespace-nowrap text-[12px] tabular">
                  <span style={{ color: Number(c.saldo) > 0 && c.fecha_vencimiento < new Date().toISOString().slice(0, 10) ? "var(--danger)" : "var(--fg-muted)" }}>
                    {fecha(c.fecha_vencimiento)}
                  </span>
                </td>
                <td>
                  <Badge tone={c.condicion_pago === "credito" ? "info" : "neutral"} size="xs">
                    {c.condicion_pago === "credito" ? "Crédito" : "Contado"}
                  </Badge>
                </td>
                <td className="text-right text-[12.5px] font-semibold text-fg tabular">
                  {nc ? "−" : ""}{money(c.total, c.moneda)}
                </td>
                <td className="text-right text-[12px] text-muted tabular">{money(c.pagado, c.moneda)}</td>
                <td className="text-right text-[12.5px] font-medium tabular">
                  <span style={{ color: Number(c.saldo) > 0 ? "var(--warn)" : "var(--ok)" }}>
                    {money(c.saldo, c.moneda)}
                  </span>
                </td>
                <td><EstadoBadge tipo="comprobante" valor={c.estado} size="xs" /></td>
              </tr>
            );
          })}
        </TBody>
      </Table>
      <Paginacion page={page} totalPages={Math.ceil(total / POR_PAGINA)} total={total} porPagina={POR_PAGINA} />
    </Card>
  );
}

export default async function FacturacionPage({ searchParams }: { searchParams: Params }) {
  return (
    <>
      <PageHeader
        titulo="Facturación"
        descripcion="Emisión de facturas, boletas y notas de crédito con series y correlativos propios, IGV, monto en letras y representación impresa brandeada."
        acciones={
          <Link
            href="/pedidos"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-brand-600 px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-700"
          >
            <ReceiptText className="size-4" />
            Facturar un pedido
          </Link>
        }
      >
        <div className="flex flex-wrap items-center gap-2 px-4 pb-4 sm:px-6">
          <SearchBox placeholder="Buscar por número (F001-00000123)…" className="min-w-[220px] flex-1 sm:max-w-sm" />
          <FiltroSelect
            param="tipo"
            placeholder="Todos los tipos"
            opciones={[
              { value: "factura", label: "Facturas" },
              { value: "boleta", label: "Boletas" },
              { value: "nota_venta", label: "Notas de venta" },
              { value: "nota_credito", label: "Notas de crédito" },
            ]}
          />
          <FiltroSelect
            param="estado"
            placeholder="Todos los estados"
            opciones={[
              { value: "emitido", label: "Emitido" },
              { value: "parcial", label: "Pago parcial" },
              { value: "pagado", label: "Pagado" },
              { value: "vencido", label: "Vencido" },
              { value: "anulado", label: "Anulado" },
            ]}
          />
        </div>
      </PageHeader>

      <Contenedor className="space-y-4">
        <Suspense fallback={<div className="grid gap-3 grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="card h-[62px]" />)}</div>}>
          <Resumen />
        </Suspense>
        <Suspense fallback={<SkeletonTable rows={12} cols={9} />}>
          <Tabla params={searchParams} />
        </Suspense>
      </Contenedor>
    </>
  );
}
