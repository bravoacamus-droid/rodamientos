"use client";

import { useActionState, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Table,
  TableContenedor,
  TBody,
  Textarea,
  THead,
} from "@rodatech/ui";

import {
  actualizarCotizacion,
  crearCotizacion,
  type ResultadoCreacion,
  type ResultadoEdicion,
} from "../../acciones/crear";
import type { ClienteOpcion } from "../../dominio/cliente";
import {
  aPayload,
  avisosDeCompra,
  avisosDeCosto,
  lineasSinAnalizar,
  avisosDeVenta,
  bloqueos as calcularBloqueos,
  estadoInicial,
  numeroDeLaSiguienteAlternativa,
  numerosDe,
  puedeMover,
  reducir,
  totalesDe,
  type EstadoConstructor,
} from "../../dominio/constructor";

import { AltaProducto } from "./alta-producto";
import { BuscadorLineas } from "./buscador";
import { BuscadorClientes } from "./buscador-clientes";
import { SelectorContacto } from "./selector-contacto";
import { FilaLinea, TarjetaLinea } from "./linea";
import { ResumenConstructor } from "./resumen";
import { NoRegistrado } from "./no-registrado";
import { History, Plus } from "lucide-react";
import {
  armarBorrador,
  claveBorrador,
  esDistinto,
  leerBorrador,
  valeLaPena,
  type Borrador,
} from "../../dominio/borrador";
import { AvisoDeuda } from "./aviso-deuda";
import { SelectorCondiciones } from "./selector-condiciones";
import { demandaParaLineas } from "../../acciones/analizar-compra";
import type { DemandaProducto } from "../../dominio/demanda";

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
  puedeEditarKit = false,
  puedeAjustarStock = false,
}: {
  /**
   * Si quien cotiza puede cambiar un kit desde aquí (25/09). Gerencia, admin
   * y compras, que son los que `guardarKit` deja pasar: a un vendedor se le
   * enseña el kit pero no se le ofrece un botón que la base rechazaría.
   */
  puedeEditarKit?: boolean;
  /** Gerencia y admin: «Actualizar stock» en la línea (06/10). */
  puedeAjustarStock?: boolean;
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
    El borrador en el navegador (12/10). Hasta pulsar «Guardar» no existía
    nada, y cerrar la pestaña tiraba el análisis de compra entero. Se guarda
    solo, 800 ms después del último cambio; al volver se ofrece recuperarlo.

    Mientras hay uno pendiente de decidir NO se escribe encima: lo que se
    teclea antes de contestar al aviso pisaría lo que se quiere recuperar.
  */
  const claveB = claveBorrador(editando?.id ?? null);
  const [pendiente, setPendiente] = useState<Borrador | null>(null);
  const decidido = useRef(false);
  useEffect(() => {
    try {
      const b = leerBorrador(window.localStorage.getItem(claveB), new Date());
      if (b && esDistinto(b, estado)) setPendiente(b);
      else decidido.current = true;
    } catch {
      decidido.current = true;
    }
    // Solo al abrir: después manda lo que se teclea.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveB]);
  useEffect(() => {
    if (pendiente || !decidido.current) return;
    const t = setTimeout(() => {
      try {
        if (valeLaPena(estado)) {
          window.localStorage.setItem(claveB, JSON.stringify(armarBorrador(estado, cliente, new Date())));
        } else {
          window.localStorage.removeItem(claveB);
        }
      } catch {
        // Sin almacenamiento (ventana privada, disco lleno): se cotiza igual.
      }
    }, 800);
    return () => clearTimeout(t);
  }, [estado, cliente, pendiente, claveB]);
  const olvidarBorrador = () => {
    try {
      window.localStorage.removeItem(claveB);
    } catch {
      // Igual que arriba.
    }
  };

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


  // Editar y crear van a acciones distintas: crear inserta y devuelve un
  // número nuevo; editar reescribe la que ya existe y NO toca el número.
  const [resultado, guardar, guardando] = useActionState<
    ResultadoCreacion | ResultadoEdicion | null,
    FormData
  >(async (previo, formData) => {
    const r = editando
      ? await actualizarCotizacion(previo as ResultadoEdicion | null, formData)
      : await crearCotizacion(previo as ResultadoCreacion | null, formData);
    if (r.ok) {
      // Ya está en la base: el borrador sobra.
      olvidarBorrador();
      router.push(`/cotizaciones/${r.id}`);
    }
    return r;
  }, null);

  const totales = useMemo(() => totalesDe(estado), [estado]);
  /** 1, 1.1, 1.2, 2… (169): el número de ítem de cada línea, en orden. */
  const numeros = useMemo(() => numerosDe(estado), [estado]);
  /** En qué ítem está ya cada producto, para avisar al añadir una alternativa. */
  const enLaCotizacion = useMemo(() => {
    const m = new Map<string, string>();
    estado.lineas.forEach((l, i) => {
      if (l.productoId && !m.has(l.productoId)) m.set(l.productoId, numeros[i] ?? "");
    });
    return m;
  }, [estado, numeros]);
  const propsDeLinea = (key: string, i: number) => ({
    numero: numeros[i] ?? String(i + 1),
    numeroAlternativa: numeroDeLaSiguienteAlternativa(estado, key),
    puedeSubir: puedeMover(estado, key, -1),
    puedeBajar: puedeMover(estado, key, 1),
    enLaCotizacion,
  });
  const bloqueos = useMemo(() => calcularBloqueos(estado), [estado]);
  // Lo que conviene mirar y NO impide guardar (17/09): hoy, el precio mínimo.
  /* Dos avisos distintos y los dos hacen falta: el piso es la regla comercial
     de Willy, y el costo es la aritmética. Desde el 25/09 se sabe que el piso
     puede quedarse por debajo del costo cuando entra una compra más cara, y
     entonces el primero da el visto bueno a una venta que pierde dinero. */
  const avisos = useMemo(
    () => [...avisosDeCompra(estado), ...avisosDeVenta(estado), ...avisosDeCosto(estado)],
    [estado],
  );

  /*
    Antes de guardar, la pregunta (09/10). Luis: *«puede guardar la cotización
    igual, pero primero tiene que registrar su precio de costo […] si no se
    analizó nada, antes de guardar darle avisos»*. Pregunta, no prohíbe: un
    producto que está en el anaquel no hay que comprarlo.
  */
  const sinAnalizar = lineasSinAnalizar(estado);

  /*
    Quién más pide los mismos productos (09/10). Se lee cuando cambia QUÉ
    productos hay, no con cada tecla: la clave es la lista de ids.
  */
  const idsProductos = [...new Set(estado.lineas.map((l) => l.productoId).filter((x): x is string => !!x))]
    .sort()
    .join(",");
  const [demanda, setDemanda] = useState<Map<string, DemandaProducto>>(new Map());
  useEffect(() => {
    if (!idsProductos) return;
    let vivo = true;
    void demandaParaLineas(idsProductos.split(",")).then((r) => {
      if (vivo && r.ok) setDemanda(new Map(r.datos.map((d) => [d.productoId, d])));
    });
    return () => {
      vivo = false;
    };
  }, [idsProductos]);
  const [preguntando, setPreguntando] = useState(false);
  // Un ref y no un estado: el clic de «Guardar igual» envía en el mismo turno.
  const guardarIgual = useRef(false);

  return (
    <form
      id="form-cotizacion"
      action={guardar}
      onSubmit={(e) => {
        if (sinAnalizar.length > 0 && !guardarIgual.current) {
          e.preventDefault();
          setPreguntando(true);
        }
        guardarIgual.current = false;
      }}
      className="flex flex-col gap-5 sm:p-6"
      /*
        Enter en un campo no guarda la cotización: se guarda con el botón.

        Revisión por módulos del 02/10. Con cliente y una línea puestas, un
        Enter en la cantidad, el precio o el buscador de productos la
        GUARDABA —el envío implícito del navegador— y gastaba un número de la
        serie. Al teclear precios el Enter sale solo, y aquí guardar a medias
        no es inocuo: cada guardado es un correlativo.
      */
      onKeyDown={(e) => {
        // `contains`: los diálogos van en un portal y React les pasa el
        // evento igual; su Enter es suyo y no se toca.
        if (
          e.key === "Enter" &&
          e.target instanceof HTMLInputElement &&
          e.currentTarget.contains(e.target)
        )
          e.preventDefault();
      }}
    >
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

      {pendiente ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-[var(--warn)] bg-[var(--warn-bg)] p-4">
          <History className="size-6 shrink-0 text-[var(--warn)]" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-base">
            <strong>Tienes una cotización sin guardar</strong> del{" "}
            {new Date(pendiente.guardado).toLocaleString("es-PE", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {pendiente.cliente ? ` · ${pendiente.cliente.razon_social}` : ""} ·{" "}
            {pendiente.estado.lineas.length === 1 ? "1 producto" : `${pendiente.estado.lineas.length} productos`}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={() => {
                despachar({ tipo: "cargar", estado: pendiente.estado });
                setCliente(pendiente.cliente);
                decidido.current = true;
                setPendiente(null);
              }}
            >
              Recuperarla
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                olvidarBorrador();
                decidido.current = true;
                setPendiente(null);
              }}
            >
              Descartar
            </Button>
          </div>
        </div>
      ) : null}

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
                // Corregido desde «Editar cliente»: es el mismo, así que solo
                // se repinta la tarjeta; la cabecera no cambia.
                onCorregido={setCliente}
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

            <AvisoDeuda clienteId={estado.clienteId} />

            {/*
              Fuera del desplegable (06/10). El aviso solo estaba DENTRO de
              «Más datos del documento», que sale plegado: Willy guardó la
              COT1-000004 con «Stock inmediato» arriba y una línea a 15 días,
              y no llegó a verlo nunca.
            */}
            {/*
              Sin «Más datos del documento» (Luis, 12/10): lo único que
              quedaba dentro eran las condiciones, y escondidas detrás de un
              botón no se ponían. La entrega sale de las líneas y la O/C se
              pone al aprobar (09/10).
            */}
            <div className="mt-3 flex flex-col gap-1 border-t border-[var(--border-soft)] pt-3 sm:max-w-2xl">
              <span className="text-sm font-medium">Condiciones</span>
              <SelectorCondiciones
                valor={estado.condiciones}
                onCambiar={(texto) => despachar({ tipo: "cabecera", campo: "condiciones", valor: texto })}
              />
              <span className="text-sm text-[var(--fg-muted)]">
                Sale impresa en la cotización. Elige de la lista, o escribe y guarda una nueva.
              </span>
            </div>
          </section>

          {/* --------------------------------------------------- Líneas */}
          {/*
            `@container`: tarjetas o tabla según el ancho de ESTA sección, no
            de la pantalla, como el registro de compra. Revisión de diseño del
            02/10: en el teléfono esta tabla se desplazaba de lado (390 px:
            319 → 867).

            El corte es `@5xl` (64 rem, 1088 px con la base de 17 px), y no
            el `@3xl` de compras. Revisión por módulos del 02/10: esta tabla
            tiene once columnas y cuatro campos, y con valores normales pide
            ~1160 px. A 1280 con el menú abierto la sección mide 870, así que
            se desplazaba y «Importe» y «Más opciones» quedaban fuera. Por
            debajo del corte salen las tarjetas, que a ese ancho ponen los
            cuatro campos en una fila; en la pantalla de Willy (1600) sigue
            la tabla.
          */}
          <section className="@container rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
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
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">Productos</h2>
                  <p className="text-sm text-[var(--fg-muted)]">
                    Agrega productos y revisa las alternativas y las ventas
                    anteriores de cada uno.
                  </p>
                </div>
                {/* Arriba a la derecha (Luis, 09/10): lo que no está en el catálogo.
                    Y al lado, darlo de alta en el catálogo sin tener que
                    buscarlo antes (Willy, 29/10, por Luis: «un botón de crear
                    un nuevo producto al costado de producto no registrado»). */}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => setCreando("")} className="gap-1.5">
                    <Plus className="size-4" aria-hidden="true" />
                    Crear nuevo producto
                  </Button>
                  <NoRegistrado onAgregar={(producto, cantidad) => despachar({ tipo: "agregar", producto, cantidad })} />
                </div>
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
              /*
                LA TABLA SE ENSEÑA VACÍA, CON SU FILA EN BLANCO.

                Willy, 24/09 (42:18): *«abajo como que no, falta algo donde
                dice producto… se supone que debería haber un cuadro ahí que
                diga número de ítem, código, descripción, precio unitario»*. Y
                el porqué, que es lo que manda: *«yo lo puedo entender porque
                tú me estás explicando a mí, pero luego cuando yo lo comparta a
                alguien se va a perder ahí, no va a saber dónde cotizo»*.

                Antes había un párrafo que decía «busca un producto arriba».
                Explicaba lo mismo, pero explicar dónde va a aparecer algo no
                es lo mismo que enseñar el sitio: la tabla con sus encabezados
                y un renglón vacío dice a la vez QUÉ se va a pedir y DÓNDE va a
                salir, sin que nadie tenga que leer nada.
              */
              <>
              {/*
                En el teléfono, el mismo «sitio vacío» que pidió Willy, pero
                con la forma de la tarjeta que va a aparecer: los nombres de
                lo que se va a pedir, y dónde.
              */}
              <div className="rounded-md border border-dashed border-[var(--border-strong)] p-3 text-sm text-[var(--fg-subtle)] @5xl:hidden">
                <p className="text-[var(--fg-muted)]">
                  1. Busca un producto arriba —por código, por el del
                  fabricante o por parte de la descripción— y aparecerá aquí.
                </p>
                <p className="mt-2">
                  Código · Descripción · Cantidad · Valor unitario · Entrega ·
                  Importe
                </p>
              </div>
              <div className="hidden @5xl:block">
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
                      <th className="text-left">Entrega</th>
                      <th className="text-left">Costo</th>
                      <th className="text-right">Valor unit.</th>
                      {estado.mostrarDescuento ? (
                        <th className="text-right">Dscto. %</th>
                      ) : null}
                      <th className="text-right">Importe</th>
                      <th className="text-right">Acciones</th>
                    </tr>
                  </THead>
                  <tbody>
                    <tr className="text-[var(--fg-subtle)]">
                      <td className="py-3">1</td>
                      {/* El aviso va en la celda del código porque es la
                          primera que se rellena: ahí es donde hay que mirar. */}
                      <td colSpan={estado.mostrarDescuento ? 11 : 10} className="py-3">
                        Busca un producto arriba —por código, por el del
                        fabricante o por parte de la descripción— y aparecerá
                        en esta línea.
                      </td>
                    </tr>
                  </tbody>
                </Table>
              </TableContenedor>
              </div>
              </>
            ) : (
              <>
              <ul className="flex flex-col gap-2.5 @5xl:hidden">
                {estado.lineas.map((l, i) => (
                  <TarjetaLinea
                    key={l.key}
                    linea={l}
                    {...propsDeLinea(l.key, i)}
                    clienteId={estado.clienteId}
                    mostrarDescuento={estado.mostrarDescuento}
                    despachar={despachar}
                    puedeEditarKit={puedeEditarKit}
                        puedeAjustarStock={puedeAjustarStock}
                    demanda={l.productoId ? demanda.get(l.productoId) : undefined}
                    cotizacionActual={editando?.id ?? null}
                  />
                ))}
              </ul>
              <div className="hidden @5xl:block">
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
                      <th className="text-left">Costo</th>
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
                        {...propsDeLinea(l.key, i)}
                        clienteId={estado.clienteId}
                        mostrarDescuento={estado.mostrarDescuento}
                        despachar={despachar}
                        puedeEditarKit={puedeEditarKit}
                        puedeAjustarStock={puedeAjustarStock}
                        demanda={l.productoId ? demanda.get(l.productoId) : undefined}
                        cotizacionActual={editando?.id ?? null}
                      />
                    ))}
                  </TBody>
                </Table>
              </TableContenedor>
              </div>
              </>
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
          avisos={avisos}
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
          sinAnalizar={sinAnalizar.length}
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
      <div className="sticky bottom-0 -mx-3 -mb-3 mt-1 border-t border-[var(--border)] bg-[var(--surface)] px-3 py-3 elev-2 sm:-mx-6 sm:-mb-6 sm:px-6">
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

          {/* En el teléfono, el aviso en su propio renglón y los dos botones a
              lo ancho: en una fila con ellos, «Faltan 2 cosas para poder
              guardar» salía partido en cinco renglones y el botón de guardar
              tocaba el borde. */}
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
            {/*
              Lo que falta, junto al botón que no se puede pulsar.

              El detalle está arriba, en el recuadro ámbar del resumen. Aquí va
              el porqué en una línea: un botón apagado sin explicación al lado
              se lee como que la pantalla está rota.
            */}
            {bloqueos.length > 0 ? (
              <span className="w-full text-sm font-medium text-[var(--warn)] sm:w-auto">
                {bloqueos.length === 1 && bloqueos[0]
                  ? bloqueos[0].mensaje
                  : `Faltan ${bloqueos.length} cosas para poder guardar`}
              </span>
            ) : null}

            <Button
              type="button"
              variant="outline"
              className="flex-1 sm:flex-none"
              onClick={() => {
                // Cancelar es decidir no seguir: no se ofrece otra vez.
                olvidarBorrador();
                router.push(editando ? `/cotizaciones/${editando.id}` : "/cotizaciones");
              }}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1 sm:flex-none"
              disabled={bloqueos.length > 0 || guardando}
            >
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

      <Dialog open={preguntando} onOpenChange={setPreguntando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Falta analizar el precio de compra</DialogTitle>
            <DialogDescription>
              {sinAnalizar.length === 1
                ? "Este producto lleva el costo de la ficha, que puede ser viejo:"
                : `Estos ${sinAnalizar.length} productos llevan el costo de la ficha, que puede ser viejo:`}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <ul className="flex flex-col gap-1">
              {sinAnalizar.map((l) => (
                <li key={l.key} className="flex items-baseline gap-2">
                  <strong>{l.codigo}</strong>
                  <span className="truncate text-sm text-[var(--fg-muted)]">{l.descripcion}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-[var(--fg-muted)]">
              Si los tienes en el almacén o ya sabes su costo, puedes guardar igual.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPreguntando(false)}>
              Volver y analizar
            </Button>
            <Button
              type="button"
              onClick={(e) => {
                setPreguntando(false);
                guardarIgual.current = true;
                const formulario = e.currentTarget.ownerDocument.getElementById("form-cotizacion");
                if (formulario instanceof HTMLFormElement) formulario.requestSubmit();
              }}
            >
              Guardar igual
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
