"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  DollarSign,
  MoreVertical,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  Badge,
  Button,
  Campo,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Switch,
  Table,
  TableContenedor,
  TBody,
  THead,
  toast,
} from "@rodatech/ui";

/*
  Por RUTA y no desde `@/modules/cotizaciones`.

  Ese barrel mezcla Server y Client Components, así que importarlo desde aquí
  —que es cliente— arrastra `lib/emisor.ts` con su `server-only` y el build
  falla. Se probó, y falló. Los tres archivos de abajo son clientes puros.
*/
import { BuscadorLineas } from "@/modules/cotizaciones/ui/constructor/buscador";
import { EditarArticulo } from "@/modules/cotizaciones/ui/constructor/editar-articulo";
import { PreciosYStock } from "@/modules/cotizaciones/ui/constructor/precios-y-stock";
import type {
  LineaConstructor,
  ProductoParaCotizar,
} from "@/modules/cotizaciones/dominio/constructor";

import { guardarKit, otrosKitsDe } from "../../acciones/kits";
import type { KitDetalle } from "../../api/kits";

const dolar = (n: number) =>
  n.toLocaleString("es-PE", { style: "currency", currency: "USD" });

interface Linea {
  producto_id: string;
  codigo: string;
  descripcion: string;
  marca: string | null;
  unidad: string;
  cantidad: number;
  stock: number;
  /** Lo que vale DENTRO del kit. Se puede cambiar, como en una cotización. */
  precioVenta: number;
  /** El de lista del producto, para poder volver a él. */
  precioLista: number;
  /** El descuento de esta pieza dentro del kit, en por ciento (088). */
  descuentoPct: number;
  costo: number;
  costoDelKardex: boolean;
  precioMinimo: number;
  precioMercado: number;
}

/**
 * La línea del kit, vestida de línea de cotización.
 *
 * «Ver precios», «Ver stock» y «Editar artículo» son los MISMOS diálogos del
 * cotizador —Luis, 17/09: *«no hay los puntos, así como cotización, para que
 * edite, ver stock, precio»*— y hablan `LineaConstructor`. Traducir aquí sale
 * muchísimo más barato que mantener dos versiones de cada diálogo, que es como
 * se garantiza que el día que se arregle uno, el otro no.
 *
 * El descuento SÍ viaja desde la 088, y hace falta que viaje: «Ver precios»
 * enseña el neto y avisa si se bajó del precio mínimo, y esa cuenta no sale
 * sin él. Lo que un kit no tiene es plazo de entrega —eso se promete en la
 * cotización, sobre el kit entero— y va en su valor neutro.
 */
function comoLineaDeCotizacion(l: Linea): LineaConstructor {
  return {
    key: l.producto_id,
    productoId: l.producto_id,
    // Una pieza de un kit nunca es un kit: lo impide `kit_solo_lleva_piezas`
    // (085), porque un kit dentro de otro haría el stock infinito de calcular.
    esKit: false,
    codigo: l.codigo,
    marca: l.marca,
    descripcion: l.descripcion,
    unidad: l.unidad,
    cantidad: l.cantidad,
    valorUnitario: l.precioVenta,
    descuentoPct: l.descuentoPct,
    costoUnitario: l.costo,
    costoDelKardex: l.costoDelKardex,
    precioMinimo: l.precioMinimo,
    precioMercado: l.precioMercado,
    // Lo que se COBRA en el kit va en `valorUnitario`; el de lista es la
    // referencia contra la que se compara. Si fueran el mismo, el modal no
    // podría decir «lo bajaste de 100 a 70».
    precioLista: l.precioLista,
    stock: l.stock,
    disponibilidad: "inmediata",
    diasEntrega: null,
  };
}

/**
 * Armar un kit, que es literalmente hacer una cotización que se guarda.
 *
 * Luis, 17/09: *«un kit es poner varios productos como haciendo una cotización;
 * se le pone un código único, una descripción y un precio general, o sea la
 * suma de todos los productos»*.
 *
 * Por eso reutiliza el MISMO buscador del constructor de cotizaciones y no uno
 * propio: es el gesto que Willy ya tiene aprendido —teclear el código y dar a
 * Enter— y el que sabe crear un producto que no existe sin salir de aquí.
 */
export function FormularioKit({
  kit,
  alGuardar,
  alCancelar,
  enModal = false,
}: {
  kit: KitDetalle | null;
  /**
   * Dentro de un modal (25/09): en vez de navegar al listado al guardar, se
   * avisa a quien lo abrió. Luis: *«es un nuevo modal ahí mismo, así es
   * dinámico en la misma cotización para no regresar a la otra ventana»*.
   *
   * Es EL MISMO editor, no una copia. Copiarlo al modal daría dos formas de
   * editar un kit que con el tiempo dejarían de hacer lo mismo — que es como
   * salieron los 47 px contra 40 de §AM.13.
   */
  alGuardar?: (r: { id: string; codigo: string }) => void;
  alCancelar?: () => void;
  /** Sin la cabecera de página ni los márgenes que suponen una página. */
  enModal?: boolean;
}) {
  const router = useRouter();
  const [guardando, empezar] = React.useTransition();

  const [codigo, setCodigo] = React.useState(kit?.codigo ?? "");
  const [descripcion, setDescripcion] = React.useState(kit?.descripcion ?? "");
  const [lineas, setLineas] = React.useState<Linea[]>(
    (kit?.componentes ?? []).map((c) => ({
      producto_id: c.producto_id,
      codigo: c.codigo,
      descripcion: c.descripcion,
      unidad: c.unidad,
      cantidad: c.cantidad,
      stock: c.stock,
      precioVenta: c.precioVenta,
      precioLista: c.precioLista,
      descuentoPct: c.descuentoPct,
      costo: c.costo,
      marca: c.marca,
      costoDelKardex: c.costoDelKardex,
      precioMinimo: c.precioMinimo,
      precioMercado: c.precioMercado,
    })),
  );

  /** Qué fila tiene abierto cada diálogo, por producto_id. */
  const [viendo, setViendo] = React.useState<string | null>(null);
  const [editando, setEditando] = React.useState<string | null>(null);

  /*
    En qué OTROS kits está cada pieza.

    Luis, 17/09: *«también si el producto está en otro kit»*. Es la pregunta
    que aparece en cuanto hay más de un kit: si se cambia el precio de un retén
    o si se agota, ¿a qué más arrastra? Un o-ring puede estar en los seis.

    Se pide cuando cambia la LISTA de ids, no en cada tecla: cambiar una
    cantidad no cambia en qué kits está nada.
  */
  const [otros, setOtros] = React.useState<Record<string, { id: string; codigo: string }[]>>({});
  const idsComponentes = lineas.map((l) => l.producto_id).join(",");

  React.useEffect(() => {
    const ids = idsComponentes ? idsComponentes.split(",") : [];
    if (ids.length === 0) {
      setOtros({});
      return;
    }
    let vivo = true;
    otrosKitsDe(ids, kit?.id).then((m) => {
      if (vivo) setOtros(m);
    });
    return () => {
      vivo = false;
    };
  }, [idsComponentes, kit?.id]);

  /** ¿Alguna pieza está en otro kit? Si no, la columna no se dibuja. */
  const hayCompartidos = lineas.some((l) => (otros[l.producto_id] ?? []).length > 0);

  /*
    El descuento por pieza, y el interruptor que lo enseña.

    Luis, 17/09: *«falta poner esto, si va a haber descuento o no»*. Es el
    mismo trato que en la cotización —Willy, 16/09 (15:52): *«esa columna se
    puede incluir o no según el caso»*—, y por el mismo motivo: una columna
    que dice 0 en las seis filas es ruido en una pantalla que hay que leer.

    Arranca encendido si el kit YA trae descuentos, porque si no, al abrirlo
    se vería una suma que no cuadra con los precios de al lado y no habría
    dónde mirar por qué. No se guarda en ninguna columna a propósito: «sin
    descuento» y «descuento del 0 %» son lo mismo, así que el estado se
    deduce de los datos y no hay dos sitios que puedan discrepar.
  */
  const [conDescuento, setConDescuento] = React.useState(
    (kit?.componentes ?? []).some((c) => c.descuentoPct > 0),
  );

  /** El unitario ya rebajado. Mismo redondeo a 4 que `kit_suma` en la base. */
  const netoDe = (l: Linea) =>
    Math.round(l.precioVenta * (1 - l.descuentoPct / 100) * 1e4) / 1e4;

  const suma = lineas.reduce((t, l) => t + netoDe(l) * l.cantidad, 0);
  const sumaCosto = lineas.reduce((t, l) => t + l.costo * l.cantidad, 0);

  /*
    Piezas que quedaron por debajo de su precio mínimo de venta.

    Se AVISA y se deja guardar, que es lo que decidió Luis el 17/09 para la
    cotización. Aquí con más razón: lo que el cliente paga es el precio del
    kit, y dentro del kit una pieza puede ir a pérdida mientras el conjunto
    gane. Pero que se sepa: un kit entero bajo mínimo se hace de una pieza en
    una pieza sin que nadie lo note.
  */
  const bajoMinimo = lineas.filter(
    (l) => l.precioMinimo > 0 && netoDe(l) < l.precioMinimo,
  );

  /*
    El precio se PROPONE y se puede cambiar.

    La suma es el punto de partida —Willy: *«hay que ingresar el precio de cada
    uno para que te calcule el precio final»*— pero un kit se cobra redondeado,
    o con un descuento por llevarlo junto. Si el precio fuera la suma y nada
    más, habría que retocar los productos para poder cobrar 400 en vez de
    415.04, y eso cambiaría el precio de cada pieza suelta.
  */
  const [precio, setPrecio] = React.useState(
    kit ? String(kit.precioVenta) : "",
  );

  /*
    Sigue a la suma también AL EDITAR, no solo al crear.

    Luis, 17/09: *«en editar veo que no suma automáticamente; el precio actual
    sí debería sumar automáticamente, y abajo debería salirle el precio
    anterior — así como en los productos, cuando cambio me dice "regresar como
    estaba"»*.

    Antes arrancaba en `true` al editar, con el argumento de que el precio
    guardado es una decisión y no se pisa sola. Pero eso dejaba la pantalla
    mintiendo: se cambiaba el precio de una pieza, la suma se movía, y arriba
    seguía el número viejo sin decir nada. Un precio que no se entera de que
    cambió lo que lo compone es peor que uno que se mueve a la vista.

    Lo que hace que esto sea seguro es el aviso de abajo: mientras el precio
    no sea el guardado, se dice cuál era y se puede volver de un clic. Es el
    mismo trato que ya tienen el precio de la pieza y el de la ficha del
    producto.
  */
  const [precioAMano, setPrecioAMano] = React.useState(false);

  /** El que tenía guardado al abrir, para poder volver a él. */
  const precioGuardado = kit?.precioVenta ?? null;

  React.useEffect(() => {
    if (!precioAMano) setPrecio(suma > 0 ? suma.toFixed(2) : "");
  }, [suma, precioAMano]);

  /** Cuántos kits se pueden armar: el componente que menos alcanza manda. */
  const armable =
    lineas.length === 0
      ? 0
      : Math.min(
          ...lineas.map((l) => (l.cantidad > 0 ? Math.floor(l.stock / l.cantidad) : 0)),
        );

  /*
    Una pieza «frena» al kit si alcanza para menos que alguna otra. Si todas
    alcanzan lo mismo —lo normal con el almacén en cero— ninguna frena, y
    marcarlas todas decía «es la que limita» de cada una, que no responde a
    nada.
  */
  const algunaFrena = lineas.some(
    (l) => (l.cantidad > 0 ? Math.floor(l.stock / l.cantidad) : 0) > armable,
  );

  function agregar(p: ProductoParaCotizar) {
    setLineas((ls) => {
      const ya = ls.find((l) => l.producto_id === p.id);
      // Repetir un producto suma cantidad en vez de crear otra línea: la clave
      // de `kit_componentes` es (kit, producto) y dos filas del mismo código
      // en una lista se leen como un error de quien la escribió.
      if (ya) {
        return ls.map((l) =>
          l.producto_id === p.id ? { ...l, cantidad: l.cantidad + 1 } : l,
        );
      }
      return [
        ...ls,
        {
          producto_id: p.id,
          codigo: p.codigo,
          descripcion: p.descripcion,
          unidad: p.unidad ?? "NIU",
          cantidad: 1,
          stock: p.stock ?? 0,
          precioVenta: p.precio_venta,
          precioLista: p.precio_venta,
          descuentoPct: 0,
          costo: p.costo_promedio || p.ultimo_costo || 0,
          marca: p.marca,
          costoDelKardex: (p.costo_promedio ?? 0) > 0,
          precioMinimo: p.precio_minimo ?? 0,
          precioMercado: p.precio_mercado ?? 0,
        },
      ];
    });
  }

  const listo =
    codigo.trim().length > 0 && descripcion.trim().length >= 3 && lineas.length > 0;

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!listo) return;

    empezar(async () => {
      const r = await guardarKit({
        id: kit?.id,
        codigo: codigo.trim(),
        descripcion: descripcion.trim(),
        precio_venta: Number(precio) || 0,
        componentes: lineas.map((l) => ({
          producto_id: l.producto_id,
          cantidad: l.cantidad,
          /*
            Si el precio es el mismo de lista, se guarda NULL.

            Así el kit sigue al maestro: el día que suba el precio de un
            rodamiento, los kits que no lo habían tocado suben con él. Guardar
            una copia del precio de lista los dejaría congelados en el de hoy
            sin que nadie lo hubiera decidido.
          */
          precio_unitario: l.precioVenta === l.precioLista ? null : l.precioVenta,
          /*
            El PORCENTAJE, no el precio ya rebajado (088).

            Un 20 % y un «23.17» no dicen lo mismo dentro de seis meses: con el
            porcentaje el kit sigue al precio de lista sin perder lo negociado;
            con el número final se queda congelado y hay que rehacer la cuenta
            a mano. Y si el interruptor está apagado no hay descuento que
            guardar, aunque queden números viejos en el estado.
          */
          descuento_pct: conDescuento ? l.descuentoPct : 0,
        })),
      });

      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`${r.codigo} guardado.`);
      if (alGuardar) {
        alGuardar({ id: r.id, codigo: r.codigo });
        return;
      }
      router.push("/productos/kits");
      router.refresh();
    });
  }

  /** Cambia una pieza del kit. La usan la tabla y las tarjetas del teléfono. */
  function cambiar(id: string, parche: Partial<Linea>) {
    setLineas((ls) => ls.map((x) => (x.producto_id === id ? { ...x, ...parche } : x)));
  }

  /**
   * El mismo menú «⋮» de la línea de cotización.
   *
   * Luis, 17/09: *«aquí tampoco hay los puntos, así como cotización, para que
   * edite, ver stock, precio; falta eso para que puedan tener control total»*.
   * Y tiene razón por dónde se decide: armando un kit es cuando uno se entera
   * de que a una pieza le falta el costo, o de que su descripción está mal —
   * no visitando el catálogo.
   *
   * Los diálogos son los MISMOS del cotizador, no copias. Y el menú es uno
   * solo para la tabla y la tarjeta del teléfono: el `type="button"` de abajo
   * ya costó un disgusto y no conviene que exista en dos sitios.
   */
  function menuDe(l: Linea) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          /*
            `type="button"` NO es decorativo aquí.

            Este menú vive DENTRO del `<form>` del kit, y un `<button>` sin type
            dentro de un formulario es un botón de ENVÍO. Sin esto, abrir el
            menú guardaba el kit.

            En la cotización no se notaba porque allí el submit está
            deshabilitado mientras falten datos.
          */
          type="button"
          title={`Opciones de ${l.codigo}`}
          aria-label={`Opciones de ${l.codigo}`}
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-[var(--border)] px-2 text-[var(--fg)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
        >
          <MoreVertical className="size-[18px]" aria-hidden="true" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onSelect={() => setEditando(l.producto_id)}>
            <Pencil />
            Editar artículo
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onSelect={() => setViendo(l.producto_id)}>
            <DollarSign />
            Ver precios
          </DropdownMenuItem>

          <DropdownMenuItem onSelect={() => setViendo(l.producto_id)}>
            <Boxes />
            Ver stock
            <span className="ml-auto tabular text-sm text-[var(--fg-muted)]">{l.stock}</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            destructivo
            onSelect={() => setLineas((ls) => ls.filter((x) => x.producto_id !== l.producto_id))}
          >
            <Trash2 />
            Quitar del kit
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <form onSubmit={enviar} className={`flex flex-col gap-5 ${enModal ? "" : "sm:p-6"}`}>
      {/* En el modal el título lo pone el propio diálogo. */}
      {enModal ? null : (
        <header>
          <h1 className="text-xl font-semibold">
            {kit ? `Editar ${kit.codigo}` : "Nuevo kit"}
          </h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Junta varios productos bajo un código y un precio. El cliente lo pide
            por ese código y en la cotización sale como un solo ítem.
          </p>
        </header>
      )}

      <section className="card p-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <Campo
            id="kit-codigo"
            label="Código"
            requerido
            ayuda="Es por el que el cliente lo va a pedir."
          >
            <Input
              id="kit-codigo"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              className="font-mono"
              placeholder="KIT-MOTOR-1"
              required
            />
          </Campo>

          <Campo
            id="kit-descripcion"
            label="Descripción"
            requerido
            ayuda="Lo que se imprime en la cotización y en la factura."
          >
            <Input
              id="kit-descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Kit de reparación para motorreductor 1"
              required
            />
          </Campo>
        </div>
      </section>

      {/* --------------------------------------------------- Contenido */}
      <section className="card @container p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Qué lleva dentro</h2>
            <p className="text-sm text-[var(--fg-muted)]">
              Búscalos igual que en una cotización. El precio de cada uno no se
              imprime: solo suma para el total.
            </p>
          </div>

          {/*
            El interruptor del descuento, pegado a la tabla que gobierna.

            Luis, 17/09: *«falta poner esto, si va a haber descuento o no»*. En
            la cotización vive en el panel «El documento» porque allí decide
            qué se IMPRIME. Aquí no imprime nada —los precios de las piezas no
            salen en el papel—: decide qué columna se ve mientras se arma, así
            que va donde está lo que cambia.

            Apagarlo NO borra lo tecleado del estado, para que encenderlo otra
            vez por error no cueste rehacer seis descuentos. Lo que sí hace es
            guardar ceros: al apagarlo, el kit no lleva descuento.
          */}
          <label className="flex cursor-pointer items-start gap-3">
            <span className="text-sm">
              Trabajar con descuento
              <span className="mt-0.5 block text-sm text-[var(--fg-muted)]">
                Solo si de verdad hay algo que descontar.
              </span>
            </span>
            <Switch
              checked={conDescuento}
              onCheckedChange={setConDescuento}
              aria-label="Trabajar con descuento en las piezas del kit"
            />
          </label>
        </div>

        <BuscadorLineas onElegir={agregar} />

        {lineas.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--fg-muted)]">
            Busca un producto arriba para empezar a armar el kit.
          </p>
        ) : (
          <>
          {/*
            Una tarjeta por pieza cuando la tabla no cabe.

            La tabla pide 850 px, y 944 con el descuento encendido: con menos,
            la cantidad y el precio —lo único que se teclea— quedaban fuera, a
            la derecha, y había que deslizarla de lado para llegar. Luis,
            25/09: *«cualquier módulo, cambio, tiene que ser 100 % responsivo,
            buen diseño y que todo cuadre»*.

            Se decide por el ancho de ESTA sección (`@container`), no de la
            pantalla, porque el formulario vive en dos sitios: su página y el
            modal de la cotización, que a igual pantalla es más estrecho. El
            corte (`@4xl`, 952 px) es el de la tabla con descuento.

            Los mismos datos que la fila, en el mismo orden de lectura: qué es,
            lo que se teclea, lo que resulta.
          */}
          <ul className="flex flex-col gap-2.5 @4xl:hidden">
            {lineas.map((l) => {
              const alcanza = l.cantidad > 0 ? Math.floor(l.stock / l.cantidad) : 0;
              const frena = algunaFrena && alcanza === armable;
              const compartido = otros[l.producto_id] ?? [];
              return (
                <li
                  key={l.producto_id}
                  className="rounded-md border border-[var(--border)] p-3"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm font-semibold">{l.codigo}</p>
                      <p className="text-sm">{l.descripcion}</p>
                    </div>
                    {menuDe(l)}
                  </div>

                  <div
                    className={`mt-3 grid gap-3 ${conDescuento ? "grid-cols-3" : "grid-cols-2"}`}
                  >
                    <label className="flex min-w-0 flex-col gap-1">
                      <span className="text-sm font-medium">Cant. ({l.unidad})</span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0.01}
                        step="any"
                        value={l.cantidad}
                        onChange={(e) =>
                          cambiar(l.producto_id, { cantidad: Number(e.target.value) || 0 })
                        }
                        className="text-right tabular"
                      />
                    </label>
                    <label className="flex min-w-0 flex-col gap-1">
                      <span className="text-sm font-medium">Valor unit.</span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={l.precioVenta}
                        onChange={(e) =>
                          cambiar(l.producto_id, { precioVenta: Number(e.target.value) || 0 })
                        }
                        className="text-right tabular"
                      />
                    </label>
                    {conDescuento ? (
                      <label className="flex min-w-0 flex-col gap-1">
                        <span className="text-sm font-medium">Desc. %</span>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={100}
                          step="0.01"
                          value={l.descuentoPct}
                          onChange={(e) => {
                            const v = Number(e.target.value) || 0;
                            cambiar(l.producto_id, {
                              descuentoPct: Math.min(100, Math.max(0, v)),
                            });
                          }}
                          className="text-right tabular"
                        />
                      </label>
                    ) : null}
                  </div>

                  {/* Aquí sí cabe la frase entera: en la tabla no, y por eso
                      allí es solo la flecha y el número. */}
                  {l.precioVenta !== l.precioLista ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => cambiar(l.producto_id, { precioVenta: l.precioLista })}
                      className="mt-2 text-sm"
                    >
                      <RotateCcw className="size-4" aria-hidden="true" />
                      Volver al de lista: {dolar(l.precioLista)}
                    </Button>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-t border-[var(--border-soft)] pt-2 text-sm">
                    <p>
                      <span className="text-[var(--fg-muted)]">Stock </span>
                      <span className="tabular">{l.stock}</span>
                      <span className="text-[var(--fg-muted)]"> · alcanza para </span>
                      <span
                        className={`tabular ${frena ? "font-semibold text-[var(--warn)]" : ""}`}
                      >
                        {alcanza}
                      </span>
                    </p>
                    <p className="text-right">
                      <span className="text-[var(--fg-muted)]">Importe </span>
                      <span className="tabular font-semibold">
                        {dolar(netoDe(l) * l.cantidad)}
                      </span>
                      {conDescuento && l.descuentoPct > 0 ? (
                        <span className="ml-1.5 text-[var(--fg-muted)] line-through">
                          {dolar(l.precioVenta * l.cantidad)}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  {frena ? (
                    <p className="mt-1 text-sm text-[var(--warn)]">
                      Es la que limita cuántos kits se pueden armar.
                    </p>
                  ) : null}
                  {compartido.length > 0 ? (
                    <p className="mt-1 flex flex-wrap items-center gap-1 text-sm text-[var(--fg-muted)]">
                      También en
                      {compartido.map((k) => (
                        <Badge key={k.id} tone="neutral" size="xs">
                          {k.codigo}
                        </Badge>
                      ))}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <div className="hidden @4xl:block">
          <TableContenedor>
            <Table>
              <THead>
                <tr>
                  <th className="text-left">Código</th>
                  <th className="text-left">Descripción</th>
                  <th className="text-right">Cant.</th>
                  <th className="text-left">U.M.</th>
                  {/* Las mismas dos columnas de una cotización, y en el mismo
                      orden. Luis, 17/09: *«igual como hacer una cotización es
                      hacer un kit»*. */}
                  <th className="text-right">Valor unit.</th>
                  {conDescuento ? <th className="text-right">Desc. %</th> : null}
                  <th className="text-right">Importe</th>
                  <th className="text-right">Stock</th>
                  <th className="text-right">Alcanza</th>
                  {/* Solo si alguna pieza está en otro kit: una columna vacía
                      en todas las filas es una pregunta que nadie hizo. */}
                  {hayCompartidos ? <th className="text-left">En otros kits</th> : null}
                  <th className="text-right" />
                </tr>
              </THead>
              <TBody>
                {lineas.map((l) => {
                  const alcanza =
                    l.cantidad > 0 ? Math.floor(l.stock / l.cantidad) : 0;
                  // El que frena al kit entero se marca: es la respuesta a
                  // «¿por qué solo puedo armar 3?».
                  const frena = algunaFrena && alcanza === armable;
                  return (
                    <tr key={l.producto_id}>
                      <td className="whitespace-nowrap font-medium">{l.codigo}</td>
                      <td className="text-sm">{l.descripcion}</td>
                      <td className="w-24">
                        <Input
                          type="number"
                          min={0.01}
                          step="any"
                          value={l.cantidad}
                          onChange={(e) =>
                            setLineas((ls) =>
                              ls.map((x) =>
                                x.producto_id === l.producto_id
                                  ? { ...x, cantidad: Number(e.target.value) || 0 }
                                  : x,
                              ),
                            )
                          }
                          className="min-w-[4.5rem] text-right tabular"
                          aria-label={`Cuántos ${l.codigo} lleva el kit`}
                        />
                      </td>
                      <td className="text-sm text-[var(--fg-muted)]">{l.unidad}</td>

                      {/*
                        El precio de la pieza DENTRO del kit, editable.

                        Luis, 17/09: *«¿por qué no me sale el precio? Recuerda
                        que él puede variar el precio»*. Tomarlo de lista y no
                        dejarlo tocar obligaría a retocar el maestro para armar
                        un kit —cambiándole el precio a esa pieza para todo el
                        mundo— o a cuadrar el total a mano, perdiendo de dónde
                        sale.

                        `min-w` en el CAMPO y no en la celda: en una tabla el
                        ancho de una celda es una sugerencia que el navegador
                        ignora cuando va justo. Lección del 16/09, dos veces.
                      */}
                      <td className="w-32">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={l.precioVenta}
                          onChange={(e) =>
                            setLineas((ls) =>
                              ls.map((x) =>
                                x.producto_id === l.producto_id
                                  ? { ...x, precioVenta: Number(e.target.value) || 0 }
                                  : x,
                              ),
                            )
                          }
                          className="min-w-[5.5rem] text-right tabular"
                          aria-label={`Valor unitario de ${l.codigo} en el kit`}
                        />
                        {/*
                          Si se movió del de lista, se puede volver.

                          En UNA línea y con `whitespace-nowrap`: la primera
                          versión decía «volver a USD 1.50» en una celda de
                          7 rem y el navegador lo partió en dos renglones —que
                          es el enlace azul partido en dos que ya costó una
                          corrección el 08/09—. Aquí la flecha lleva el trabajo
                          y el texto es solo el número al que se vuelve; la
                          frase entera vive en el `title` y en el `aria-label`.
                        */}
                        {l.precioVenta !== l.precioLista ? (
                          <button
                            type="button"
                            onClick={() =>
                              setLineas((ls) =>
                                ls.map((x) =>
                                  x.producto_id === l.producto_id
                                    ? { ...x, precioVenta: x.precioLista }
                                    : x,
                                ),
                              )
                            }
                            className="mt-1 ml-auto flex h-7 items-center gap-1 whitespace-nowrap rounded px-1 text-sm text-[var(--fg-muted)] underline transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
                            title={`Volver al precio de lista de ${l.codigo}: ${dolar(l.precioLista)}`}
                            aria-label={`Volver al precio de lista de ${l.codigo}, ${dolar(l.precioLista)}`}
                          >
                            <RotateCcw className="size-3.5 shrink-0" aria-hidden="true" />
                            {dolar(l.precioLista)}
                          </button>
                        ) : null}
                      </td>

                      {/*
                        El descuento de la pieza, solo si el interruptor está.

                        Luis, 17/09: *«falta poner esto, si va a haber
                        descuento o no»*. Va donde la cotización lo tiene
                        —entre el valor unitario y el importe—, porque el orden
                        de las columnas es parte de lo que ya está aprendido.

                        El tope de 100 lo pone el campo, la Server Action y el
                        check de la base: los tres, porque un `max` en un
                        `<input type=number>` no impide teclear 120.
                      */}
                      {conDescuento ? (
                        <td className="w-24">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            value={l.descuentoPct}
                            onChange={(e) => {
                              const v = Number(e.target.value) || 0;
                              setLineas((ls) =>
                                ls.map((x) =>
                                  x.producto_id === l.producto_id
                                    ? { ...x, descuentoPct: Math.min(100, Math.max(0, v)) }
                                    : x,
                                ),
                              );
                            }}
                            className="min-w-[4rem] text-right tabular"
                            aria-label={`Descuento de ${l.codigo} en el kit`}
                          />
                        </td>
                      ) : null}

                      <td className="text-right tabular text-sm font-medium">
                        {dolar(netoDe(l) * l.cantidad)}
                        {/* Con descuento, el bruto tachado debajo: es lo que
                            permite ver de un vistazo cuánto se rebajó sin
                            hacer la cuenta. */}
                        {conDescuento && l.descuentoPct > 0 ? (
                          <span className="block text-sm font-normal text-[var(--fg-muted)] line-through">
                            {dolar(l.precioVenta * l.cantidad)}
                          </span>
                        ) : null}
                      </td>

                      <td className="text-right tabular text-sm">{l.stock}</td>
                      <td
                        className={`text-right tabular text-sm ${
                          frena ? "font-semibold text-[var(--warn)]" : ""
                        }`}
                        title={frena ? "Es el que limita cuántos kits se pueden armar" : undefined}
                      >
                        {alcanza}
                      </td>
                      {hayCompartidos ? (
                        <td className="text-sm">
                          {(otros[l.producto_id] ?? []).length > 0 ? (
                            <span
                              className="flex flex-wrap gap-1"
                              title="Si cambias el precio o se agota, estos kits también se mueven"
                            >
                              {(otros[l.producto_id] ?? []).map((k) => (
                                <Badge key={k.id} tone="neutral" size="xs">
                                  {k.codigo}
                                </Badge>
                              ))}
                            </span>
                          ) : (
                            <span className="text-[var(--fg-subtle)]">solo aquí</span>
                          )}
                        </td>
                      ) : null}

                      <td className="text-right">{menuDe(l)}</td>
                    </tr>
                  );
                })}
              </TBody>
            </Table>
          </TableContenedor>
          </div>
          </>
        )}
      </section>

      {/* ------------------------------------------------------ Precio */}
      <section className="card flex flex-col gap-4 p-4 lg:flex-row lg:items-start">
        <div className="flex-1">
          <h2 className="mb-2 text-base font-semibold">Precio del kit</h2>
          <div className="flex flex-col gap-1 text-sm">
            <span className="flex items-baseline justify-between">
              <span className="text-[var(--fg-muted)]">Suma de los productos</span>
              <span className="tabular">{dolar(suma)}</span>
            </span>
            {sumaCosto > 0 ? (
              <span className="flex items-baseline justify-between">
                <span className="text-[var(--fg-muted)]">Te cuesta</span>
                <span className="tabular">{dolar(sumaCosto)}</span>
              </span>
            ) : null}
            {sumaCosto > 0 && Number(precio) > 0 ? (
              <span className="flex items-baseline justify-between border-t border-[var(--border-soft)] pt-1">
                <span className="text-[var(--fg-muted)]">Margen sobre el costo</span>
                <span
                  className={`tabular font-semibold ${
                    (Number(precio) - sumaCosto) / sumaCosto < 0.12
                      ? "text-[var(--danger)]"
                      : (Number(precio) - sumaCosto) / sumaCosto < 0.2
                        ? "text-[var(--warn)]"
                        : "text-[var(--ok)]"
                  }`}
                >
                  {(((Number(precio) - sumaCosto) / sumaCosto) * 100).toFixed(1)}%
                </span>
              </span>
            ) : null}
          </div>

          {/*
            Piezas por debajo de su precio mínimo de venta.

            Avisa y deja guardar, que es lo que se decidió el 17/09 para la
            cotización. Aquí con más motivo: lo que cobra el kit es SU precio,
            y una pieza puede ir a pérdida dentro de un conjunto que gana. Pero
            sin este aviso, un kit entero bajo mínimo se arma pieza a pieza sin
            que nadie lo vea — y el precio mínimo lo puso Willy por algo.

            Dice CUÁLES y CUÁNTO, no «hay 3 líneas con problemas»: lo primero
            se puede corregir, lo segundo obliga a buscarlas a mano.
          */}
          {bajoMinimo.length > 0 ? (
            <p className="mt-3 rounded-md border border-[var(--warn)] bg-[var(--surface-2)] p-3 text-sm">
              <strong className="text-[var(--warn)]">
                {bajoMinimo.length === 1
                  ? "Una pieza va por debajo de su precio mínimo de venta:"
                  : `${bajoMinimo.length} piezas van por debajo de su precio mínimo de venta:`}
              </strong>{" "}
              {bajoMinimo.map((l, i) => (
                <span key={l.producto_id}>
                  {i > 0 ? " · " : ""}
                  <span className="font-medium">{l.codigo}</span> a{" "}
                  <span className="tabular">{dolar(netoDe(l))}</span>, el mínimo
                  es <span className="tabular">{dolar(l.precioMinimo)}</span>
                </span>
              ))}
              . Se puede guardar igual: lo que se cobra es el precio del kit.
            </p>
          ) : null}
        </div>

        <div className="lg:w-72">
          <Campo
            id="kit-precio"
            label="Se vende a"
            ayuda="Sigue a la suma de los productos. Si escribes uno, se queda con ese."
          >
            <Input
              id="kit-precio"
              type="number"
              min={0}
              step="0.01"
              value={precio}
              onChange={(e) => {
                setPrecioAMano(true);
                setPrecio(e.target.value);
              }}
              className="tabular text-right"
            />
          </Campo>

          {/*
            Las dos vueltas atrás, y nunca las dos a la vez.

            Luis, 17/09: *«abajo debería salirle el precio anterior, así como
            en los productos, cuando cambio me dice "regresar como estaba"»*.

            · Si el precio ya no es el que estaba guardado, lo primero que hay
              que poder hacer es volver a ÉL: es la red que hace seguro que el
              precio siga a la suma solo.
            · Si no, y se tecleó a mano, se puede volver a la suma.

            Se prefiere el guardado porque responde a la pregunta más urgente
            —«¿le he cambiado el precio a un kit que ya vendo?»— y porque la
            suma siempre está ahí arriba, a dos renglones.
          */}
          {precioGuardado !== null &&
          Math.abs(Number(precio) - precioGuardado) >= 0.01 ? (
            <p className="mt-2 text-sm">
              <span className="text-[var(--fg-muted)]">Antes se vendía a </span>
              <span className="tabular">{dolar(precioGuardado)}</span>
              {". "}
              <button
                type="button"
                onClick={() => {
                  setPrecioAMano(true);
                  setPrecio(precioGuardado.toFixed(2));
                }}
                className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1 align-baseline text-brand-600 underline transition-colors hover:bg-[var(--surface-2)]"
              >
                <RotateCcw className="size-3.5 shrink-0" aria-hidden="true" />
                Dejarlo como estaba
              </button>
            </p>
          ) : precioAMano && suma > 0 && Math.abs(Number(precio) - suma) >= 0.01 ? (
            <button
              type="button"
              onClick={() => {
                setPrecioAMano(false);
                setPrecio(suma.toFixed(2));
              }}
              className="mt-2 inline-flex items-center gap-1 whitespace-nowrap rounded px-1 text-sm text-brand-600 underline transition-colors hover:bg-[var(--surface-2)]"
            >
              <RotateCcw className="size-3.5 shrink-0" aria-hidden="true" />
              Volver a la suma ({dolar(suma)})
            </button>
          ) : null}
        </div>
      </section>

      {/* La barra al pie, como en la cotización (Luis, 16/09). Los márgenes
          negativos anulan el relleno de quien la rodea: en el teléfono es el
          de la página (p-3), desde `sm` el del formulario (p-6). */}
      <div
        className={
          enModal
            ? "sticky bottom-0 border-t border-[var(--border)] bg-[var(--surface)] py-3"
            : "sticky bottom-0 -mx-3 -mb-3 border-t border-[var(--border)] bg-[var(--surface)] px-3 py-3 elev-2 sm:-mx-6 sm:-mb-6 sm:px-6"
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm">
            <span className="text-[var(--fg-muted)]">Con el stock de hoy se pueden armar </span>
            <strong className="tabular">{armable}</strong>
          </span>
          <span className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => (alCancelar ? alCancelar() : router.back())}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={!listo || guardando}>
              {guardando ? "Guardando…" : kit ? "Guardar cambios" : "Crear kit"}
            </Button>
          </span>
        </div>
      </div>

      {/*
        Los diálogos, FUERA de la tabla y montados solo al abrirse.

        Montados: sus campos nacen de la línea con `useState`, que no se
        reinicializa cuando cambia una prop —la trampa que ya mordió en este
        proyecto—. Desmontarlos es lo que garantiza que abrir la segunda pieza
        no enseñe los datos de la primera.

        Fuera de la tabla: un diálogo dentro de un `<td>` hereda el
        `display` del contexto de tabla y se pinta donde no debe.
      */}
      {viendo ? (
        (() => {
          const l = lineas.find((x) => x.producto_id === viendo);
          if (!l) return null;
          return (
            <PreciosYStock
              linea={comoLineaDeCotizacion(l)}
              onCerrar={() => setViendo(null)}
            />
          );
        })()
      ) : null}

      {editando ? (
        (() => {
          const l = lineas.find((x) => x.producto_id === editando);
          if (!l) return null;
          return (
            <EditarArticulo
              linea={comoLineaDeCotizacion(l)}
              onCerrar={() => setEditando(null)}
              onGuardar={(c) => {
                /*
                  Lo guardado en el catálogo se refleja en la fila del kit.

                  Sin esto, corregir el costo de una pieza desde aquí no
                  movería ni la suma ni el margen del kit hasta recargar — y
                  el motivo de corregirlo suele ser justo ver el margen.
                */
                setLineas((ls) =>
                  ls.map((x) =>
                    x.producto_id === editando
                      ? {
                          ...x,
                          codigo: c.codigo,
                          descripcion: c.descripcion,
                          marca: c.marca.trim() ? c.marca.trim() : null,
                          ...(c.ficha
                            ? {
                                costo: c.ficha.costoUnitario,
                                costoDelKardex: false,
                                precioMinimo: c.ficha.precioMinimo,
                                precioLista: c.ficha.precioLista,
                                /*
                                  El precio DEL KIT solo cambia si seguía al de
                                  lista. Si alguien lo había bajado a mano para
                                  este kit, corregir la ficha del producto no
                                  puede deshacer esa decisión.
                                */
                                precioVenta:
                                  x.precioVenta === x.precioLista
                                    ? c.ficha.precioLista
                                    : x.precioVenta,
                              }
                            : {}),
                        }
                      : x,
                  ),
                );
              }}
            />
          );
        })()
      ) : null}
    </form>
  );
}
