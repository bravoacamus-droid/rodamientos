"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "@rodatech/ui";
import { Check, Minus } from "lucide-react";

import { cambiarPermisoArea } from "../acciones/permisos";
import {
  AREAS,
  estadoDelArea,
  tablasSinArea,
  type EstadoArea,
  type PermisoGuardado,
} from "../dominio/permisos";
import { ETIQUETA_ROL, ROLES, type Rol } from "../dominio/tipos";

/**
 * Quién puede tocar qué.
 *
 * Una fila por área y una columna por rol. Marcar una casilla escribe todas
 * las tablas de esa área de golpe (ver `dominio/permisos.ts`).
 *
 * ---------------------------------------------------------------------------
 * Tres decisiones que no son de estilo
 * ---------------------------------------------------------------------------
 * 1. **La columna de Gerencia va apagada y no se puede tocar.** Es la única
 *    que puede llegar a esta pantalla; dejar quitársela sería ofrecer un botón
 *    para encerrarse fuera. La aplicación lo impide y la Server Action también.
 *
 * 2. **«A medias» se ve distinto.** La matriz se sembró tabla a tabla (007) y
 *    un área puede estar incompleta. Pintar eso como «no» y dejar que el
 *    primer clic lo arrase sería mentir sobre lo que hay.
 *
 * 3. **Cada casilla es un botón con su palabra**, no un `checkbox` suelto.
 *    Luis, textual: *«una persona que no sabe que tiene que darle click ahí»*.
 *    Un cuadradito de 13 px en una rejilla de 48 no lo ve nadie.
 */
export function MatrizPermisos({
  guardados,
  puedeEditar,
  rolPropio,
}: {
  guardados: PermisoGuardado[];
  puedeEditar: boolean;
  rolPropio: Rol | null;
}) {
  const router = useRouter();
  const [enCurso, setEnCurso] = React.useState<string | null>(null);
  const sueltas = tablasSinArea(guardados);

  async function alternar(areaClave: string, rol: Rol, estado: EstadoArea) {
    const id = `${areaClave}:${rol}`;
    setEnCurso(id);
    // «A medias» se completa; lo demás se invierte. Así un clic en un área
    // incompleta nunca borra: primero la termina.
    const puede = estado !== "todo";
    const r = await cambiarPermisoArea({ area: areaClave, rol, puede });
    setEnCurso(null);
    if (r.ok) {
      toast.success(r.mensaje);
      router.refresh();
    } else {
      toast.error(r.error);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="scroll-x">
        <table className="w-full min-w-[42rem] text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-sm uppercase tracking-wide text-[var(--fg-subtle)]">
              <th className="px-3 py-2 font-medium">Qué se puede tocar</th>
              {ROLES.map((r) => (
                <th key={r} className="px-2 py-2 text-center font-medium">
                  {ETIQUETA_ROL[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {AREAS.map((area) => (
              <tr
                key={area.clave}
                className="border-b border-[var(--border)] align-top last:border-0"
              >
                <td className="px-3 py-3">
                  <p className="font-medium">{area.etiqueta}</p>
                  <p className="text-sm text-[var(--fg-muted)]">{area.ayuda}</p>
                </td>
                {ROLES.map((rol) => {
                  const estado = estadoDelArea(area, rol, guardados);
                  const esGerencia = rol === "gerencia";
                  const id = `${area.clave}:${rol}`;
                  return (
                    <td key={rol} className="px-2 py-3 text-center">
                      <Casilla
                        estado={estado}
                        etiqueta={`${area.etiqueta} · ${ETIQUETA_ROL[rol]}`}
                        // Gerencia nunca, el propio rol tampoco: los dos casos
                        // acaban en «nadie puede devolvérmelo».
                        bloqueada={!puedeEditar || esGerencia || rol === rolPropio}
                        ocupada={enCurso === id}
                        onClick={() => alternar(area.clave, rol, estado)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/*
        Lo que nadie clasificó. Hoy no sale nunca; saldrá el día que alguien
        meta una tabla en la matriz y se olvide de esta pantalla — y entonces
        se ve, en vez de quedarse invisible.
      */}
      {sueltas.length > 0 ? (
        <div className="rounded-lg border border-[var(--warn)] bg-[var(--warn-bg)] p-3">
          <p className="text-sm font-medium">
            Hay permisos que esta pantalla todavía no sabe agrupar
          </p>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            Se cambian por SQL hasta que alguien los meta en un grupo:{" "}
            {sueltas.join(", ")}.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Casilla({
  estado,
  etiqueta,
  bloqueada,
  ocupada,
  onClick,
}: {
  estado: EstadoArea;
  etiqueta: string;
  bloqueada: boolean;
  ocupada: boolean;
  onClick: () => void;
}) {
  const comun =
    "inline-flex h-9 min-w-[4.5rem] items-center justify-center gap-1.5 rounded-md border px-2 text-sm font-medium transition";

  if (bloqueada) {
    return (
      <span
        className={`${comun} cursor-not-allowed border-[var(--border)] bg-[var(--surface-2)] text-[var(--fg-subtle)]`}
        title={
          estado === "nada" ? "No, y no se cambia desde aquí" : "Sí, y no se cambia desde aquí"
        }
      >
        {estado === "nada" ? "No" : "Sí"}
      </span>
    );
  }

  const estilos: Record<EstadoArea, string> = {
    todo: "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok)] hover:brightness-95",
    nada: "border-[var(--border)] bg-[var(--surface)] text-[var(--fg-muted)] hover:border-[var(--fg-subtle)]",
    mezcla: "border-[var(--warn)] bg-[var(--warn-bg)] text-[var(--warn)] hover:brightness-95",
  };

  const texto: Record<EstadoArea, string> = {
    todo: "Sí",
    nada: "No",
    mezcla: "A medias",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={ocupada}
      aria-label={`${etiqueta}: ${texto[estado]}`}
      title={
        estado === "mezcla"
          ? "Tiene una parte del grupo. Al pulsar se le da el grupo entero."
          : undefined
      }
      className={`${comun} ${estilos[estado]} disabled:opacity-60`}
    >
      {estado === "todo" ? <Check className="size-4" aria-hidden /> : null}
      {estado === "mezcla" ? <Minus className="size-4" aria-hidden /> : null}
      {ocupada ? "…" : texto[estado]}
    </button>
  );
}
