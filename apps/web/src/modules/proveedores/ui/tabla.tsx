import Link from "next/link";
import { EstadoError, EstadoVacio, PaginacionKeyset } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { listarProveedores } from "../api/consultas";
import { ETIQUETA_TIPO, type FiltrosProveedores } from "../dominio/tipos";
import { AccionesFila } from "./acciones-fila";

/**
 * Tabla del maestro de proveedores.
 *
 * La columna que la diferencia de la de clientes es **Marcas**: en una
 * distribuidora de rodamientos, «¿quién me vende SKF?» es la pregunta que se
 * le hace al maestro, y sin esa columna habría que abrir las fichas una a una.
 *
 * En móvil NO es una tabla: por debajo de `md` cada proveedor es una tarjeta
 * con lo mismo apilado, igual que en el resto del ERP.
 */
export async function TablaProveedores({ filtros }: { filtros: FiltrosProveedores }) {
  const [resultado, perfil] = await Promise.all([
    listarProveedores(filtros),
    perfilActual(),
  ]);

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No se pudo cargar el maestro de proveedores"
        descripcion="La consulta no llegó a completarse."
        detalle={resultado.error}
      />
    );
  }

  const { filas, siguiente } = resultado.datos;

  if (filas.length === 0) {
    const filtrando = Boolean(filtros.q || filtros.tipo || filtros.marca);
    return (
      <EstadoVacio
        titulo={filtrando ? "Ningún proveedor coincide" : "Todavía no hay proveedores"}
        descripcion={
          filtrando
            ? "Prueba con menos filtros, o busca por RUC."
            : "Crea el primero con «Nuevo proveedor». También se puede dar de alta sobre la marcha al recibir mercadería."
        }
      />
    );
  }

  const rol = perfil?.activo ? perfil.rol : null;
  const puedeEditar = rol !== null && ["gerencia", "admin", "compras"].includes(rol);

  return (
    <>
      {/* ------------------------------------------------ Escritorio */}
      <div className="scroll-x hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
              <th className="px-4 py-2.5 font-medium">Proveedor</th>
              <th className="px-4 py-2.5 font-medium">Documento</th>
              <th className="px-4 py-2.5 font-medium">Marcas</th>
              <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Contacto</th>
              <th className="px-4 py-2.5 text-right font-medium">Pago</th>
              <th className="px-4 py-2.5 text-right font-medium">Lead time</th>
              <th className="px-4 py-2.5 font-medium">Tipo</th>
              <th className="w-12 px-2 py-2.5">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((p) => (
              <tr
                key={p.id}
                className={`border-b border-[var(--border-soft)] transition-colors hover:bg-[var(--surface-2)] ${
                  p.activo ? "" : "opacity-60"
                }`}
              >
                <td className="max-w-xs px-4 py-2.5">
                  <Link
                    href={`/proveedores/${p.id}`}
                    className="block truncate font-medium text-brand-600 hover:underline"
                  >
                    {p.razon_social}
                  </Link>
                  <span className="block font-mono text-xs text-[var(--fg-subtle)]">
                    {p.codigo}
                    {p.activo ? "" : " · de baja"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 tabular text-[0.8rem]">
                  {p.numero_documento ? (
                    <>
                      <span className="text-xs text-[var(--fg-subtle)]">
                        {p.tipo_documento}{" "}
                      </span>
                      {p.numero_documento}
                    </>
                  ) : (
                    <span className="text-[var(--fg-subtle)]">sin documento</span>
                  )}
                </td>
                <td className="max-w-xs px-4 py-2.5">
                  {p.marcas.length === 0 ? (
                    <span className="text-xs text-[var(--fg-subtle)]">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {p.marcas.slice(0, 4).map((m) => (
                        <span
                          key={m}
                          className="rounded-sm bg-[var(--surface-2)] px-1.5 py-0.5 text-xs"
                        >
                          {m}
                        </span>
                      ))}
                      {p.marcas.length > 4 ? (
                        <span className="px-1 py-0.5 text-xs text-[var(--fg-subtle)]">
                          +{p.marcas.length - 4}
                        </span>
                      ) : null}
                    </div>
                  )}
                </td>
                <td className="hidden max-w-[14rem] px-4 py-2.5 text-xs lg:table-cell">
                  {p.contacto ? <span className="block truncate">{p.contacto}</span> : null}
                  {p.telefono || p.whatsapp ? (
                    <span className="block truncate text-[var(--fg-muted)]">
                      {p.telefono ?? p.whatsapp}
                    </span>
                  ) : null}
                  {!p.contacto && !p.telefono && !p.whatsapp ? (
                    <span className="text-[var(--fg-subtle)]">—</span>
                  ) : null}
                </td>
                <td className="px-4 py-2.5 text-right tabular text-[0.8rem]">
                  {/* 0 días no es «sin dato»: es al contado, que es una
                      condición tan real como 30 días. */}
                  {p.dias_pago === 0 ? "contado" : `${p.dias_pago} d`}
                </td>
                <td className="px-4 py-2.5 text-right tabular text-[0.8rem]">
                  {p.lead_time_dias} d
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`inline-block whitespace-nowrap rounded-sm px-1.5 py-0.5 text-xs font-medium ${
                      p.tipo === "importacion"
                        ? "bg-[var(--info-bg)] text-[var(--info)]"
                        : "bg-[var(--surface-2)] text-[var(--fg-muted)]"
                    }`}
                  >
                    {ETIQUETA_TIPO[p.tipo]}
                  </span>
                </td>
                <td className="px-2 py-1.5">
                  <AccionesFila
                    id={p.id}
                    razonSocial={p.razon_social}
                    activo={p.activo}
                    puedeEditar={puedeEditar}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ----------------------------------------------------- Móvil */}
      <ul className="flex flex-col divide-y divide-[var(--border-soft)] md:hidden">
        {filas.map((p) => (
          <li
            key={p.id}
            className={`flex items-start gap-2 px-3 py-3 ${p.activo ? "" : "opacity-60"}`}
          >
            <div className="min-w-0 flex-1">
              <Link
                href={`/proveedores/${p.id}`}
                className="block truncate text-sm font-semibold text-brand-600"
              >
                {p.razon_social}
              </Link>
              <p className="mt-0.5 text-xs text-[var(--fg-muted)]">
                {p.numero_documento
                  ? `${p.tipo_documento} ${p.numero_documento}`
                  : "sin documento"}
                {" · "}
                {ETIQUETA_TIPO[p.tipo]}
              </p>

              {p.marcas.length > 0 ? (
                <p className="mt-1 truncate text-xs text-[var(--fg-subtle)]">
                  {p.marcas.join(" · ")}
                </p>
              ) : null}

              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 text-xs text-[var(--fg-muted)]">
                <span>{p.dias_pago === 0 ? "Contado" : `Pago ${p.dias_pago} d`}</span>
                <span>Lead {p.lead_time_dias} d</span>
                {p.activo ? null : (
                  <span className="rounded-sm bg-[var(--surface-2)] px-1.5 py-0.5">
                    De baja
                  </span>
                )}
              </div>
            </div>

            <AccionesFila
              id={p.id}
              razonSocial={p.razon_social}
              activo={p.activo}
              puedeEditar={puedeEditar}
            />
          </li>
        ))}
      </ul>

      <div className="px-3 py-3 sm:px-4">
        <PaginacionKeyset
          cantidadEnPagina={filas.length}
          cursorSiguiente={siguiente}
          cursorAnterior={null}
        />
      </div>
    </>
  );
}
