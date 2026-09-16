"use client";

import { useActionState, useEffect, useMemo, useReducer, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, SelectNativo, Table, TableContenedor, TBody, Textarea, THead } from "@rodatech/ui";

import {
  actualizarCotizacion,
  crearCotizacion,
  type ResultadoCreacion,
  type ResultadoEdicion,
} from "../../acciones/crear";
import type { ClienteOpcion } from "../../dominio/cliente";
import {
  aPayload,
  bloqueos as calcularBloqueos,
  ENTREGAS,
  estadoInicial,
  reducir,
  totalesDe,
  type EstadoConstructor,
} from "../../dominio/constructor";
import {
  entregaDelDocumento,
  entregaPrometeSinRespaldo,
  entregaSeContradice,
} from "../../dominio/disponibilidad";
import { marcasConocidas } from "@/modules/productos/acciones/alta-rapida";

import { AltaProducto } from "./alta-producto";
import { BuscadorLineas } from "./buscador";
import { BuscadorClientes } from "./buscador-clientes";
import { SelectorContacto } from "./selector-contacto";
import { FilaLinea } from "./linea";
import { ResumenConstructor } from "./resumen";

/**
 * Constructor de cotizaciones.
 *
 * Todo el estado vive en `dominio/constructor.ts` como reducer puro, así que
 * este componente solo conecta cables: despacha acciones y pinta lo que sale.
 * Es la diferencia con la demo, donde las mismas 974 líneas mezclaban tipos,
 * estado, cálculo de precios, negociación y persistencia en un solo archivo
 * que no se podía probar sin montar React.
 */

export function Constructor({
  sugeridos,
  clienteInicial = null,
  hoy,
  editando = null,
}: {
  /** Los últimos cotizados, para que el buscador ofrezca algo sin teclear. */
  sugeridos: ClienteOpcion[];
  /** El cliente de `?cliente=…`, ya resuelto por el servidor. */
  clienteInicial?: ClienteOpcion | null;
  /** `aaaa-mm-dd` del servidor: el dominio nunca lee el reloj. */
  hoy: string;
  /**
   * La cotización que se está EDITANDO, ya cargada.
   *
   * Es el mismo constructor porque es la misma pantalla: buscar productos,
   * poner precios, mirar el piso. Hacer una copia para editar garantizaría
   * que el día que se arregle algo aquí, allí no.
   *
   * `null` = alta.
   */
  editando?: { id: string; numero: string; estado: EstadoConstructor } | null;
}) {
  const router = useRouter();
  const [estado, despachar] = useReducer(
    reducir,
    editando?.estado ?? estadoInicial(clienteInicial?.id ?? null),
  );
  // El cliente elegido se guarda ENTERO y no solo su id. El reducer sigue
  // llevando el id —es lo que se envía— pero la ficha que se pinta necesita la
  // razón social, el documento y la condición de pago, y ya no existe una
  // lista completa en memoria donde buscarlos: la cartera vive en la base.
  const [cliente, setCliente] = useState<ClienteOpcion | null>(clienteInicial);

  /*
    El tiempo de entrega sale de las líneas, no de una caja que nadie mira.

    Nació antes que la disponibilidad por línea (040) y se quedó como un
    desplegable con «Stock inmediato» de arranque. Desde entonces el mismo papel
    podía decir dos cosas a la vez —cabecera «Stock inmediato», línea «15 días ·
    exterior»— y las dos salían impresas. Pasó en la COT1-000004.

    Lo sincroniza el REDUCER, no un efecto de aquí. El primer intento fue un
    `useEffect` que despachaba al ver el desajuste y colgó el navegador: se
    dispara con el estado que acaba de cambiar y vuelve a cambiarlo. Esto solo
    lee y pinta.
  */
  const entregaPropuesta = useMemo(
    () => entregaDelDocumento(estado.lineas),
    [estado.lineas],
  );

  const entregaMiente = useMemo(
    () => entregaSeContradice(estado.tiempoEntrega, estado.lineas),
    [estado.tiempoEntrega, estado.lineas],
  );

  /*
    El reverso, que faltaba: la cabecera promete una demora y ninguna línea la
    respalda.

    Willy, 16/09, con una cotización de tres ítems: arriba decía «Parte
    inmediato, el resto hasta 15 días» y las tres líneas estaban en inmediata.
    Su observación fue *«no se indica qué ítem es de importación»* — y no se
    indicaba porque no había ninguno marcado. Quien lee el papel busca cuál
    tarda, no lo encuentra, y llama.
  */
  /** El código que se está dando de alta, o null. */
  const [creando, setCreando] = useState<string | null>(null);

  /*
    Las marcas que ya existen, para sugerirlas al escribir la de una línea.

    Alimentan el `<datalist>` del final, que usa «Editar artículo» cuando se
    elige «solo en esta cotización» — el caso del retén. Ahí la marca es texto
    y no una clave ajena, así que se puede escribir una que no esté en el
    catálogo: Willy, 16/09, *«puede ser diversas marcas: LYO, NQK, PHK, NAK…
    etc»*, y ese «etc» es el motivo de que sugiera en vez de obligar.

    Se piden una vez al montar, no al abrir el diálogo: son 24 nombres, y
    pedirlos aquí evita que la caja salga sin sugerencias el primer segundo.
  */
  const [marcas, setMarcas] = useState<string[]>([]);
  useEffect(() => {
    let vivo = true;
    marcasConocidas().then((m) => {
      if (vivo) setMarcas(m);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const entregaSinRespaldo = useMemo(
    () => entregaPrometeSinRespaldo(estado.tiempoEntrega, estado.lineas),
    [estado.tiempoEntrega, estado.lineas],
  );

  // Editar y crear van a acciones distintas: crear inserta y devuelve un
  // número nuevo; editar reescribe la que ya existe y NO toca el número.
  const [resultado, guardar, guardando] = useActionState<
    ResultadoCreacion | ResultadoEdicion | null,
    FormData
  >(async (previo, formData) => {
    const r = editando
      ? await actualizarCotizacion(previo as ResultadoEdicion | null, formData)
      : await crearCotizacion(previo as ResultadoCreacion | null, formData);
    if (r.ok) router.push(`/cotizaciones/${r.id}`);
    return r;
  }, null);

  const totales = useMemo(() => totalesDe(estado), [estado]);
  const bloqueos = useMemo(() => calcularBloqueos(estado), [estado]);

  return (
    <form action={guardar} className="flex flex-col gap-5 p-6">
      <input
        type="hidden"
        name="cotizacion"
        // Al editar viaja además el id: la acción reescribe ESA cotización.
        value={JSON.stringify(
          editando ? { id: editando.id, ...aPayload(estado) } : aPayload(estado),
        )}
      />

      {/*
        Solo el título. Guardar se fue al pie.

        Luis, 16/09: *«al terminar una cotización debe aparecer en la parte de
        abajo el botón de guardar, no arriba»*. Y tiene la razón de siempre en
        esta pantalla: el orden en que se trabaja es cliente → productos →
        totales, y el botón que cierra ese recorrido estaba en el punto de
        partida. Al terminar de teclear la última línea había que volver
        arriba a buscarlo.
      */}
      <header>
        <h1 className="text-xl font-semibold">
          {editando ? `Editar ${editando.numero}` : "Nueva cotización"}
        </h1>
      </header>

      {resultado && !resultado.ok ? (
        <p className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger)]">
          {resultado.error}
        </p>
      ) : null}

      {/* Una sola columna. Era `lg:flex-row` con el resumen al lado; al
          bajarlo, ese envoltorio ya no separaba nada. */}
      <div className="flex min-w-0 flex-col gap-5">
          {/* ------------------------------------------------- Cabecera */}
          {/*
            Lo esencial arriba, el resto plegado.

            Antes eran seis campos en rejilla antes de dejarte trabajar. Pero
            para empezar a cotizar solo hace falta saber PARA QUIÉN: la validez
            tiene un valor por defecto sensato, la entrega también, y la orden
            de compra la mitad de las veces no existe todavía.

            Es la misma lección que dejó el cliente sobre la ficha de cliente:
            «a las justas me dan correo». Pedir todo por adelantado no hace que
            los datos aparezcan, solo que la pantalla estorbe.
          */}
          <section className="card p-4">
            {/* `overflow-visible` no está de más: el panel de resultados se
                posiciona en el flujo del documento y un ancestro que recorte
                lo dejaría cortado a media lista. */}
            {/* Tres columnas desde `lg`: cliente, a quién va dirigida, y la
                validez. En `sm` el destinatario baja a su propia fila entera
                antes que quedarse en una columna donde no cabe un nombre. */}
            <div className="grid gap-3 overflow-visible sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,0.6fr)]">
              <BuscadorClientes
                sugeridos={sugeridos}
                elegido={cliente}
                hoy={hoy}
                onElegir={(c) => {
                  setCliente(c);
                  despachar({ tipo: "cabecera", campo: "clienteId", valor: c.id });
                }}
                onQuitar={() => {
                  setCliente(null);
                  despachar({ tipo: "cabecera", campo: "clienteId", valor: null });
                }}
              />

              {/* Aquí y no dentro de «Más datos del documento», que está
                  plegado por defecto: es pedido de Willy (31/08) y estando
                  escondido no lo rellenaba nadie. */}
              <SelectorContacto
                clienteId={estado.clienteId}
                cliente={cliente?.razon_social ?? null}
                contactoId={estado.contactoId}
                contacto={estado.contacto}
                onElegir={(id, nombre) => {
                  despachar({ tipo: "cabecera", campo: "contactoId", valor: id });
                  despachar({ tipo: "cabecera", campo: "contacto", valor: nombre });
                }}
                onEscribir={(nombre) => {
                  // Escrito a mano: se suelta el enlace a la ficha. Guardar un
                  // id que ya no corresponde al nombre impreso sería peor que
                  // no guardar ninguno.
                  despachar({ tipo: "cabecera", campo: "contactoId", valor: null });
                  despachar({ tipo: "cabecera", campo: "contacto", valor: nombre });
                }}
              />

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Válida por</span>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={estado.validezDias}
                    onChange={(e) =>
                      despachar({
                        tipo: "cabecera",
                        campo: "validezDias",
                        valor: Number(e.target.value),
                      })
                    }
                    className="w-20 tabular"
                  />
                  <span className="text-sm text-[var(--fg-muted)]">días</span>
                </div>
              </label>
            </div>

            <details className="group mt-3 border-t border-[var(--border-soft)] pt-3">
              <summary className="cursor-pointer list-none text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]">
                <span className="inline-block transition-transform group-open:rotate-90">
                  ›
                </span>{" "}
                Más datos del documento
              </summary>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">

                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Tiempo de entrega</span>
                  <SelectNativo
                    value={estado.tiempoEntrega}
                    onChange={(e) => {
                      // El reducer marca «a mano» solo al ver este campo.
                      despachar({
                        tipo: "cabecera",
                        campo: "tiempoEntrega",
                        valor: e.target.value,
                      });
                    }}
                  >
                    {/* La propuesta primero, y solo si no está ya en la lista
                        fija: «Hasta 45 días» sale de una línea con plazo
                        escrito a mano y no puede estar prevista. */}
                    {ENTREGAS.includes(entregaPropuesta as (typeof ENTREGAS)[number]) ? null : (
                      <option value={entregaPropuesta}>{entregaPropuesta}</option>
                    )}
                    {ENTREGAS.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </SelectNativo>
                  {entregaSinRespaldo ? (
                    <span className="text-xs font-medium text-[var(--warn)]">
                      Prometes una espera y las líneas están todas como
                      inmediatas. Marca en su línea cuál tarda, o el cliente no
                      sabrá por cuál está esperando.
                    </span>
                  ) : null}
                  {entregaMiente ? (
                    <span className="text-xs font-medium text-[var(--warn)]">
                      Dice inmediato y hay líneas que tardan. Lo que cuadra:{" "}
                      <button
                        type="button"
                        className="underline"
                        onClick={() => {
                          despachar({
                            tipo: "cabecera",
                            campo: "tiempoEntrega",
                            valor: entregaPropuesta,
                          });
                        }}
                      >
                        {entregaPropuesta}
                      </button>
                    </span>
                  ) : (
                    <span className="text-xs text-[var(--fg-subtle)]">
                      La promesa general del documento. Sale de las líneas.
                    </span>
                  )}
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Orden de compra del cliente</span>
                  <Input
                    value={estado.ordenCompraCliente}
                    onChange={(e) =>
                      despachar({
                        tipo: "cabecera",
                        campo: "ordenCompraCliente",
                        valor: e.target.value,
                      })
                    }
                    placeholder="Si ya la tienen"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Condiciones</span>
                  <Input
                    value={estado.condiciones}
                    onChange={(e) =>
                      despachar({
                        tipo: "cabecera",
                        campo: "condiciones",
                        valor: e.target.value,
                      })
                    }
                    placeholder="Forma de pago, garantía…"
                  />
                </label>
              </div>
            </details>
          </section>

          {/* --------------------------------------------------- Líneas */}
          <section className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
            {/*
              La sección se presenta, y el subtítulo hace un trabajo de verdad.

              No está para adornar: dice EN VOZ ALTA que cada línea tiene
              alternativas y ventas anteriores. Las dos cosas llevan meses en
              el ERP y no se usaban porque nadie sabía que estaban —Willy,
              47:00, preguntando por algo que ya existía: *«¿no te muestra una
              referencia de a quién se ha vendido, a cuánto se ha vendido?»*—.
              Un botón se encuentra si sabes que lo estás buscando.

              El buscador se queda como está y a todo ancho, no detrás de un
              «+ Agregar producto». Luis, 08/09: *«los productos añadidos por
              el buscador que tenemos está genial, hay que diseñarlo bien
              nomás»*. Y hay una razón para no meterlo en un diálogo: en este
              catálogo se teclea el código y ya —6309, un código de fabricante,
              media descripción—, y un modal por producto son dos clics de más
              en lo que más veces se repite de la pantalla.
            */}
            <div className="mb-3 flex flex-col gap-3">
              <div>
                <h2 className="text-base font-semibold">Productos</h2>
                <p className="text-sm text-[var(--fg-muted)]">
                  Agrega productos y revisa las alternativas y las ventas
                  anteriores de cada uno.
                </p>
              </div>
              {/*
                Y la salida cuando el código no existe.

                Willy, 16/09: *«digito un código que no está creado y no me sale
                la opción para crearlo en el sistema»*. El buscador se abría
                vacío y no había por dónde seguir. Ahora ofrece darlo de alta
                aquí mismo — el constructor no guarda borrador, así que
                mandarlo a «Nuevo producto» se llevaría por delante la
                cotización a medias.
              */}
              <BuscadorLineas
                onElegir={(p) => despachar({ tipo: "agregar", producto: p })}
                onCrear={(codigo) => setCreando(codigo)}
              />
            </div>

            {estado.lineas.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--fg-muted)]">
                Busca un producto arriba para empezar. Puedes teclear el código,
                el del fabricante o parte de la descripción.
              </p>
            ) : (
              <TableContenedor>
                <Table>
                  <THead>
                    <tr>
                      <th className="w-8 text-left">#</th>
                      <th className="text-left">Código</th>
                      <th className="text-left">Marca</th>
                      <th className="text-left">Descripción</th>
                      <th className="text-right">Cant.</th>
                      <th className="text-left">U.M.</th>
                      {/* Siempre visible, aunque no se imprima: es de donde
                          sale lo que hay que salir a comprar. */}
                      <th className="text-left">Entrega</th>
                      <th className="text-right">Valor unit.</th>
                      {estado.mostrarDescuento ? (
                        <th className="text-right">Dscto. %</th>
                      ) : null}
                      <th className="text-right">Importe</th>
                      {/* Con nombre desde el 08/09. La columna existía sin
                          encabezado, y una columna sin nombre al final de una
                          tabla se lee como sobrante. */}
                      <th className="text-right">Acciones</th>
                    </tr>
                  </THead>
                  <TBody>
                    {estado.lineas.map((l, i) => (
                      <FilaLinea
                        key={l.key}
                        linea={l}
                        indice={i}
                        total={estado.lineas.length}
                        clienteId={estado.clienteId}
                        mostrarDescuento={estado.mostrarDescuento}
                        despachar={despachar}
                      />
                    ))}
                  </TBody>
                </Table>
              </TableContenedor>
            )}
          </section>

          <section className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Observaciones</span>
              <Textarea
                value={estado.observaciones}
                onChange={(e) =>
                  despachar({
                    tipo: "cabecera",
                    campo: "observaciones",
                    valor: e.target.value,
                  })
                }
                rows={3}
                placeholder="Lo que salga impreso al pie de la cotización."
              />
            </label>
          </section>
      </div>

      {/*
        El resumen, ABAJO y a todo ancho. Antes era una columna a la derecha.

        Luis, 08/09: *«el resumen se pasó abajo para que ocupe más espacio
        producto»*. Y es lo correcto por una razón concreta de esta pantalla:
        la tabla de líneas tiene NUEVE columnas —código, marca, descripción,
        cantidad, unidad, entrega, precio, descuento, importe— más los botones
        de cada fila. Quitarle 320 px a eso comprimía la descripción, que es
        lo que Willy lee para saber qué rodamiento es (08:04: *«con sellos de
        metal y juego C3… en función a eso yo ya veo»*).

        El resumen, en cambio, son cuatro cifras: no necesita alto, necesita
        estar al final, que es donde se mira cuando ya está todo puesto.
      */}
      <ResumenConstructor
          totales={totales}
          bloqueos={bloqueos}
          mostrarDescuento={estado.mostrarDescuento}
          onMostrarDescuento={(v) =>
            despachar({ tipo: "cabecera", campo: "mostrarDescuento", valor: v })
          }
          mostrarDisponibilidad={estado.mostrarDisponibilidad}
          onMostrarDisponibilidad={(v) =>
            despachar({ tipo: "cabecera", campo: "mostrarDisponibilidad", valor: v })
          }
          hayNoInmediatos={estado.lineas.some((l) => l.disponibilidad !== "inmediata")}
          guardando={guardando}
        />

      {/*
        La barra de cierre: el total y los dos botones, al final y PEGADA.

        Al pie porque lo pidió Luis y porque es donde termina el recorrido. Y
        pegada al borde de abajo (`sticky`) por lo contrario: una cotización de
        veinte líneas es una página larga, y un botón que solo existe al final
        del scroll obliga a bajar hasta el fondo cada vez que se quiere
        guardar. Es exactamente la pega que él mismo cazó el 09/09 con el botón
        de imprimir debajo de la hoja.

        Así está siempre a la vista sin estar arriba: es lo último de la
        página, y a la vez no hay que ir a buscarlo.

        Y el total va aquí, repetido, porque es lo que se mira justo antes de
        pulsar. La tarjeta de «Totales» lo explica —valor de venta, IGV,
        margen—; esto solo recuerda la cifra que se está por firmar.
      */}
      <div className="sticky bottom-0 -mx-6 -mb-6 mt-1 border-t border-[var(--border)] bg-[var(--surface)] px-6 py-3 elev-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="text-sm text-[var(--fg-muted)]">
              {estado.lineas.length === 1
                ? "1 producto · total"
                : `${estado.lineas.length} productos · total`}
            </span>
            <span className="tabular text-lg font-semibold">
              {totales.total.toLocaleString("es-PE", {
                style: "currency",
                currency: "USD",
              })}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/*
              Lo que falta, junto al botón que no se puede pulsar.

              El detalle está arriba, en el recuadro ámbar del resumen. Aquí va
              el porqué en una línea: un botón apagado sin explicación al lado
              se lee como que la pantalla está rota.
            */}
            {bloqueos.length > 0 ? (
              <span className="text-sm font-medium text-[var(--warn)]">
                {bloqueos.length === 1 && bloqueos[0]
                  ? bloqueos[0].mensaje
                  : `Faltan ${bloqueos.length} cosas para poder guardar`}
              </span>
            ) : null}

            <Button
              type="button"
              variant="outline"
              onClick={() =>
                router.push(editando ? `/cotizaciones/${editando.id}` : "/cotizaciones")
              }
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={bloqueos.length > 0 || guardando}>
              {guardando
                ? "Guardando…"
                : editando
                  ? "Guardar cambios"
                  : "Guardar cotización"}
            </Button>
          </div>
        </div>
      </div>

      {/*
        El alta rápida, fuera del flujo pero dentro del formulario.

        Se monta solo cuando hace falta: así las listas de marcas y familias se
        piden la vez que se usa y no en cada cotización.
      */}
      {/* Las sugerencias de marca, una sola vez para todas las líneas. */}
      <datalist id="marcas-conocidas">
        {marcas.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      {creando !== null ? (
        <AltaProducto
          codigoInicial={creando}
          onCerrar={() => setCreando(null)}
          onCreado={(producto) => despachar({ tipo: "agregar", producto })}
        />
      ) : null}
    </form>
  );
}
