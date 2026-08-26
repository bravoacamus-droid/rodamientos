import Link from "next/link";
import { notFound } from "next/navigation";
import { EstadoError } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { detalleProveedor } from "../api/consultas";
import { ETIQUETA_DOCUMENTO, ETIQUETA_TIPO } from "../dominio/tipos";

/** La ficha de un proveedor. */
export default async function PaginaDetalleProveedor({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [resultado, perfil] = await Promise.all([detalleProveedor(id), perfilActual()]);

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No se pudo cargar el proveedor"
        descripcion="La consulta no llegó a completarse."
        detalle={resultado.error}
      />
    );
  }
  if (!resultado.datos) notFound();

  const p = resultado.datos;
  const puedeEditar =
    perfil !== null &&
    perfil.activo &&
    ["gerencia", "admin", "compras"].includes(perfil.rol);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{p.razon_social}</h1>
            {p.activo ? null : (
              <span className="rounded-sm bg-[var(--surface-2)] px-2 py-0.5 text-xs font-medium text-[var(--fg-muted)]">
                De baja
              </span>
            )}
          </div>
          <p className="font-mono text-sm text-[var(--fg-muted)]">
            {p.codigo}
            {p.numero_documento
              ? ` · ${ETIQUETA_DOCUMENTO[p.tipo_documento]} ${p.numero_documento}`
              : " · sin documento"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/recepciones?proveedor=${p.id}`}
            className="inline-flex h-9 items-center rounded-sm border border-[var(--border)] px-3 text-sm font-medium hover:bg-[var(--surface-2)]"
          >
            Ver recepciones
          </Link>
          {puedeEditar ? (
            <Link
              href={`/proveedores/${p.id}/editar`}
              className="inline-flex h-9 items-center rounded-sm bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
            >
              Editar
            </Link>
          ) : null}
        </div>
      </div>

      <section className="card grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Dato etiqueta="Tipo de compra" valor={ETIQUETA_TIPO[p.tipo]} pie={p.pais} />
        <Dato
          etiqueta="Condición de pago"
          valor={p.dias_pago === 0 ? "Al contado" : `${p.dias_pago} días`}
          pie="lo que él nos da a nosotros"
        />
        <Dato
          etiqueta="Lead time"
          valor={`${p.lead_time_dias} días`}
          pie="desde que se le pide hasta que llega"
        />
        <Dato
          etiqueta="Contacto"
          valor={p.contacto ?? "—"}
          pie={p.telefono ?? p.whatsapp ?? p.email}
        />
      </section>

      <section className="card p-4">
        <h2 className="text-sm font-semibold">Marcas que representa</h2>
        {p.marcas.length === 0 ? (
          <p className="mt-1 text-sm text-[var(--fg-subtle)]">
            Ninguna anotada. Al ponerlas, este proveedor aparece al filtrar el
            maestro por marca.
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {p.marcas.map((m) => (
              <span
                key={m}
                className="rounded-full border border-[var(--border)] px-3 py-1 text-sm"
              >
                {m}
              </span>
            ))}
          </div>
        )}
      </section>

      {p.direccion || p.email || p.notas ? (
        <section className="card grid gap-4 p-4 sm:grid-cols-2">
          {p.direccion ? (
            <Dato
              etiqueta="Dirección"
              valor={p.direccion}
              pie={p.ubigeo_nombre}
            />
          ) : null}
          {p.email ? <Dato etiqueta="Correo" valor={p.email} /> : null}
          {p.notas ? (
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
                Notas
              </dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-sm">{p.notas}</dd>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function Dato({
  etiqueta,
  valor,
  pie,
}: {
  etiqueta: string;
  valor: string;
  pie?: string | null;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
        {etiqueta}
      </dt>
      <dd className="mt-0.5 text-sm">{valor}</dd>
      {pie ? <p className="text-xs text-[var(--fg-subtle)]">{pie}</p> : null}
    </div>
  );
}
