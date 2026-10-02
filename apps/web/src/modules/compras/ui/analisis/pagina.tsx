import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, EstadoError } from "@rodatech/ui";
import { Plus } from "lucide-react";
import { perfilActual } from "@rodatech/db/servidor";

import { listarAnalisis } from "../../api/analisis";

const ROLES = ["gerencia", "admin", "compras"];

/**
 * Los análisis de importación guardados (098, §AQ).
 *
 * Son también el historial de lo que cada proveedor de fuera ha cotizado:
 * Willy, 01/10, *«los precios deben quedar en un historial […] para no volver
 * a pedir en otra oportunidad»*.
 */
export default async function PaginaAnalisis() {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) redirect("/login");
  if (!ROLES.includes(perfil.rol)) {
    return <EstadoError titulo="No puedes ver los análisis" descripcion="Los hacen Compras y Gerencia." />;
  }

  const r = await listarAnalisis();
  if (!r.ok) {
    return <EstadoError titulo="No se pudo cargar la lista" descripcion="La consulta no llegó a completarse." detalle={r.error} />;
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Análisis de importación</h1>
          <p className="max-w-2xl text-sm text-[var(--fg-muted)]">
            Antes de comprar: con la proforma del proveedor de fuera, cuánto te cuesta cada
            producto puesto en Lima y cuánto ganas contra el precio de mercado.
          </p>
        </div>
        <Link
          href="/compras/analisis/nuevo"
          className="inline-flex h-10 items-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus className="size-4" aria-hidden />
          Nuevo análisis
        </Link>
      </header>

      {r.datos.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-base font-medium">Todavía no hay ningún análisis.</p>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            Cuando te llegue una proforma de importación, empieza uno con «Nuevo análisis».
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {r.datos.map((a) => (
            <li key={a.id}>
              <Link
                href={`/compras/analisis/${a.id}`}
                className="card flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-[var(--surface-2)]"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{a.numero}</span>
                    {a.estado === "comprado" ? (
                      <Badge tone="success">Comprado · {a.compra_numero}</Badge>
                    ) : (
                      <Badge tone="warning">En análisis</Badge>
                    )}
                  </p>
                  <p className="mt-0.5 text-sm font-medium">{a.proveedor}</p>
                  <p className="text-sm text-[var(--fg-muted)]">
                    {a.fecha}
                    {a.referencia ? ` · Proforma ${a.referencia}` : ""} · {a.lineas}{" "}
                    {a.lineas === 1 ? "producto" : "productos"}
                    {a.costo_envio > 0 ? ` · envío $ ${a.costo_envio.toFixed(2)}` : ""}
                  </p>
                </div>
                <span className="text-sm font-medium text-brand-700 underline">Abrir</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
