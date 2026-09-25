"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Input } from "@rodatech/ui";
import { Plus } from "lucide-react";

import { useBusqueda } from "@/lib/usar-busqueda";

import {
  buscarParaCotizar,
  type ProductoBusqueda,
} from "../../acciones/buscar";

/**
 * Caja única de búsqueda: un término contra código, código de fabricante y
 * descripción a la vez.
 *
 * La demo hacía `.or(sku.ilike, codigo_fabricante.ilike, descripcion.ilike)`
 * y el índice trigram estaba sobre otra columna, así que era un seq scan. Aquí
 * va un solo RPC contra `busqueda`, que sí está indexada.
 */

export function BuscadorLineas({
  onElegir,
  onCrear,
}: {
  onElegir: (p: ProductoBusqueda) => void;
  /**
   * Qué hacer cuando lo que se busca no existe.
   *
   * Willy, 16/09: *«digito un código que no está creado y no me sale la opción
   * para crearlo en el sistema»*. Tecleó `22208` y esta caja se abría vacía:
   * ni un resultado, ni una salida. La búsqueda funcionaba — lo que faltaba
   * era la puerta.
   *
   * Si no se pasa, el vacío sigue siendo un vacío: lo decide quien monta el
   * buscador, porque no todas las pantallas que buscan productos pueden
   * crearlos.
   */
  onCrear?: (termino: string) => void;
}) {
  const [termino, setTermino] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);

  // La espera al teclear y el descarte de respuestas tardías viven en el hook.
  // Sin el descarte, la respuesta de «620» puede llegar DESPUÉS que la de
  // «6205» y pintar productos que no son los que dice la caja — y en un
  // constructor de cotizaciones eso es una línea equivocada en un documento
  // que se manda al cliente. Ver `lib/busqueda.ts`.
  const { resultados: crudos, error, buscando, limpiar } = useBusqueda({
    termino,
    buscar: buscarParaCotizar,
  });
  const resultados = crudos ?? [];

  // Al llegar resultados nuevos, el resaltado vuelve arriba.
  useEffect(() => {
    setResaltado(0);
    if (crudos !== null) setAbierto(true);
  }, [crudos]);

  // Cerrar al hacer clic fuera.
  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  const elegir = (p: ProductoBusqueda) => {
    onElegir(p);
    // Se limpia para poder encadenar: cotizar es agregar muchos seguidos.
    setTermino("");
    limpiar();
    setAbierto(false);
  };

  const teclas = (e: React.KeyboardEvent) => {
    if (!abierto || resultados.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setResaltado((i) => Math.min(i + 1, resultados.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setResaltado((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const p = resultados[resaltado];
      if (p) elegir(p);
    } else if (e.key === "Escape") {
      setAbierto(false);
    }
  };

  return (
    <div ref={contenedor} className="relative">
      <Input
        value={termino}
        onChange={(e) => setTermino(e.target.value)}
        onFocus={() => resultados.length > 0 && setAbierto(true)}
        onKeyDown={teclas}
        placeholder="Buscar por código, código de fabricante o descripción…"
        aria-label="Buscar producto"
        autoComplete="off"
      />

      {buscando ? (
        <span className="absolute right-3 top-2.5 text-xs text-[var(--fg-muted)]">
          buscando…
        </span>
      ) : null}

      {abierto && (resultados.length > 0 || error || crudos?.length === 0) ? (
        <div className="absolute z-30 mt-1.5 max-h-80 w-full overflow-y-auto overscroll-contain rounded-md border border-[var(--border-strong)] bg-[var(--surface)] elev-3">
          {error && resultados.length === 0 ? (
            <p className="p-3 text-sm text-[var(--fg-muted)]">{error}</p>
          ) : null}

          {/*
            El vacío, con salida.

            Antes esto no existía: la caja se abría, no pintaba nada, y el
            resultado era una caja blanca que parece un fallo. Ahora dice qué
            pasó —con el término entre comillas, para que se vea si hay una
            errata— y ofrece lo único que se puede hacer desde aquí.
          */}
          {!error && crudos?.length === 0 && termino.trim().length > 0 ? (
            <div className="p-3">
              <p className="text-sm">
                No hay ningún producto con{" "}
                <strong className="font-mono">«{termino.trim()}»</strong>.
              </p>
              {onCrear ? (
                <button
                  type="button"
                  onClick={() => {
                    /*
                      Se limpia igual que al elegir un producto.

                      Sin esto, la caja se queda con el término de antes y con
                      el «no hay ningún producto» encima —una respuesta que ya
                      no es verdad, porque acaba de crearse—. Probado en
                      pantalla el 16/09: la línea entraba bien y el aviso viejo
                      seguía tapándola.

                      Se limpia AL ABRIR el diálogo y no al crear: el código ya
                      viaja dentro, y si se cancela, el sitio donde se vuelve a
                      escribir es una caja vacía, que es lo que se espera.
                    */
                    const codigo = termino.trim();
                    setTermino("");
                    limpiar();
                    setAbierto(false);
                    onCrear(codigo);
                  }}
                  className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-md bg-brand-600 px-3 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
                >
                  <Plus className="size-4 shrink-0" aria-hidden="true" />
                  Crear «{termino.trim()}» en el catálogo
                </button>
              ) : (
                <p className="mt-1 text-sm text-[var(--fg-muted)]">
                  Pídele a Compras o a Gerencia que lo den de alta.
                </p>
              )}
            </div>
          ) : null}

          {resultados.length > 0 ? (
            <p className="sticky top-0 z-10 border-b border-[var(--border-soft)] bg-[var(--surface-2)] px-3 py-1.5 text-xs text-[var(--fg-muted)]">
              {resultados.length} {resultados.length === 1 ? "resultado" : "resultados"} · ↑↓ para moverte, Enter para agregar
            </p>
          ) : null}

          {resultados.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => elegir(p)}
              onMouseEnter={() => setResaltado(i)}
              // 48 px de alto y el resaltado ocupando la fila entera. Antes
              // era una línea delgada donde había que acertar con el ratón:
              // fallar el clic parecía que la búsqueda no funcionaba.
              //
              // En el teléfono, dos renglones: arriba código, stock y precio;
              // abajo marca y descripción. En una sola fila con los anchos del
              // escritorio solo cabían el código y la marca, y la descripción
              // y el precio quedaban tras una barra de desplazamiento — o sea,
              // se elegía a ciegas. Desde `sm`, `contents` deshace el envoltorio
              // y vuelve la fila de siempre.
              className={`flex min-h-12 w-full flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-[var(--border-soft)] px-3 py-2 text-left transition-colors last:border-0 sm:flex-nowrap ${
                i === resaltado
                  ? "bg-brand-50 dark:bg-brand-950"
                  : "hover:bg-[var(--surface-2)]"
              }`}
            >
              <span className="shrink-0 font-mono text-[0.8rem] font-semibold sm:w-40">
                {p.codigo}
              </span>
              <span className="order-last flex min-w-0 basis-full gap-2 sm:order-none sm:contents">
                <span className="shrink-0 text-sm text-[var(--fg-muted)] sm:w-14">
                  {p.marca}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{p.descripcion}</span>
              </span>
              <Badge
                className="ml-auto sm:ml-0"
                tone={
                  p.estado_stock === "sin_stock"
                    ? "danger"
                    : p.estado_stock === "bajo"
                      ? "warning"
                      : "success"
                }
                size="xs"
              >
                {p.stock ?? 0}
              </Badge>
              <span className="w-20 shrink-0 text-right tabular text-sm">
                ${p.precio_venta.toFixed(2)}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
