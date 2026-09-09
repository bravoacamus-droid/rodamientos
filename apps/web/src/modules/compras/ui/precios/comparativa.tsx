"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, formatearMoneda } from "@rodatech/ui";
import {
  Check,
  ClipboardPen,
  PackageSearch,
  Plus,
  ShoppingCart,
  TriangleAlert,
} from "lucide-react";

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
import {
  faltaPreguntarle,
  mejorConocido,
  referenciaVacia,
  type ProveedorConocido,
  type Referencia,
} from "../../dominio/referencia";
import { anadirALaRonda, comprarDeLaRonda, quitarDeLaRonda } from "../../acciones/comparar";
import { AnadirALaConsulta } from "./anadir-a-la-consulta";
import { QuitarDeLaConsulta } from "./quitar-de-la-consulta";
import { PanelRespuesta } from "./panel-respuesta";
import { AjustarVenta } from "./ajustar-venta";

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
export function Comparativa({
  ronda,
  referencias,
}: {
  ronda: RondaDetalle;
  /** Por `producto_id`. Puede venir vacío: la rejilla funciona igual. */
  referencias: Record<string, Referencia>;
}) {
  const router = useRouter();

  /*
    Lo apuntado desde esta pantalla, ENCIMA de lo que manda el servidor.

    Esto era estado a secas —`useState(ronda.proveedores)`— y ahí había un
    fallo callado: `useState` no se vuelve a inicializar cuando cambian las
    props, así que un `router.refresh()` traía la ronda con un proveedor más y
    la rejilla seguía pintando los de antes. Se veía al añadir a alguien que
    faltaba: la fila se guardaba en la base y en pantalla no pasaba nada.

    Es el mismo razonamiento que el de `aMano` unas líneas más abajo, y por eso
    la forma es la misma: lo del servidor manda, y lo local son parches. Lo que
    se guarda desde aquí ya está también en la base, así que el parche y el
    servidor dicen lo mismo — el parche solo evita esperar a la recarga.
  */
  const [parches, setParches] = React.useState<
    Record<string, Partial<ProveedorConsultado>>
  >({});
  const [apuntadas, setApuntadas] = React.useState<Record<string, Respuesta[]>>({});

  const proveedores = React.useMemo(
    () =>
      ronda.proveedores.map((p) =>
        parches[p.consulta_proveedor_id]
          ? { ...p, ...parches[p.consulta_proveedor_id] }
          : p,
      ),
    [ronda.proveedores, parches],
  );

  const respuestas = React.useMemo(
    () => [
      // Las del servidor, salvo las de los proveedores que se acaban de
      // apuntar aquí: de esos manda lo local, que es más nuevo.
      ...ronda.respuestas.filter((r) => !(r.consulta_proveedor_id in apuntadas)),
      ...Object.values(apuntadas).flat(),
    ],
    [ronda.respuestas, apuntadas],
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
    setParches((prev) => ({ ...prev, [cpId]: { ...prev[cpId], ...proveedor } }));
    setApuntadas((prev) => ({ ...prev, [cpId]: lineas }));
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

  /*
    A quién se le podría preguntar y no se le preguntó.

    Es la pregunta que uno se hace MIRANDO la rejilla —«¿me faltó alguien?»— y
    hasta ahora había que contestarla de memoria. Sale de los que constan como
    que venden ese producto, que es justo lo que el sistema aprende solo de
    cada compra desde la 046.
  */
  const enLaRonda = React.useMemo(
    () => new Set(proveedores.map((p) => p.proveedor_id)),
    [proveedores],
  );

  const [anadiendo, setAnadiendo] = React.useState<string | null>(null);

  function anadir(itemId: string, proveedorId: string) {
    setAviso(null);
    setAnadiendo(`${itemId}|${proveedorId}`);
    empezar(async () => {
      const r = await anadirALaRonda({
        consulta_id: ronda.id,
        proveedor_id: proveedorId,
        items: [itemId],
      });
      setAnadiendo(null);
      if (!r.ok) {
        setAviso(r.error);
        return;
      }
      // Recarga entera: la ronda gana una columna y unas asignaciones, y las
      // dos vienen del servidor.
      router.refresh();
    });
  }

  /**
   * El proveedor que se olvidó, con los productos que se le marcaron.
   *
   * A diferencia de `anadir`, que mete a alguien para UN producto desde su
   * fila, esto entra por el diálogo: se busca en el maestro entero y se elige
   * por qué se le pregunta. Los dos pasos son obligatorios —Luis, 09/09:
   * *«para añadir un proveedor tiene que saber a qué producto»*—.
   */
  function anadirATodo(proveedorId: string, items: string[]) {
    setAviso(null);
    setAnadiendo("todos");
    empezar(async () => {
      const r = await anadirALaRonda({
        consulta_id: ronda.id,
        proveedor_id: proveedorId,
        items,
      });
      setAnadiendo(null);
      if (!r.ok) {
        setAviso(r.error);
        return;
      }
      router.refresh();
    });
  }

  /**
   * Deshacer un «se lo pregunté a este», entero o por producto.
   *
   * Luis, 09/09: *«nos falta ahí eliminar por producto al proveedor si es que
   * se equivocó, o eliminar el proveedor completo con sus productos»*. La
   * lista vacía significa entero, que es lo que espera la acción.
   *
   * Aquí no hay parche local como en el resto de la pantalla: quitar BORRA
   * filas, y pintar como si ya no estuvieran antes de saber que se borraron
   * es enseñar algo que puede no haber pasado. Se espera a la recarga.
   */
  function quitar(proveedorId: string, items: string[]) {
    setAviso(null);
    empezar(async () => {
      const r = await quitarDeLaRonda({
        consulta_id: ronda.id,
        proveedor_id: proveedorId,
        items,
      });
      if (!r.ok) {
        setAviso(r.error);
        return;
      }
      router.refresh();
    });
  }

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
          // Lo que se le preguntó A ÉL y, de eso, lo que ya contestó: es lo
          // que el diálogo de quitar necesita para decir qué se pierde.
          const suyos = ronda.items.filter((i) =>
            preguntadas.has(i.item_id + '|' + r.consulta_proveedor_id),
          );
          const conPrecio = new Set(
            respuestas
              .filter((x) => x.consulta_proveedor_id === r.consulta_proveedor_id)
              .map((x) => x.item_id),
          );
          return (
            /*
              Un BOTÓN de verdad, no la tarjeta entera haciendo de botón.

              Era una tarjeta pulsable con el texto «Pulsa para apuntar lo que
              te diga» — y eso obliga a leerlo para descubrir que se puede
              pulsar. Luis: *«una persona que no sabe, tiene que darle clic ahí
              en el cuadrado; debes poner un botón de registrar precio en cada
              card»*.

              La aplicación la usa gente mayor. Un botón que parece un botón no
              hay que explicarlo.
            */
            <div key={r.consulta_proveedor_id} className="card flex flex-col gap-2 p-3">
              <div className="flex items-start justify-between gap-2">
                {/* El nombre entero al pasar por encima: «CAFAMER LOGISTICA
                    INDUSTRIAL S.A.C. - CAFAMER S.A.C.» no cabe en una tarjeta,
                    y con dos parecidos el corte los deja idénticos. */}
                <span className="truncate text-sm font-medium" title={r.proveedor}>
                  {r.proveedor}
                </span>
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

              {/* «Tiene 0 de 2» al que no ha contestado es el mismo error
                  que la celda: dice que no lo tiene cuando lo que pasa es
                  que no ha dicho nada. */}
              {r.estado !== "esperando" ? (
                <p className="text-xs text-[var(--fg-muted)]">
                  {`Tiene ${r.cubre} de ${ronda.items.length}`}
                  {r.gana > 0 ? ` · gana ${r.gana}` : ""}
                  {p.moneda === "PEN" ? ` · en soles a ${p.tipo_cambio ?? "?"}` : ""}
                  {p.incluye_igv ? " · IGV incluido" : ""}
                </p>
              ) : null}

              {r.totalSiTodo !== null ? (
                <p className="text-xs text-[var(--fg-subtle)]">
                  Todo con él: {formatearMoneda(r.totalSiTodo, "USD")}
                </p>
              ) : null}
              {comprado ? (
                <p className="text-xs text-[var(--ok)]">Ya se le compró</p>
              ) : null}

              {/* El texto cambia con el estado: la primera vez es «registrar»,
                  después es «corregir». No hay que pensar cuál toca. */}
              <Button
                type="button"
                variant={r.estado === "esperando" ? "primary" : "outline"}
                onClick={() => setAbierto(r.consulta_proveedor_id)}
                className="mt-auto w-full gap-1.5"
              >
                <ClipboardPen className="size-4" aria-hidden="true" />
                {r.estado === "esperando" ? "Registrar precio" : "Ver o corregir"}
              </Button>

              {/*
                Quitar va DEBAJO del de registrar y en gris, no al lado.

                Los dos botones de una tarjeta no valen lo mismo: uno se usa
                todos los días y el otro es para arreglar un error. Puestos a
                la par, el de borrar se pulsa por error —y aquí borrar se
                lleva precios ya apuntados—.

                Al que ya se le compró no se le puede quitar, así que no se
                le enseña el botón: un botón que siempre da error es peor que
                no tenerlo.
              */}
              {ronda.estado === "abierta" && !comprado ? (
                <QuitarDeLaConsulta
                  proveedor={r.proveedor}
                  suyos={suyos}
                  conPrecio={conPrecio}
                  enCurso={enCurso}
                  onQuitar={(items) => quitar(p.proveedor_id, items)}
                />
              ) : null}
            </div>
          );
        })}
      </section>

      {/*
        Añadir a cualquier proveedor, no solo a los que el sistema ya conoce.

        Luis, 09/09: *«si ya le puse los proveedores, no sé dónde puedo seguir
        agregando más proveedores… debería ver un botón aquí, si es que seguro
        se olvidó de otros»*.

        La acción ya existía (`anadirALaRonda`) y su único camino era un texto
        de 11 px bajo cada fila —«falta preguntarle a…»— que además solo
        proponía a quien YA le habían comprado ese producto. Al que se te
        olvidó y nunca le compraste eso, no había forma de llegar. La pieza
        estaba y la puerta era del tamaño de una rendija.

        El buscador es el mismo de «Pedir precio»: va contra el maestro entero
        y busca por RUC, razón social **y marca**, que es la mitad de las veces
        que se abre esto —«¿quién me trae SKF?»—.

        Y pregunta por cuáles, que no es un adorno: al de retenes no se le
        pregunta por unas chapas SKF.
      */}
      {ronda.estado === "abierta" ? (
        <section className="card p-4">
          <h2 className="text-base font-semibold">¿Te falta preguntarle a alguien?</h2>
          <p className="mb-3 text-sm text-[var(--fg-muted)]">
            Marca los productos, elige de los que ya los venden —o búscalo— y
            su columna aparece al momento.
          </p>
          <AnadirALaConsulta
            items={ronda.items}
            referencias={referencias}
            enLaRonda={proveedores}
            preguntadas={preguntadas}
            enCurso={anadiendo === "todos"}
            onAnadir={anadirATodo}
          />
          {anadiendo === "todos" ? (
            <p className="mt-2 text-sm text-[var(--fg-muted)]">Añadiendo…</p>
          ) : null}
        </section>
      ) : (
        // Y si está cerrada, se dice. Sin esto la sección desaparece sin más y
        // parece que el botón no existe —que es justo lo que pasó el 09/09—.
        <p className="text-sm text-[var(--fg-muted)]">
          Esta consulta ya está cerrada, así que no se le puede añadir a nadie
          más. Para seguir preguntando, abre una consulta nueva desde{" "}
          <strong>Pedir precio</strong>.
        </p>
      )}

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
                {/*
                  La columna del producto se queda quieta al desplazar.

                  Luis: «pon que tenga 10 proveedores; tiene que agruparse bien
                  sin romperse». Con diez son trece columnas y la tabla se
                  desplaza — sin fijar esta, al llegar al décimo proveedor ya no
                  se ve de qué producto es el precio que se está mirando, que es
                  justo lo que la tabla venía a resolver.
                */}
                <th className="sticky left-0 z-20 bg-[var(--surface)] px-4 py-2.5 font-medium">
                  Producto
                </th>
                <th className="px-3 py-2.5 text-right font-medium">Cant.</th>
                {proveedores.map((p) => (
                  <th
                    key={p.consulta_proveedor_id}
                    className="min-w-[7rem] max-w-[11rem] truncate px-3 py-2.5 text-right font-medium"
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
                const ref =
                  referencias[fila.item.producto_id] ??
                  referenciaVacia(fila.item.producto_id);
                const faltan = faltaPreguntarle(ref, enLaRonda);
                return (
                  <tr
                    key={fila.item.item_id}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    {/* Fija, como su cabecera: es la referencia de la fila. */}
                    <td className="sticky left-0 z-10 bg-[var(--surface)] px-4 py-2.5">
                      <span className="font-medium tabular-nums">{fila.item.codigo}</span>
                      <span className="block max-w-[18rem] truncate text-sm text-[var(--fg-muted)]">
                        {fila.item.descripcion}
                      </span>

                      {/*
                        Lo que ya se sabe, aquí también.

                        Estaba solo dentro del diálogo de apuntar, y Luis lo
                        pidió en la rejilla: *«acá tampoco sé a cuánto se
                        compró últimamente, qué proveedor me dio el mejor
                        precio»*. Y es donde se mira para decidir a quién
                        comprarle — abrir un diálogo para recordar cuánto te
                        costó es perder el hilo de la comparación.
                      */}
                      <ReferenciaDeFila referencia={ref} />

                      <AQuienFalta
                        faltan={faltan}
                        anadiendo={anadiendo}
                        itemId={fila.item.item_id}
                        bloqueado={enCurso || ronda.estado !== "abierta"}
                        onAnadir={(provId) => anadir(fila.item.item_id, provId)}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {fila.item.cantidad}
                    </td>

                    {fila.celdas.map((celda) => {
                      const gana =
                        fila.ganador?.consulta_proveedor_id === celda.consulta_proveedor_id;
                      const esElegido = elegido === celda.consulta_proveedor_id;
                      /*
                        Y cuál es el más CARO.

                        Luis: *«así diferencia cuál es más barato o más caro»*.
                        El verde del ganador ya estaba; faltaba la otra punta,
                        que es la que hace que se vea de un golpe cuánto va de
                        uno a otro.

                        Solo con dos o más precios: con uno solo no hay nada
                        que comparar, y pintarlo diría que es caro cuando es
                        simplemente el único.
                      */
                      const conPrecio = fila.celdas.filter((c) => c.costoUsd !== null);
                      const masCaro =
                        conPrecio.length > 1 &&
                        celda.costoUsd !== null &&
                        celda.costoUsd ===
                          Math.max(...conPrecio.map((c) => c.costoUsd!));
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
                                    ? "font-semibold text-[var(--ok)] hover:bg-[var(--surface-2)]"
                                    : masCaro
                                      ? "text-[var(--danger)] hover:bg-[var(--surface-2)]"
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
                        <span title={proveedores.find((p) => p.consulta_proveedor_id === elegido)?.proveedor}>
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

      {/* ------------------------------------------- A cuánto lo vendes */}
      {/*
        Con el costo delante, decidir el precio de venta.

        Luis: «que me traiga el precio de compra más barato y poder editar el
        precio de venta y el precio mínimo si es que quiere cambiar». Es el
        momento exacto: se acaba de saber lo que cuesta de verdad, y salir a
        la ficha del producto para ajustar la venta es garantizar que no se
        haga.

        Solo para los productos que ya tienen alguna respuesta: sin costo no
        hay nada nuevo que decidir.
      */}
      {filas.some((f) => f.celdas.some((c) => c.costoUsd !== null)) ? (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-base font-semibold">A cuánto lo vendes</h2>
            <p className="text-sm text-[var(--fg-muted)]">
              Ya sabes lo que te cuesta. Ajusta tu precio si hace falta, o
              déjalo como está.
            </p>
          </div>
          {/*
            En columnas, no una debajo de otra.

            Luis, 09/09: *«muy grandes los cards; si son dos productos pues
            los repartimos en columnas, tampoco se llena mucho… así todo está
            en una sola página sin hacer tanto scroll»*.

            Y tiene razón en lo segundo tanto como en lo primero: esto se
            decide comparando —a este le saco 15 %, a este 19 %— y comparar
            dos cifras que no caben a la vez obliga a memorizar una.

            Dos columnas y no tres: los campos llevan etiqueta y un tercio de
            pantalla las parte en dos líneas.
          */}
          <div className="grid gap-3 xl:grid-cols-2">
            {filas
              .filter((f) => f.celdas.some((c) => c.costoUsd !== null))
              .map((f) => (
                <AjustarVenta
                  key={f.item.item_id}
                  productoId={f.item.producto_id}
                  codigo={f.item.codigo}
                  descripcion={f.item.descripcion}
                  referencia={
                    referencias[f.item.producto_id] ??
                    referenciaVacia(f.item.producto_id)
                  }
                  ofertas={f.celdas
                    .filter((c) => c.costoUsd !== null)
                    .map((c) => ({
                      proveedor:
                        proveedores.find(
                          (p) => p.consulta_proveedor_id === c.consulta_proveedor_id,
                        )?.proveedor ?? "—",
                      costoUsd: c.costoUsd!,
                    }))}
                />
              ))}
          </div>
        </section>
      ) : null}
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
              diez dólares lo decide Willy — pero decide sabiendo cuánto es.

              Solo mientras haya algo que decidir. Con las compras ya hechas,
              «comprándoselo todo a X son $3.00 más» es un consejo sobre una
              decisión que ya se tomó, y encima con un número que ya no se
              puede aprovechar. */}
          {propuestas.length > 0 &&
          resumen.mejorUnico &&
          resumen.costeDeUnSoloProveedor !== null ? (
            <p className="mt-1 text-[var(--fg-muted)]">
              {resumen.costeDeUnSoloProveedor === 0
                ? `${resumen.mejorUnico.proveedor} lo tiene todo al mismo precio.`
                : `Comprándoselo todo a ${resumen.mejorUnico.proveedor} son ${formatearMoneda(
                    resumen.costeDeUnSoloProveedor,
                    "USD",
                  )} más, en una sola compra.`}
            </p>
          ) : null}

          {/*
            Dos frases distintas, porque son dos situaciones distintas.

            Antes había una sola y contaba «sin ganador», que incluye a los que
            todavía no han contestado. Una ronda recién abierta decía «2
            productos no los tiene nadie, hay que buscarlos fuera» con los dos
            proveedores en «Esperando»: mandaba a buscar proveedores nuevos
            mientras esperaba respuesta de los que ya tenía.
          */}
          {resumen.esperando > 0 ? (
            <p className="mt-1 text-[var(--fg-muted)]">
              {resumen.esperando}{" "}
              {resumen.esperando === 1
                ? "producto está esperando respuesta"
                : "productos están esperando respuesta"}
              .
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

        {/*
          El botón, solo mientras haya algo que registrar.

          Apagado al lado de «esta consulta ya está resuelta» no informaba de
          nada: repetía en gris lo que la frase de al lado ya decía en negro.
        */}
        {propuestas.length > 0 ? (
          <Button onClick={comprar} disabled={enCurso} className="gap-1.5">
            <ShoppingCart className="size-4" />
            {propuestas.length <= 1
              ? "Registrar la compra"
              : `Registrar ${propuestas.length} compras`}
          </Button>
        ) : null}
      </section>

      {/*
        En qué acabó la ronda.

        Luis, 09/09: *«cuando registro, esos enlaces ni yo los entiendo… en
        cada orden voy a poder ver el total a pagar, ¿no? Hay que hacer mejor
        eso»*.

        Era «Ya salieron: CMP-26-00015, CMP-26-00016» en gris de 14 px. Los
        números SÍ eran enlaces —solo que sin subrayado hasta pasarles el
        ratón por encima, que es la definición de enlace que no se ve— y
        aparte un correlativo suelto no dice nada: ni a quién le compraste ni
        cuánto le debes. Justo lo que hay que saber al terminar.

        Ahora es una tarjeta por compra, con el total delante y un botón de
        verdad. Es el mismo patrón de siempre en este proyecto: la función
        estaba, la puerta era una rendija.
      */}
      {ronda.compras.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-base font-semibold">
              {ronda.compras.length === 1
                ? "La compra que salió de aquí"
                : "Las compras que salieron de aquí"}
            </h2>
            <p className="text-sm text-[var(--fg-muted)]">
              Una por proveedor. Ahí se registra lo que llega y lo que se le
              paga.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {ronda.compras.map((c) => (
              <div key={c.id} className="card flex flex-col gap-2 p-4">
                <span className="font-mono text-base font-semibold">
                  {c.numero}
                </span>
                <span
                  className="truncate text-sm text-[var(--fg-muted)]"
                  title={c.proveedor}
                >
                  {c.proveedor}
                </span>

                {/* El total, que es lo que se preguntó: cuánto hay que
                    pagarle a este. Grande, porque es la cifra. */}
                <span className="flex items-baseline justify-between gap-2 rounded-md bg-[var(--surface-2)] px-3 py-2">
                  <span className="text-sm text-[var(--fg-muted)]">
                    Total a pagar
                  </span>
                  <strong className="text-lg tabular-nums">
                    {formatearMoneda(c.total, "USD")}
                  </strong>
                </span>

                <Button asChild variant="outline" className="mt-auto w-full gap-1.5">
                  <Link href={`/compras/${c.id}`}>
                    <PackageSearch className="size-4" aria-hidden="true" />
                    Ver la compra
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

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
          referencias={referencias}
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

/**
 * «Me faltó preguntarle a este».
 *
 * Debajo de cada producto, quién más consta que lo vende y no entró en la
 * ronda — con lo último que cobró, que es lo que decide si vale la pena
 * llamarle. Un clic lo mete en la consulta y ya se le puede apuntar.
 *
 * Es la mitad del historial que no se veía: el sistema aprende de cada compra
 * quién vende qué (046), y hasta ahora eso solo se consultaba entrando a la
 * ficha del producto, o sea nunca, porque cuando estás comparando no te vas a
 * otra pantalla.
 *
 * Se enseñan tres como mucho. La lista completa está en la ficha; aquí lo que
 * hace falta es acordarse, no elegir entre nueve.
 */
function AQuienFalta({
  faltan,
  itemId,
  anadiendo,
  bloqueado,
  onAnadir,
}: {
  faltan: ProveedorConocido[];
  itemId: string;
  anadiendo: string | null;
  bloqueado: boolean;
  onAnadir: (proveedorId: string) => void;
}) {
  if (faltan.length === 0) return null;
  const primeros = faltan.slice(0, 3);

  return (
    <span className="mt-1 flex flex-wrap items-center gap-1 text-sm">
      <span className="text-[var(--fg-subtle)]">Falta preguntarle a</span>
      {primeros.map((p) => {
        const esperando = anadiendo === `${itemId}|${p.proveedor_id}`;
        return (
          <button
            key={p.proveedor_id}
            type="button"
            disabled={bloqueado}
            onClick={() => onAnadir(p.proveedor_id)}
            title={
              p.ultimoCostoUsd === null
                ? `Añadir ${p.proveedor} a esta consulta`
                : `Su última factura fue de $${p.ultimoCostoUsd.toFixed(2)}. Añadirlo a esta consulta.`
            }
            className="inline-flex max-w-[12rem] items-center gap-1 rounded-sm border border-[var(--border)] px-1.5 py-0.5 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] disabled:opacity-50"
          >
            <Plus className="size-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{esperando ? "Añadiendo…" : p.proveedor}</span>
            {p.ultimoCostoUsd !== null ? (
              <span className="shrink-0 tabular-nums text-[var(--fg-subtle)]">
                ${p.ultimoCostoUsd.toFixed(2)}
              </span>
            ) : null}
          </button>
        );
      })}
      {faltan.length > primeros.length ? (
        <span className="text-[var(--fg-subtle)]">
          y {faltan.length - primeros.length} más
        </span>
      ) : null}
    </span>
  );
}

/**
 * A cuánto te costó y a cuánto lo vendes, en la propia fila.
 *
 * Luis: *«acá tampoco sé a cuánto se compró últimamente, qué proveedor me dio
 * el mejor precio»*. Y la rejilla es justo donde se decide a quién comprarle:
 * tener que abrir el diálogo de apuntar para recordar cuánto costó la última
 * vez es perder el hilo de la comparación que se está haciendo.
 *
 * Va en una línea y no en una tarjeta: aquí hay una fila por producto y el
 * espacio es de la comparación. Lo detallado —el margen, el piso, los tres
 * proveedores— vive en el diálogo.
 */
function ReferenciaDeFila({ referencia: ref }: { referencia: Referencia }) {
  const mejor = mejorConocido(ref);
  if (ref.ultimoCosto === null && ref.precioVenta === null && mejor === null) return null;

  return (
    <span className="mt-1 flex flex-wrap items-baseline gap-x-3 text-sm">
      {ref.ultimoCosto !== null ? (
        <span>
          <span className="text-[var(--fg-subtle)]">te costó </span>
          <strong className="tabular-nums">{formatearMoneda(ref.ultimoCosto, "USD")}</strong>
        </span>
      ) : null}
      {ref.precioVenta !== null ? (
        <span>
          <span className="text-[var(--fg-subtle)]">vendes a </span>
          <strong className="tabular-nums">{formatearMoneda(ref.precioVenta, "USD")}</strong>
        </span>
      ) : null}
      {/* Quién lo dio más barato, que es la otra mitad de la pregunta: el
          número solo no dice a quién volver a llamar. */}
      {mejor ? (
        <span className="min-w-0 truncate text-[var(--fg-muted)]">
          mejor {formatearMoneda(mejor.costoUsd, "USD")} · {mejor.proveedor}
        </span>
      ) : null}
    </span>
  );
}
