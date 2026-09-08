"use client";

import { useState, useTransition } from "react";
import {
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  SelectNativo,
} from "@rodatech/ui";

import { historialDe, sustitutosPara, type Sustituto, type VentaAnterior } from "../../acciones/buscar";
import type { Accion, LineaConstructor } from "../../dominio/constructor";
import { revisionDe } from "../../dominio/constructor";
import {
  DIAS_POR_DEFECTO,
  DISPONIBILIDADES,
  ETIQUETA_DISPONIBILIDAD,
  prometeDeMas,
  type Disponibilidad,
} from "../../dominio/disponibilidad";
import { importeLinea } from "../../dominio/totales";

/**
 * Una línea de la cotización.
 *
 * Concentra la negociación, que es donde Willy pierde o gana el margen:
 *
 *   - El precio y el descuento se pueden bajar libremente, pero el piso se
 *     pinta EN VIVO. Impedir la tecla obliga a adivinar dónde está el límite;
 *     verlo se lo enseña.
 *   - Cuando la línea rompe el piso se dice cuánto falta y cuál es el descuento
 *     máximo que sí cabe. Un "no puedes" sin número no sirve para negociar.
 *   - Si no hay stock, se ofrecen sustitutos ahí mismo (49:56).
 *   - El histórico dice a cuánto se le vendió ANTES a este cliente.
 */

const dolar = (n: number) =>
  n.toLocaleString("es-PE", { style: "currency", currency: "USD" });

export function FilaLinea({
  linea,
  indice,
  total,
  clienteId,
  mostrarDescuento,
  despachar,
}: {
  linea: LineaConstructor;
  indice: number;
  total: number;
  clienteId: string | null;
  mostrarDescuento: boolean;
  despachar: (a: Accion) => void;
}) {
  const [panel, setPanel] = useState<"ninguno" | "sustitutos" | "historial">("ninguno");
  const [sustitutos, setSustitutos] = useState<Sustituto[]>([]);
  const [historial, setHistorial] = useState<VentaAnterior[]>([]);
  const [cargando, iniciar] = useTransition();

  const revision = revisionDe(linea);
  const importe = importeLinea({
    cantidad: linea.cantidad,
    valorUnitario: linea.valorUnitario,
    descuentoPct: linea.descuentoPct,
  });
  const noAlcanza = linea.productoId !== null && linea.stock < linea.cantidad;
  // «Sin stock» y «no alcanza» no son lo mismo, y decirlo mal cambia la
  // decisión: con 20 de 30 se vende lo que hay y se compra el resto; con 0 hay
  // que salir a buscarlo entero. La pantalla ponía «sin stock» en los dos.
  const sinNada = noAlcanza && linea.stock <= 0;

  // Abren siempre, sin alternar. El toggle tenía sentido cuando el botón era
  // el mismo enlace que abría y cerraba el panel de debajo; con un diálogo se
  // cierra con la equis o con Escape, y un botón que a veces no hace nada
  // visible se siente roto.
  const abrirSustitutos = () => {
    setPanel("sustitutos");
    if (sustitutos.length > 0 || !linea.productoId) return;
    iniciar(async () => {
      const r = await sustitutosPara(linea.productoId as string);
      if (r.ok) setSustitutos(r.datos);
    });
  };

  /*
    Cuántas ventas se han pedido. Willy quiso cinco y un «ver más» (50:01).

    Se guarda el NÚMERO y no un booleano de «ya pedí más» porque el panel se
    cierra y se vuelve a abrir mientras se cotiza, y quien ya desplegó las 25
    no quiere que se le vuelvan a esconder.
  */
  const [cuantasVentas, setCuantasVentas] = useState(5);

  const traerHistorial = (limite: number) => {
    if (!linea.productoId) return;
    setCuantasVentas(limite);
    iniciar(async () => {
      const r = await historialDe(linea.productoId as string, clienteId, limite);
      if (r.ok) setHistorial(r.datos);
    });
  };

  const abrirHistorial = () => {
    setPanel("historial");
    if (historial.length > 0 || !linea.productoId) return;
    traerHistorial(cuantasVentas);
  };

  return (
    <>
      <tr className={revision.ok ? "" : "bg-[var(--danger-bg)]"}>
        <td className="tabular text-[var(--fg-muted)]">{indice + 1}</td>

        {/*
          El stock, como DATO y no como puerta.

          Era un enlace subrayado en ámbar de 12 px —«sin stock · ver
          alternativas»— y hacía dos trabajos a la vez: avisar y ser el único
          camino a las alternativas. Los dos mal. Willy no lo veía, y con
          stock suficiente el enlace no salía, así que no había forma de
          mirar una equivalencia por precio o por marca aunque se quisiera.

          Ahora esto solo informa. Las alternativas son un botón de la
          columna de acciones, y están siempre.
        */}
        <td>
          <div className="font-medium">{linea.codigo}</div>
          <span
            className={`text-sm ${noAlcanza ? "font-medium text-[var(--warn)]" : "text-[var(--fg-muted)]"}`}
          >
            {sinNada
              ? "sin stock"
              : noAlcanza
                ? `solo ${linea.stock}`
                : `stock ${linea.stock}`}
          </span>
        </td>

        {/* C2: la marca en columna propia. */}
        <td className="text-sm">{linea.marca ?? "—"}</td>

        {/* C3: la descripción no repite el código. */}
        <td className="text-sm">{linea.descripcion}</td>

        <td className="w-24">
          <Input
            type="number"
            min={0}
            step="any"
            value={linea.cantidad}
            onChange={(e) =>
              despachar({ tipo: "cantidad", key: linea.key, valor: Number(e.target.value) })
            }
            className="text-right tabular"
            aria-label={`Cantidad de ${linea.codigo}`}
          />
        </td>

        <td className="text-xs text-[var(--fg-muted)]">{linea.unidad}</td>

        {/*
          Cuándo se puede entregar (040).

          Esta columna se ve SIEMPRE, a diferencia de la del descuento, que
          aparece solo si se activa. No es una incoherencia: la casilla de la
          cabecera decide si la columna se IMPRIME, no si el dato existe. Y el
          dato hace falta aunque no se imprima, porque es de donde va a salir
          la bandeja «Por comprar»: lo que no es inmediato hay que pedirlo.
        */}
        <td className="w-40">
          <SelectNativo
            value={linea.disponibilidad}
            onChange={(e) =>
              despachar({
                tipo: "disponibilidad",
                key: linea.key,
                // El `as` es honesto: las opciones del select SON el enum.
                valor: e.target.value as Disponibilidad,
              })
            }
            className="h-control-sm text-xs"
            aria-label={`Disponibilidad de ${linea.codigo}`}
          >
            {DISPONIBILIDADES.map((d) => (
              <option key={d} value={d}>
                {ETIQUETA_DISPONIBILIDAD[d]}
              </option>
            ))}
          </SelectNativo>

          {linea.disponibilidad !== "inmediata" ? (
            <div className="mt-1 flex items-center gap-1">
              <Input
                type="number"
                min={1}
                max={365}
                step="1"
                value={linea.diasEntrega ?? ""}
                onChange={(e) =>
                  despachar({
                    tipo: "diasEntrega",
                    key: linea.key,
                    // Vaciar la caja vuelve al plazo habitual, no a cero.
                    valor: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                placeholder={String(DIAS_POR_DEFECTO[linea.disponibilidad] ?? "")}
                className="h-control-sm w-14 text-right tabular text-xs"
                aria-label={`Días de entrega de ${linea.codigo}`}
              />
              <span className="text-xs text-[var(--fg-muted)]">días</span>
            </div>
          ) : null}

          {/* Prometer «inmediata» sin stock no se bloquea —Willy consigue en
              el día casi todo lo que no tiene— pero sí se dice: lo que salga
              en esa columna es una promesa impresa. */}
          {prometeDeMas(linea.disponibilidad, linea.cantidad, linea.stock) ? (
            <span className="mt-1 block text-xs text-[var(--warn)]">
              {sinNada
                ? "sin stock para prometer entrega inmediata"
                : `solo hay ${linea.stock} para prometer entrega inmediata`}
            </span>
          ) : null}
        </td>

        {/* C1: SOLO valor unitario. La columna "precio unitario" (valor x 1.18)
            desaparece del modelo, no solo del PDF: es la que le hizo perder
            ventas porque el cliente comparaba con IGV contra la competencia. */}
        <td className="w-28">
          <Input
            type="number"
            min={0}
            step="0.0001"
            value={linea.valorUnitario}
            onChange={(e) =>
              despachar({ tipo: "precio", key: linea.key, valor: Number(e.target.value) })
            }
            className={`text-right tabular ${revision.ok ? "" : "border-[var(--danger)]"}`}
            aria-label={`Valor unitario de ${linea.codigo}`}
          />
          {linea.valorUnitario !== linea.precioLista ? (
            <button
              type="button"
              onClick={() => despachar({ tipo: "volverALista", key: linea.key })}
              className="mt-0.5 block text-sm text-[var(--fg-muted)] underline"
              title={`Lista: ${dolar(linea.precioLista)}`}
            >
              volver a {dolar(linea.precioLista)}
            </button>
          ) : null}

        </td>

        {mostrarDescuento ? (
          <td className="w-24">
            <Input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={linea.descuentoPct}
              onChange={(e) =>
                despachar({ tipo: "descuento", key: linea.key, valor: Number(e.target.value) })
              }
              className={`text-right tabular ${revision.ok ? "" : "border-[var(--danger)]"}`}
              aria-label={`Descuento de ${linea.codigo}`}
            />
            {revision.descuentoMaximoPct !== null && revision.ok ? (
              <span className="mt-0.5 block text-xs text-[var(--fg-muted)]">
                máx. {revision.descuentoMaximoPct}%
              </span>
            ) : null}
          </td>
        ) : null}

        <td className="text-right tabular font-medium">{dolar(importe)}</td>

        <td>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => despachar({ tipo: "mover", key: linea.key, direccion: -1 })}
              disabled={indice === 0}
              className="flex size-8 items-center justify-center rounded-sm text-[var(--fg-muted)] hover:bg-[var(--surface-2)] disabled:opacity-30"
              aria-label="Subir"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => despachar({ tipo: "mover", key: linea.key, direccion: 1 })}
              disabled={indice === total - 1}
              className="flex size-8 items-center justify-center rounded-sm text-[var(--fg-muted)] hover:bg-[var(--surface-2)] disabled:opacity-30"
              aria-label="Bajar"
            >
              ↓
            </button>

            {/*
              Los tres que importan, como BOTONES.

              Las dos primeras cosas ya estaban y no se veían: las
              alternativas detrás de un enlace ámbar de 12 px que solo salía
              sin stock, y las ventas anteriores detrás de otro enlace —antes
              incluso detrás de un «hist.» apretado entre estas dos flechas—.

              Willy, 47:00, tecleando un precio: *«¿no te muestra una
              referencia de a quién se ha vendido, a cuánto se ha vendido?»*.
              La respuesta era que sí, y no había manera de que lo supiera.

              Luis, 08/09, sobre su prototipo: *«más ordenado, más entendible
              para Willy, con botones modales, así no rompemos nada»*.
            */}
            <BotonAccion
              onClick={abrirSustitutos}
              etiqueta="Alternativas"
              titulo={`Ver alternativas de ${linea.codigo}`}
              deshabilitado={!linea.productoId}
            >
              <IconoCambio />
            </BotonAccion>

            <BotonAccion
              onClick={abrirHistorial}
              etiqueta="Ventas"
              titulo={`Ventas anteriores de ${linea.codigo}`}
              deshabilitado={!linea.productoId}
            >
              <IconoReloj />
            </BotonAccion>

            <BotonAccion
              onClick={() => despachar({ tipo: "quitar", key: linea.key })}
              etiqueta="Quitar"
              titulo={`Quitar ${linea.codigo}`}
              peligro
            >
              <IconoPapelera />
            </BotonAccion>
          </div>
        </td>
      </tr>

      {/* Aviso del piso: con el número que hace falta, no un "no puedes". */}
      {!revision.ok ? (
        <tr className="bg-[var(--danger-bg)]">
          <td />
          <td colSpan={mostrarDescuento ? 8 : 7} className="pb-2 text-sm">
            <span className="font-medium text-[var(--danger)]">
              {dolar(revision.precioNeto)} queda bajo el mínimo de{" "}
              {dolar(revision.piso)}
            </span>{" "}
            — faltan {dolar(revision.faltantePorUnidad)} por unidad (
            {dolar(revision.faltanteEnLinea)} en la línea).{" "}
            {linea.descuentoPct > 0 && revision.descuentoMaximoPct !== null ? (
              <>Con este precio el descuento máximo es {revision.descuentoMaximoPct}%. </>
            ) : null}
            {revision.valorUnitarioMinimo !== null && linea.descuentoPct > 0 ? (
              <>
                Con {linea.descuentoPct}% de descuento no bajes de{" "}
                {dolar(revision.valorUnitarioMinimo)}.{" "}
              </>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => despachar({ tipo: "bajarAlPiso", key: linea.key })}
            >
              Dejar en el mínimo
            </Button>
          </td>
        </tr>
      ) : null}

      {/*
        En diálogo, no como fila desplegada dentro de la tabla.

        Una fila que se abre empuja hacia abajo todo lo que hay debajo: al
        cerrarla, el precio que se estaba tecleando ha cambiado de sitio y hay
        que volver a buscarlo. En una cotización de seis líneas eso pasa
        constantemente, y es justo mientras se negocia.

        El diálogo tampoco tiene que caber en el ancho de una celda, así que
        las alternativas se leen con su precio y su stock al lado — que es
        para lo que se abren.

        Van FUERA del `<tr>`: un diálogo montado dentro de una fila hereda el
        `display: table-row` del contexto y se pinta donde no debe.
      */}
      <Dialog
        open={panel === "sustitutos"}
        onOpenChange={(v) => setPanel(v ? "sustitutos" : "ninguno")}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Alternativas de {linea.codigo}</DialogTitle>
            <DialogDescription>
              Productos que entran en el mismo sitio. La que conviene es la que
              tiene stock y mejor precio.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <PanelSustitutos
              cargando={cargando}
              sustitutos={sustitutos}
              onElegir={(p) => {
                despachar({ tipo: "sustituir", key: linea.key, producto: p });
                setPanel("ninguno");
              }}
            />
          </DialogBody>
        </DialogContent>
      </Dialog>

      <Dialog
        open={panel === "historial"}
        onOpenChange={(v) => setPanel(v ? "historial" : "ninguno")}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Ventas anteriores · {linea.codigo}</DialogTitle>
            <DialogDescription>
              {clienteId
                ? "Lo que ya se le vendió a este cliente, y a cuánto."
                : "Elige un cliente para ver lo que se le vendió a él; por ahora sale de todos."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <PanelHistorial
              cargando={cargando}
              ventas={historial}
              pedidas={cuantasVentas}
              onVerMas={() => traerHistorial(25)}
            />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Un botón de la columna de acciones.
 *
 * Con texto desde `xl`, y solo icono por debajo. No es un capricho de
 * responsive: la fila ya lleva código, marca, descripción, cantidad, entrega,
 * precio, descuento e importe, y tres botones con texto no caben en un
 * portátil sin comerse la descripción — que es lo que se lee para saber qué
 * línea es.
 *
 * El icono nunca va solo del todo: `title` y `aria-label` llevan la frase
 * entera con el código dentro, así que al pasar por encima se lee «Ver
 * alternativas de 6309».
 */
function BotonAccion({
  onClick,
  etiqueta,
  titulo,
  children,
  deshabilitado,
  peligro,
}: {
  onClick: () => void;
  etiqueta: string;
  titulo: string;
  children: React.ReactNode;
  deshabilitado?: boolean;
  peligro?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      title={titulo}
      aria-label={titulo}
      className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        peligro
          ? "border-[var(--border)] text-[var(--danger)] hover:bg-[var(--danger-bg)]"
          : "border-[var(--border)] text-[var(--fg)] hover:bg-[var(--surface-2)]"
      }`}
    >
      {children}
      <span className="hidden xl:inline">{etiqueta}</span>
    </button>
  );
}

function IconoCambio() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 shrink-0"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7h13l-3-3M21 17H8l3 3" />
    </svg>
  );
}

function IconoReloj() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 shrink-0"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function IconoPapelera() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 shrink-0"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
    </svg>
  );
}

/*
  Solo quedan dos, y los dos afirman que la pieza ENTRA (061).

  «Mismo tipo» y «misma subfamilia» se fueron: la serie 60 junta al 6307 con
  el 6309 y no son intercambiables. Willy, 07/09: *«el número básico ya te
  define las tres medidas principales del rodamiento»*.
*/
const ETIQUETA_ORIGEN: Record<Sustituto["origen"], string> = {
  equivalencia: "equivalente registrado",
  mismo_basico: "misma medida",
};

function PanelSustitutos({
  cargando,
  sustitutos,
  onElegir,
}: {
  cargando: boolean;
  sustitutos: Sustituto[];
  onElegir: (p: Sustituto) => void;
}) {
  if (cargando) {
    return <p className="text-sm text-[var(--fg-muted)]">Buscando alternativas…</p>;
  }
  if (sustitutos.length === 0) {
    return (
      <p className="text-sm text-[var(--fg-muted)]">
        No hay alternativas para este producto.
      </p>
    );
  }

  /*
    Una tabla con un botón por fila, y no una fila que ES un botón.

    Era lo segundo: cada alternativa era un `<button>` entero, sin nada que
    dijera que se podía pulsar. Es exactamente lo que Luis lleva repitiendo
    desde el principio y lo que CLAUDE.md prohíbe en la primera página —*«una
    persona que no sabe que tiene que darle click ahí»*, y las celdas
    pulsables no valen—. Yo mismo lo dejé así al mover esto a un diálogo el
    08/09, mirando los botones de la fila y no los de dentro.

    Ahora hay columnas con encabezado y un «Usar esta» por alternativa, que
    es lo que hay en el prototipo de Luis.
  */
  return (
    <div className="scroll-x">
      <table className="w-full text-sm">
        <thead className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
          <tr>
            <th className="py-2 pr-3 font-medium">Código</th>
            <th className="px-3 py-2 font-medium">Descripción</th>
            <th className="px-3 py-2 text-right font-medium">Precio</th>
            <th className="px-3 py-2 text-right font-medium">Stock</th>
            <th className="py-2 pl-3 text-right font-medium">Acción</th>
          </tr>
        </thead>
        <tbody>
          {sustitutos.map((s) => (
            <tr
              key={s.id}
              className={`border-b border-[var(--border-soft)] last:border-0 ${
                s.mejor_oferta ? "bg-[var(--ok-bg)]" : ""
              }`}
            >
              <td className="py-2.5 pr-3 align-top">
                <span className="block font-medium">{s.codigo}</span>
                <span className="block text-xs text-[var(--fg-subtle)]">{s.marca}</span>
              </td>

              {/*
                La descripción, que es por lo que se elige. Entera, no
                recortada: en un diálogo cabe.

                Willy, 08:04, leyendo la lista del 6309: *«el primero es un
                rodamiento sin sellos; el siguiente también sin sellos, pero
                con juego radial C4; el tercero con sellos de metal y juego
                C3; el cuarto con sellos de goma y juego C3. En función a eso
                yo ya veo»*. La pantalla enseñaba código, marca y precio —
                todo menos lo que él mira.
              */}
              <td className="px-3 py-2.5 align-top">
                <span className="block">{s.descripcion}</span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {/*
                    El origen, solo cuando dice algo que el código no.

                    «Misma medida» se deduce del propio código —los cuatro
                    empiezan por 6309—, así que repetirlo es ruido. Que
                    alguien de la casa la haya DECLARADO sí informa: sabe algo
                    que el catálogo no.
                  */}
                  {s.origen === "equivalencia" ? (
                    <Badge tone="neutral" size="xs">
                      {ETIQUETA_ORIGEN[s.origen]}
                    </Badge>
                  ) : null}
                  {s.mejor_oferta ? (
                    <Badge tone="success" size="xs">la que conviene</Badge>
                  ) : null}
                </span>
              </td>

              <td className="whitespace-nowrap px-3 py-2.5 text-right align-top">
                <span className="block tabular font-medium">{dolar(s.precio_venta)}</span>
                {s.diferencia_pct !== 0 ? (
                  <span
                    className={`block text-xs tabular ${
                      s.diferencia_pct < 0 ? "text-[var(--ok)]" : "text-[var(--fg-muted)]"
                    }`}
                  >
                    {s.diferencia_pct > 0 ? "+" : ""}
                    {s.diferencia_pct}%
                  </span>
                ) : null}
              </td>

              {/* «Sin stock» con palabras y en rojo, no un 0 que se confunde
                  con cualquier otra cifra de la columna. */}
              <td className="whitespace-nowrap px-3 py-2.5 text-right align-top">
                {(s.stock ?? 0) > 0 ? (
                  <span className="tabular">{s.stock}</span>
                ) : (
                  <span className="font-medium text-[var(--danger)]">Sin stock</span>
                )}
              </td>

              <td className="py-2.5 pl-3 text-right align-top">
                <button
                  type="button"
                  onClick={() => onElegir(s)}
                  className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-sm font-medium transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
                >
                  <IconoUsar />
                  Usar esta
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IconoUsar() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 shrink-0"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  );
}

function PanelHistorial({
  cargando,
  ventas,
  pedidas,
  onVerMas,
}: {
  cargando: boolean;
  ventas: VentaAnterior[];
  /** Cuántas se pidieron. Si llegaron menos, ya no hay más que ver. */
  pedidas: number;
  onVerMas: () => void;
}) {
  if (cargando) {
    return <p className="text-sm text-[var(--fg-muted)]">Cargando histórico…</p>;
  }
  if (ventas.length === 0) {
    return (
      <p className="text-sm text-[var(--fg-muted)]">
        Este producto todavía no se ha facturado.
      </p>
    );
  }

  return (
    // El título lo pone el diálogo, con el código y el cliente.
    <div>
      <div className="flex flex-col gap-0.5 text-sm">
        {ventas.map((v, i) => (
          <div
            key={`${v.documento}-${i}`}
            className={`flex items-center gap-3 rounded-sm px-1.5 py-1 ${
              v.mismo_cliente ? "bg-[var(--info-bg)]" : ""
            }`}
          >
            <span className="w-24 shrink-0 tabular text-sm text-[var(--fg-muted)]">
              {v.fecha}
            </span>
            <span className="w-28 shrink-0 text-sm">{v.documento}</span>
            <span className="flex-1 truncate text-sm">{v.cliente}</span>
            {v.mismo_cliente ? (
              <Badge tone="info" size="xs">
                este cliente
              </Badge>
            ) : null}
            <span className="w-16 text-right tabular text-sm">×{v.cantidad}</span>
            <span className="w-20 text-right tabular font-medium">
              {dolar(v.valor_unitario)}
            </span>
          </div>
        ))}
      </div>

      {/*
        «Ver más», solo cuando de verdad puede haber más.

        Si se pidieron cinco y llegaron cuatro, no hay una sexta venta
        escondida: el botón prometería algo que no existe.
      */}
      {ventas.length >= pedidas && pedidas < 25 ? (
        <button
          type="button"
          onClick={onVerMas}
          className="mt-1.5 text-sm text-brand-600 underline"
        >
          Ver más ventas
        </button>
      ) : null}
    </div>
  );
}
