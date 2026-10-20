"use client";

import * as React from "react";
import { campoBase, cn } from "@rodatech/ui";
import { Plus, Search, X } from "lucide-react";

import { crearMarca } from "@/modules/productos/acciones/catalogos";

/**
 * Las marcas que representa un proveedor, con buscador.
 *
 * Eran botones con TODAS las marcas del maestro, y con la importación de los
 * productos del sistema anterior las marcas pasan de 27 a cientos: una pared
 * de botones donde hay que encontrar SKF a ojo. Reunión del 20/10 (≈54:30),
 * Giussepe: *«no que pique, sino que lo busque, y cuando lo busque lo vaya
 * añadiendo»*; Willy: *«es importante, porque mi personal me dice: esto, ¿con
 * quién lo cotizo, a quién se lo pido?»*.
 *
 * Se escribe, salen las que coinciden (sin tildes ni mayúsculas), se elige y
 * queda puesta como pastilla con su botón de quitar. Si no está, se ofrece
 * crearla: el RPC devuelve la que ya hubiera si era la misma con otra
 * escritura, así que no duplica.
 */

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function BuscadorMarcas({
  marcas: marcasIniciales,
  elegidas,
  onCambio,
}: {
  marcas: { id: string; nombre: string }[];
  elegidas: string[];
  onCambio: (ids: string[]) => void;
}) {
  // Las que se crean aquí se suman a la lista sin recargar la página.
  const [marcas, setMarcas] = React.useState(marcasIniciales);
  const [texto, setTexto] = React.useState("");
  const [abierto, setAbierto] = React.useState(false);
  const [activo, setActivo] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [creando, crear] = React.useTransition();

  const porId = React.useMemo(() => new Map(marcas.map((m) => [m.id, m])), [marcas]);
  const q = normalizar(texto);

  const sugeridas = React.useMemo(() => {
    if (!q) return [];
    return marcas
      .filter((m) => !elegidas.includes(m.id) && normalizar(m.nombre).includes(q))
      // Lo que EMPIEZA por lo tecleado, arriba: «sk» → SKF antes que RUSKA.
      .sort((a, b) => {
        const pa = normalizar(a.nombre).startsWith(q) ? 0 : 1;
        const pb = normalizar(b.nombre).startsWith(q) ? 0 : 1;
        return pa - pb || a.nombre.localeCompare(b.nombre);
      })
      .slice(0, 8);
  }, [marcas, elegidas, q]);

  const existeExacta = marcas.some((m) => normalizar(m.nombre) === q);
  const ofrecerCrear = q.length >= 2 && !existeExacta;
  const total = sugeridas.length + (ofrecerCrear ? 1 : 0);

  const añadir = (id: string) => {
    if (!elegidas.includes(id)) onCambio([...elegidas, id]);
    setTexto("");
    setActivo(0);
    setError(null);
  };

  const crearNueva = () => {
    const nombre = texto.trim();
    crear(async () => {
      const r = await crearMarca(nombre);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setMarcas((ms) => (ms.some((m) => m.id === r.datos.id) ? ms : [...ms, { id: r.datos.id, nombre: r.datos.nombre }]));
      añadir(r.datos.id);
    });
  };

  const elegir = (i: number) => {
    if (i < sugeridas.length) añadir(sugeridas[i]!.id);
    else if (ofrecerCrear) crearNueva();
  };

  return (
    <div className="flex flex-col gap-3">
      {elegidas.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Marcas puestas">
          {elegidas.map((id) => (
            <li
              key={id}
              className="inline-flex items-center gap-1 rounded-full border border-brand-600 bg-brand-50 py-1 pl-3 pr-1 text-sm font-medium text-brand-700 dark:bg-brand-950 dark:text-brand-200"
            >
              {porId.get(id)?.nombre ?? "—"}
              <button
                type="button"
                onClick={() => onCambio(elegidas.filter((x) => x !== id))}
                aria-label={`Quitar ${porId.get(id)?.nombre ?? "marca"}`}
                className="inline-flex size-7 items-center justify-center rounded-full hover:bg-brand-100 dark:hover:bg-brand-900"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--fg-subtle)]">Todavía ninguna.</p>
      )}

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-subtle)]"
          aria-hidden="true"
        />
        <input
          type="text"
          role="combobox"
          aria-expanded={abierto && total > 0}
          aria-controls="marcas-sugeridas"
          aria-label="Buscar una marca para añadir"
          value={texto}
          placeholder="Escribe la marca: SKF, NTN, Timken…"
          className={cn(campoBase, "pl-9")}
          onChange={(e) => {
            setTexto(e.target.value);
            setAbierto(true);
            setActivo(0);
            setError(null);
          }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setTimeout(() => setAbierto(false), 150)}
          onKeyDown={(e) => {
            // Enter elige, y NO envía el formulario del proveedor.
            if (e.key === "Enter") {
              e.preventDefault();
              if (total > 0) elegir(activo);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActivo((a) => Math.min(a + 1, total - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActivo((a) => Math.max(a - 1, 0));
            } else if (e.key === "Escape") {
              setAbierto(false);
            }
          }}
        />

        {abierto && total > 0 ? (
          <ul
            id="marcas-sugeridas"
            role="listbox"
            className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-[var(--border-strong)] bg-[var(--surface)] py-1 elev-2"
          >
            {sugeridas.map((m, i) => (
              <li key={m.id} role="option" aria-selected={i === activo}>
                <button
                  type="button"
                  // mousedown y no click: el blur del campo cerraría la lista antes.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    añadir(m.id);
                  }}
                  onMouseEnter={() => setActivo(i)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                    i === activo ? "bg-[var(--surface-2)]" : "",
                  )}
                >
                  <Plus className="size-4 text-[var(--fg-muted)]" aria-hidden="true" />
                  {m.nombre}
                </button>
              </li>
            ))}
            {ofrecerCrear ? (
              <li role="option" aria-selected={activo === sugeridas.length}>
                <button
                  type="button"
                  disabled={creando}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    crearNueva();
                  }}
                  onMouseEnter={() => setActivo(sugeridas.length)}
                  className={cn(
                    "flex w-full items-center gap-2 border-t border-[var(--border-soft)] px-3 py-2 text-left text-sm font-medium text-brand-700",
                    activo === sugeridas.length ? "bg-[var(--surface-2)]" : "",
                  )}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  {creando ? "Creando…" : `Crear la marca «${texto.trim().toUpperCase()}»`}
                </button>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      {error ? <p className="text-sm font-medium text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
