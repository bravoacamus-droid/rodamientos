import type { Metadata } from "next";
import { Suspense } from "react";
import { Building2, Hash, Users, Warehouse, Tag, Layers, ShieldCheck } from "lucide-react";
import { createClient, getEmpresa, getSesion } from "@/lib/supabase/server";
import { PageHeader, Contenedor } from "@/components/layout/shell";
import { Card, CardHeader, CardTitle, CardContent, Table, THead, TBody, Badge, Avatar, SkeletonTable } from "@/components/ui/primitives";
import { EstadoBadge } from "@/components/ui/estados";
import { Logo } from "@/components/marca/logo";
import { fechaHora, num } from "@/lib/utils";

export const metadata: Metadata = { title: "Configuración" };
export const dynamic = "force-dynamic";

const PERMISOS: Record<string, string[]> = {
  admin: ["Configuración del sistema", "Usuarios y roles", "Series de documentos", "Aprobación de emergencias", "Anulación de comprobantes"],
  gerencia: ["Todos los módulos", "Aprobación de emergencias", "Reportería completa", "Configuración"],
  ventas: ["Cotizaciones", "Pedidos", "Facturación", "Clientes", "Consulta de stock"],
  almacen: ["Inventario y kardex", "Ingresos y ajustes", "Recepción de compras", "Pedidos"],
  compras: ["Órdenes de compra", "Importaciones y landed cost", "Proveedores", "Maestro de productos"],
  cobranzas: ["Cartera y aging", "Registro de pagos", "Gestiones de cobranza", "Estados de cuenta"],
};

async function Contenido() {
  const supabase = await createClient();
  const [empresa, sesion] = await Promise.all([getEmpresa(), getSesion()]);

  const [{ data: usuarios }, { data: series }, { data: almacenes }, { data: marcas }, { data: categorias }] =
    await Promise.all([
      supabase.from("profiles").select("*").order("rol"),
      supabase.from("series_documento").select("*").order("tipo"),
      supabase.from("almacenes").select("*").order("codigo"),
      supabase.from("marcas").select("nombre, pais, segmento, activo").order("orden"),
      supabase.from("categorias").select("nombre, slug, descripcion").order("orden"),
    ]);

  const rolActual = sesion?.perfil?.rol ?? "ventas";

  return (
    <>
      {/* --------------------------------------------------------- Empresa */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Datos de la empresa</CardTitle>
            <p className="mt-0.5 text-[11.5px] text-muted">
              Información utilizada en cotizaciones, comprobantes y estados de cuenta
            </p>
          </div>
          <Building2 className="size-4 text-subtle" />
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-[220px_1fr]">
          <div className="flex flex-col items-start gap-3 rounded-lg border bg-[var(--surface-2)] p-4">
            <Logo height={44} />
            <div>
              <p className="text-[12px] font-semibold text-fg">{empresa?.nombre_comercial}</p>
              <p className="mt-0.5 text-[10.5px] italic text-muted">{empresa?.eslogan}</p>
            </div>
          </div>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {[
              ["Razón social", empresa?.razon_social],
              ["RUC", empresa?.ruc],
              ["Dirección fiscal", `${empresa?.direccion ?? ""} · ${empresa?.distrito ?? ""}`],
              ["Teléfono", empresa?.telefono],
              ["Celular / WhatsApp", empresa?.celular],
              ["Correo gerencia", empresa?.email],
              ["Correo ventas", empresa?.email_ventas],
              ["Sitio web", empresa?.web],
              ["IGV configurado", `${empresa?.igv_porcentaje}%`],
              ["Moneda base", empresa?.moneda_base],
              ["Tipo de cambio referencial", `S/ ${empresa?.tipo_cambio}`],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between gap-3 border-b border-[var(--border-soft)] pb-1.5">
                <dt className="text-[11.5px] text-muted">{k}</dt>
                <dd className="text-right text-[12px] font-medium text-fg">{v ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-3 xl:grid-cols-2">
        {/* ------------------------------------------------------ Series */}
        <Card className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>Series y correlativos</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted">
                Numeración de los comprobantes emitidos por el sistema
              </p>
            </div>
            <Hash className="size-4 text-subtle" />
          </CardHeader>
          <Table>
            <THead>
              <tr>
                <th>Tipo</th>
                <th>Serie</th>
                <th className="text-right">Último correlativo</th>
                <th>Estado</th>
              </tr>
            </THead>
            <TBody>
              {(series ?? []).map((s) => (
                <tr key={s.id}>
                  <td className="text-[12.5px] text-fg capitalize">{s.tipo.replace("_", " ")}</td>
                  <td className="text-[12.5px] font-semibold text-brand-700 tabular">{s.serie}</td>
                  <td className="text-right text-[12.5px] tabular">
                    {s.serie}-{String(s.correlativo).padStart(8, "0")}
                  </td>
                  <td>
                    <Badge tone={s.activo ? "success" : "neutral"} size="xs">
                      {s.activo ? "Activa" : "Inactiva"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </TBody>
          </Table>
        </Card>

        {/* --------------------------------------------------- Almacenes */}
        <Card className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>Almacenes</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted">Ubicaciones físicas del inventario</p>
            </div>
            <Warehouse className="size-4 text-subtle" />
          </CardHeader>
          <Table>
            <THead>
              <tr>
                <th>Código</th>
                <th>Nombre</th>
                <th>Responsable</th>
                <th>Estado</th>
              </tr>
            </THead>
            <TBody>
              {(almacenes ?? []).map((a) => (
                <tr key={a.id}>
                  <td className="text-[12.5px] font-semibold text-fg tabular">{a.codigo}</td>
                  <td className="text-[12.5px] text-fg">{a.nombre}</td>
                  <td className="text-[11.5px] text-muted">{a.responsable ?? "—"}</td>
                  <td>
                    <Badge tone={a.activo ? "success" : "neutral"} size="xs">
                      {a.activo ? "Operativo" : "Inactivo"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>

      {/* -------------------------------------------------------- Usuarios */}
      <Card className="overflow-hidden">
        <CardHeader>
          <div>
            <CardTitle>Usuarios y roles</CardTitle>
            <p className="mt-0.5 text-[11.5px] text-muted">
              El acceso a cada módulo se define por el rol asignado; la base de datos aplica las mismas
              reglas mediante políticas de seguridad a nivel de fila.
            </p>
          </div>
          <Users className="size-4 text-subtle" />
        </CardHeader>
        <Table>
          <THead>
            <tr>
              <th>Usuario</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Permisos principales</th>
              <th>Último acceso</th>
              <th>Estado</th>
            </tr>
          </THead>
          <TBody>
            {(usuarios ?? []).map((u) => (
              <tr key={u.id} className={u.id === sesion?.perfil?.id ? "!bg-brand-50" : undefined}>
                <td>
                  <div className="flex items-center gap-2.5">
                    <Avatar nombre={u.nombre} size={28} />
                    <div>
                      <span className="block text-[12.5px] font-medium text-fg">
                        {u.nombre}
                        {u.id === sesion?.perfil?.id && (
                          <span className="ml-1.5 text-[10px] text-brand-600">(usted)</span>
                        )}
                      </span>
                      <span className="block text-[10.5px] text-subtle">{u.cargo ?? "—"}</span>
                    </div>
                  </div>
                </td>
                <td className="text-[11.5px] text-muted">{u.email}</td>
                <td><EstadoBadge tipo="rol" valor={u.rol} size="xs" /></td>
                <td className="max-w-[320px]">
                  <div className="flex flex-wrap gap-1">
                    {(PERMISOS[u.rol] ?? []).slice(0, 3).map((p) => (
                      <Badge key={p} tone="neutral" size="xs">{p}</Badge>
                    ))}
                    {(PERMISOS[u.rol] ?? []).length > 3 && (
                      <Badge tone="neutral" size="xs">+{(PERMISOS[u.rol] ?? []).length - 3}</Badge>
                    )}
                  </div>
                </td>
                <td className="text-[11.5px] text-muted tabular">
                  {u.ultimo_acceso ? fechaHora(u.ultimo_acceso) : "Nunca"}
                </td>
                <td>
                  <Badge tone={u.activo ? "success" : "neutral"} size="xs">
                    {u.activo ? "Activo" : "Inactivo"}
                  </Badge>
                </td>
              </tr>
            ))}
          </TBody>
        </Table>
      </Card>

      <div className="grid gap-3 xl:grid-cols-2">
        {/* ------------------------------------------------------- Marcas */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Marcas representadas</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted">
                {num((marcas ?? []).length, 0)} marcas clasificadas por segmento para el cross-reference
              </p>
            </div>
            <Tag className="size-4 text-subtle" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {["premium", "estandar", "economica"].map((seg) => {
                const items = (marcas ?? []).filter((m) => m.segmento === seg);
                if (!items.length) return null;
                return (
                  <div key={seg}>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-subtle">
                      {seg === "premium" ? "Prestigio" : seg === "estandar" ? "Estándar" : "Económica"}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {items.map((m) => (
                        <Badge
                          key={m.nombre}
                          tone={seg === "premium" ? "brand" : seg === "estandar" ? "info" : "neutral"}
                          size="sm"
                        >
                          {m.nombre}
                        </Badge>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* --------------------------------------------------- Categorías */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Líneas de producto</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted">Familias del catálogo Rodatech</p>
            </div>
            <Layers className="size-4 text-subtle" />
          </CardHeader>
          <CardContent className="space-y-2">
            {(categorias ?? []).map((c) => (
              <div key={c.slug} className="rounded-lg border px-3 py-2">
                <p className="text-[12.5px] font-medium text-fg">{c.nombre}</p>
                <p className="mt-0.5 text-[11px] text-muted">{c.descripcion}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------- Matriz de roles */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Su perfil y alcance</CardTitle>
            <p className="mt-0.5 text-[11.5px] text-muted">
              Permisos vigentes para el rol con el que inició sesión
            </p>
          </div>
          <ShieldCheck className="size-4 text-subtle" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-[var(--surface-2)] p-4">
            <Avatar nombre={sesion?.perfil?.nombre} size={44} />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold text-fg">{sesion?.perfil?.nombre}</p>
              <p className="text-[11.5px] text-muted">{sesion?.perfil?.email}</p>
            </div>
            <EstadoBadge tipo="rol" valor={rolActual} size="md" />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(PERMISOS[rolActual] ?? []).map((p) => (
              <Badge key={p} tone="brand" size="sm">{p}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

export default function ConfiguracionPage() {
  return (
    <>
      <PageHeader
        titulo="Configuración del sistema"
        descripcion="Parámetros de la empresa, series de comprobantes, almacenes, usuarios y roles. El código fuente y la base de datos son propiedad de Inversiones Rodatech E.I.R.L."
      />
      <Contenedor className="space-y-4">
        <Suspense fallback={<SkeletonTable rows={10} cols={5} />}>
          <Contenido />
        </Suspense>
      </Contenedor>
    </>
  );
}
