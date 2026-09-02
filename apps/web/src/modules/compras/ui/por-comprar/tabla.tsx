"use client";

// Cliente por dos cosas que son eventos del navegador: marcar filas para
// llevárselas a una compra, y desplegar el detalle de quién espera cada
// producto. Los números ya vienen calculados del servidor.

import * as React from "react";
import Link from "next/link";
import { Badge, Button, Checkbox, Moneda, formatearFecha } from "@rodatech/ui";
import { ChevronDown, ChevronRight, MessageCircle, ShoppingCart } from "lucide-react";

import {
  ETIQUETA_URGENCIA,
  type ProductoPorComprar,
  type Urgencia,
} from "../../dominio/por-comprar";

const TONO_URGENCIA: Record<Urgencia, "danger" | "warning" | "info" | "neutral"> = {
  vencido: "danger",
  hoy: "warning",
  pronto: "info",
  holgado: "neutral",
};

/** Cuántos días quedan, dicho como se dice. */
function plazo(dias: number): string {
  if (dias < -1) return `hace ${Math.abs(dias)} días`;
  if (dias === -1) return "ayer";
  if (dias === 0) return "hoy";
  if (dias === 1) return "mañana";
  return `en ${dias} días`;
}

const cantidad = (n: number): string =>
  Number.isInteger(n) ? String(n) : n.toFixed(2);

export function TablaPorComprar({ filas }: { filas: ProductoPorComprar[] }) {
  // Solo se puede marcar lo que hay que comprar: marcar algo que ya viene en
  // camino llevaría a pedirlo dos veces, que es justo lo que la bandeja evita.
  const comprables = React.useMemo(
    () => filas.filter((f) => f.estado === "comprar"),
    [filas],
  );

  const [marcados, setMarcados] = React.useState<Set<string>>(new Set());
  const [abiertos, setAbiertos] = React.useState<Set<string>>(new Set());

  const alternar = (conjunto: Set<string>, id: string) => {
    const copia = new Set(conjunto);
    if (copia.has(id)) copia.delete(id);
    else copia.add(id);
    return copia;
  };

  const seleccion = comprables.filter((f) => marcados.has(f.producto_id));
  const estimadoSeleccion = seleccion.reduce((a, f) => a + f.estimado, 0);

  const todos = comprables.length > 0 && seleccion.length === comprables.length;
  const algunos = seleccion.length > 0 && !todos;

  // `producto:cantidad` separado por comas. Lo lee `precargaDeCompra`, que
  // valida cada id contra el maestro: aquí no se envía nada de confianza.
  const items = (elegidos: ProductoPorComprar[]) =>
    elegidos.map((f) => `${f.producto_id}:${f.falta}`).join(",");

  const enlaceCompra = (elegidos: ProductoPorComprar[]) =>
    `/compras/nueva?items=${items(elegidos)}`;

  // El paso de ANTES de comprar: preguntar precio. Va al mismo sitio y con
  // el mismo formato, porque es el mismo gesto —«esto me falta»— resuelto
  // de dos maneras según se sepa ya a quién comprárselo o no.
  const enlacePedir = (elegidos: ProductoPorComprar[]) =>
    `/compras/pedir-precio?items=${items(elegidos)}`;

  return (
    <div className="flex flex-col">
      {/* ------------------------------------------------------- Escritorio */}
      <div className="scroll-x hidden md:block">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
              <th className="w-10 px-3 py-2.5">
                <Checkbox
                  checked={todos ? true : algunos ? "indeterminate" : false}
                  onCheckedChange={(v) =>
                    setMarcados(
                      v ? new Set(comprables.map((f) => f.producto_id)) : new Set(),
                    )
                  }
                  aria-label="Marcar todo lo que hay que comprar"
                  disabled={comprables.length === 0}
                />
              </th>
              <th className="px-3 py-2.5 font-medium">Producto</th>
              <th className="px-3 py-2.5 font-medium">Se prometió</th>
              <th className="px-3 py-2.5 text-right font-medium">Piden</th>
              <th className="px-3 py-2.5 text-right font-medium">Tengo</th>
              <th className="px-3 py-2.5 text-right font-medium">Ya pedido</th>
              <th className="px-3 py-2.5 text-right font-medium">Falta comprar</th>
              <th className="px-3 py-2.5 text-right font-medium">≈ Costo</th>
              <th className="w-28 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const abierto = abiertos.has(f.producto_id);
              const enCamino = f.estado === "en_camino";
              return (
                <React.Fragment key={f.producto_id}>
                  <tr
                    className={`border-b border-[var(--border-soft)] transition-colors hover:bg-[var(--surface-2)] ${
                      enCamino ? "opacity-70" : ""
                    }`}
                  >
                    <td className="px-3 py-3 align-top">
                      <Checkbox
                        checked={marcados.has(f.producto_id)}
                        onCheckedChange={() =>
                          setMarcados((m) => alternar(m, f.producto_id))
                        }
                        disabled={enCamino}
                        aria-label={`Comprar ${f.codigo}`}
                      />
                    </td>

                    <td className="px-3 py-3 align-top">
                      <button
                        type="button"
                        onClick={() => setAbiertos((a) => alternar(a, f.producto_id))}
                        className="flex items-start gap-1.5 text-left"
                        aria-expanded={abierto}
                      >
                        {abierto ? (
                          <ChevronDown className="mt-1 size-4 shrink-0" aria-hidden="true" />
                        ) : (
                          <ChevronRight className="mt-1 size-4 shrink-0" aria-hidden="true" />
                        )}
                        <span>
                          <span className="block font-mono text-base font-semibold">
                            {f.codigo}
                          </span>
                          <span className="block text-sm text-[var(--fg-muted)]">
                            {f.marca ? `${f.marca} · ` : ""}
                            {f.descripcion}
                          </span>
                          <span className="block text-sm text-[var(--fg-subtle)]">
                            {f.clientes === 1 ? "1 cliente" : `${f.clientes} clientes`}
                            {" lo "}
                            {f.clientes === 1 ? "espera" : "esperan"}
                          </span>
                        </span>
                      </button>
                    </td>

                    <td className="whitespace-nowrap px-3 py-3 align-top">
                      <Badge tone={TONO_URGENCIA[f.urgencia]} size="md">
                        {ETIQUETA_URGENCIA[f.urgencia]}
                      </Badge>
                      <span className="mt-1 block text-sm text-[var(--fg-muted)]">
                        {formatearFecha(f.prometida)} · {plazo(f.dias)}
                      </span>
                    </td>

                    <td className="px-3 py-3 text-right align-top tabular text-base">
                      {cantidad(f.comprometido)}
                    </td>
                    <td className="px-3 py-3 text-right align-top tabular text-base">
                      {cantidad(f.stock)}
                    </td>
                    <td className="px-3 py-3 text-right align-top tabular text-base">
                      {f.pedido > 0 ? (
                        <>
                          {cantidad(f.pedido)}
                          {f.proximaLlegada ? (
                            <span className="block text-xs text-[var(--fg-subtle)]">
                              llega {formatearFecha(f.proximaLlegada)}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-[var(--fg-subtle)]">—</span>
                      )}
                    </td>

                    {/* La cifra de la bandeja. Es la única que se lee de lejos. */}
                    <td className="px-3 py-3 text-right align-top">
                      {enCamino ? (
                        <span className="text-sm text-[var(--fg-muted)]">
                          Ya está pedido
                        </span>
                      ) : (
                        <span className="tabular text-xl font-semibold">
                          {cantidad(f.falta)}
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-3 text-right align-top tabular">
                      {f.estimado > 0 ? (
                        <Moneda valor={f.estimado} />
                      ) : (
                        <span className="text-[var(--fg-subtle)]">—</span>
                      )}
                    </td>

                    <td className="px-3 py-3 align-top">
                      {enCamino ? null : (
                        <Link
                          href={enlaceCompra([f])}
                          className="inline-flex h-9 items-center rounded-sm border border-[var(--border-strong)] px-3 text-sm font-medium hover:bg-[var(--surface-2)]"
                        >
                          Comprar
                        </Link>
                      )}
                    </td>
                  </tr>

                  {abierto ? (
                    <tr className="border-b border-[var(--border-soft)] bg-[var(--surface-2)]">
                      <td />
                      <td colSpan={8} className="px-3 pb-4 pt-1">
                        <DetalleLineas fila={f} />
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ------------------------------------------------------------ Móvil */}
      <ul className="flex flex-col gap-3 md:hidden">
        {filas.map((f) => {
          const abierto = abiertos.has(f.producto_id);
          return (
            <li
              key={f.producto_id}
              className="rounded-md border border-[var(--border)] p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="block font-mono text-base font-semibold">
                    {f.codigo}
                  </span>
                  <span className="block text-sm text-[var(--fg-muted)]">
                    {f.marca ? `${f.marca} · ` : ""}
                    {f.descripcion}
                  </span>
                </div>
                <Badge tone={TONO_URGENCIA[f.urgencia]} size="md">
                  {ETIQUETA_URGENCIA[f.urgencia]}
                </Badge>
              </div>

              <p className="mt-2 text-sm">
                Piden <strong className="tabular">{cantidad(f.comprometido)}</strong>,
                tengo <strong className="tabular">{cantidad(f.stock)}</strong>
                {f.pedido > 0 ? (
                  <>
                    , pedido <strong className="tabular">{cantidad(f.pedido)}</strong>
                  </>
                ) : null}
                .
              </p>

              <p className="mt-1 text-base">
                {f.estado === "en_camino" ? (
                  <span className="text-[var(--fg-muted)]">
                    Ya está pedido
                    {f.proximaLlegada ? `, llega ${formatearFecha(f.proximaLlegada)}` : ""}.
                  </span>
                ) : (
                  <>
                    Falta comprar{" "}
                    <strong className="tabular text-xl">{cantidad(f.falta)}</strong>
                  </>
                )}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {f.estado === "comprar" ? (
                  <Link
                    href={enlaceCompra([f])}
                    className="inline-flex h-11 items-center rounded-sm bg-brand-600 px-3 text-sm font-medium text-white"
                  >
                    Comprar
                  </Link>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={() => setAbiertos((a) => alternar(a, f.producto_id))}
                >
                  {abierto ? "Ocultar" : "Quién lo espera"}
                </Button>
              </div>

              {abierto ? (
                <div className="mt-3">
                  <DetalleLineas fila={f} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* --------------------------------------------------- Lo seleccionado */}
      {seleccion.length > 0 ? (
        <div className="sticky bottom-0 z-10 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-brand-200 bg-[var(--surface)] p-3 shadow-lg dark:border-brand-800">
          <p className="text-base">
            <strong>
              {seleccion.length === 1
                ? "1 producto"
                : `${seleccion.length} productos`}
            </strong>{" "}
            marcados
            {estimadoSeleccion > 0 ? (
              <>
                {" · aproximadamente "}
                <Moneda valor={estimadoSeleccion} />
              </>
            ) : null}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => setMarcados(new Set())}
            >
              Desmarcar
            </Button>
            {/* Antes de comprar se pregunta el precio. Va primero que
                «Registrar la compra» porque es lo que ocurre antes. */}
            <Link
              href={enlacePedir(seleccion)}
              className="inline-flex h-11 items-center gap-2 rounded-sm border border-[var(--border-strong)] px-4 text-sm font-medium hover:bg-[var(--surface-2)]"
            >
              <MessageCircle className="size-4" aria-hidden="true" />
              Pedir precio
            </Link>
            <Link
              href={enlaceCompra(seleccion)}
              className="inline-flex h-11 items-center gap-2 rounded-sm bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
            >
              <ShoppingCart className="size-4" aria-hidden="true" />
              Registrar la compra
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Quién espera este producto.
 *
 * Es lo que convierte la bandeja en algo con lo que se puede llamar a un
 * cliente: no solo «faltan 12», sino a quién se le prometieron y para cuándo.
 * `Cubierto` es la parte que sale del almacén, por orden de confirmación.
 */
function DetalleLineas({ fila }: { fila: ProductoPorComprar }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
          <th className="py-1.5 pr-3 font-medium">Cliente</th>
          <th className="py-1.5 pr-3 font-medium">Cotización</th>
          <th className="py-1.5 pr-3 text-right font-medium">Confirmó</th>
          <th className="py-1.5 pr-3 text-right font-medium">Del almacén</th>
          <th className="py-1.5 pr-3 text-right font-medium">Le falta</th>
          <th className="py-1.5 font-medium">Se prometió</th>
        </tr>
      </thead>
      <tbody>
        {fila.lineas.map((l) => (
          <tr key={l.item_id} className="border-t border-[var(--border-soft)]">
            <td className="py-1.5 pr-3">{l.cliente}</td>
            <td className="py-1.5 pr-3">
              <Link
                href={`/cotizaciones/${l.cotizacion_id}`}
                className="font-mono text-brand-600 hover:underline"
              >
                {l.cotizacion}
              </Link>
            </td>
            <td className="py-1.5 pr-3 text-right tabular">{cantidad(l.comprometido)}</td>
            <td className="py-1.5 pr-3 text-right tabular">
              {l.cubierto > 0 ? (
                cantidad(l.cubierto)
              ) : (
                <span className="text-[var(--fg-subtle)]">—</span>
              )}
            </td>
            <td className="py-1.5 pr-3 text-right tabular font-medium">
              {l.descubierto > 0 ? (
                cantidad(l.descubierto)
              ) : (
                <span className="text-[var(--ok)]">Se le puede servir</span>
              )}
            </td>
            <td className="py-1.5 whitespace-nowrap">{formatearFecha(l.prometida)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
