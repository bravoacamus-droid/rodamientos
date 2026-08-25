import { Suspense } from "react";
import Link from "next/link";
import { Skeleton } from "@rodatech/ui";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

import { estadoConfiguracion } from "../api/configuracion";
import type { FiltrosComprobantes } from "../dominio/tipos";
import { FiltrosFacturacionBarra } from "./filtros";
import { TablaComprobantes } from "./tabla";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function uno(v: string | string[] | undefined): string | undefined {
  const valor = Array.isArray(v) ? v[0] : v;
  return valor && valor.length > 0 ? valor : undefined;
}

/**
 * Facturación.
 *
 * El aviso de configuración va ARRIBA y no escondido en ajustes: mientras no
 * haya certificado se puede emitir y cobrar, pero nada llega a SUNAT, y eso
 * hay que verlo cada vez que se entra, no descubrirlo en la inspección.
 */
export default async function PaginaFacturacion({ searchParams }: Props) {
  const sp = await searchParams;

  const filtros: FiltrosComprobantes = {
    q: uno(sp.q),
    cliente: uno(sp.cliente),
    tipo: uno(sp.tipo),
    estado: uno(sp.estado),
    sunat: uno(sp.sunat),
    desde: uno(sp.desde),
    hasta: uno(sp.hasta),
    cursor: uno(sp.cursor),
  };

  const supabase = await clienteServidor();
  const [{ data: clientes }, perfil, config] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, razon_social")
      .eq("activo", true)
      .order("razon_social")
      .limit(500),
    perfilActual(),
    estadoConfiguracion(),
  ]);

  const rol = perfil?.activo ? perfil.rol : null;
  const puedeFacturar = rol !== null && ["gerencia", "admin", "ventas"].includes(rol);
  const esGerencia = rol !== null && ["gerencia", "admin"].includes(rol);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Facturación</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Facturas y boletas electrónicas. Cierran el ciclo comercial.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {esGerencia ? (
            <Link
              href="/facturacion/configuracion"
              className="inline-flex h-9 items-center rounded-sm border border-[var(--border)] px-3 text-sm font-medium hover:bg-[var(--surface-2)]"
            >
              Configuración
            </Link>
          ) : null}
          {puedeFacturar ? (
            <Link
              href="/facturacion/nueva"
              className="inline-flex h-9 items-center rounded-sm bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
            >
              Emitir comprobante
            </Link>
          ) : null}
        </div>
      </div>

      {/* --------------------------------------------- Aviso de estado */}
      {!config.listo ? (
        <div className="anim-entrada rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm">
          <p className="font-medium">
            Se puede emitir y cobrar, pero nada llega a SUNAT todavía.
          </p>
          <ul className="mt-1.5 flex flex-col gap-0.5 text-[0.8rem]">
            {config.faltan.map((f) => (
              <li key={f}>· {f}</li>
            ))}
          </ul>
          {esGerencia ? (
            <Link
              href="/facturacion/configuracion"
              className="mt-2 inline-block text-[0.8rem] font-medium underline"
            >
              Ir a configurarlo
            </Link>
          ) : null}
        </div>
      ) : config.ambiente === "beta" ? (
        <p className="anim-entrada rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
          <strong>Homologación (beta).</strong> Lo que se emita se envía a SUNAT,
          pero <strong>no tiene valor fiscal</strong>. Es lo correcto hasta terminar
          las pruebas.
        </p>
      ) : null}

      {config.avisoCaducidad ? (
        <p className="anim-entrada rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger)]">
          {config.avisoCaducidad}
        </p>
      ) : null}

      <section className="card pt-4">
        <FiltrosFacturacionBarra clientes={clientes ?? []} />

        <Suspense
          key={JSON.stringify(filtros)}
          fallback={<Skeleton className="h-96 w-full" />}
        >
          <TablaComprobantes filtros={filtros} />
        </Suspense>
      </section>
    </div>
  );
}
