"use client";

// Cliente: mantiene el término tecleado, la petición en vuelo y el panel
// abierto. Es el mismo motivo por el que `BuscadorLineas` lo es.

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button } from "@rodatech/ui";
import { Building2, Check, Search, X } from "lucide-react";

import { useBusqueda } from "@/lib/usar-busqueda";

import {
  digitosDe,
  motivoNoSeleccionable,
  pareceDocumento,
  resaltar,
  resumenCredito,
  ultimaVez,
  type ClienteOpcion,
} from "../../dominio/cliente";

import { buscarClientesParaCotizar } from "../../acciones/buscar";
import { ClienteRapido } from "./cliente-rapido";

/**
 * El selector de cliente del constructor.
 *
 * Era un `<select>` con la cartera entera dentro. Un desplegable nativo no
 * busca: salta a la primera letra que teclees y nada más. Con dos clientes de
 * prueba se aguanta; con la cartera que Willy va a subir, no.
 *
 * Lo que hace este:
 *
 *  · BUSCA CONTRA EL SERVIDOR, ordenado por Postgres (`buscar_clientes`, 030).
 *    Un RUC completo gana siempre; después el prefijo del documento o el
 *    código; después la razón social que EMPIEZA por lo tecleado.
 *
 *  · DESGLOSA cada fila: razón social, documento, condición de pago y cuándo
 *    se le cotizó por última vez. Dos clientes con nombre parecido se
 *    distinguen por eso, no por el nombre.
 *
 *  · RESALTA lo que coincide, sin tildes y sin mayúsculas. `resaltar()` está
 *    en el dominio y probado, porque la versión ingenua desplaza el resaltado
 *    una letra por cada tilde que haya antes.
 *
 *  · CON LA CAJA VACÍA ofrece los últimos cotizados, que es lo que sirve
 *    cuando uno no recuerda el nombre exacto.
 *
 *  · SI NO ENCUENTRA NADA y lo tecleado es un RUC, ofrece el alta con el
 *    número ya puesto. Es el gesto que pidió Willy (34:12): pegar el RUC y
 *    seguir cotizando sin cambiar de pantalla.
 *
 * Una vez elegido, el campo se convierte en una FICHA: quién es, cómo paga y
 * a quién va dirigida. Un `<select>` mostrando solo el nombre obligaba a
 * abrir la ficha del cliente para ver si era a crédito.
 */

export function BuscadorClientes({
  sugeridos,
  elegido,
  onElegir,
  onQuitar,
  hoy,
}: {
  /** Los últimos cotizados, del servidor. Se enseñan con la caja vacía. */
  sugeridos: ClienteOpcion[];
  elegido: ClienteOpcion | null;
  onElegir: (c: ClienteOpcion) => void;
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

  // La espera al teclear y el descarte de respuestas tardías, en el hook
  // compartido. `resultados` es `null` mientras no se haya buscado —entonces
  // se ofrecen los sugeridos— y `[]` cuando se buscó y no hay, que es otra
  // cosa y se dice distinto. Ver `lib/busqueda.ts`.
  const { resultados, error, buscando } = useBusqueda({
    termino,
    buscar: buscarClientesParaCotizar,
  });
  const lista = resultados ?? sugeridos;

  useEffect(() => setResaltado(0), [resultados]);

  // Cerrar al pulsar fuera. El diálogo de alta rápida vive en un portal de
  // Radix, o sea FUERA de este contenedor: sin la comprobación del `[data-
  // radix-popper]`/`[role=dialog]`, abrirlo cerraría el panel y el foco
  // volvería aquí en mitad del formulario.
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
    () => lista.filter((c) => motivoNoSeleccionable(c) === null),
    [lista],
  );

  const elegir = (c: ClienteOpcion) => {
    if (motivoNoSeleccionable(c) !== null) return;
    onElegir(c);
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
      // de búsqueda envía la cotización a medias.
      e.preventDefault();
      const c = seleccionables[resaltado];
      if (c) elegir(c);
    }
  };

  /* ------------------------------------------------- Ya hay cliente elegido */

  if (elegido) {
    const aviso = motivoNoSeleccionable(elegido);
    return (
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">
          Cliente <span className="text-[var(--danger)]">*</span>
        </span>

        <div className="flex items-start gap-3 rounded-md border border-brand-300 bg-brand-50 p-3 dark:bg-brand-950/40">
          <Building2 className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden="true" />

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{elegido.razon_social}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--fg-muted)]">
              <span className="tabular">
                {elegido.numero_documento
                  ? `${elegido.tipo_documento} ${elegido.numero_documento}`
                  : "Sin documento"}
              </span>
              <span aria-hidden="true">·</span>
              <span>{resumenCredito(elegido)}</span>
              {elegido.contacto ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">{elegido.contacto}</span>
                </>
              ) : null}
            </p>
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
              // El foco vuelve a la caja: quitar cliente es casi siempre el
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

  /* ------------------------------------------------------ Todavía sin elegir */

  return (
    <div ref={contenedor} className="relative flex flex-col gap-1">
      <label htmlFor="cot-cliente" className="text-sm font-medium">
        Cliente <span className="text-[var(--danger)]">*</span>
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
            id="cot-cliente"
            value={termino}
            onChange={(e) => {
              setTermino(e.target.value);
              setAbierto(true);
            }}
            onFocus={() => setAbierto(true)}
            onKeyDown={teclas}
            placeholder="Busca por nombre, RUC o código…"
            autoComplete="off"
            role="combobox"
            aria-expanded={abierto}
            aria-controls="cot-cliente-lista"
            aria-autocomplete="list"
            className="h-control-md w-full rounded-md border border-[var(--border)] bg-[var(--surface)] pl-9 pr-20 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
          />
          {buscando ? (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--fg-muted)]">
              buscando…
            </span>
          ) : null}
        </div>

        {/* Willy, 34:12: dar de alta pegando el RUC desde la propia cotización.
            A la derecha del campo y como botón —no como enlace de texto—:
            estaba tan escondido que en la demo no lo vio. */}
        <ClienteRapido
          documentoInicial={buscandoDocumento ? digitosDe(q) : ""}
          nombreInicial={buscandoDocumento ? "" : q}
          onCreado={(c) => {
            setTermino("");
            setAbierto(false);
            onElegir(c);
          }}
        />
      </div>

      {abierto ? (
        <div
          id="cot-cliente-lista"
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-96 overflow-y-auto overscroll-contain rounded-md border border-[var(--border-strong)] bg-[var(--surface)] elev-3"
        >
          <p className="sticky top-0 z-10 border-b border-[var(--border-soft)] bg-[var(--surface-2)] px-3 py-1.5 text-xs text-[var(--fg-muted)]">
            {error
              ? error
              : resultados === null
                ? sugeridos.length > 0
                  ? "Últimos cotizados · escribe para buscar en toda la cartera"
                  : "Escribe para buscar"
                : `${lista.length} ${lista.length === 1 ? "cliente" : "clientes"}${
                    buscandoDocumento ? " · buscando por documento" : ""
                  } · ↑↓ y Enter`}
          </p>

          {lista.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-sm text-[var(--fg-muted)]">
                {q.length < 2
                  ? "Escribe al menos dos letras."
                  : `Ningún cliente coincide con «${q}».`}
              </p>
              {q.length >= 2 ? (
                <p className="mt-1 text-xs text-[var(--fg-subtle)]">
                  {buscandoDocumento
                    ? "Dalo de alta con el botón de la derecha: el documento ya va puesto."
                    : "Prueba con el RUC, o con menos palabras del nombre."}
                </p>
              ) : null}
            </div>
          ) : null}

          {lista.map((c) => {
            const impedimento = motivoNoSeleccionable(c);
            const indice = seleccionables.indexOf(c);
            const activo = indice !== -1 && indice === resaltado;

            return (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={activo}
                disabled={impedimento !== null}
                onClick={() => elegir(c)}
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
                    {resaltar(c.razon_social, q).map((t, i) =>
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
                      {c.numero_documento ? (
                        resaltar(c.numero_documento, digitosDe(q)).map((t, i) =>
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
                        <span className="text-[var(--fg-subtle)]">{c.codigo}</span>
                      )}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{resumenCredito(c)}</span>
                  </p>
                  {impedimento ? (
                    <p className="mt-0.5 text-xs font-medium text-[var(--danger)]">
                      {impedimento}
                    </p>
                  ) : null}
                </div>

                <div className="shrink-0 text-right">
                  <span className="block text-xs text-[var(--fg-muted)]">
                    {ultimaVez(c.ultima_cotizacion, hoy)}
                  </span>
                  {c.cotizaciones > 0 ? (
                    <Badge tone="neutral" size="xs">
                      {c.cotizaciones}{" "}
                      {c.cotizaciones === 1 ? "cotización" : "cotizaciones"}
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

      <span className="text-xs text-[var(--fg-subtle)]">
        Es lo único que hace falta para empezar.
      </span>

      {/* Solo para lectores de pantalla: cuántos hay, sin robar el foco. */}
      <span className="sr-only" role="status" aria-live="polite">
        {resultados === null ? "" : `${resultados.length} clientes encontrados`}
      </span>
    </div>
  );
}
