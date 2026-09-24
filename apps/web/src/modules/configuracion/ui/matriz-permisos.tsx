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

  const casilla = (area: (typeof AREAS)[number], rol: Rol) => {
    const estado = estadoDelArea(area, rol, guardados);
    return (
      <Casilla
        estado={estado}
        etiqueta={`${area.etiqueta} · ${ETIQUETA_ROL[rol]}`}
        // Gerencia nunca, el propio rol tampoco: los dos casos acaban en
        // «nadie puede devolvérmelo».
        bloqueada={!puedeEditar || rol === "gerencia" || rol === rolPropio}
        ocupada={enCurso === `${area.clave}:${rol}`}
        onClick={() => alternar(area.clave, rol, estado)}
      />
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/*
        EN MÓVIL, TARJETAS. EN ESCRITORIO, REJILLA.

        Son 9 áreas por 6 roles. Metido en una tabla cabe en un portátil, pero
        en un teléfono son 54 casillas con scroll horizontal: al llegar a la
        columna de Cobranzas ya no se ve de qué fila era, que es la peor forma
        posible de decidir un permiso. Así que en móvil cada área es una
        tarjeta con sus seis roles debajo, y el nombre siempre encima.
      */}
      <div className="flex flex-col gap-3 md:hidden">
        {AREAS.map((area) => (
          <div key={area.clave} className="rounded-lg border border-[var(--border)] p-3">
            <p className="font-medium">{area.etiqueta}</p>
            <p className="mt-0.5 text-sm text-[var(--fg-muted)]">{area.ayuda}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {ROLES.map((rol) => (
                <div key={rol} className="flex flex-col gap-1">
                  <span className="text-sm text-[var(--fg-subtle)]">
                    {ETIQUETA_ROL[rol]}
                  </span>
                  {casilla(area, rol)}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block">
        <table className="w-full text-sm">
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
                {ROLES.map((rol) => (
                  <td key={rol} className="px-2 py-3 text-center">
                    {casilla(area, rol)}
                  </td>
                ))}
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
    // h-10 en móvil: 38 px es poco para un dedo, y la recomendación son 44.
    // En escritorio vuelve a h-9, que es la altura del resto de controles.
    "inline-flex h-10 w-full min-w-[4.5rem] items-center justify-center gap-1.5 rounded-md border px-2 text-sm font-medium transition md:h-9 md:w-auto";

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
