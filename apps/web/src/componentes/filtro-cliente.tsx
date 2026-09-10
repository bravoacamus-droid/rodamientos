"use client";

// Cliente: mantiene lo tecleado, la petición en vuelo y el panel abierto.

import * as React from "react";
import { Input } from "@rodatech/ui";
import { Search, X } from "lucide-react";

import { useBusqueda } from "@/lib/usar-busqueda";
import {
  buscarClientesParaFiltrar,
  type ClienteParaFiltrar,
} from "@/modules/clientes/acciones/buscar";

/**
 * El filtro de cliente de las listas: se teclea y va listando.
 *
 * ---------------------------------------------------------------------------
 * Por qué no es un `<select>`
 * ---------------------------------------------------------------------------
 * Luis, 10/09: *«ese selector de cliente, buscador infinito; tiene que ser un
 * buscador de cliente inteligente, ya que puede haber demasiados clientes: voy
 * buscando y me va listando. Hazlo más pequeño también»*.
 *
 * Era un desplegable con 500 clientes dentro —el tope que ponía la consulta,
 * no la cartera— y tres problemas encima:
 *
 *  1. **Un desplegable nativo no busca.** Salta a la primera letra que
 *     teclees y nada más: para llegar a «MATRITECH» hay que recorrer las emes.
 *  2. **Se traían los 500 en cada carga de la página**, se filtrara o no.
 *  3. **Se estiraba al ancho del nombre más largo**, y eso era lo que empujaba
 *     «Desde» y «Hasta» a la fila de abajo.
 *
 * El buscador de verdad ya existía para el constructor de cotizaciones desde
 * hace tiempo, con su comentario diciendo justo esto. No se llevó a los
 * filtros. Van veinte casos del mismo patrón.
 *
 * ---------------------------------------------------------------------------
 * Cómo se comporta
 * ---------------------------------------------------------------------------
 * Sin filtro es un campo normal que dice «Todos». Elegido uno, se convierte en
 * el nombre con una equis para quitarlo — así el filtro aplicado se ve sin
 * abrir nada, que es lo que falla en los buscadores que se vacían al elegir.
 *
 * El ancho lo pone la rejilla que lo contiene, no él: así ocupa lo mismo que
 * el campo de al lado. Lo que NO hace es crecer con el nombre que tenga dentro
 * —los largos se truncan— porque un filtro que cambia de tamaño al usarlo
 * descoloca la fila entera.
 */
export function FiltroCliente({
  valor,
  nombre,
  onCambiar,
}: {
  /** El id que hay en la URL, o `null`. */
  valor: string | null;
  /** Su razón social, para pintarla sin volver a buscar. */
  nombre: string | null;
  onCambiar: (id: string | null) => void;
}) {
  const id = React.useId();
  const [abierto, setAbierto] = React.useState(false);
  const [termino, setTermino] = React.useState("");
  const caja = React.useRef<HTMLDivElement>(null);

  const { resultados, buscando, error, limpiar } = useBusqueda<ClienteParaFiltrar>({
    termino,
    buscar: buscarClientesParaFiltrar,
  });

  // Cerrar al pulsar fuera. Sin esto, el panel se queda abierto encima de la
  // tabla y tapa las primeras filas.
  React.useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  const cerrar = () => {
    setAbierto(false);
    setTermino("");
    limpiar();
  };

  const elegir = (c: ClienteParaFiltrar) => {
    onCambiar(c.id);
    cerrar();
  };

  const quitar = () => {
    onCambiar(null);
    cerrar();
  };

  return (
    <div ref={caja} className="relative flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-[var(--fg-muted)]">
        Cliente
      </label>

      {valor !== null && !abierto ? (
        /* Elegido: se ve quién es y cómo quitarlo, sin abrir nada. */
        <div className="flex h-control-md items-center gap-1.5 rounded-md border border-brand-300 bg-brand-50 px-2.5 dark:bg-brand-950">
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="min-w-0 flex-1 truncate text-left text-sm font-medium"
            title={nombre ?? undefined}
          >
            {nombre ?? "Cliente elegido"}
          </button>
          <button
            type="button"
            onClick={quitar}
            aria-label="Quitar el filtro de cliente"
            className="shrink-0 rounded-sm p-0.5 text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-subtle)]"
            aria-hidden="true"
          />
          <Input
            id={id}
            value={termino}
            onChange={(e) => setTermino(e.target.value)}
            onFocus={() => setAbierto(true)}
            placeholder="Todos"
            className="pl-8"
            autoComplete="off"
          />
        </div>
      )}

      {/* El panel lleva ancho mínimo propio: la celda de la rejilla puede ser
          estrecha y una razón social no se lee en 120 px. */}
      {abierto ? (
        <div className="absolute left-0 top-full z-20 mt-1 w-full min-w-64 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] elev-2">
          {valor !== null ? (
            <button
              type="button"
              onClick={quitar}
              className="flex w-full items-center gap-2 border-b border-[var(--border-soft)] px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)]"
            >
              <X className="size-4 shrink-0" aria-hidden="true" />
              Todos
            </button>
          ) : null}

          {error ? (
            <p className="px-3 py-2 text-sm text-[var(--danger)]">{error}</p>
          ) : null}

          {termino.trim().length < 2 ? (
            <p className="px-3 py-2 text-sm text-[var(--fg-muted)]">
              Escribe dos letras del nombre, o el RUC.
            </p>
          ) : buscando ? (
            <p className="px-3 py-2 text-sm text-[var(--fg-muted)]">Buscando…</p>
          ) : (resultados ?? []).length === 0 ? (
            <p className="px-3 py-2 text-sm text-[var(--fg-muted)]">
              Ningún cliente con eso.
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto">
              {(resultados ?? []).map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => elegir(c)}
                    className="flex w-full flex-col px-3 py-2 text-left hover:bg-[var(--surface-2)]"
                  >
                    <span className="truncate text-sm font-medium">{c.razon_social}</span>
                    {c.numero_documento ? (
                      <span className="font-mono text-xs text-[var(--fg-subtle)]">
                        {c.numero_documento}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
