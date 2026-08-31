"use client";

// Cliente: mantiene el término tecleado, la petición en vuelo y el panel
// abierto. Mismo motivo que `BuscadorClientes`.

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button } from "@rodatech/ui";
import { Check, Search, Truck, X } from "lucide-react";

import { useBusqueda } from "@/lib/usar-busqueda";
import { digitosDe, pareceDocumento, resaltar } from "@/lib/texto-busqueda";

import { buscarProveedores } from "../acciones/buscar";
import {
  motivoNoSeleccionable,
  resumenMarcas,
  resumenPago,
  ultimaVez,
  type ProveedorOpcion,
} from "../dominio/opcion";
import { ProveedorRapido } from "./rapido";

/**
 * El selector de proveedor de la compra y de la recepción.
 *
 * Eran dos `<select>` con el maestro entero dentro, y quedó anotado el 28/08
 * que con el Excel de proveedores de Willy iban a doler. Duelen antes de eso:
 * la consulta de compras traía la lista con `.limit(500)` y la de recepciones
 * sin límite ninguno, o sea contra el tope por defecto de PostgREST. Las dos
 * TRUNCABAN EN SILENCIO — y un desplegable que se corta no avisa: el proveedor
 * que falta parece no estar dado de alta, y se crea otra vez.
 *
 * Lo que hace este:
 *
 *  · BUSCA CONTRA EL SERVIDOR, ordenado por Postgres (`buscar_proveedores`,
 *    033). RUC completo primero, luego prefijo o código, luego la razón social
 *    que EMPIEZA por lo tecleado.
 *
 *  · BUSCA POR MARCA, que es lo propio de este selector y no del de cliente:
 *    «¿quién me trae SKF?» es media de las veces que se abre. La relación
 *    estaba en `proveedor_marcas` desde la 002 y no la usaba nadie.
 *
 *  · DESGLOSA cada fila: razón social, RUC, cómo paga, cuánto tarda, qué
 *    marcas trae y cuándo se le compró por última vez. Antes había que abrir
 *    la ficha para saber cualquiera de esas cosas.
 *
 *  · CON LA CAJA VACÍA ofrece los últimos a los que se compró.
 *
 *  · SI NO ENCUENTRA NADA ofrece el alta con lo tecleado ya puesto.
 *
 * La espera al teclear y el descarte de respuestas tardías vienen del hook
 * compartido; el resaltado, de `lib/texto-busqueda.ts`. Ninguna de las dos
 * cosas se reescribe aquí — que fue exactamente el error que dejó cuatro
 * buscadores con cuatro carreras distintas.
 */
export function BuscadorProveedores({
  id,
  sugeridos,
  elegido,
  onElegir,
  onQuitar,
  hoy,
}: {
  /** Para el `<label htmlFor>`: hay uno en compras y otro en recepciones. */
  id: string;
  /** Los últimos a los que se compró, del servidor. */
  sugeridos: ProveedorOpcion[];
  elegido: ProveedorOpcion | null;
  onElegir: (p: ProveedorOpcion) => void;
  onQuitar: () => void;
  /** `aaaa-mm-dd`. Lo inyecta el servidor: el dominio no lee el reloj. */
  hoy: string;
}) {
  const [termino, setTermino] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);

  const q = termino.trim();
  const buscandoDocumento = pareceDocumento(q);

  const { resultados, error, buscando } = useBusqueda({
    termino,
    buscar: buscarProveedores,
  });
  const lista = resultados ?? sugeridos;

  useEffect(() => setResaltado(0), [resultados]);

  // Cerrar al pulsar fuera. El diálogo de alta rápida vive en un portal de
  // Radix, o sea FUERA de este contenedor: sin la comprobación del
  // `[role=dialog]`, abrirlo cerraría el panel en mitad del formulario.
  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      const destino = e.target as HTMLElement;
      if (destino.closest("[role=dialog]")) return;
      if (!contenedor.current?.contains(destino)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  const seleccionables = useMemo(
    () => lista.filter((p) => motivoNoSeleccionable(p) === null),
    [lista],
  );

  const elegir = (p: ProveedorOpcion) => {
    if (motivoNoSeleccionable(p) !== null) return;
    onElegir(p);
    setTermino("");
    setAbierto(false);
  };

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setAbierto(false);
      return;
    }
    if (!abierto || seleccionables.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setResaltado((i) => Math.min(i + 1, seleccionables.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setResaltado((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      // El constructor está dentro de un `<form>`: sin esto, Enter en la caja
      // de búsqueda envía la compra a medias.
      e.preventDefault();
      const p = seleccionables[resaltado];
      if (p) elegir(p);
    }
  };

  /* ------------------------------------------------ Ya hay proveedor elegido */

  if (elegido) {
    const aviso = motivoNoSeleccionable(elegido);
    const marcas = resumenMarcas(elegido.marcas);
    return (
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">
          Proveedor <span className="text-[var(--danger)]">*</span>
        </span>

        <div className="flex items-start gap-3 rounded-md border border-brand-300 bg-brand-50 p-3 dark:bg-brand-950/40">
          <Truck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden="true" />

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{elegido.razon_social}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--fg-muted)]">
              <span className="tabular">
                {elegido.numero_documento
                  ? `${elegido.tipo_documento} ${elegido.numero_documento}`
                  : elegido.codigo}
              </span>
              <span aria-hidden="true">·</span>
              <span>{resumenPago(elegido)}</span>
              {elegido.tipo === "importacion" ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Importación</span>
                </>
              ) : null}
            </p>
            {marcas ? (
              <p className="mt-0.5 truncate text-xs text-[var(--fg-subtle)]">{marcas}</p>
            ) : null}
            {aviso ? (
              <p className="mt-1 text-xs font-medium text-[var(--danger)]">{aviso}</p>
            ) : null}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => {
              onQuitar();
              // El foco vuelve a la caja: quitar proveedor es casi siempre el
              // primer paso de elegir otro.
              requestAnimationFrame(() => campo.current?.focus());
            }}
          >
            <X aria-hidden="true" />
            Cambiar
          </Button>
        </div>
      </div>
    );
  }

  /* ----------------------------------------------------- Todavía sin elegir */

  return (
    <div ref={contenedor} className="relative flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        Proveedor <span className="text-[var(--danger)]">*</span>
      </label>

      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-subtle)]"
            aria-hidden="true"
          />
          {/* Un `<input>` pelado y no el `Input` del design system: hace falta
              sitio para la lupa a la izquierda y para el «buscando…» a la
              derecha, y eso es padding, no una variante nueva del control. */}
          <input
            ref={campo}
            id={id}
            value={termino}
            onChange={(e) => {
              setTermino(e.target.value);
              setAbierto(true);
            }}
            onFocus={() => setAbierto(true)}
            onKeyDown={teclas}
            placeholder="Busca por nombre, RUC o marca…"
            autoComplete="off"
            role="combobox"
            aria-expanded={abierto}
            aria-controls={`${id}-lista`}
            aria-autocomplete="list"
            className="h-control-md w-full rounded-md border border-[var(--border)] bg-[var(--surface)] pl-9 pr-20 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
          />
          {buscando ? (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--fg-muted)]">
              buscando…
            </span>
          ) : null}
        </div>

        <ProveedorRapido
          documentoInicial={buscandoDocumento ? digitosDe(q) : ""}
          nombreInicial={buscandoDocumento ? "" : q}
          onCreado={(p) => {
            setTermino("");
            setAbierto(false);
            onElegir(p);
          }}
        />
      </div>

      {abierto ? (
        <div
          id={`${id}-lista`}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-96 overflow-y-auto overscroll-contain rounded-md border border-[var(--border-strong)] bg-[var(--surface)] elev-3"
        >
          <p className="sticky top-0 z-10 border-b border-[var(--border-soft)] bg-[var(--surface-2)] px-3 py-1.5 text-xs text-[var(--fg-muted)]">
            {error
              ? error
              : resultados === null
                ? sugeridos.length > 0
                  ? "Últimos a los que se compró · escribe para buscar en todo el maestro"
                  : "Escribe para buscar"
                : `${lista.length} ${lista.length === 1 ? "proveedor" : "proveedores"}${
                    buscandoDocumento ? " · buscando por RUC" : ""
                  } · ↑↓ y Enter`}
          </p>

          {lista.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-sm text-[var(--fg-muted)]">
                {q.length < 2
                  ? "Escribe al menos dos letras."
                  : `Ningún proveedor coincide con «${q}».`}
              </p>
              {q.length >= 2 ? (
                <p className="mt-1 text-xs text-[var(--fg-subtle)]">
                  {buscandoDocumento
                    ? "Dalo de alta con el botón de la derecha: el RUC ya va puesto."
                    : "Prueba con el RUC, con la marca que te trae, o con menos palabras del nombre."}
                </p>
              ) : null}
            </div>
          ) : null}

          {lista.map((p) => {
            const impedimento = motivoNoSeleccionable(p);
            const indice = seleccionables.indexOf(p);
            const activo = indice !== -1 && indice === resaltado;
            const marcas = resumenMarcas(p.marcas);

            return (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={activo}
                disabled={impedimento !== null}
                onClick={() => elegir(p)}
                onMouseEnter={() => indice !== -1 && setResaltado(indice)}
                // 48 px de alto y el resaltado ocupando la fila entera, igual
                // que en el buscador de productos: fallar el clic parecía que
                // la búsqueda no funcionaba.
                className={`flex min-h-12 w-full items-center gap-3 border-b border-[var(--border-soft)] px-3 py-2 text-left transition-colors last:border-0 ${
                  impedimento !== null
                    ? "cursor-not-allowed opacity-60"
                    : activo
                      ? "bg-brand-50 dark:bg-brand-950"
                      : "hover:bg-[var(--surface-2)]"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {resaltar(p.razon_social, q).map((t, i) =>
                      t.coincide ? (
                        <mark
                          key={i}
                          className="rounded-sm bg-accent-400/40 px-0 text-inherit"
                        >
                          {t.texto}
                        </mark>
                      ) : (
                        <span key={i}>{t.texto}</span>
                      ),
                    )}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-[var(--fg-muted)]">
                    <span className="tabular">
                      {p.numero_documento ? (
                        resaltar(p.numero_documento, digitosDe(q)).map((t, i) =>
                          t.coincide ? (
                            <mark
                              key={i}
                              className="rounded-sm bg-accent-400/40 px-0 text-inherit"
                            >
                              {t.texto}
                            </mark>
                          ) : (
                            <span key={i}>{t.texto}</span>
                          ),
                        )
                      ) : (
                        <span className="text-[var(--fg-subtle)]">{p.codigo}</span>
                      )}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{resumenPago(p)}</span>
                  </p>
                  {marcas ? (
                    <p className="mt-0.5 truncate text-xs text-[var(--fg-subtle)]">
                      {/* La marca se resalta igual que el nombre: si la fila
                          salió PORQUE se buscó una marca, hay que ver cuál. */}
                      {resaltar(marcas, q).map((t, i) =>
                        t.coincide ? (
                          <mark
                            key={i}
                            className="rounded-sm bg-accent-400/40 px-0 text-inherit"
                          >
                            {t.texto}
                          </mark>
                        ) : (
                          <span key={i}>{t.texto}</span>
                        ),
                      )}
                    </p>
                  ) : null}
                  {impedimento ? (
                    <p className="mt-0.5 text-xs font-medium text-[var(--danger)]">
                      {impedimento}
                    </p>
                  ) : null}
                </div>

                <div className="shrink-0 text-right">
                  <span className="block text-xs text-[var(--fg-muted)]">
                    {ultimaVez(p.ultima_compra, hoy)}
                  </span>
                  {p.compras > 0 ? (
                    <Badge tone="neutral" size="xs">
                      {p.compras} {p.compras === 1 ? "compra" : "compras"}
                    </Badge>
                  ) : null}
                </div>

                {activo ? (
                  <Check className="size-4 shrink-0 text-brand-600" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Solo para lectores de pantalla: cuántos hay, sin robar el foco. */}
      <span className="sr-only" role="status" aria-live="polite">
        {resultados === null ? "" : `${resultados.length} proveedores encontrados`}
      </span>
    </div>
  );
}
