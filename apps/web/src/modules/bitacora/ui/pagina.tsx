import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Badge,
  EstadoError,
  EstadoVacio,
  PaginacionKeyset,
  Skeleton,
  formatearFechaHora,
} from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";
import { History } from "lucide-react";

import {
  POR_PAGINA,
  fallosPendientes,
  movimientos,
  quienesAparecen,
} from "../api/consultas";
import {
  ETIQUETA_ACCION,
  ETIQUETA_ENTIDAD,
  TONO_ACCION,
  describir,
  enlaceDe,
  type FiltrosBitacora,
} from "../dominio/tipos";
import { Fallos } from "./fallos";
import { FiltrosBarra } from "./filtros";

/** Solo quien puede verlo todo. La bitácora dice quién hizo qué. */
const ROLES = ["gerencia", "admin"];

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function uno(v: string | string[] | undefined): string | undefined {
  const valor = Array.isArray(v) ? v[0] : v;
  return valor && valor.length > 0 ? valor : undefined;
}

/**
 * Qué ha pasado en el sistema.
 *
 * De la auditoría del 31/08 (§0.5): la tabla existía desde la primera
 * migración y **nadie escribía en ella**. Ahora la llenan disparadores (051), y
 * esto es donde se lee.
 *
 * No está todo a propósito. Se apunta lo que cambia dinero, stock o permisos;
 * un registro que lo apunta todo entierra la respuesta el día que hace falta.
 */
export default async function PaginaBitacora({ searchParams }: Props) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) redirect("/login");
  if (!ROLES.includes(perfil.rol)) {
    return (
      <EstadoError
        titulo="No puedes ver la bitácora"
        descripcion="Dice quién hizo qué, así que solo la ve Gerencia y Administración."
      />
    );
  }

  const sp = await searchParams;
  const filtros: FiltrosBitacora = {
    entidad: uno(sp.entidad),
    usuario: uno(sp.usuario),
    desde: uno(sp.desde),
    hasta: uno(sp.hasta),
    cursor: uno(sp.cursor),
  };

  const personas = await quienesAparecen();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Qué ha pasado</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Quién cambió qué y cuándo. No se puede editar ni borrar.
        </p>
      </div>

      {/* Lo roto va ARRIBA de lo que pasó. Si algo está fallando, eso es
          lo que hay que ver primero; el historial se consulta cuando se
          busca algo concreto. */}
      <section className="card p-4">
        <h2 className="mb-1 text-sm font-semibold">Lo que se rompió</h2>
        <p className="mb-3 text-xs text-[var(--fg-subtle)]">
          Errores de servidor sin revisar. Hasta ahora morían en la pantalla
          de quien los provocaba y nadie más se enteraba.
        </p>
        <Suspense fallback={<Skeleton className="h-24 w-full" />}>
          <BloqueFallos />
        </Suspense>
      </section>

      <section className="card pt-4">
        <FiltrosBarra personas={personas.ok ? personas.datos : []} />

        <Suspense
          key={JSON.stringify(filtros)}
          fallback={<Skeleton className="h-96 w-full" />}
        >
          <Tabla filtros={filtros} />
        </Suspense>
      </section>

      <p className="text-xs text-[var(--fg-subtle)]">
        Se apunta lo que cambia <strong>dinero, stock o permisos</strong>, y de
        eso solo los campos que importan: cambiar la dirección de un cliente no
        entra, cambiarle la línea de crédito sí. Un registro que lo apunta todo
        entierra la respuesta el día que hace falta.
      </p>
    </div>
  );
}

async function BloqueFallos() {
  const r = await fallosPendientes();
  if (!r.ok) {
    return (
      <EstadoError
        titulo="No se pudo leer el registro de fallos"
        descripcion={r.error}
      />
    );
  }
  return <Fallos fallos={r.datos} />;
}

async function Tabla({ filtros }: { filtros: FiltrosBitacora }) {
  const r = await movimientos(filtros);

  if (!r.ok) {
    return (
      <EstadoError
        titulo="No se pudo leer la bitácora"
        descripcion="La consulta no llegó a completarse."
        detalle={r.error}
      />
    );
  }

  const { filas, siguiente } = r.datos;

  if (filas.length === 0) {
    const filtrando = Boolean(
      filtros.entidad || filtros.usuario || filtros.desde || filtros.hasta,
    );
    return (
      <EstadoVacio
        icono={<History className="size-8" aria-hidden="true" />}
        titulo={filtrando ? "Nada coincide" : "Todavía no ha pasado nada"}
        descripcion={
          filtrando
            ? "Prueba con menos filtros."
            : "Se irá llenando según se emitan documentos, se muevan precios o se cambien permisos."
        }
      />
    );
  }

  return (
    <>
      <div className="scroll-x">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
              <th className="px-4 py-2.5 font-medium">Cuándo</th>
              <th className="px-4 py-2.5 font-medium">Quién</th>
              <th className="px-4 py-2.5 font-medium">Qué</th>
              <th className="px-4 py-2.5 font-medium">Cambió</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((m) => {
              const href = enlaceDe(m.entidad, m.entidad_id);
              return (
                <tr key={m.id} className="border-b border-[var(--border-soft)]">
                  <td className="whitespace-nowrap px-4 py-2.5 tabular text-[var(--fg-muted)]">
                    {formatearFechaHora(m.creado_en)}
                  </td>
                  <td className="px-4 py-2.5 font-medium">{m.usuario_nombre}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={TONO_ACCION[m.accion] ?? "neutral"} size="sm">
                      {ETIQUETA_ACCION[m.accion] ?? m.accion}
                    </Badge>{" "}
                    {href ? (
                      <Link href={href} className="text-brand-600 hover:underline">
                        {ETIQUETA_ENTIDAD[m.entidad] ?? m.entidad}
                      </Link>
                    ) : (
                      <span>{ETIQUETA_ENTIDAD[m.entidad] ?? m.entidad}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--fg-muted)]">
                    {describir(m.descripcion)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Sin «anterior»: la bitácora solo crece, así que volver atrás es
          volver al principio de la lista, que es donde ya estabas. */}
      <PaginacionKeyset
        cantidadEnPagina={filas.length}
        cursorSiguiente={siguiente}
        cursorAnterior={null}
        porPagina={POR_PAGINA}
      />
    </>
  );
}
