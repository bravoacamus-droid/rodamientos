"use client";

import { useActionState, useEffect, useMemo, useReducer, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  Input,
  SelectNativo,
  Table,
  TableContenedor,
  TBody,
  Textarea,
  THead,
  formatearFecha,
} from "@rodatech/ui";

import { costosDelProveedor } from "../../acciones/costos";
import { quienEsperaAhora } from "../../acciones/esperando";
import { avisosDeCantidad, type QuienEsperaProducto } from "../../dominio/listos";
import { registrarCompra, type ResultadoCompra } from "../../acciones/registrar";
import {
  aPayload,
  avisos as calcularAvisos,
  bloqueos as calcularBloqueos,
  estadoInicial,
  reducir,
  totalesDe,
  type ProductoParaComprar,
} from "../../dominio/constructor";
import { BuscadorProveedores } from "@/modules/proveedores/ui/buscador";
import type { ProveedorOpcion } from "@/modules/proveedores/dominio/opcion";
import { BuscadorCompra } from "./buscador";
import { FilaCompra } from "./linea";
import { BloqueMoneda } from "./moneda";
import { GastosDeCompra } from "./gastos";
import {
  COURIERS_DE_SIEMPRE,
  ETIQUETA_MODALIDAD,
  MODALIDADES,
  modalidadDe,
  type Modalidad,
} from "../../dominio/gastos";

/**
 * Registro de una compra.
 *
 * Todo el estado vive en `dominio/constructor.ts` como reducer puro, así que
 * este componente solo conecta cables: despacha acciones y pinta lo que sale.
 *
 * Comprar NO mueve stock. Willy, 25:21: *"el stock se mueve al recibir la
 * mercadería"*. Por eso aquí no hay ni una palabra de kardex: lo que se está
 * registrando es el compromiso con el proveedor.
 */
export function ConstructorCompra({
  sugeridos,
  hoy,
  precarga = [],
  candidatos = [],
  esperan = [],
  elegido = null,
  couriers = [...COURIERS_DE_SIEMPRE],
}: {
  /** Los de siempre y los ya usados, para el desplegable (095). */
  couriers?: string[];
  /**
   * Los últimos a los que se compró. NO es el maestro: desde la 033 el
   * selector busca contra el servidor, así que la página ya no manda la lista
   * entera —que además venía truncada a 500 sin decirlo—.
   */
  sugeridos: ProveedorOpcion[];
  /** La fecha la fija el servidor: el dominio no lee reloj, para poder probarlo. */
  hoy: string;
  /**
   * Líneas ya puestas al abrir. Viene de la bandeja «Por comprar»: allí se
   * ve qué falta y con qué urgencia, y de nada serviría si al pulsar
   * «Comprar» hubiera que volver a buscar los mismos códigos a mano.
   */
  precarga?: { producto: ProductoParaComprar; cantidad: number }[];
  /**
   * Proveedores que ya venden lo que se está comprando, de más a menos
   * coincidencias. El sistema lo aprendió de las compras anteriores (046);
   * elegirlos a mano teniendo el dato era hacerle buscar lo que ya se sabe.
   */
  candidatos?: {
    /** La ficha ENTERA. Media ficha con un `as` tumba el selector: pasó. */
    proveedor: ProveedorOpcion;
    coincidencias: number;
    deCuantos: number;
  }[];
  /** Los clientes que esperan esto, para que la compra lleve su porqué. */
  esperan?: {
    cliente: string;
    cotizacion: string;
    cotizacion_id: string;
    codigos: string[];
    prometida: string;
  }[];
  /**
   * El proveedor ya elegido, cuando la bandeja repartió lo marcado y este
   * botón traía el suyo. Preguntarlo otra vez sería preguntar dos veces.
   */
  elegido?: ProveedorOpcion | null;
}) {
  const router = useRouter();
  // El estado inicial se calcula UNA vez, aplicando la precarga sobre el
  // estado vacío con el mismo reducer que usa todo lo demás. Hacerlo con un
  // efecto duplicaría las líneas en cuanto React montara dos veces.
  const [estado, despachar] = useReducer(reducir, null, () => {
    const base = elegido
      ? reducir(estadoInicial(hoy), { tipo: "cabecera", campo: "proveedorId", valor: elegido.id })
      : estadoInicial(hoy);
    const conLineas = precarga.reduce(
      (e, i) => reducir(e, { tipo: "agregar", producto: i.producto, cantidad: i.cantidad }),
      base,
    );
    // El porqué viaja con la compra, no solo en la pantalla: las
    // observaciones se ven en la ficha y es lo que lee quien recibe.
    // Editable, como todo lo que se propone.
    if (esperan.length === 0) return conLineas;
    return reducir(conLineas, {
      tipo: "cabecera",
      campo: "observaciones",
      valor: esperan
        .map(
          (e) =>
            `Para ${e.cliente} (${e.cotizacion}), prometido ${formatearFecha(e.prometida)}.`,
        )
        .join(" "),
    });
  });

  // El proveedor elegido, entero. Antes se buscaba en la lista con un `find`;
  // ahora la lista no está —el elegido puede venir de una búsqueda o de un alta
  // recién hecha— así que la ficha se guarda al elegirla. `estado.proveedorId`
  // sigue siendo la única fuente para el payload: esto es solo para pintar.
  const [proveedor, setProveedor] = useState<ProveedorOpcion | null>(elegido);

  // Lo que este proveedor cobró la última vez, por producto. Se recarga al
  // cambiar de proveedor: es la referencia contra la que se negocia.
  const [ultimosCostos, setUltimosCostos] = useState<
    Record<string, { costo: number; numero: string; fecha: string }>
  >({});
  const [, cargarCostos] = useTransition();

  const [resultado, guardar, guardando] = useActionState<ResultadoCompra | null, FormData>(
    async (previo, formData) => {
      const r = await registrarCompra(previo, formData);
      if (r.ok) router.push(`/compras/${r.id}`);
      return r;
    },
    null,
  );

  const totales = useMemo(() => totalesDe(estado), [estado]);
  const bloqueos = useMemo(() => calcularBloqueos(estado), [estado]);
  const avisos = useMemo(() => calcularAvisos(estado), [estado]);

  useEffect(() => {
    if (!estado.proveedorId) {
      setUltimosCostos({});
      return;
    }
    const id = estado.proveedorId;
    cargarCostos(async () => {
      const r = await costosDelProveedor(id);
      setUltimosCostos(r.ok ? r.datos : {});
      // Y se rellenan, no solo se enseñan. Antes el número estaba debajo
      // del campo y había que copiarlo a mano al campo de arriba, una vez
      // por línea. El reducer solo pisa lo que el sistema había propuesto:
      // lo tecleado se queda.
      if (r.ok) {
        const costos: Record<string, number> = {};
        for (const [producto, u] of Object.entries(r.datos)) costos[producto] = u.costo;
        despachar({ tipo: "costosDelProveedor", costos });
      }
    });
  }, [estado.proveedorId]);

  /*
    «Necesitas comprar más: otros dos clientes esperan esto.»

    Se pregunta al servidor cada vez que cambia la LISTA de productos —no las
    cantidades, que se comparan aquí sin viajar—. Antes esto solo llegaba
    precargado desde la bandeja, así que el que compraba a ojo, que es el que
    más lo necesita, no veía ningún aviso.

    Si la consulta falla no pasa nada: es un aviso sobre una pantalla que tiene
    que dejar comprar igual.
  */
  const productosEnLaCompra = useMemo(
    () =>
      estado.lineas
        .map((l) => l.productoId)
        .filter((id): id is string => Boolean(id))
        .sort()
        .join(","),
    [estado.lineas],
  );

  const [esperandoPorProducto, setEsperandoPorProducto] = useState<
    Record<string, QuienEsperaProducto>
  >({});

  useEffect(() => {
    const ids = productosEnLaCompra ? productosEnLaCompra.split(",") : [];
    if (ids.length === 0) {
      setEsperandoPorProducto({});
      return;
    }
    let vigente = true;
    void quienEsperaAhora(ids).then((r) => {
      if (vigente) setEsperandoPorProducto(r.ok ? r.datos : {});
    });
    return () => {
      vigente = false;
    };
  }, [productosEnLaCompra]);

  const faltantes = useMemo(
    () =>
      avisosDeCantidad(
        estado.lineas
          .filter((l) => l.productoId)
          .map((l) => ({ producto_id: l.productoId, cantidad: l.cantidad })),
        esperandoPorProducto,
      ),
    [estado.lineas, esperandoPorProducto],
  );

  const esImportacion = estado.tipo === "importacion";
  const modalidad = modalidadDe(estado.tipo, estado.via);

  return (
    <form action={guardar} className="flex flex-col gap-5">
      <input type="hidden" name="compra" value={JSON.stringify(aPayload(estado))} />

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Registrar compra</h1>
          {/*
            Se dice que es de UN proveedor, y dónde está la otra.

            Luis, 21/09: *«si voy a registrar una compra puedo tener uno o
            varios proveedores… no voy a hacer producto, compra, otro producto,
            otro proveedor, otra compra; mareamos a Willy»*.

            El diagnóstico era justo aunque la pieza ya existiera: la pantalla
            de varios proveedores es «Pedir precios» —una lista de productos,
            los proveedores que quieras, y de ahí salen las compras ya
            repartidas—. Lo que fallaba es que ESTA no decía que era la de uno
            solo, y es a la que se llega buscando «Compras» en el menú.

            Así que lo dice, y lleva. Un aviso que explica y no ofrece camino
            solo consigue que quien lo lee se sienta tonto.
          */}
          <p className="text-sm text-[var(--fg-muted)]">
            De <strong>un solo proveedor</strong>. Si vas a repartir la compra
            entre varios,{" "}
            <Link href="/compras/precios" className="text-brand-600 underline">
              hazlo desde «Pedir precios»
            </Link>
            : ahí pones todos los productos y todos los proveedores, y salen las
            compras repartidas.
          </p>
          <p className="mt-0.5 text-sm text-[var(--fg-muted)]">
            El stock no se mueve aquí. Se moverá cuando la mercadería llegue y se
            recepcione.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/*
            Preguntar antes de comprar.

            Aquí se escribe el costo a mano, y quien lo escribe se lo cree.
            Este botón lleva las líneas ya puestas a la consulta de precios,
            que es donde se ve a cuánto lo deja cada proveedor — y de ahí sale
            la compra sola, con el ganador.

            No bloquea nada: registrar una compra ya pactada, sin preguntar a
            nadie, es lo normal y sigue estando a un botón de distancia.
          */}
          {estado.lineas.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                router.push(
                  `/compras/pedir-precio?items=${estado.lineas
                    .filter((l) => l.productoId)
                    .map((l) => `${l.productoId}:${l.cantidad}`)
                    .join(",")}`,
                )
              }
            >
              Comparar precios antes
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => router.push("/compras")}>
            Cancelar
          </Button>
          <Button type="submit" disabled={bloqueos.length > 0 || guardando}>
            {guardando ? "Guardando…" : "Guardar compra"}
          </Button>
        </div>
      </header>

      {resultado && !resultado.ok ? (
        <p className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger)]">
          {resultado.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-5 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {/* ------------------------------------------------- Cabecera */}
          <section className="card p-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
              {/* La caja de búsqueda ya enseña cómo paga y cuánto tarda en la
                  ficha del elegido, así que aquí solo queda el porqué de que
                  sea lo primero que se rellena. */}
              <div className="flex flex-col gap-1">
                {/* A quién comprárselo, sin buscarlo. ENCIMA del buscador: debajo,
                    el panel de resultados los tapaba al pulsar el campo, y el
                    atajo desaparecía justo cuando se iba a usar. Solo cuando no hay
                    proveedor todavía: una vez elegido, estos botones
                    invitarían a cambiarlo sin motivo. */}
                {!proveedor && candidatos.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 pb-1">
                    <span className="text-xs text-[var(--fg-subtle)]">
                      Ya te han vendido esto:
                    </span>
                    {candidatos.map((c) => (
                      <button
                        key={c.proveedor.id}
                        type="button"
                        onClick={() => {
                          setProveedor(c.proveedor);
                          despachar({
                            tipo: "cabecera",
                            campo: "proveedorId",
                            valor: c.proveedor.id,
                          });
                        }}
                        className="rounded-full border border-[var(--border-strong)] px-3 py-1 text-sm hover:bg-[var(--surface-2)]"
                      >
                        {c.proveedor.razon_social}
                        <span className="ml-1.5 text-xs text-[var(--fg-subtle)]">
                          {c.coincidencias} de {c.deCuantos}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}

                <BuscadorProveedores
                  id="com-proveedor"
                  sugeridos={sugeridos}
                  elegido={proveedor}
                  onElegir={(p) => {
                    setProveedor(p);
                    despachar({ tipo: "cabecera", campo: "proveedorId", valor: p.id });
                  }}
                  onQuitar={() => {
                    setProveedor(null);
                    despachar({ tipo: "cabecera", campo: "proveedorId", valor: null });
                  }}
                  hoy={hoy}
                />
                {proveedor ? null : (
                  <span className="text-xs text-[var(--fg-subtle)]">
                    Es lo primero: los precios que se enseñan son los suyos.
                  </span>
                )}

              </div>

              {/*
                Tres modalidades en un solo selector, aunque la base guarde dos
                cosas —tipo y vía—. Quien registra piensa «esto vino por
                avión», no «importación, vía aérea» (§AO.4, 095).
              */}
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Cómo llegó</span>
                <SelectNativo
                  value={modalidad}
                  onChange={(e) =>
                    despachar({ tipo: "modalidad", valor: e.target.value as Modalidad })
                  }
                >
                  {MODALIDADES.map((m) => (
                    <option key={m} value={m}>
                      {ETIQUETA_MODALIDAD[m]}
                    </option>
                  ))}
                </SelectNativo>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Fecha</span>
                <Input
                  type="date"
                  value={estado.fecha}
                  onChange={(e) =>
                    despachar({ tipo: "cabecera", campo: "fecha", valor: e.target.value })
                  }
                />
              </label>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Factura del proveedor</span>
                <Input
                  value={estado.documentoProveedor}
                  onChange={(e) =>
                    despachar({
                      tipo: "cabecera",
                      campo: "documentoProveedor",
                      valor: e.target.value,
                    })
                  }
                  placeholder="F001-1234"
                />
              </label>

              {/*
                Aquí iba «Llega el», y se quita.

                Luis, 21/09: *«en compras, "llega el" no debería ir ahí, ya que
                eso viene de las cotizaciones. Si el producto es de inmediato,
                normal; si es de 15 días, va a aparecer; si es de 3 días,
                igual. Ahora, si llega antes, no pasa nada»*.

                Y tiene razón: la fecha que importa es la que se le PROMETIÓ al
                cliente, y esa ya está — en el bloque «Para quién es», unas
                filas más abajo, con su «prometido el…». Pedirla otra vez aquí
                es hacer teclear a mano un dato que el sistema ya sabe, y
                arriesgarse a que las dos versiones no coincidan.

                La columna sigue en la base y la ficha la enseña cuando la hay:
                las compras creadas desde una ronda ya la dejaban vacía, así
                que esto no cambia nada de lo guardado. Lo que se va es la
                obligación de inventarla.
              */}

              <label className="flex items-end gap-2 pb-2">
                <input
                  type="checkbox"
                  checked={estado.afectoIgv}
                  onChange={(e) =>
                    despachar({ tipo: "afectoIgv", valor: e.target.checked })
                  }
                  className="size-4 accent-brand-600"
                />
                <span className="text-sm">La factura lleva IGV</span>
              </label>
            </div>

            {/* En qué moneda vino la factura (042). Va justo debajo de la
                casilla del IGV porque son la misma pregunta hecha dos
                veces: ambas salen de mirar el papel del proveedor. */}
            <div className="mt-3 border-t border-[var(--border-soft)] pt-3">
              <BloqueMoneda
                moneda={estado.moneda}
                tipoCambio={estado.tipoCambio}
                fecha={estado.fecha}
                despachar={despachar}
              />
            </div>

            {/* Los campos de importación solo aparecen cuando lo son. Un
                tracking de DHL en una compra a un proveedor de Lima ensucia el
                histórico para siempre. */}
            {esImportacion ? (
              <div className="mt-3 grid gap-3 border-t border-[var(--border-soft)] pt-3 sm:grid-cols-2">
                {/*
                  El courier se ELIGE, no se teclea. Willy (§AO.4): «este
                  courier lo puedo registrar en un dato maestro, porque esto
                  es selecciones, con una barra desplegable o lo busque».

                  Es un `datalist`: propone los de siempre y los que ya se han
                  usado en compras anteriores, y deja escribir uno nuevo. Así
                  la lista crece sola con el uso y no hace falta una pantalla
                  aparte para mantenerla —que sería justo la pieza sin camino
                  de siempre—.
                */}
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">
                    {modalidad === "maritima" ? "Naviera o agente de carga" : "Courier"}
                  </span>
                  <Input
                    list="couriers-conocidos"
                    value={estado.courier}
                    onChange={(e) =>
                      despachar({ tipo: "cabecera", campo: "courier", valor: e.target.value })
                    }
                    placeholder={modalidad === "maritima" ? "Elige o escribe" : "DHL"}
                  />
                  <datalist id="couriers-conocidos">
                    {couriers.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </label>

                <label className="flex flex-col gap-1">
                  {/* El número cambia de nombre con la vía: en aéreo es la guía
                      aérea o tracking; en marítimo, el BL o el contenedor. */}
                  <span className="text-sm font-medium">
                    {modalidad === "maritima" ? "N.° de BL o contenedor" : "Tracking o guía aérea"}
                  </span>
                  <Input
                    value={estado.tracking}
                    onChange={(e) =>
                      despachar({ tipo: "cabecera", campo: "tracking", valor: e.target.value })
                    }
                    placeholder={modalidad === "maritima" ? "MAEU123456789" : "Número de seguimiento"}
                  />
                </label>
              </div>
            ) : null}
          </section>

          {/* --------------------------------------------------- Gastos */}
          <GastosDeCompra
            modalidad={modalidad}
            gastos={estado.gastos}
            moneda={estado.moneda}
            despachar={despachar}
          />

          {/* --------------------------------------------------- Líneas */}
          <section className="card p-4">
            <div className="mb-3">
              <BuscadorCompra
                onElegir={(p) => despachar({ tipo: "agregar", producto: p })}
                ultimosCostos={ultimosCostos}
              />
            </div>

            {estado.lineas.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--fg-muted)]">
                Busca un producto arriba para empezar. Puedes teclear el código, la
                marca o parte de la descripción.
              </p>
            ) : (
              <TableContenedor>
                <Table>
                  <THead>
                    <tr>
                      <th className="text-left">Código</th>
                      <th className="text-left">Descripción</th>
                      <th className="text-right">Cant.</th>
                      <th className="text-left">U.M.</th>
                      <th className="text-right">Costo unit.</th>
                      <th className="text-right">Importe</th>
                      <th className="text-right">Stock</th>
                      <th />
                    </tr>
                  </THead>
                  <TBody>
                    {estado.lineas.map((l) => (
                      <FilaCompra
                        key={l.key}
                        linea={l}
                        ultimoCosto={ultimosCostos[l.productoId]}
                        despachar={despachar}
                      />
                    ))}
                  </TBody>
                </Table>
              </TableContenedor>
            )}
          </section>

          {/* «Te falta comprar.»

              Pegado a la tabla de líneas y no abajo del todo: es lo único de
              esta pantalla que pide CAMBIAR un número que ya está escrito, y
              un aviso que hay que ir a buscar no se lee.

              Aparece cuando tres clientes distintos llevan el mismo producto y
              la compra se hizo pensando en uno. Nunca cuando sobra: reponer
              almacén es deliberado, y regañar por eso hace que se dejen de
              leer los avisos —incluidos los que sí importan. */}
          {faltantes.length > 0 ? (
            <section className="rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-4">
              <h2 className="text-sm font-semibold">
                Te va a faltar para los pedidos que ya tienes
              </h2>
              <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                {faltantes.map((f) => {
                  const linea = estado.lineas.find((l) => l.productoId === f.producto_id);
                  return (
                    <li key={f.producto_id} className="flex flex-wrap items-baseline gap-x-2">
                      <strong className="font-mono text-[0.8rem]">
                        {linea?.codigo ?? "—"}
                      </strong>
                      <span>
                        llevas {f.llevas} y {f.clientes === 1 ? "un cliente espera" : `${f.clientes} clientes esperan`}{" "}
                        {f.esperan}
                      </span>
                      <span className="ml-auto font-medium">
                        faltan {f.faltan}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-xs text-[var(--fg-muted)]">
                Ya descontado lo que hay en almacén. Puedes comprar de más para
                stock; esto solo avisa de lo que falta.
              </p>
            </section>
          ) : null}

          {/* Para quién es. Cuando la compra nace de la bandeja tiene un
              motivo —alguien confirmó y espera— y ese motivo se perdía: la
              pantalla no lo enseñaba, y quien recibía la mercadería días
              después no sabía que esas ocho unidades ya tenían dueño.

              Va abajo y no arriba a propósito: no es un dato que haya que
              rellenar, es el porqué de lo que se está haciendo. */}
          {esperan.length > 0 ? (
            <section className="card p-4">
              <h2 className="text-sm font-semibold">Para quién es</h2>
              <p className="mb-2 text-xs text-[var(--fg-subtle)]">
                Ya está confirmado por estos clientes. Se anota en las
                observaciones para que quien reciba la mercadería lo sepa.
              </p>
              <ul className="flex flex-col gap-1.5 text-sm">
                {esperan.map((e) => (
                  <li key={e.cotizacion_id} className="flex flex-wrap items-baseline gap-x-2">
                    <strong>{e.cliente}</strong>
                    <Link
                      href={`/cotizaciones/${e.cotizacion_id}`}
                      className="font-mono text-xs text-brand-600 hover:underline"
                    >
                      {e.cotizacion}
                    </Link>
                    <span className="text-xs text-[var(--fg-muted)]">
                      {e.codigos.join(", ")}
                    </span>
                    <span className="ml-auto text-xs text-[var(--fg-subtle)]">
                      prometido {formatearFecha(e.prometida)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="card p-4">
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
                placeholder="Lo que convenga recordar de esta compra."
              />
            </label>
          </section>
        </div>

        {/* -------------------------------------------------- Resumen */}
        <aside className="w-full shrink-0 lg:w-80">
          <div className="card sticky top-4 flex flex-col gap-3 p-4">
            <h2 className="text-sm font-semibold">Resumen</h2>

            <dl className="flex flex-col gap-1.5 text-sm">
              <Fila etiqueta="Líneas" valor={String(totales.lineas)} />
              <Fila etiqueta="Unidades" valor={totales.unidades.toLocaleString("es-PE")} />
              <div className="my-1 border-t border-[var(--border-soft)]" />
              <Fila etiqueta="Subtotal" valor={`$ ${totales.subtotal.toFixed(2)}`} />
              <Fila
                etiqueta={estado.afectoIgv ? "IGV (18 %)" : "IGV (no afecto)"}
                valor={`$ ${totales.igv.toFixed(2)}`}
              />
              <Fila etiqueta="Total" valor={`$ ${totales.total.toFixed(2)}`} fuerte />

              {/* En las tres modalidades desde el 25/09: el transporte de una
                  compra local también es costo (§AO.4). */}
              {totales.gastos > 0 ? (
                <>
                  <div className="my-1 border-t border-[var(--border-soft)]" />
                  <Fila etiqueta="Gastos" valor={`$ ${totales.gastos.toFixed(2)}`} />
                  {/* Lo que de verdad va a costar la mercadería en almacén. El
                      IGV no entra: es crédito fiscal recuperable, no costo. */}
                  <Fila
                    etiqueta="Costo en almacén"
                    valor={`$ ${totales.costoEnAlmacen.toFixed(2)}`}
                    fuerte
                  />
                </>
              ) : null}
            </dl>

            {bloqueos.length > 0 ? (
              <div className="rounded-sm border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
                <p className="mb-1 text-xs font-medium">Falta para poder guardar:</p>
                <ul className="flex flex-col gap-0.5 text-xs text-[var(--fg-muted)]">
                  {bloqueos.map((b) => (
                    <li key={b.campo}>· {b.mensaje}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Avisos: no impiden guardar. Son situaciones legítimas que suelen
                ser errores, y bloquearlas obligaría a inventarse un rodeo el
                día que de verdad pasan. */}
            {avisos.length > 0 ? (
              <div className="rounded-sm border border-[var(--warn)] bg-[var(--warn-bg)] p-2.5">
                <p className="mb-1 text-xs font-medium">Conviene mirar:</p>
                <ul className="flex flex-col gap-1 text-xs">
                  {avisos.map((a, i) => (
                    <li key={`${a.key}-${i}`}>
                      <strong className="font-mono">{a.codigo}</strong> · {a.mensaje}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </form>
  );
}

function Fila({
  etiqueta,
  valor,
  fuerte,
}: {
  etiqueta: string;
  valor: string;
  fuerte?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[var(--fg-muted)]">{etiqueta}</dt>
      <dd className={`tabular ${fuerte ? "text-base font-semibold" : ""}`}>{valor}</dd>
    </div>
  );
}
