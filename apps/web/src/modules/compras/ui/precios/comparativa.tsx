"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, formatearMoneda } from "@rodatech/ui";
import { Check, ShoppingCart, TriangleAlert } from "lucide-react";

import {
  ETIQUETA_RESPUESTA,
  compararTodo,
  comprasPropuestas,
  eleccionFinal,
  estadoDeFila,
  resumirComparativa,
  resumirProveedores,
  type ProveedorConsultado,
  type Respuesta,
} from "../../dominio/comparador";
import { comprarDeLaRonda } from "../../acciones/comparar";
import { PanelRespuesta } from "./panel-respuesta";

// Por la ruta profunda y no por el índice del módulo: `api/comparador.ts` es
// `server-only` y esto es un componente de cliente. Misma razón que en
// «Pedir precio».
import type { RondaDetalle } from "../../api/comparador";

/**
 * La rejilla del comparador.
 *
 * Una fila por producto, una columna por proveedor. En cada celda, lo que
 * contestó, y al lado del producto quién gana y por cuánto.
 *
 * ---------------------------------------------------------------------------
 * Por qué la comparación se rehace aquí y no viene de la base
 * ---------------------------------------------------------------------------
 * Porque hay que verla cambiar **mientras se escribe**. Se apunta el precio
 * del tercer proveedor y el ganador se mueve delante, antes de guardar nada;
 * eso es lo que convierte esto en una herramienta de decidir y no en un
 * formulario. La misma cuenta vive en `v_comparativa_precios` para cuando la
 * pregunta la hace otra pantalla.
 */
export function Comparativa({ ronda }: { ronda: RondaDetalle }) {
  const router = useRouter();
  const [respuestas, setRespuestas] = React.useState<Respuesta[]>(ronda.respuestas);
  const [proveedores, setProveedores] = React.useState<ProveedorConsultado[]>(
    ronda.proveedores,
  );
  const [abierto, setAbierto] = React.useState<string | null>(null);
  const [enCurso, empezar] = React.useTransition();
  const [aviso, setAviso] = React.useState<string | null>(null);

  // Qué se le preguntó a quién. Sin esto, los cruces que nunca se
  // preguntaron —al de retenes, las chapas— salían como respuestas que faltan.
  const preguntadas = React.useMemo(
    () => new Set(ronda.preguntadas),
    [ronda.preguntadas],
  );

  const filas = React.useMemo(
    () => compararTodo(ronda.items, proveedores, respuestas, preguntadas),
    [ronda.items, proveedores, respuestas, preguntadas],
  );
  const resumenes = React.useMemo(
    () => resumirProveedores(filas, proveedores),
    [filas, proveedores],
  );
  const resumen = React.useMemo(
    () => resumirComparativa(filas, resumenes),
    [filas, resumenes],
  );

  // La elección arranca en el ganador de cada producto y se puede mover. Los
  // productos que ya se compraron en esta ronda salen de la elección: volver a
  // proponerlos sería proponer comprar dos veces lo mismo.
  const yaComprados = React.useMemo(
    () => new Set(ronda.compras.map((c) => c.proveedor_id)),
    [ronda.compras],
  );
  /**
   * Lo que la persona movió A MANO, y nada más.
   *
   * La elección entera NO es estado: se recalcula con cada respuesta que
   * entra. Guardar la elección completa fue el fallo que tuvo esta pantalla
   * —al llegar una respuesta nueva se mezclaba dando prioridad a lo ya
   * elegido, así que el primero que contestaba se quedaba con todo y el
   * segundo no podía ganarle aunque llegara más barato—. Y como las
   * respuestas nunca llegan a la vez, pasaba siempre.
   *
   * `null` significa «lo quitó a mano»: lo que se decidió no comprar no
   * vuelve porque aparezca otra oferta.
   */
  const [aMano, setAMano] = React.useState<Record<string, string | null>>({});

  const eleccion = React.useMemo(() => eleccionFinal(filas, aMano), [filas, aMano]);

  const propuestas = React.useMemo(
    () =>
      comprasPropuestas(filas, proveedores, eleccion).filter(
        (c) => !yaComprados.has(c.proveedor_id),
      ),
    [filas, proveedores, eleccion, yaComprados],
  );

  function alternar(itemId: string, cpId: string) {
    setAMano((prev) => ({
      ...prev,
      // Volver a pulsar el que ya estaba elegido lo quita.
      [itemId]: eleccion[itemId] === cpId ? null : cpId,
    }));
  }

  function guardado(
    cpId: string,
    proveedor: Partial<ProveedorConsultado>,
    lineas: Respuesta[],
  ) {
    setProveedores((prev) =>
      prev.map((p) =>
        p.consulta_proveedor_id === cpId ? { ...p, ...proveedor } : p,
      ),
    );
    setRespuestas((prev) => [
      ...prev.filter((r) => r.consulta_proveedor_id !== cpId),
      ...lineas,
    ]);
    setAbierto(null);
    // La elección no se toca: se recalcula sola con las respuestas nuevas,
    // salvo lo que esté movido a mano.
  }

  function comprar() {
    setAviso(null);
    empezar(async () => {
      const r = await comprarDeLaRonda({
        consulta_id: ronda.id,
        compras: propuestas.map((c) => ({
          proveedor_id: c.proveedor_id,
          moneda: c.moneda,
          tipo_cambio: c.tipo_cambio,
          tipo: c.tipo,
          fecha_estimada: null,
          lineas: c.lineas.map((l) => ({
            producto_id: l.producto_id,
            cantidad: l.cantidad,
            costo_unitario: l.costo_unitario,
          })),
        })),
      });

      if (!r.ok) {
        setAviso(r.error);
        return;
      }
      if (r.fallidas.length > 0) {
        setAviso(
          `Se registraron ${r.compras.length} de ${
            r.compras.length + r.fallidas.length
          } compras. La que falló: ${r.fallidas[0]?.error ?? ""}`,
        );
      }
      router.refresh();
    });
  }

  const sinContestar = proveedores.filter((p) => p.estado === "esperando").length;

  return (
    <div className="flex flex-col gap-5">
      {/* -------------------------------------------------- Los proveedores */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {resumenes.map((r) => {
          const p = proveedores.find(
            (x) => x.consulta_proveedor_id === r.consulta_proveedor_id,
          );
          if (!p) return null;
          const comprado = yaComprados.has(p.proveedor_id);
          return (
            <button
              key={r.consulta_proveedor_id}
              type="button"
              onClick={() => setAbierto(r.consulta_proveedor_id)}
              className="card p-3 text-left transition-colors hover:bg-[var(--surface-2)]"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="truncate text-sm font-medium">{r.proveedor}</span>
                <span
                  className={`shrink-0 text-xs ${
                    r.estado === "esperando"
                      ? "text-[var(--warn)]"
                      : r.estado === "respondio"
                        ? "text-[var(--ok)]"
                        : "text-[var(--fg-subtle)]"
                  }`}
                >
                  {ETIQUETA_RESPUESTA[r.estado]}
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--fg-muted)]">
                {/* «Tiene 0 de 2» al que no ha contestado es el mismo error
                    que la celda: dice que no lo tiene cuando lo que pasa es
                    que no ha dicho nada. */}
                {r.estado === "esperando"
                  ? "Pulsa para apuntar lo que te diga"
                  : `Tiene ${r.cubre} de ${ronda.items.length}`}
                {r.gana > 0 ? ` · gana ${r.gana}` : ""}
                {p.moneda === "PEN" ? ` · en soles a ${p.tipo_cambio ?? "?"}` : ""}
                {p.incluye_igv ? " · IGV incluido" : ""}
              </p>
              {r.totalSiTodo !== null ? (
                <p className="mt-1 text-xs text-[var(--fg-subtle)]">
                  Todo con él: {formatearMoneda(r.totalSiTodo, "USD")}
                </p>
              ) : null}
              {comprado ? (
                <p className="mt-1 text-xs text-[var(--ok)]">Ya se le compró</p>
              ) : null}
            </button>
          );
        })}
      </section>

      {sinContestar > 0 ? (
        <p className="text-sm text-[var(--fg-muted)]">
          Falta{sinContestar === 1 ? "" : "n"} {sinContestar} por contestar. Puedes
          decidir con lo que hay y volver cuando llegue el resto: lo apuntado se
          queda.
        </p>
      ) : null}

      {/* ------------------------------------------------------- La rejilla */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
              <tr>
                <th className="px-4 py-2.5 font-medium">Producto</th>
                <th className="px-3 py-2.5 text-right font-medium">Cant.</th>
                {proveedores.map((p) => (
                  <th
                    key={p.consulta_proveedor_id}
                    className="max-w-[11rem] truncate px-3 py-2.5 text-right font-medium"
                    title={p.proveedor}
                  >
                    {p.proveedor}
                  </th>
                ))}
                <th className="px-4 py-2.5 font-medium">Se le compra a</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => {
                const elegido = eleccion[fila.item.item_id];
                return (
                  <tr
                    key={fila.item.item_id}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <td className="px-4 py-2.5">
                      <span className="font-medium tabular-nums">{fila.item.codigo}</span>
                      <span className="block max-w-[18rem] truncate text-xs text-[var(--fg-muted)]">
                        {fila.item.descripcion}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {fila.item.cantidad}
                    </td>

                    {fila.celdas.map((celda) => {
                      const gana =
                        fila.ganador?.consulta_proveedor_id === celda.consulta_proveedor_id;
                      const esElegido = elegido === celda.consulta_proveedor_id;
                      return (
                        <td
                          key={celda.consulta_proveedor_id}
                          className="px-3 py-2.5 text-right"
                        >
                          {celda.costoUsd === null ? (
                            // Tres estados, no dos. «No se le preguntó» —no
                            // vende eso— no es una respuesta que falte, y
                            // marcarlo como tal llena la rejilla de deudas
                            // que no existen.
                            <span className="text-[var(--fg-subtle)]">
                              {!celda.preguntada
                                ? ""
                                : !celda.respondida
                                  ? "—"
                                  : "no tiene"}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                alternar(fila.item.item_id, celda.consulta_proveedor_id)
                              }
                              className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 tabular-nums transition-colors ${
                                esElegido
                                  ? "bg-brand-600 text-white"
                                  : gana
                                    ? "text-[var(--ok)] hover:bg-[var(--surface-2)]"
                                    : "hover:bg-[var(--surface-2)]"
                              }`}
                              title={
                                celda.costo !== null && celda.costo !== celda.costoUsd
                                  ? `Dijo ${celda.costo} · son ${celda.costoUsd} USD sin IGV`
                                  : undefined
                              }
                            >
                              {esElegido ? <Check className="size-3" /> : null}
                              {formatearMoneda(celda.costoUsd, "USD")}
                            </button>
                          )}
                          {celda.dias !== null && celda.costoUsd !== null ? (
                            <span className="block text-[10px] text-[var(--fg-subtle)]">
                              {celda.dias} d
                            </span>
                          ) : null}
                        </td>
                      );
                    })}

                    <td className="px-4 py-2.5">
                      {fila.ganador === null ? (
                        // «Nadie lo tiene» solo cuando TODOS los preguntados
                        // contestaron que no. Decirlo mientras se espera es
                        // dar por cerrada una pregunta abierta, y manda a
                        // buscar fuera algo que quizá llegue mañana.
                        <EsperaOFalta estado={estadoDeFila(fila)} />
                      ) : elegido ? (
                        <span>
                          {
                            proveedores.find((p) => p.consulta_proveedor_id === elegido)
                              ?.proveedor
                          }
                          {fila.ganador.ahorroUnitario !== null &&
                          elegido === fila.ganador.consulta_proveedor_id ? (
                            <span className="block text-xs text-[var(--fg-subtle)]">
                              {formatearMoneda(
                                fila.ganador.ahorroUnitario * fila.item.cantidad,
                                "USD",
                              )}{" "}
                              menos que {fila.ganador.segundo}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-[var(--fg-subtle)]">Sin elegir</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* -------------------------------------------------------- El cierre */}
      <section className="card flex flex-wrap items-end justify-between gap-4 p-4">
        <div className="text-sm">
          {/* Con todo comprado, «$ 95.74 repartiendo entre 0 proveedores» es
              una frase sin sentido: el número ya no es una propuesta, es lo
              que se pagó. */}
          {propuestas.length === 0 && ronda.compras.length > 0 ? (
            <p>Esta consulta ya está resuelta: salió lo que se decidió comprar.</p>
          ) : (
            <p>
              <strong className="text-base tabular-nums">
                {formatearMoneda(resumen.totalRepartido, "USD")}
              </strong>{" "}
              repartiendo entre {propuestas.length}{" "}
              {propuestas.length === 1 ? "proveedor" : "proveedores"}
              {resumen.diasMaximo !== null ? ` · llega en ${resumen.diasMaximo} d` : ""}
            </p>
          )}

          {/* Lo que cuesta la comodidad. No se recomienda ninguna de las dos:
              tres proveedores son tres pagos y tres entregas, y si eso vale
              diez dólares lo decide Willy — pero decide sabiendo cuánto es. */}
          {resumen.mejorUnico && resumen.costeDeUnSoloProveedor !== null ? (
            <p className="mt-1 text-[var(--fg-muted)]">
              {resumen.costeDeUnSoloProveedor === 0
                ? `${resumen.mejorUnico.proveedor} lo tiene todo al mismo precio.`
                : `Comprándoselo todo a ${resumen.mejorUnico.proveedor} son ${formatearMoneda(
                    resumen.costeDeUnSoloProveedor,
                    "USD",
                  )} más, en una sola compra.`}
            </p>
          ) : null}

          {resumen.sinNadie > 0 ? (
            <p className="mt-1 text-[var(--warn)]">
              {resumen.sinNadie}{" "}
              {resumen.sinNadie === 1
                ? "producto no lo tiene nadie"
                : "productos no los tiene nadie"}
              . Esos hay que buscarlos fuera.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {ronda.compras.length > 0 ? (
            <span className="text-sm text-[var(--fg-muted)]">
              Ya salieron:{" "}
              {ronda.compras.map((c, i) => (
                <React.Fragment key={c.id}>
                  {i > 0 ? ", " : ""}
                  <Link
                    href={`/compras/${c.id}`}
                    className="tabular-nums underline-offset-2 hover:underline"
                  >
                    {c.numero}
                  </Link>
                </React.Fragment>
              ))}
            </span>
          ) : null}

          <Button
            onClick={comprar}
            disabled={enCurso || propuestas.length === 0}
            className="gap-1.5"
          >
            <ShoppingCart className="size-4" />
            {propuestas.length <= 1
              ? "Registrar la compra"
              : `Registrar ${propuestas.length} compras`}
          </Button>
        </div>
      </section>

      {aviso ? (
        <p
          role="alert"
          className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm"
        >
          {aviso}
        </p>
      ) : null}

      {abierto ? (
        <PanelRespuesta
          proveedor={proveedores.find((p) => p.consulta_proveedor_id === abierto)!}
          // Solo lo que se le preguntó A ÉL. Pedirle precio de un producto que
          // no vende es lo que este cambio vino a quitar; dejarlo en el panel
          // sería quitarlo del mensaje y devolverlo por la puerta de atrás.
          items={ronda.items.filter((i) =>
            preguntadas.has(`${i.item_id}|${abierto}`),
          )}
          respuestas={respuestas.filter((r) => r.consulta_proveedor_id === abierto)}
          onCerrar={() => setAbierto(null)}
          onGuardado={guardado}
        />
      ) : null}
    </div>
  );
}

/**
 * Por qué esta fila no tiene a quién comprarle.
 *
 * Son tres motivos distintos y solo uno de ellos manda a buscar fuera. Antes
 * se decía «nadie lo tiene» para los tres.
 */
function EsperaOFalta({ estado }: { estado: ReturnType<typeof estadoDeFila> }) {
  if (estado === "esperando") {
    return <span className="text-[var(--fg-subtle)]">Esperando respuesta</span>;
  }
  if (estado === "sin_preguntar") {
    return (
      <span className="inline-flex items-center gap-1 text-[var(--warn)]">
        <TriangleAlert className="size-3.5" />
        No se le preguntó a nadie
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[var(--warn)]">
      <TriangleAlert className="size-3.5" />
      Nadie lo tiene
    </span>
  );
}
