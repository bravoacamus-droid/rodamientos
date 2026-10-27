import { ChevronDown, History } from "lucide-react";
import { puedo } from "@/lib/permisos";

import { historialDe } from "../api/consultas";
import { describir, type Movimiento } from "../dominio/tipos";

/**
 * «Quién lo hizo y cuándo», al pie de la ficha de UN documento (TR-03).
 *
 * `historialDe` estaba escrito y exportado con el comentario «lo consume la
 * ficha del comprobante», y no lo importaba nadie: para saber quién emitió
 * una factura o aprobó una cotización había que ir a «Qué ha pasado», donde
 * no se puede buscar por número. Es el patrón de CLAUDE.md §2 —la pieza
 * existe, el camino no—, y esto es el camino.
 *
 * Plegada por defecto: es la respuesta a una pregunta que se hace poco, y
 * abierta empujaría hacia abajo lo que se mira a diario. Solo para quien
 * puede ver la bitácora: dice quién hizo qué.
 *
 * Componente de servidor. La firma la importan otras fichas (compra y
 * recepción); no cambiarla sin cambiarlas a ellas.
 */
export async function HistorialDocumento({ entidad, id }: { entidad: string; id: string }) {
  if (!(await puedo("bitacora", "ver"))) return null;

  const r = await historialDe(entidad, id);

  return (
    <details className="card group no-print print:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-semibold hover:bg-[var(--surface-2)] [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-start gap-2">
          <History className="mt-0.5 size-4 shrink-0 text-[var(--fg-muted)]" aria-hidden="true" />
          {/* El recuento va en el mismo renglón de texto: como hermano de
              flex, a 390 px se partía en una columna aparte. */}
          <span>
            Quién lo hizo y cuándo
            {r.ok && r.datos.length > 0 ? (
              <span className="whitespace-nowrap font-normal text-[var(--fg-muted)]">
                {" "}
                · {r.datos.length} {r.datos.length === 1 ? "anotación" : "anotaciones"}
              </span>
            ) : null}
          </span>
        </span>
        {/* Que se vea que se abre: un rótulo con flecha, no un texto suelto. */}
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--border-strong)] px-2.5 py-1 font-medium">
          <span className="group-open:hidden">Ver</span>
          <span className="hidden group-open:inline">Ocultar</span>
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
        </span>
      </summary>

      <div className="border-t border-[var(--border-soft)] px-4 py-3 text-sm">
        {!r.ok ? (
          <p role="alert" className="text-[var(--danger)]">
            No se pudo leer el historial: {r.error}
          </p>
        ) : r.datos.length === 0 ? (
          <p className="text-[var(--fg-muted)]">Todavía no hay nada apuntado de este documento.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-[var(--border-soft)]">
            {r.datos.map((m) => (
              <li key={m.id} className="py-1.5">
                <span className="tabular text-[var(--fg-muted)]">{fechaHora(m.creado_en)}</span>
                {" · "}
                <span className="font-medium">{m.usuario_nombre}</span>
                {" · "}
                {frase(m)}
              </li>
            ))}
          </ol>
        )}
      </div>
    </details>
  );
}

/** «20/10/2026 21:03», en hora de Lima y con el año entero. */
function fechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const partes = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  return `${v("day")}/${v("month")}/${v("year")} ${v("hour")}:${v("minute")}`;
}

/** La acción dicha con palabras; el detalle, con los nombres de campo traducidos. */
function frase(m: Movimiento): string {
  // «Se creó» / «Se borró» es lo que escribe la base cuando no hay más que
  // decir: al lado de «Lo creó» sería decirlo dos veces.
  const detalle = m.descripcion && !/^Se (creó|borró)\.?$/.test(m.descripcion.trim()) ? describir(m.descripcion) : null;
  switch (m.accion) {
    case "creado":
      return detalle ? `Lo creó · ${detalle}` : "Lo creó";
    case "borrado":
      return detalle ? `Lo borró · ${detalle}` : "Lo borró";
    default:
      return detalle ?? "Lo cambió";
  }
}
