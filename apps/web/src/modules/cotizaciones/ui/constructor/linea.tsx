"use client";

import { useState, useTransition } from "react";
/*
  Los iconos salen de lucide, no de `<path>` escritos a mano.

  Luis, 16/09: *«hay que poner buenos iconos, la ✕ y todo eso; tiene que verse
  bien, que todo calce, que tenga buena lógica, porque no es más que un CRUD
  que se repite»*.

  Y esa última frase es el argumento entero. Esta pantalla tenía cinco iconos
  dibujados a mano y dos flechas que eran **caracteres de texto** —«↑», «↓»—,
  así que ni el grosor del trazo ni el tamaño ni el centrado coincidían con
  los de las otras diez pantallas, que ya usaban lucide. Un lápiz de trazo 2
  al lado de una flecha tipográfica no se lee como un juego de botones: se lee
  como una pantalla a medio hacer.

  La librería ya estaba en `package.json` y en el propio menú del sistema de
  diseño. Era otra pieza puesta sin usar.
*/
import {
  ArrowLeftRight,
  Boxes,
  ChevronDown,
  ChevronUp,
  DollarSign,
  History,
  MoreVertical,
  Package,
  Pencil,
  SquareArrowOutUpRight,
  Trash2,
} from "lucide-react";
import {
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  SelectNativo,
} from "@rodatech/ui";

import { historialDe, sustitutosPara, type Sustituto, type VentaAnterior } from "../../acciones/buscar";
import { EditarArticulo } from "./editar-articulo";
import { PreciosYStock } from "./precios-y-stock";
import { DialogoKit } from "./dialogo-kit";
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
  puedeEditarKit = false,
}: {
  linea: LineaConstructor;
  indice: number;
  total: number;
  clienteId: string | null;
  mostrarDescuento: boolean;
  despachar: (a: Accion) => void;
  /** Gerencia, admin y compras: los que pueden cambiar un kit (25/09). */
  puedeEditarKit?: boolean;
}) {
  const [panel, setPanel] = useState<"ninguno" | "sustitutos" | "historial">("ninguno");
  const [editando, setEditando] = useState(false);
  /** El kit, visto y editado sin salir de la cotización (25/09). */
  const [viendoKit, setViendoKit] = useState(false);
  /** El diálogo de precios y stock (17/09). */
  const [viendo, setViendo] = useState(false);
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

  /** ¿Alguna de las ventas que llegaron es de ESTE cliente? */
  const hayDelCliente = historial.some((v) => v.mismo_cliente);

  const abrirHistorial = () => {
    setPanel("historial");
    if (historial.length > 0 || !linea.productoId) return;
    traerHistorial(cuantasVentas);
  };

  return (
    <>
      <tr className={revision.ok ? "" : "bg-[var(--danger-bg)]"}>
        {/*
          El número de línea y las flechas que lo cambian, juntos.

          Estaban al final, en «Acciones», donde ocupaban 70 px fijos de una
          columna que en la pantalla de Willy ahogaba a todas las demás. Y
          estaban lejos de lo único que modifican: este número.

          No se esconden —siguen siendo dos botones con su `aria-label`—; se
          mudan a donde significan algo.
        */}
        <td className="align-top">
          <div className="flex items-center gap-0.5">
            <span className="tabular text-[var(--fg-muted)]">{indice + 1}</span>
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => despachar({ tipo: "mover", key: linea.key, direccion: -1 })}
                disabled={indice === 0}
                className="flex h-4 w-5 items-center justify-center rounded-sm text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)] disabled:opacity-25"
                aria-label={`Subir ${linea.codigo}`}
                title="Subir"
              >
                <ChevronUp className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => despachar({ tipo: "mover", key: linea.key, direccion: 1 })}
                disabled={indice === total - 1}
                className="flex h-4 w-5 items-center justify-center rounded-sm text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)] disabled:opacity-25"
                aria-label={`Bajar ${linea.codigo}`}
                title="Bajar"
              >
                <ChevronDown className="size-3.5" />
              </button>
            </div>
          </div>
        </td>

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
        {/* Un código no se parte: «6310-2Z/C3» en dos renglones deja de
            parecerse a lo que el cliente tiene escrito en su orden. */}
        <td className="min-w-[6.5rem]">
          <div className="whitespace-nowrap font-medium">{linea.codigo}</div>
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

        {/*
          C2: la marca en columna propia. Y se LEE, no se teclea.

          Estuvo unas horas siendo una caja de texto, porque era el único sitio
          donde se podía arreglar el retén que sale «sin marca». Luis, 16/09,
          en cuanto «Editar artículo» pasó a traer la ficha entera: *«¿qué pasó
          con esto?, ¿por qué se puede cambiar eso?, no quedamos… y ocupa mucho
          también»*.

          Las dos cosas son ciertas. La caja se comía entre 112 y 199 px de una
          fila donde la descripción es lo que hay que leer, y desde que el
          diálogo edita el catálogo había dos maneras de cambiar la marca sin
          que nada dijera en qué se diferencian.

          Ahora hay una sola puerta —el menú— con las dos salidas dentro y su
          alcance escrito. Y el caso del retén no se pierde: en el diálogo se
          elige «solo en esta cotización», que es donde 45x60x8TC se vende como
          LYO, NQK, PHK o NAK sobre una única fila del maestro.
        */}
        <td className="text-sm">
          {linea.marca ?? (
            <span className="text-[var(--fg-subtle)]">sin marca</span>
          )}
        </td>

        {/* C3: la descripción no repite el código. */}
        <td className="text-sm">{linea.descripcion}</td>

        {/*
          La cantidad, con un ancho que NO se puede aplastar.

          Willy, 16/09: *«le he ingresado 50 unidades y no se ve la cantidad
          completa, solo el 0»*. Y era literal: en su pantalla esta caja medía
          **42 px**.

          El motivo no estaba aquí sino al final de la fila. Los botones de
          «Alternativas» y «Ventas» enseñan su texto desde `xl` (1280 px) y no
          se encogen, así que en una pantalla de 1600 —la de Willy— la columna
          de acciones se queda con 414 px fijos y el resto de columnas se
          reparten lo que sobra. Las de texto se parten en más renglones; las
          que llevan un campo dentro, no: se quedan sin sitio donde escribir.

          `min-w` en el propio campo es lo que lo impide. Un ancho en el `<td>`
          no basta: en una tabla es una sugerencia, y el navegador la ignora
          cuando va justo. Si con esto la tabla no cabe, se desplaza —para eso
          está `scroll-x`—, que es mucho mejor que una caja donde no se lee lo
          que se acaba de teclear.
        */}
        <td className="w-24">
          <Input
            type="number"
            min={0}
            step="any"
            value={linea.cantidad}
            onChange={(e) =>
              despachar({ tipo: "cantidad", key: linea.key, valor: Number(e.target.value) })
            }
            className="min-w-[4.5rem] text-right tabular"
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
            // Sin `min-w`, la columna lo estrechaba hasta dejar «Inmedia» y
            // media flecha: una promesa de entrega a medio leer.
            className="h-control-sm min-w-[7rem] text-xs"
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
            /*
              El aviso, corto.

              Decía «sin stock para prometer entrega inmediata»: cuarenta
              caracteres dentro de una columna estrecha, que en la pantalla de
              Willy se partían en CUATRO renglones y estiraban la fila entera.
              La frase completa se queda en el `title`, para quien pase el
              ratón; lo que se lee de un vistazo es que algo va mal, y eso cabe
              en dos palabras. La columna de al lado ya dice qué se prometió.
            */
            <span
              className="mt-1 block text-sm font-medium text-[var(--warn)]"
              title={
                sinNada
                  ? "No hay stock para prometer entrega inmediata"
                  : `Solo hay ${linea.stock} para prometer entrega inmediata`
              }
            >
              {sinNada ? "sin stock" : `solo ${linea.stock}`}
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
            className={`min-w-[5.5rem] text-right tabular ${revision.ok ? "" : "border-[var(--danger)]"}`}
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
              className={`min-w-[4rem] text-right tabular ${revision.ok ? "" : "border-[var(--danger)]"}`}
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

        {/*
          Todo lo de la línea, en un menú.

          Luis, 16/09, con el menú de otro sistema en la pantalla: *«yo creo
          que así está bien… ahí adentro también estaría alternativas, ventas,
          eliminar si se queda»*.

          -------------------------------------------------------------------
          Esto DESHACE una decisión del 08/09, y conviene saberlo
          -------------------------------------------------------------------
          «Alternativas» y «Ventas anteriores» existen desde la 011 y Willy no
          las encontró nunca: la primera era un enlace ámbar de 12 px que solo
          aparecía SIN stock; la segunda, un enlace azul partido en dos
          renglones. En 47:00, tecleando un precio, preguntó si el sistema no
          le mostraba *«a quién se ha vendido, a cuánto se ha vendido»* — y lo
          tenía delante. Por eso el 08/09 se sacaron a botones con su palabra.

          Volverlas a meter en un menú es repetir la forma del problema. Se
          hace igual, porque lo pidió, y porque hay tres diferencias que no
          son de estilo:

            · el menú lo abre un botón con borde, no un enlace gris — el
              disparador SE VE, que es lo que fallaba;
            · dentro se leen con su nombre entero a 14 px, no abreviadas
              («hist.») ni a 12;
            · y salen SIEMPRE, con stock o sin él. Lo de 011 no era solo que
              fuera pequeño: es que con stock no existía.

          A cambio, la columna baja de 414 px fijos a los 52 de un botón, que
          es de donde sale el sitio para que se lea la cantidad.
        */}
        <td>
          <DropdownMenu>
            <DropdownMenuTrigger
              title={`Opciones de ${linea.codigo}`}
              aria-label={`Opciones de ${linea.codigo}`}
              className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--border)] px-2 text-[var(--fg)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
            >
              <MoreVertical className="size-[18px]" aria-hidden="true" />
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-60">
              {/*
                Lo primero, lo que pidió Luis: *«en la opción de editar
                artículo deben aparecer todos los campos editables: código,
                marca, descripción»*. Se puede en las líneas escritas a mano
                —sin `productoId`— igual que en las del catálogo: lo que se
                edita es la copia impresa, y esa la tienen las dos.
              */}
              {/*
                Un KIT, lo primero: ver lo que lleva, y cambiarlo ahí mismo.

                Luis, 25/09: *«solo si es un kit, en los tres puntos ver
                detalle de kit […] un nuevo modal ahí mismo, así es dinámico en
                la misma cotización, para no regresar a la otra ventana»*. Y es
                lo que Willy buscó en la reunión del 24/09 (8:09) y no
                encontró: tenía «Editar artículo», que cambia la copia impresa
                de la línea, no lo que el kit lleva dentro.
              */}
              {linea.esKit && linea.productoId ? (
                <>
                  <DropdownMenuItem
                    onSelect={() => requestAnimationFrame(() => setViendoKit(true))}
                  >
                    <Package />
                    Ver kit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              ) : null}

              <DropdownMenuItem onSelect={() => setEditando(true)}>
                <Pencil />
                Editar artículo
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {/*
                Ver precios y ver stock, las dos que pidió Luis el 17/09:
                *«en las opciones hay que ponerlo ver stock y ver precios, y le
                salga modal de los precios pues: compra, precio mínimo, precio
                venta, etc.»*.

                Son DOS entradas y UN diálogo, no dos pantallas. Quien busca el
                stock y quien busca el costo entran por la palabra que tiene en
                la cabeza, pero una vez dentro lo que se mira es lo mismo: si
                este precio vale la pena y si hay para despachar. Partirlo en
                dos modales obligaría a abrir los dos para decidir una cosa.

                Y responde a lo que Willy pidió el 16/09 (7:30): *«puede verlos
                los precios como un ojito, y ver a cuánto lo compró, a cuánto
                le costó y a cuánto lo está vendiendo»*.
              */}
              <DropdownMenuItem onSelect={() => requestAnimationFrame(() => setViendo(true))}>
                <DollarSign />
                Ver precios
              </DropdownMenuItem>

              <DropdownMenuItem onSelect={() => requestAnimationFrame(() => setViendo(true))}>
                <Boxes />
                Ver stock
                {/* El número, ya en el menú: muchas veces es lo único que se
                    venía a mirar, y así no hace falta abrir nada. */}
                <span className="ml-auto tabular text-sm text-[var(--fg-muted)]">
                  {linea.stock}
                </span>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {/*
                `onSelect` con el diálogo: Radix devuelve el foco al
                disparador al cerrarse el menú, y si el diálogo ya se montó se
                lo quita de las manos. Se deja cerrar antes con un
                `requestAnimationFrame`.
              */}
              <DropdownMenuItem
                disabled={!linea.productoId}
                onSelect={() => requestAnimationFrame(abrirSustitutos)}
              >
                <ArrowLeftRight />
                Ver alternativas
              </DropdownMenuItem>

              <DropdownMenuItem
                disabled={!linea.productoId}
                onSelect={() => requestAnimationFrame(abrirHistorial)}
              >
                <History />
                Ventas anteriores
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {/* «Quitar de la cotización» y no «Eliminar»: no se borra nada,
                  sale de este papel. La misma distinción que «dar de baja» en
                  el catálogo (24:21). */}
              <DropdownMenuItem
                destructivo
                onSelect={() => despachar({ tipo: "quitar", key: linea.key })}
              >
                <Trash2 />
                Quitar de la cotización
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
      {/*
        Montado solo cuando se abre, y no con `open={editando}`.

        Sus tres cajas nacen de la línea con `useState`, y `useState` no se
        reinicializa cuando cambia una prop —la trampa que ya mordió en este
        proyecto—. Si el diálogo viviera siempre montado, editar una línea,
        cerrar y abrir otra enseñaría los datos de la primera. Desmontarlo es
        lo que garantiza que empiece por lo que hay AHORA en la línea.
      */}
      {viendo ? (
        <PreciosYStock linea={linea} onCerrar={() => setViendo(false)} />
      ) : null}

      {/* Montado solo al abrirse, por lo mismo que los demás. */}
      {viendoKit ? (
        <DialogoKit
          linea={linea}
          puedeEditarKit={puedeEditarKit}
          onCerrar={() => setViendoKit(false)}
          onKitGuardado={(producto, anterior) =>
            despachar({ tipo: "refrescarKit", key: linea.key, producto, anterior })
          }
        />
      ) : null}

      {editando ? (
        <EditarArticulo
          linea={linea}
          onCerrar={() => setEditando(false)}
          onGuardar={(c) => {
            // Con ficha: un solo hecho, una sola acción, y la línea se pone al
            // día del costo y del piso además de lo impreso.
            if (c.ficha) {
              despachar({
                tipo: "fichaActualizada",
                key: linea.key,
                datos: {
                  codigo: c.codigo,
                  marca: c.marca.trim() ? c.marca.trim() : null,
                  descripcion: c.descripcion,
                  ...c.ficha,
                },
              });
              return;
            }
            // Solo en esta cotización: se toca lo que se imprime y nada más.
            despachar({ tipo: "codigo", key: linea.key, valor: c.codigo });
            despachar({ tipo: "marca", key: linea.key, valor: c.marca });
            despachar({ tipo: "descripcion", key: linea.key, valor: c.descripcion });
          }}
        />
      ) : null}

      <Dialog
        open={panel === "sustitutos"}
        onOpenChange={(v) => setPanel(v ? "sustitutos" : "ninguno")}
      >
        <DialogContent className="max-w-5xl">
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
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Ventas anteriores · {linea.codigo}</DialogTitle>
            {/*
              La frase dice lo que hay, no lo que se pretendía.

              Decía «lo que ya se le vendió a este cliente» siempre, y era
              mentira en el caso más común: si el cliente nunca compró ese
              código, la lista sale llena de OTROS clientes bajo un título que
              afirma que son suyos. Luis lo cazó el 09/09 mirando una venta a
              INDUSTRIAL TECHNOLOGY en una cotización que no era para ellos.

              El orden sí era el correcto desde la 011 —lo de este cliente
              primero, que es lo que pidió Willy en 50:25— y sigue igual. Lo
              que fallaba era el rótulo.
            */}
            <DialogDescription>
              {!clienteId
                ? "Elige un cliente y verás primero lo que se le vendió a él."
                : hayDelCliente
                  ? "Primero lo de este cliente, y debajo lo de los demás."
                  : "Este cliente no ha comprado este producto antes. Estas son las últimas ventas a otros."}
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
        <thead className="border-b border-[var(--border)] text-left text-sm uppercase tracking-wide text-[var(--fg-subtle)]">
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
              {/* `whitespace-nowrap`: partir «6309-2Z/C3» en dos líneas por la
                  raya lo convierte en dos códigos que no existen, y en este
                  catálogo el código ES el producto. */}
              <td className="whitespace-nowrap py-2.5 pr-3 align-top">
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
                  <SquareArrowOutUpRight className="size-4 shrink-0" />
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
