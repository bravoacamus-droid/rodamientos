"use client";

// Cliente: se elige a quién se le pregunta qué, y el mensaje de cada uno se
// rehace al vuelo. Los enlaces los abre el navegador — el servidor no manda
// nada, y eso es deliberado.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, SelectNativo } from "@rodatech/ui";
import { ClipboardList, Copy, Mail, MessageCircle } from "lucide-react";

// Por la ruta profunda: el índice de `mensajes` reexporta su `api/`, que es
// `server-only`, y esto es un componente de cliente.
import { canalesDisponibles, enlaceCorreo, enlaceWhatsapp } from "@/modules/mensajes/dominio/enlaces";
import {
  ETIQUETA_CANAL,
  listaDeItems,
  renderizar,
  type Plantilla,
} from "@/modules/mensajes/dominio/plantillas";
import type { ProveedorParaPedir } from "@/modules/proveedores/dominio/pedir";

import { abrirRonda } from "../../acciones/comparar";
import {
  aPayloadDeConsulta,
  cuantosProveedores,
  gruposDeEnvio,
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
 * **No manda nada solo.** Cada botón abre WhatsApp o el correo con el texto ya
 * escrito y la persona pulsa enviar.
 */
export function PedirPrecio({
  items,
  proveedores: sugeridos,
  porProducto,
  plantillas,
  empresa,
  yo,
  hoy,
}: {
  items: ItemPedido[];
  /** Los que venden algo de la lista, con cuántos de ella cubren. */
  proveedores: ProveedorParaPedir[];
  /** Y quién vende cada uno por separado. */
  porProducto: Record<string, ProveedorParaPedir[]>;
  plantillas: Plantilla[];
  empresa: string;
  yo: string;
  hoy: string;
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

  const [plantillaId, setPlantillaId] = React.useState(plantillas[0]?.id ?? "");
  const [copiado, setCopiado] = React.useState<string | null>(null);
  const [abriendo, empezarRonda] = React.useTransition();
  const [aviso, setAviso] = React.useState<string | null>(null);

  const plantilla = plantillas.find((p) => p.id === plantillaId) ?? plantillas[0];

  const grupos = React.useMemo(
    () => gruposDeEnvio(items, seleccion, proveedores),
    [items, seleccion, proveedores],
  );
  const huerfanos = React.useMemo(() => sinNadie(items, seleccion), [items, seleccion]);
  const cuantos = cuantosProveedores(seleccion);

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

  const textoPara = (proveedor: string, suyos: ItemPedido[]) =>
    plantilla
      ? renderizar(plantilla.cuerpo, {
          proveedor,
          items: listaDeItems(suyos),
          empresa,
          yo,
          fecha: hoy,
        })
      : "";

  const asuntoPara = (proveedor: string) =>
    plantilla?.asunto
      ? renderizar(plantilla.asunto, { proveedor, empresa, yo, fecha: hoy })
      : `Solicitud de cotización · ${empresa}`;

  const copiar = async (id: string, texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(id);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      // Sin permiso de portapapeles no se rompe nada: el texto está a la
      // vista y se puede seleccionar a mano.
      setCopiado(null);
    }
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
          items,
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

  if (plantillas.length === 0) {
    return (
      <p className="rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm">
        No hay ningún mensaje escrito para pedir precios.{" "}
        <Link href="/configuracion" className="font-medium underline">
          Escribe el primero en Configuración
        </Link>
        .
      </p>
    );
  }

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

      {/* --------------------------------------------------- Con qué texto */}
      <section className="card p-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Con qué mensaje</span>
          <SelectNativo
            value={plantillaId}
            onChange={(e) => setPlantillaId(e.target.value)}
            className="h-11 md:h-control-md"
          >
            {plantillas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} · {ETIQUETA_CANAL[p.canal]}
              </option>
            ))}
          </SelectNativo>
          <span className="text-xs text-[var(--fg-subtle)]">
            Se corrigen en{" "}
            <Link href="/configuracion" className="underline">
              Configuración
            </Link>
            .
          </span>
        </label>
      </section>

      {/* ------------------------------------------------ A quién, por producto */}
      {modo === "separado" ? (
        items.map((item) => (
          <section key={item.producto_id} className="card p-4">
            <div className="mb-3 flex flex-wrap items-baseline gap-2 border-b border-[var(--border-soft)] pb-2">
              <span className="font-mono text-sm font-semibold">{item.codigo}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--fg-muted)]">
                {item.marca ? `${item.marca} · ` : ""}
                {item.descripcion}
              </span>
              <span className="tabular text-sm">
                {item.cantidad} {item.unidad}
              </span>
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
          <h2 className="mb-1 text-sm font-semibold">A quién se le pide</h2>
          <p className="mb-3 text-xs text-[var(--fg-subtle)]">
            A cada uno le llega la lista completa, con los {items.length} productos.
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
        <p className="rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm">
          <strong>
            {huerfanos.length === 1
              ? "Un producto no se le va a preguntar a nadie"
              : `${huerfanos.length} productos no se le van a preguntar a nadie`}
          </strong>
          : {huerfanos.map((h) => h.codigo).join(", ")}. Búscales proveedor o se
          quedan sin precio.
        </p>
      ) : null}

      {/* ------------------------------------------- Lo que le llega a cada uno */}
      {grupos.length > 0 ? (
        <section className="card p-4">
          <h2 className="mb-1 text-sm font-semibold">Lo que le llega a cada uno</h2>
          <p className="mb-3 text-xs text-[var(--fg-subtle)]">
            {grupos.length === 1
              ? "Un mensaje."
              : `${grupos.length} mensajes, uno por proveedor.`}{" "}
            Se abre WhatsApp con el texto escrito y lo mandas tú.
          </p>

          <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
            {grupos.map((g) => {
              const proveedor = proveedores.find((p) => p.id === g.proveedor.id);
              if (!proveedor) return null;
              const canales = canalesDisponibles(proveedor);
              const texto = textoPara(g.proveedor.razon_social, g.items);
              const wa = enlaceWhatsapp(proveedor.whatsapp ?? proveedor.telefono, texto);
              const correo = enlaceCorreo(
                proveedor.email,
                asuntoPara(g.proveedor.razon_social),
                texto,
              );

              return (
                <li key={g.proveedor.id} className="flex flex-col gap-2 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link
                      href={`/proveedores/${g.proveedor.id}`}
                      className="text-sm font-medium text-brand-600 hover:underline"
                    >
                      {g.proveedor.razon_social}
                    </Link>
                    <span className="text-xs text-[var(--fg-subtle)]">
                      {g.items.length === 1
                        ? g.items[0]?.codigo
                        : `${g.items.length} productos`}
                    </span>
                  </div>

                  {!canales.whatsapp && !canales.correo ? (
                    <span className="text-xs text-[var(--warn)]">
                      No tiene WhatsApp ni correo en su ficha. Puedes copiar el
                      texto, o{" "}
                      <Link href={`/proveedores/${g.proveedor.id}/editar`} className="underline">
                        ponerle el número
                      </Link>
                      .
                    </span>
                  ) : null}

                  <p className="whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
                    {texto}
                  </p>

                  <div className="flex flex-wrap items-center gap-2">
                    {wa ? (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-9 items-center gap-1.5 rounded-sm bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
                      >
                        <MessageCircle className="size-4" aria-hidden="true" />
                        WhatsApp
                      </a>
                    ) : null}
                    {correo ? (
                      <a
                        href={correo}
                        className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-[var(--border-strong)] px-3 text-sm font-medium hover:bg-[var(--surface-2)]"
                      >
                        <Mail className="size-4" aria-hidden="true" />
                        Correo
                      </a>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9"
                      onClick={() => void copiar(g.proveedor.id, texto)}
                    >
                      <Copy aria-hidden="true" />
                      {copiado === g.proveedor.id ? "Copiado" : "Copiar"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* ----------------------------------------------------------- Guardar */}
      <section className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="text-sm">
          <p className="font-medium">¿Vas a esperar respuesta?</p>
          <p className="text-xs text-[var(--fg-subtle)]">
            Guarda la consulta y tendrás dónde apuntar lo que te diga cada uno,
            ver quién sale más barato y convertirlo en compras.
          </p>
        </div>
        <Button
          type="button"
          onClick={guardarRonda}
          disabled={abriendo || cuantos === 0}
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

      <p className="text-xs text-[var(--fg-subtle)]">
        <strong>Nada sale solo</strong>: no hay envío automático, ni falta.
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
