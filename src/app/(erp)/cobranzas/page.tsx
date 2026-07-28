import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Wallet, AlertTriangle, CalendarClock, TrendingUp, Phone } from "lucide-react";
import { createClient, getEmpresa } from "@/lib/supabase/server";
import { PageHeader, Contenedor } from "@/components/layout/shell";
import { FiltroSelect } from "@/components/ui/client";
import { Card, CardHeader, CardTitle, CardContent, Table, THead, TBody, Badge, EmptyState, SkeletonTable } from "@/components/ui/primitives";
import { EstadoBadge } from "@/components/ui/estados";
import { MiniStat } from "@/components/ui/kpi";
import { GraficoAging, GraficoBarrasH } from "@/components/charts/graficos";
import { AccionesCartera } from "./acciones";
import { money, num, fecha, haceTiempo, pct } from "@/lib/utils";
import type { EmpresaPdf } from "@/lib/pdf/documentos";

export const metadata: Metadata = { title: "Crédito y cobranzas" };
export const dynamic = "force-dynamic";

type Params = Promise<{ [k: string]: string | undefined }>;

const TRAMOS = [
  { id: "vigente", label: "Vigente" },
  { id: "1-15", label: "1-15 días" },
  { id: "16-30", label: "16-30 días" },
  { id: "31-60", label: "31-60 días" },
  { id: "60+", label: "Más de 60" },
];

async function Panel() {
  const supabase = await createClient();
  const [{ data: cartera }, { data: cobrado }] = await Promise.all([
    supabase.from("v_cartera").select("*"),
    supabase.from("pagos").select("monto, fecha").gte("fecha", new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)),
  ]);

  const filas = cartera ?? [];
  const total = filas.reduce((s, f) => s + Number(f.saldo), 0);
  const vencido = filas.filter((f) => Number(f.dias_vencido) > 0).reduce((s, f) => s + Number(f.saldo), 0);
  const cobrado30 = (cobrado ?? []).reduce((s, p) => s + Number(p.monto), 0);

  const porTramo = TRAMOS.map((t) => ({
    tramo: t.label,
    monto: filas.filter((f) => f.tramo === t.id).reduce((s, f) => s + Number(f.saldo), 0),
  }));

  const porCliente = Object.entries(
    filas.reduce<Record<string, number>>((acc, f) => {
      acc[f.cliente] = (acc[f.cliente] ?? 0) + Number(f.saldo);
      return acc;
    }, {})
  )
    .map(([nombre, valor]) => ({ nombre: nombre.length > 26 ? `${nombre.slice(0, 25)}…` : nombre, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 8);

  return (
    <>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Cartera total por cobrar" valor={money(total)} icon={<Wallet />} tono="brand" />
        <MiniStat label="Saldo vencido" valor={money(vencido)} icon={<AlertTriangle />} tono="danger" />
        <MiniStat label="Documentos pendientes" valor={num(filas.length, 0)} icon={<CalendarClock />} />
        <MiniStat label="Cobrado últimos 30 días" valor={money(cobrado30)} icon={<TrendingUp />} tono="success" />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Antigüedad de saldos (aging)</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted">
                {pct(total ? (vencido / total) * 100 : 0)} de la cartera está vencida
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <GraficoAging data={porTramo} alto={210} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Concentración por cliente</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted">Mayores saldos pendientes de cobro</p>
            </div>
          </CardHeader>
          <CardContent>
            <GraficoBarrasH data={porCliente} anchoEje={168} alto={210} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

async function TablaCartera({ params }: { params: Params }) {
  const sp = await params;
  const supabase = await createClient();
  const empresa = await getEmpresa();

  const tramo = sp.tramo ?? "";
  let consulta = supabase.from("v_cartera").select("*");
  if (tramo) consulta = consulta.eq("tramo", tramo);

  const { data } = await consulta.order("dias_vencido", { ascending: false }).limit(120);
  const filas = data ?? [];

  if (!filas.length) {
    return (
      <Card>
        <EmptyState icon={<Wallet />} titulo="Sin documentos pendientes" descripcion="La cartera está al día para este filtro." />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div>
          <CardTitle>Documentos por cobrar</CardTitle>
          <p className="mt-0.5 text-[11.5px] text-muted">
            {filas.length} documento(s) · saldo {money(filas.reduce((s, f) => s + Number(f.saldo), 0))}
          </p>
        </div>
      </CardHeader>
      <Table>
        <THead>
          <tr>
            <th>Documento</th>
            <th>Cliente</th>
            <th>Emisión</th>
            <th>Vencimiento</th>
            <th className="text-right">Días</th>
            <th className="text-right">Total</th>
            <th className="text-right">Saldo</th>
            <th>Tramo</th>
            <th className="text-right">Gestión</th>
          </tr>
        </THead>
        <TBody>
          {filas.map((f) => {
            const vencido = Number(f.dias_vencido) > 0;
            return (
              <tr key={f.id}>
                <td>
                  <Link href={`/facturacion/${f.id}`} className="text-[12.5px] font-semibold text-brand-700 tabular hover:underline">
                    {f.numero}
                  </Link>
                </td>
                <td className="max-w-[240px]">
                  <Link href={`/clientes/${f.cliente_id}`} className="block truncate text-[12.5px] text-fg hover:text-brand-700 hover:underline">
                    {f.cliente}
                  </Link>
                  <span className="block text-[10.5px] text-subtle tabular">{f.ruc ?? "—"}</span>
                </td>
                <td className="whitespace-nowrap text-[12px] text-muted tabular">{fecha(f.fecha_emision)}</td>
                <td className="whitespace-nowrap text-[12px] tabular">
                  <span style={{ color: vencido ? "var(--danger)" : "var(--fg-muted)" }}>
                    {fecha(f.fecha_vencimiento)}
                  </span>
                </td>
                <td className="text-right text-[12px] font-medium tabular">
                  <span style={{ color: vencido ? "var(--danger)" : "var(--ok)" }}>
                    {vencido ? `+${f.dias_vencido}` : f.dias_vencido}
                  </span>
                </td>
                <td className="text-right text-[12px] text-muted tabular">{money(f.total, f.moneda)}</td>
                <td className="text-right text-[12.5px] font-semibold text-fg tabular">{money(f.saldo, f.moneda)}</td>
                <td>
                  <Badge
                    tone={f.tramo === "vigente" ? "success" : f.tramo === "60+" ? "danger" : "warning"}
                    size="xs"
                  >
                    {TRAMOS.find((t) => t.id === f.tramo)?.label ?? f.tramo}
                  </Badge>
                </td>
                <td>
                  <AccionesCartera
                    documento={{
                      id: f.id,
                      numero: f.numero,
                      cliente_id: f.cliente_id,
                      cliente: f.cliente,
                      ruc: f.ruc,
                      telefono: f.telefono,
                      whatsapp: f.whatsapp,
                      email: f.email,
                      saldo: Number(f.saldo),
                      total: Number(f.total),
                      moneda: f.moneda,
                      fecha_vencimiento: f.fecha_vencimiento,
                      dias_vencido: Number(f.dias_vencido),
                      linea_credito: Number(f.linea_credito),
                      dias_credito: Number(f.dias_credito),
                    }}
                    empresa={empresa as unknown as EmpresaPdf}
                  />
                </td>
              </tr>
            );
          })}
        </TBody>
      </Table>
    </Card>
  );
}

async function Gestiones() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("gestiones_cobranza")
    .select("id, fecha, canal, resultado, compromiso_fecha, nota, clientes(id, razon_social), comprobantes(id, numero), profiles(nombre)")
    .order("fecha", { ascending: false })
    .limit(12);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Últimas gestiones de cobranza</CardTitle>
          <p className="mt-0.5 text-[11.5px] text-muted">Bitácora de contactos y compromisos de pago</p>
        </div>
        <Phone className="size-4 text-subtle" />
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {(data ?? []).length === 0 ? (
          <EmptyState titulo="Sin gestiones registradas" />
        ) : (
          <ul className="divide-y divide-[var(--border-soft)]">
            {(data ?? []).map((g) => {
              const cli = g.clientes as unknown as { id: string; razon_social: string } | null;
              const comp = g.comprobantes as unknown as { id: string; numero: string } | null;
              const usr = g.profiles as unknown as { nombre: string } | null;
              return (
                <li key={g.id} className="flex items-start gap-3 px-5 py-2.5">
                  <Badge tone="neutral" size="xs" className="mt-0.5 shrink-0 capitalize">
                    {g.canal}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] text-fg">
                      <span className="font-medium">{cli?.razon_social}</span>
                      {comp && <span className="text-muted"> · {comp.numero}</span>}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-muted">{g.resultado}</p>
                    {g.compromiso_fecha && (
                      <p className="mt-0.5 text-[10.5px] text-subtle">
                        Compromiso de pago: {fecha(g.compromiso_fecha)}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-right text-[10.5px] text-subtle">
                    {haceTiempo(g.fecha)}
                    <span className="block">{usr?.nombre?.split(" ")[0]}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default async function CobranzasPage({ searchParams }: { searchParams: Params }) {
  return (
    <>
      <PageHeader
        titulo="Crédito y cobranzas"
        descripcion="Cartera por cobrar con antigüedad de saldos, línea y plazo de crédito por cliente, registro de pagos y estado de cuenta enviable en PDF por WhatsApp o correo."
      >
        <div className="flex flex-wrap items-center gap-2 px-4 pb-4 sm:px-6">
          <FiltroSelect
            param="tramo"
            placeholder="Toda la cartera"
            opciones={TRAMOS.map((t) => ({ value: t.id, label: t.label }))}
          />
        </div>
      </PageHeader>

      <Contenedor className="space-y-4">
        <Suspense fallback={<div className="h-40 card" />}>
          <Panel />
        </Suspense>
        <Suspense fallback={<SkeletonTable rows={12} cols={9} />}>
          <TablaCartera params={searchParams} />
        </Suspense>
        <Suspense fallback={<div className="h-64 card" />}>
          <Gestiones />
        </Suspense>
      </Contenedor>
    </>
  );
}
