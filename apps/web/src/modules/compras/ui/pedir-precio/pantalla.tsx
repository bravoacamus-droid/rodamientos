"use client";

// Cliente: se elige a quién se le pregunta qué, y el mensaje de cada uno se
// rehace al vuelo. Los enlaces los abre el navegador — el servidor no manda
// nada, y eso es deliberado.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@rodatech/ui";
import { ClipboardList } from "lucide-react";

// Por la ruta profunda: el índice de `mensajes` reexporta su `api/`, que es
// `server-only`, y esto es un componente de cliente.
import type { ProveedorParaPedir } from "@/modules/proveedores/dominio/pedir";

import { abrirRonda } from "../../acciones/comparar";
import {
  aPayloadDeConsulta,
  cuantosProveedores,
  modoSugerido,
  sinNadie,
  type ItemConsulta,
  type Modo,
  type Seleccion,
} from "../../dominio/reparto-consulta";
import { AnadirProveedor } from "./anadir";

export type ItemPedido = ItemConsulta;

/**
 * Pedir precio, a cada proveedor lo suyo.
 *
 * ---------------------------------------------------------------------------
 * Lo que cambió el 03/09
 * ---------------------------------------------------------------------------
 * Antes se mandaba **la lista entera a todos los marcados**. Luis: *«cada
 * producto es de diferente proveedor, no el mismo; cada producto puede tener
 * hasta 5 proveedores»*. Con dos líneas —unas chapas SKF y un retén— al de
 * retenes le llegaba un mensaje pidiéndole chapas que no vende.
 *
 * Ahora hay dos modos, y el sistema propone el que toca:
 *
 *  · **Junto** — un mensaje con todo. Es lo que se hace con un distribuidor
 *    general: una sola conversación, aunque no lo tenga todo.
 *  · **Separado** — a cada proveedor solo lo que vende. Es lo de los
 *    especialistas, y es lo que se propone cuando ningún proveedor cubre
 *    todos los productos.
 *
 * **No manda nada, y desde el 09/09 ni lo ofrece.**
 *
 * Llegó a escribir el mensaje de WhatsApp por proveedor. Willy ya había dicho
 * que no lo quería (18:47): *«no, creo no, ya mucho ya. Yo eso lo manejo para
 * pedir precios, yo lo hago el WhatsApp así de forma rápida: corto la imagen de
 * mi requerimiento, o me hago un cuadrito en Excel al toque… y pum, lo mando»*.
 * Se dejó plegado como término medio, y Luis pidió quitarlo del todo. Tenía
 * razón: media pantalla estaba dedicada a resolver algo que él resuelve en diez
 * segundos a su manera.
 *
 * De paso se fue un bloqueo que nadie había pedido: sin plantilla de mensaje
 * configurada, la pantalla entera se negaba a abrir y no dejaba ni apuntar a
 * quién ibas a preguntar.
 */
export function PedirPrecio({
  items,
  proveedores: sugeridos,
  porProducto,
}: {
  items: ItemPedido[];
  /** Los que venden algo de la lista, con cuántos de ella cubren. */
  proveedores: ProveedorParaPedir[];
  /** Y quién vende cada uno por separado. */
  porProducto: Record<string, ProveedorParaPedir[]>;
}) {
  const router = useRouter();

  // La lista arranca en lo que el sistema sabe y crece con lo que se busque.
  // Sin esto la pantalla no arranca el primer día: `proveedor_productos` se
  // llena sola con cada compra.
  const [proveedores, setProveedores] = React.useState(() => {
    const vistos = new Map(sugeridos.map((p) => [p.id, p]));
    for (const lista of Object.values(porProducto)) {
      for (const p of lista) if (!vistos.has(p.id)) vistos.set(p.id, p);
    }
    return [...vistos.values()];
  });

  const idsPorProducto = React.useMemo(() => {
    const r: Record<string, string[]> = {};
    for (const item of items) {
      r[item.producto_id] = (porProducto[item.producto_id] ?? []).map((p) => p.id);
    }
    return r;
  }, [items, porProducto]);

  const [modo, setModo] = React.useState<Modo>(() => modoSugerido(items, idsPorProducto));

  // La selección arranca con los proveedores que ya venden cada producto: es
  // lo que el sistema aprendió de las compras (046) y casi siempre es lo bueno.
  const [seleccion, setSeleccion] = React.useState<Seleccion>(() => {
    const r: Record<string, string[]> = {};
    for (const item of items) r[item.producto_id] = idsPorProducto[item.producto_id] ?? [];
    return r;
  });

  const [abriendo, empezarRonda] = React.useTransition();
  const [aviso, setAviso] = React.useState<string | null>(null);

  /**
   * Las cantidades, editables.
   *
   * Llegan de la bandeja o del pedido con lo que falta, y casi siempre están
   * bien. Pero se pide precio POR VOLUMEN —«¿y si te llevo 50?»— y viniendo
   * de la ficha de un producto no hay ninguna cantidad natural: la pone quien
   * pregunta.
   */
  const [cantidades, setCantidades] = React.useState<Record<string, number>>(() =>
    Object.fromEntries(items.map((i) => [i.producto_id, i.cantidad])),
  );

  /** Los items con la cantidad que hay ahora en pantalla. */
  const conCantidad = React.useMemo(
    () =>
      items.map((i) => ({ ...i, cantidad: cantidades[i.producto_id] ?? i.cantidad })),
    [items, cantidades],
  );

  const ponerCantidad = (productoId: string, valor: number) => {
    setCantidades((prev) => ({
      ...prev,
      [productoId]: Number.isFinite(valor) && valor > 0 ? valor : 1,
    }));
  };
  const huerfanos = React.useMemo(() => sinNadie(items, seleccion), [items, seleccion]);
  const cuantos = cuantosProveedores(seleccion);

  /**
   * Los productos que se decidió dejar fuera a sabiendas.
   *
   * Luis, 09/09: *«en compras me deja anotar si no puse el proveedor los dos
   * productos, otra cosa dejaría seguir»*. Y tenía razón: la ronda se abría
   * igual y esos productos se caían en silencio —`aPayloadDeConsulta` los
   * filtra— así que la consulta salía a medias sin que nadie se enterara.
   *
   * No se prohíbe del todo, porque a veces de verdad no hay a quién
   * preguntarle. Lo que se prohíbe es que pase sin querer: hay que decirlo.
   *
   * Se guardan los ids y no un sí/no para que, si luego se desmarca a alguien
   * y aparece un huérfano nuevo, vuelva a preguntar por ese.
   */
  const [dejarFuera, setDejarFuera] = React.useState<string[]>([]);
  const sinDecidir = huerfanos.filter((h) => !dejarFuera.includes(h.producto_id));
  const entran = items.length - huerfanos.length;

  /** Marca o desmarca un proveedor. En «junto», en todos los productos. */
  const alternar = (proveedorId: string, productoId?: string) => {
    setSeleccion((previa) => {
      const copia: Record<string, string[]> = {};
      const objetivo = modo === "junto" ? items.map((i) => i.producto_id) : [productoId!];
      const estaba = (previa[objetivo[0] ?? ""] ?? []).includes(proveedorId);

      for (const item of items) {
        const actual = previa[item.producto_id] ?? [];
        if (!objetivo.includes(item.producto_id)) {
          copia[item.producto_id] = [...actual];
          continue;
        }
        copia[item.producto_id] = estaba
          ? actual.filter((id) => id !== proveedorId)
          : [...actual, proveedorId];
      }
      return copia;
    });
  };




  /**
   * Guardar la ronda para poder apuntar lo que contesten.
   *
   * Es un botón aparte y no algo que pase solo al abrir WhatsApp: preguntar un
   * precio de paso no merece un documento, y el envío lo hace el navegador,
   * así que aquí no hay forma de saber si de verdad se mandó.
   */
  const guardarRonda = () => {
    setAviso(null);
    empezarRonda(async () => {
      const r = await abrirRonda(
        aPayloadDeConsulta(
          conCantidad,
          seleccion,
          proveedores,
          `${items.length} ${items.length === 1 ? "producto" : "productos"} de la bandeja`,
        ),
      );
      if (!r.ok) {
        setAviso(r.error);
        return;
      }
      router.push(`/compras/precios/${r.id}`);
    });
  };


  const yaEstan = new Set(proveedores.map((p) => p.id));

  return (
    <div className="flex flex-col gap-5">
      {/* ------------------------------------------------------- Cómo se pide */}
      {items.length > 1 ? (
        <section className="card p-4">
          <h2 className="mb-1 text-sm font-semibold">¿Cómo lo preguntas?</h2>
          <p className="mb-3 text-xs text-[var(--fg-subtle)]">
            {modoSugerido(items, idsPorProducto) === "separado"
              ? "Ningún proveedor vende todo lo de esta lista, así que lo propuesto es preguntar por separado."
              : "Hay proveedores que venden todo lo de esta lista."}
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            <OpcionModo
              activa={modo === "junto"}
              onElegir={() => {
                setModo("junto");
                // Al pasar a junto, cada proveedor marcado en algún producto
                // pasa a estarlo en todos: es lo que significa «un mensaje
                // con la lista entera».
                setSeleccion((previa) => {
                  const todos = [...new Set(Object.values(previa).flat())];
                  return Object.fromEntries(items.map((i) => [i.producto_id, todos]));
                });
              }}
              titulo="Todo junto"
              detalle="Un mensaje con los dos productos a cada proveedor. Para el que vende de todo."
            />
            <OpcionModo
              activa={modo === "separado"}
              onElegir={() => {
                setModo("separado");
                // Y al volver a separado, cada uno se queda con lo que vende.
                setSeleccion(
                  Object.fromEntries(
                    items.map((i) => [i.producto_id, idsPorProducto[i.producto_id] ?? []]),
                  ),
                );
              }}
              titulo="Cada producto por su lado"
              detalle="A cada proveedor solo lo que vende. Para especialistas."
            />
          </div>
        </section>
      ) : null}


      {/* ------------------------------------------------ A quién, por producto */}
      {modo === "separado" ? (
        items.map((item) => (
          <section key={item.producto_id} className="card p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-[var(--border-soft)] pb-2">
              <span className="font-mono text-sm font-semibold">{item.codigo}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--fg-muted)]">
                {item.marca ? `${item.marca} · ` : ""}
                {item.descripcion}
              </span>
              <CampoCantidad
                item={item}
                valor={cantidades[item.producto_id] ?? item.cantidad}
                onCambiar={(v) => ponerCantidad(item.producto_id, v)}
              />
            </div>

            <ListaProveedores
              proveedores={[
                ...(porProducto[item.producto_id] ?? []),
                // Y los añadidos a mano para este producto, que todavía no
                // constan como que lo venden.
                ...proveedores.filter(
                  (p) =>
                    (seleccion[item.producto_id] ?? []).includes(p.id) &&
                    !(idsPorProducto[item.producto_id] ?? []).includes(p.id),
                ),
              ]}
              marcados={seleccion[item.producto_id] ?? []}
              onAlternar={(id) => alternar(id, item.producto_id)}
              vacio="Todavía no consta que nadie venda este producto. Búscalo aquí abajo."
            />

            <AnadirProveedor
              yaEstan={new Set(seleccion[item.producto_id] ?? [])}
              onAnadir={(p) => {
                setProveedores((previos) =>
                  previos.some((x) => x.id === p.id) ? previos : [...previos, p],
                );
                alternar(p.id, item.producto_id);
              }}
            />
          </section>
        ))
      ) : (
        <section className="card p-4">
          {/* Qué se pide, con las cantidades a mano. En «separado» esto va en
              la cabecera de cada bloque; aquí, que la lista es una sola, iba
              sin verse — y se pide precio por volumen, así que la cantidad es
              parte de la pregunta. */}
          <h2 className="mb-2 text-sm font-semibold">Qué se pide</h2>
          <ul className="mb-4 flex flex-col divide-y divide-[var(--border-soft)]">
            {items.map((item) => (
              <li
                key={item.producto_id}
                className="flex flex-wrap items-center gap-2 py-2"
              >
                <span className="font-mono text-sm font-medium">{item.codigo}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-[var(--fg-muted)]">
                  {item.marca ? `${item.marca} · ` : ""}
                  {item.descripcion}
                </span>
                <CampoCantidad
                  item={item}
                  valor={cantidades[item.producto_id] ?? item.cantidad}
                  onCambiar={(v) => ponerCantidad(item.producto_id, v)}
                />
              </li>
            ))}
          </ul>

          <h2 className="mb-1 text-sm font-semibold">A quién se le pide</h2>
          <p className="mb-3 text-xs text-[var(--fg-subtle)]">
            A cada uno le llega la lista completa, con los {items.length}{" "}
            {items.length === 1 ? "producto" : "productos"}.
          </p>

          <ListaProveedores
            proveedores={proveedores}
            marcados={seleccion[items[0]?.producto_id ?? ""] ?? []}
            onAlternar={(id) => alternar(id)}
            totalItems={items.length}
            vacio="Todavía no consta que nadie venda estos productos. Búscalos aquí abajo."
          />

          <AnadirProveedor
            yaEstan={yaEstan}
            onAnadir={(p) => {
              setProveedores((previos) => [...previos, p]);
              alternar(p.id);
            }}
          />
        </section>
      )}

      {huerfanos.length > 0 ? (
        <div className="rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3">
          <p className="text-sm">
            <strong>
              {huerfanos.length === 1
                ? "Un producto no se le va a preguntar a nadie"
                : `${huerfanos.length} productos no se le van a preguntar a nadie`}
            </strong>
            : <strong>{huerfanos.map((h) => h.codigo).join(", ")}</strong>.{" "}
            {sinDecidir.length > 0
              ? huerfanos.length === 1
                ? "Márcale proveedor arriba, o búscalo con «Preguntarle a alguien más». Si no, no entra en la ronda y se queda sin precio."
                : "Márcales proveedor arriba, o búscalos con «Preguntarle a alguien más». Si no, no entran en la ronda y se quedan sin precio."
              : huerfanos.length === 1
                ? "Queda fuera de la ronda. Se le puede pedir precio en otra."
                : "Quedan fuera de la ronda. Se les puede pedir precio en otra."}
          </p>

          {sinDecidir.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              onClick={() => setDejarFuera(huerfanos.map((h) => h.producto_id))}
            >
              No hay a quién preguntarle: seguir sin{" "}
              {sinDecidir.length === 1 ? "él" : "ellos"}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              onClick={() => setDejarFuera([])}
            >
              {huerfanos.length === 1 ? "Mejor le busco proveedor" : "Mejor les busco proveedor"}
            </Button>
          )}
        </div>
      ) : null}

      {/* ----------------------------------------------------------- Guardar */}
      <section className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="text-sm">
          <p className="font-medium">¿Vas a esperar respuesta?</p>
          <p className="text-[var(--fg-muted)]">
            {cuantos === 0
              ? "Primero marca a quién le vas a preguntar."
              : sinDecidir.length > 0
                ? sinDecidir.length === 1
                  ? "Resuelve antes lo de arriba: hay un producto sin nadie a quien preguntarle."
                  : "Resuelve antes lo de arriba: hay productos sin nadie a quien preguntarle."
                : `Entran ${entran} ${entran === 1 ? "producto" : "productos"} y ${cuantos} ${cuantos === 1 ? "proveedor" : "proveedores"}. Tendrás dónde apuntar lo que te diga cada uno y ver quién sale más barato.`}
          </p>
        </div>
        <Button
          type="button"
          onClick={guardarRonda}
          disabled={abriendo || cuantos === 0 || sinDecidir.length > 0}
          className="gap-1.5"
        >
          <ClipboardList className="size-4" aria-hidden="true" />
          {abriendo
            ? "Guardando…"
            : `Anotar la consulta a ${cuantos} ${cuantos === 1 ? "proveedor" : "proveedores"}`}
        </Button>
      </section>

      {aviso ? (
        <p
          role="alert"
          className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm"
        >
          {aviso}
        </p>
      ) : null}

      {/*
          Se dice lo que esta pantalla NO hace, porque su nombre promete más.

          «Pedir precio» suena a que va a preguntar. Lo que hace es apuntar a
          quién vas a preguntar, para tener dónde anotar las respuestas y poder
          compararlas después.
      */}
      <p className="text-sm text-[var(--fg-subtle)]">
        Aquí no se manda nada: preguntas tú como siempre, y esto te guarda la
        ronda para anotar lo que te diga cada uno.
      </p>

    </div>
  );
}

function OpcionModo({
  activa,
  onElegir,
  titulo,
  detalle,
}: {
  activa: boolean;
  onElegir: () => void;
  titulo: string;
  detalle: string;
}) {
  return (
    <button
      type="button"
      onClick={onElegir}
      aria-pressed={activa}
      className={`rounded-md border p-3 text-left transition-colors ${
        activa
          ? "border-brand-600 bg-brand-50 dark:bg-brand-950"
          : "border-[var(--border)] hover:bg-[var(--surface-2)]"
      }`}
    >
      <span className="block text-sm font-medium">{titulo}</span>
      <span className="mt-0.5 block text-xs text-[var(--fg-muted)]">{detalle}</span>
    </button>
  );
}

function ListaProveedores({
  proveedores,
  marcados,
  onAlternar,
  totalItems,
  vacio,
}: {
  proveedores: ProveedorParaPedir[];
  marcados: readonly string[];
  onAlternar: (id: string) => void;
  /** Solo en modo junto: para decir «vende 2 de 3». */
  totalItems?: number;
  vacio: string;
}) {
  if (proveedores.length === 0) {
    return <p className="text-sm text-[var(--fg-muted)]">{vacio}</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
      {proveedores.map((p) => (
        <li key={p.id}>
          <label className="flex cursor-pointer items-start gap-3 py-2.5">
            <input
              type="checkbox"
              checked={marcados.includes(p.id)}
              onChange={() => onAlternar(p.id)}
              className="mt-1 size-4"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{p.razon_social}</span>
              <span className="block text-xs text-[var(--fg-subtle)]">
                {totalItems !== undefined
                  ? `vende ${p.coincidencias} de ${totalItems}`
                  : p.coincidencias > 0
                    ? `se le compró ${p.coincidencias} ${p.coincidencias === 1 ? "vez" : "veces"}`
                    : "sin compras todavía"}
                {p.ultimoCostoUsd !== null
                  ? ` · la última vez, $ ${p.ultimoCostoUsd.toFixed(2)}`
                  : ""}
              </span>
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

/**
 * La cantidad por la que se pregunta.
 *
 * Es parte de la pregunta, no un dato de paso: el precio de 5 y el de 50 no
 * son el mismo, y en este oficio se negocia por volumen. Viniendo de la ficha
 * de un producto no hay ninguna cantidad natural, así que la pone quien
 * pregunta.
 */
function CampoCantidad({
  item,
  valor,
  onCambiar,
}: {
  item: ItemPedido;
  valor: number;
  onCambiar: (v: number) => void;
}) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <Input
        type="number"
        min={1}
        step="any"
        value={valor}
        onChange={(e) => onCambiar(Number(e.target.value))}
        className="h-9 w-20 text-right tabular"
        aria-label={`Cantidad de ${item.codigo}`}
      />
      <span className="text-sm text-[var(--fg-muted)]">{item.unidad}</span>
    </span>
  );
}
