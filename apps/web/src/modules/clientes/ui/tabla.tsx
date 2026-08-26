import Link from "next/link";
import { Badge, EstadoError, EstadoVacio, Moneda, PaginacionKeyset } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { listarClientes } from "../api/consultas";
import {
  ETIQUETA_CONDICION,
  type ClienteLista,
  type FiltrosClientes,
} from "../dominio/tipos";
import { AccionesFila } from "./acciones-fila";

/** Roles que mantienen la cartera. Ventas entra porque es quien da de alta. */
const ROLES_ESCRITURA = ["gerencia", "admin", "ventas"];

/**
 * Listado de la cartera.
 *
 * En escritorio son siete columnas. En un teléfono siete columnas no se leen
 * ni con scroll horizontal, así que por debajo de `md` cada cliente es una
 * tarjeta con la misma información apilada y el mismo menú de acciones. Es el
 * mismo dato, no una versión recortada.
 */
export async function TablaClientes({ filtros }: { filtros: FiltrosClientes }) {
  const [resultado, perfil] = await Promise.all([listarClientes(filtros), perfilActual()]);

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No se pudo cargar la cartera"
        descripcion="La consulta no llegó a completarse. No se ha modificado ni perdido nada."
        detalle={resultado.error}
      />
    );
  }

  const { filas, siguiente } = resultado.datos;

  if (filas.length === 0) {
    const filtrando = Boolean(filtros.q || filtros.condicion);
    return (
      <EstadoVacio
        titulo={filtrando ? "Ningún cliente coincide" : "La cartera está vacía"}
        descripcion={
          filtrando
            ? "Prueba con menos filtros, o busca por RUC. Los bloqueados y los desactivados están ocultos salvo que los pidas."
            : "Crea el primero con «Nuevo cliente»: pegando el RUC, los datos se traen solos."
        }
      />
    );
  }

  const rol = perfil?.activo ? perfil.rol : null;
  const puedeEditar = rol !== null && ROLES_ESCRITURA.includes(rol);

  return (
    <>
      {/* ------------------------------------------------------ Escritorio */}
      <div className="scroll-x hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
              <th className="px-4 py-2.5 font-medium">Código</th>
              <th className="px-4 py-2.5 font-medium">Documento</th>
              <th className="px-4 py-2.5 font-medium">Razón social</th>
              <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Contacto</th>
              <th className="px-4 py-2.5 font-medium">Condición</th>
              <th className="hidden px-4 py-2.5 text-right font-medium lg:table-cell">
                Línea
              </th>
              <th className="px-4 py-2.5 font-medium">Estado</th>
              <th className="w-12 px-2 py-2.5">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((c) => (
              <tr
                key={c.id}
                className={`border-b border-[var(--border-soft)] transition-colors hover:bg-[var(--surface-2)] ${
                  c.activo ? "" : "opacity-60"
                }`}
              >
                <td className="px-4 py-2.5">
                  <Link
                    href={`/clientes/${c.id}`}
                    className="font-mono text-[0.8rem] font-medium text-brand-600 hover:underline"
                  >
                    {c.codigo}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5">
                  <span className="text-xs text-[var(--fg-subtle)]">
                    {c.tipo_documento}
                  </span>{" "}
                  <span className="tabular">{c.numero_documento ?? "—"}</span>
                </td>
                <td className="max-w-xs px-4 py-2.5">
                  <span className="block truncate font-medium">{c.razon_social}</span>
                  {c.nombre_comercial ? (
                    <span className="block truncate text-xs text-[var(--fg-subtle)]">
                      {c.nombre_comercial}
                    </span>
                  ) : null}
                </td>
                <td className="hidden max-w-[14rem] px-4 py-2.5 lg:table-cell">
                  <Contacto c={c} />
                </td>
                <td className="whitespace-nowrap px-4 py-2.5">
                  <Condicion c={c} />
                </td>
                <td className="hidden px-4 py-2.5 text-right lg:table-cell">
                  {c.condicion_pago === "credito" && c.linea_credito > 0 ? (
                    <Moneda valor={c.linea_credito} tamano="sm" enfasis="suave" />
                  ) : (
                    <span className="text-[var(--fg-subtle)]">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <Estado c={c} />
                </td>
                <td className="px-2 py-1.5">
                  <AccionesFila
                    id={c.id}
                    codigo={c.codigo}
                    razonSocial={c.razon_social}
                    bloqueado={c.bloqueado}
                    puedeEditar={puedeEditar}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ------------------------------------------------------------ Móvil */}
      <ul className="flex flex-col divide-y divide-[var(--border-soft)] md:hidden">
        {filas.map((c) => (
          <li
            key={c.id}
            className={`flex items-start gap-2 px-3 py-3 ${c.activo ? "" : "opacity-60"}`}
          >
            {/* `min-w-0` es lo que impide que un nombre largo empuje la tarjeta
                fuera de los 360 px: sin él, flex no deja encoger al hijo. */}
            <div className="min-w-0 flex-1">
              <Link
                href={`/clientes/${c.id}`}
                className="block truncate text-sm font-semibold text-brand-600"
              >
                {c.razon_social}
              </Link>

              <p className="mt-0.5 truncate font-mono text-xs text-[var(--fg-subtle)]">
                {c.codigo} · {c.tipo_documento} {c.numero_documento ?? "sin documento"}
              </p>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <Estado c={c} />
                <Condicion c={c} />
              </div>

              <div className="mt-1 min-w-0 text-xs text-[var(--fg-muted)]">
                <Contacto c={c} />
              </div>
            </div>

            <AccionesFila
              id={c.id}
              codigo={c.codigo}
              razonSocial={c.razon_social}
              bloqueado={c.bloqueado}
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

/**
 * Quién y por dónde.
 *
 * Se prioriza el WhatsApp sobre el teléfono fijo porque es por donde de verdad
 * se les escribe. El correo puede faltar y no pasa nada: hay clientes técnicos
 * que a las justas dan un número.
 */
function Contacto({ c }: { c: ClienteLista }) {
  const via = c.whatsapp ?? c.telefono;
  if (!c.contacto && !via && !c.email) {
    return <span className="text-[var(--fg-subtle)]">Sin datos de contacto</span>;
  }
  return (
    <>
      {c.contacto ? <span className="block truncate">{c.contacto}</span> : null}
      <span className="block truncate text-xs text-[var(--fg-subtle)]">
        {[via, c.email].filter(Boolean).join(" · ")}
      </span>
    </>
  );
}

function Condicion({ c }: { c: ClienteLista }) {
  if (c.condicion_pago === "contado") {
    return (
      <Badge tone="neutral" size="xs">
        {ETIQUETA_CONDICION.contado}
      </Badge>
    );
  }
  return (
    <Badge tone="info" size="xs">
      {ETIQUETA_CONDICION.credito}
      {c.dias_credito > 0 ? ` ${c.dias_credito}d` : ""}
    </Badge>
  );
}

/** Solo se pinta cuando hay algo que decir: un cliente normal no lleva insignia. */
function Estado({ c }: { c: ClienteLista }) {
  if (c.bloqueado) {
    return (
      <Badge tone="danger" size="xs">
        Bloqueado
      </Badge>
    );
  }
  if (!c.activo) {
    return (
      <Badge tone="warning" size="xs">
        Desactivado
      </Badge>
    );
  }
  return (
    <Badge tone="success" size="xs">
      Activo
    </Badge>
  );
}
