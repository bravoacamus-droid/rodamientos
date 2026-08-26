import { Suspense } from "react";
import Link from "next/link";
import { Badge, CifraAnimada, EstadoError, EstadoVacio, Skeleton } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { importaciones } from "../api/consultas";
import {
  diasDeAtraso,
  diasParaLlegar,
  estadoTransito,
  incidenciaGastos,
  resumir,
  tonoTransito,
} from "../dominio/transito";
import {
  ETIQUETA_TRANSITO,
  type FiltrosImportaciones,
  type Importacion,
} from "../dominio/tipos";
import { FiltrosImportacionesBarra } from "./filtros";
import { PanelGastos } from "./gastos";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function uno(v: string | string[] | undefined): string | undefined {
  const valor = Array.isArray(v) ? v[0] : v;
  return valor && valor.length > 0 ? valor : undefined;
}

const dinero = (n: number) => `$ ${n.toFixed(2)}`;

/** Los roles que `permisos_rol` deja escribir en `gastos_importacion`. */
const ROLES_GASTOS = ["gerencia", "admin", "compras"];

/**
 * Importaciones.
 *
 * Willy compra fuera en envíos pequeños por courier, no en contenedores
 * (30:01), así que esto no es un módulo de landed cost con DUA y ad valorem:
 * es «¿dónde está mi pedido y cuánto me va a costar puesto aquí?».
 *
 * El reparto de los gastos sobre el costo ya lo hacía la base —y estaba MAL:
 * hasta la migración 022, dos entregas parciales de la misma compra cargaban
 * los gastos completos cada una—. Lo que faltaba era esto: ver lo que está
 * fuera y poder detallar en qué se fue el dinero.
 *
 * Ordenado por lo que urge: lo atrasado arriba, después lo que viene por fecha
 * de llegada, y lo ya recibido al final. Es el orden en que alguien pregunta
 * «¿qué falta?».
 */
export default async function PaginaImportaciones({ searchParams }: Props) {
  const sp = await searchParams;

  const filtros: FiltrosImportaciones = {
    q: uno(sp.q),
    // Por defecto se enseña solo lo abierto. Lo que ya llegó no es una
    // importación que seguir, es una compra: vive en /compras.
    abiertas: uno(sp.abiertas) ?? "1",
  };

  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(
    new Date(),
  );

  const perfil = await perfilActual();
  const puedeGastos =
    perfil?.activo === true && ROLES_GASTOS.includes(perfil.rol);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Importaciones</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Lo que viene de fuera: dónde está, cuándo llega y cuánto suman los
          gastos que lo encarecen.
        </p>
      </div>

      <Suspense
        fallback={
          <div className="grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        }
      >
        <Indicadores filtros={{ abiertas: "1" }} hoy={hoy} />
      </Suspense>

      <section className="card pt-4">
        <FiltrosImportacionesBarra />
        <Suspense
          key={JSON.stringify(filtros)}
          fallback={<Skeleton className="h-96 w-full" />}
        >
          <Listado filtros={filtros} hoy={hoy} puedeGastos={puedeGastos} />
        </Suspense>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Las tarjetas van SIEMPRE sobre lo abierto, ignorando el filtro.
 *
 * Un contador que se mueve con el filtro no sirve para decidir: «hay 40.000
 * fuera» tiene que decir lo mismo se esté buscando lo que se esté buscando.
 */
async function Indicadores({
  filtros,
  hoy,
}: {
  filtros: FiltrosImportaciones;
  hoy: string;
}) {
  const r = await importaciones(filtros, hoy);
  if (!r.ok) {
    return <EstadoError titulo="No se pudieron cargar las importaciones" detalle={r.error} />;
  }

  const s = resumir(r.datos, hoy);

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="card anim-entrada p-3">
        <p className="text-xs text-[var(--fg-muted)]">En camino</p>
        <p className="mt-0.5 text-xl font-semibold">
          <CifraAnimada valor={s.enCamino} decimales={0} />
        </p>
        <p className="mt-0.5 text-xs text-[var(--fg-subtle)]">
          {s.enCamino === 0 ? "no hay nada fuera" : "pedidos sin llegar del todo"}
        </p>
      </div>

      <div className="card anim-entrada p-3">
        <p className="text-xs text-[var(--fg-muted)]">Atrasadas</p>
        <p
          className={`mt-0.5 text-xl font-semibold ${s.atrasadas > 0 ? "text-[var(--danger)]" : ""}`}
        >
          <CifraAnimada valor={s.atrasadas} decimales={0} />
        </p>
        <p className="mt-0.5 text-xs text-[var(--fg-subtle)]">
          {s.atrasadas === 0 ? "todo dentro de plazo" : "pasaron su fecha estimada"}
        </p>
      </div>

      <div className="card anim-entrada p-3">
        <p className="text-xs text-[var(--fg-muted)]">Dinero fuera</p>
        <p className="mt-0.5 text-xl font-semibold">
          <CifraAnimada valor={s.valorEnCamino} decimales={2} prefijo="$ " />
        </p>
        <p className="mt-0.5 text-xs text-[var(--fg-subtle)]">
          {s.gastosEnCamino > 0
            ? `más ${dinero(s.gastosEnCamino)} en gastos`
            : "sin gastos anotados"}
        </p>
      </div>
    </div>
  );
}

async function Listado({
  filtros,
  hoy,
  puedeGastos,
}: {
  filtros: FiltrosImportaciones;
  hoy: string;
  puedeGastos: boolean;
}) {
  const r = await importaciones(filtros, hoy);
  if (!r.ok) {
    return (
      <EstadoError
        titulo="No se pudieron cargar las importaciones"
        descripcion="La consulta no llegó a completarse."
        detalle={r.error}
      />
    );
  }

  if (r.datos.length === 0) {
    const filtrando = Boolean(filtros.q);
    return (
      <EstadoVacio
        titulo={
          filtrando
            ? "Nada coincide con la búsqueda"
            : filtros.abiertas === "1"
              ? "No hay nada en camino"
              : "Todavía no hay importaciones"
        }
        descripcion={
          filtrando
            ? "Prueba con el número de compra, el tracking o el courier."
            : filtros.abiertas === "1"
              ? "Todo lo que se pidió fuera ya llegó. Quita el filtro para ver el histórico."
              : "Una compra aparece aquí cuando se registra con tipo «importación»."
        }
      />
    );
  }

  return (
    <div className="scroll-x">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
            <th className="px-4 py-2.5 font-medium">Compra</th>
            <th className="px-4 py-2.5 font-medium">Proveedor</th>
            <th className="px-4 py-2.5 font-medium">Envío</th>
            <th className="px-4 py-2.5 font-medium">Estado</th>
            <th className="px-4 py-2.5 text-right font-medium">Mercadería</th>
            <th className="px-4 py-2.5 font-medium">Gastos</th>
          </tr>
        </thead>
        <tbody>
          {r.datos.map((c, i) => (
            <Fila key={c.id} compra={c} hoy={hoy} indice={i} puedeGastos={puedeGastos} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Fila({
  compra,
  hoy,
  indice,
  puedeGastos,
}: {
  compra: Importacion;
  hoy: string;
  indice: number;
  puedeGastos: boolean;
}) {
  const estado = estadoTransito(compra, hoy);
  const atraso = diasDeAtraso(compra, hoy);
  const faltan = diasParaLlegar(compra, hoy);
  const incidencia = incidenciaGastos(compra);

  // El cerrojo de la 022: los gastos se congelan en cuanto entra mercadería.
  const editable = puedeGastos && compra.estado === "registrada";

  return (
    <tr
      className="anim-entrada border-b border-[var(--border-soft)] align-top transition-colors hover:bg-[var(--surface-2)]"
      style={{ animationDelay: `${Math.min(indice, 6) * 24}ms` }}
    >
      <td className="px-4 py-2.5">
        <Link
          href={`/compras/${compra.id}`}
          className="font-mono text-xs font-medium text-brand-600 hover:underline"
        >
          {compra.numero}
        </Link>
        <span className="block text-xs text-[var(--fg-subtle)] tabular">{compra.fecha}</span>
        {compra.documento_proveedor ? (
          <span className="block text-xs text-[var(--fg-subtle)]">
            {compra.documento_proveedor}
          </span>
        ) : null}
      </td>

      <td className="max-w-xs px-4 py-2.5">
        <Link
          href={`/proveedores/${compra.proveedor_id}`}
          className="block truncate hover:underline"
        >
          {compra.proveedor}
        </Link>
        <span className="block text-xs text-[var(--fg-subtle)]">
          {compra.lineasRecibidas} de {compra.lineas}{" "}
          {compra.lineas === 1 ? "línea llegó" : "líneas llegaron"}
        </span>
      </td>

      <td className="px-4 py-2.5">
        {compra.courier ? (
          <span className="block font-medium">{compra.courier}</span>
        ) : (
          <span className="block text-[var(--fg-subtle)]">sin courier</span>
        )}
        {compra.tracking ? (
          <span className="block font-mono text-xs text-[var(--fg-muted)]">
            {compra.tracking}
          </span>
        ) : null}
      </td>

      <td className="whitespace-nowrap px-4 py-2.5">
        <Badge tone={tonoTransito(estado)} size="xs">
          {ETIQUETA_TRANSITO[estado]}
        </Badge>
        <span className="mt-0.5 block text-xs text-[var(--fg-subtle)]">
          {atraso > 0
            ? `${atraso} ${atraso === 1 ? "día" : "días"} de retraso`
            : faltan !== null
              ? faltan === 0
                ? "llega hoy"
                : `en ${faltan} ${faltan === 1 ? "día" : "días"}`
              : compra.fecha_estimada
                ? compra.fecha_estimada
                : "nadie prometió fecha"}
        </span>
      </td>

      <td className="px-4 py-2.5 text-right tabular">
        {dinero(compra.subtotal)}
        <span className="block text-xs text-[var(--fg-subtle)]">sin IGV</span>
      </td>

      <td className="px-4 py-2.5">
        <PanelGastos
          compraId={compra.id}
          total={compra.gastos}
          subtotal={compra.subtotal}
          editable={editable}
          motivoBloqueo={
            puedeGastos
              ? "Ya entró mercadería: el costo está en el kardex y los gastos se congelan. Se corrige con un ajuste de inventario."
              : "Tu rol no puede tocar los gastos de importación."
          }
        />
        {incidencia !== null && incidencia > 0 ? (
          <span
            className={`mt-1 block text-xs ${incidencia >= 25 ? "text-[var(--warn)]" : "text-[var(--fg-subtle)]"}`}
          >
            encarecen un {incidencia.toFixed(1)} %
          </span>
        ) : null}
      </td>
    </tr>
  );
}
