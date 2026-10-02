import { Suspense } from "react";
import Link from "next/link";
import { Badge, EstadoError, EstadoVacio, Skeleton } from "@rodatech/ui";

import { cabeceraProducto, lineaDeTiempo, resumen } from "../api/consultas";
import {
  agruparPorDia,
  dispersionCotizada,
  margenDeReferencia,
  porCliente,
  porProveedor,
  tonoEvento,
} from "../dominio/linea-tiempo";
import {
  AYUDA_EVENTO,
  ETIQUETA_EVENTO,
  type EventoTrazabilidad,
  type Referencia,
} from "../dominio/tipos";
import { Volver } from "@/componentes/volver";

interface Props {
  params: Promise<{ id: string }>;
}

// Espacio que no se parte entre el signo y la cifra: en el teléfono salía
// «$» al final de una línea y «36.00» en la siguiente (revisión por módulos
// del 02/10).
// Con separador de miles: «$ 1103.52» se leía peor que «$ 1,103.52».
const dinero = (n: number) =>
  `$ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Trazabilidad de un producto.
 *
 * La pantalla que Willy pidió con más ganas, y que le costó una mañana
 * rebuscando por WhatsApp el mismo día de la demo (26/08, 32:45):
 *
 *   «Quería saber uno de los ítems. ¿A qué precio le he cotizado antes? ¿Y a
 *    quién le he comprado? ¿Y a qué precio?»
 *
 * Está ordenada como se responde esa pregunta, no como salen los datos:
 * primero las tres cifras que zanjan la duda —a quién comprarle, a cuánto se
 * cotizó por última vez y cuánto margen deja eso—, después las contrapartes
 * agrupadas, y al final la línea de tiempo completa por si hay que mirar el
 * documento concreto.
 */
export default async function PaginaTrazabilidad({ params }: Props) {
  const { id } = await params;

  return (
    <div className="flex flex-col gap-5">
      <Suspense fallback={<Skeleton className="h-16 w-full" />}>
        <Cabecera id={id} />
      </Suspense>

      <Suspense
        fallback={
          <div className="grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        }
      >
        <Respuestas id={id} />
      </Suspense>

      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Historia id={id} />
      </Suspense>
    </div>
  );
}

// ---------------------------------------------------------------------------

async function Cabecera({ id }: { id: string }) {
  const r = await cabeceraProducto(id);
  if (!r.ok) {
    return <EstadoError titulo="No se pudo cargar el producto" detalle={r.error} />;
  }

  const p = r.datos;

  return (
    <div>
      <Volver href={`/productos/${p.id}`}>Volver a la ficha del producto</Volver>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
        <h1 className="text-2xl font-semibold tracking-tight">Historia del producto</h1>
        <Link
          href={`/productos/${p.id}`}
          className="font-mono text-base font-medium text-brand-600 hover:underline"
        >
          {p.codigo}
        </Link>
        <span className="text-sm text-[var(--fg-muted)]">{p.marca}</span>
      </div>
      <p className="mt-0.5 text-sm text-[var(--fg-muted)]">{p.descripcion}</p>
      <p className="mt-1 text-sm text-[var(--fg-subtle)]">
        {p.stock > 0 ? `${p.stock} en stock` : "sin stock"} · costo promedio{" "}
        {dinero(p.costo_promedio)} · venta {dinero(p.precio_venta)}
        {p.precio_minimo > 0 ? ` · mínimo ${dinero(p.precio_minimo)}` : ""}
      </p>
    </div>
  );
}

/**
 * Las tres cifras que responden la pregunta sin bajar a la línea de tiempo.
 *
 * Es el orden en que Willy la formuló: primero a quién se lo compró y a
 * cuánto, después a qué precio lo ofreció, y el margen que sale de juntar las
 * dos. Bajar a los documentos solo debería hacer falta cuando algo no cuadra.
 */
async function Respuestas({ id }: { id: string }) {
  const r = await resumen(id);
  if (!r.ok) {
    return <EstadoError titulo="No se pudo leer la trazabilidad" detalle={r.error} />;
  }

  const s = r.datos;

  if (s.eventos === 0) {
    return (
      <section className="card p-4">
        <EstadoVacio
          titulo="Este código no se ha movido nunca"
          descripcion="No hay compras, cotizaciones ni ventas registradas. Cuando entre en una orden de compra o en una cotización, aparecerá aquí."
        />
      </section>
    );
  }

  const margen = margenDeReferencia(s);
  const dispersion = dispersionCotizada(s);

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Tarjeta
        titulo="A quién comprarle"
        vacio="Todavía no se ha comprado"
        referencia={s.mejorProveedor}
        pie={
          s.proveedores > 1
            ? `el más barato de ${s.proveedores} proveedores`
            : "el único proveedor hasta ahora"
        }
      />

      <Tarjeta
        titulo="Último precio cotizado"
        vacio="Nunca se ha cotizado"
        referencia={s.ultimaCotizacion}
        pie={
          dispersion === null
            ? undefined
            : dispersion === 0
              ? "siempre al mismo precio"
              : // Que el precio baile es información, no ruido: significa que
                // hay que mirar el histórico del cliente antes de dar un número.
                `el precio baila un ${dispersion.toFixed(0)} % entre clientes`
        }
      />

      <div className="card anim-entrada p-3">
        <p className="text-sm text-[var(--fg-muted)]">Margen de referencia</p>
        <p
          className={`mt-0.5 text-xl font-semibold ${
            margen === null
              ? "text-[var(--fg-subtle)]"
              : margen < 12
                ? "text-[var(--danger)]"
                : margen < 20
                  ? "text-[var(--warn)]"
                  : "text-[var(--ok)]"
          }`}
        >
          {margen === null ? "—" : `${margen.toFixed(1)} %`}
        </p>
        <p className="mt-0.5 text-sm text-[var(--fg-subtle)]">
          {margen === null
            ? "hace falta una compra y una cotización"
            : "comprando al mejor precio y vendiendo al último cotizado"}
        </p>
      </div>
    </div>
  );
}

function Tarjeta({
  titulo,
  vacio,
  referencia,
  pie,
}: {
  titulo: string;
  vacio: string;
  referencia: Referencia | null;
  pie?: string;
}) {
  return (
    <div className="card anim-entrada p-3">
      <p className="text-sm text-[var(--fg-muted)]">{titulo}</p>
      {referencia ? (
        <>
          <p className="mt-0.5 truncate text-base font-semibold" title={referencia.nombre ?? ""}>
            {referencia.nombre ?? "—"}
          </p>
          <p className="mt-0.5 text-sm">
            <span className="tabular font-medium">{dinero(referencia.unitario)}</span>
            <span className="ml-2 text-sm text-[var(--fg-subtle)]">
              {referencia.documento} · {referencia.fecha.slice(0, 10)}
            </span>
          </p>
        </>
      ) : (
        <p className="mt-0.5 text-base font-semibold text-[var(--fg-subtle)]">{vacio}</p>
      )}
      {pie ? <p className="mt-0.5 text-sm text-[var(--fg-subtle)]">{pie}</p> : null}
    </div>
  );
}

async function Historia({ id }: { id: string }) {
  const r = await lineaDeTiempo(id);
  if (!r.ok) {
    return (
      <section className="card p-4">
        <EstadoError
          titulo="No se pudo cargar la historia"
          descripcion="La consulta no llegó a completarse."
          detalle={r.error}
        />
      </section>
    );
  }

  if (r.datos.length === 0) return null;

  const proveedores = porProveedor(r.datos);
  const clientes = porCliente(r.datos);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-1 text-sm font-semibold">Proveedores</h2>
          <p className="mb-3 text-sm text-[var(--fg-subtle)]">
            Ordenados por el mejor precio conseguido, no por el más reciente.
          </p>
          {proveedores.length === 0 ? (
            <p className="py-4 text-center text-sm text-[var(--fg-muted)]">
              Todavía no se le ha comprado a nadie.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
              {proveedores.map((p) => (
                <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
                  <div className="min-w-0">
                    <Link
                      href={`/proveedores/${p.id}`}
                      className="text-sm font-medium text-brand-600 hover:underline"
                    >
                      {p.nombre}
                    </Link>
                    <span className="block text-sm text-[var(--fg-subtle)]">
                      {p.veces} {p.veces === 1 ? "compra" : "compras"} · {p.unidades} unidades
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="tabular text-sm font-medium">{dinero(p.mejorPrecio)}</span>
                    {p.ultimoPrecio !== p.mejorPrecio ? (
                      <span className="block text-sm text-[var(--fg-subtle)]">
                        la última vez {dinero(p.ultimoPrecio)}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <h2 className="mb-1 text-sm font-semibold">Clientes</h2>
          <p className="mb-3 text-sm text-[var(--fg-subtle)]">
            Lo más reciente arriba: es lo que hay que sostener si vuelve a llamar.
          </p>
          {clientes.length === 0 ? (
            <p className="py-4 text-center text-sm text-[var(--fg-muted)]">
              Nunca se le ha ofrecido a nadie.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
              {clientes.map((c) => (
                <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
                  <div className="min-w-0">
                    <Link
                      href={`/clientes/${c.id}`}
                      className="text-sm font-medium text-brand-600 hover:underline"
                    >
                      {c.nombre}
                    </Link>
                    <span className="block text-sm text-[var(--fg-subtle)]">
                      {c.cotizaciones} cotizado · {c.ventas} vendido
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="tabular text-sm font-medium">{dinero(c.ultimoPrecio)}</span>
                    <span className="block text-sm text-[var(--fg-subtle)]">
                      {c.ultimaFecha}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card @container overflow-hidden">
        <header className="border-b border-[var(--border-soft)] px-4 py-3">
          <h2 className="text-sm font-semibold">Todo lo que ha pasado</h2>
          <p className="text-sm text-[var(--fg-subtle)]">
            {r.datos.length} {r.datos.length === 1 ? "evento" : "eventos"}, del más
            reciente al más antiguo. Dentro de cada día, en el orden en que
            ocurrieron.
          </p>
        </header>

        <div className="flex flex-col">
          {agruparPorDia(r.datos).map((grupo) => (
            <section key={grupo.dia}>
              <h3 className="border-t border-[var(--border-soft)] bg-[var(--surface-2)] px-4 py-1.5 text-sm font-semibold tabular text-[var(--fg-muted)]">
                {grupo.dia}
              </h3>
              <ul className="flex flex-col">
                {grupo.eventos.map((e, i) => (
                  <Fila key={`${e.evento}-${e.documento_id}-${i}`} evento={e} indice={i} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

/** A dónde lleva cada tipo de documento. */
function rutaDe(evento: EventoTrazabilidad): string | null {
  switch (evento.evento) {
    case "compra":
      return `/compras/${evento.documento_id}`;
    case "recepcion":
      return `/recepciones/${evento.documento_id}`;
    case "cotizacion":
      return `/cotizaciones/${evento.documento_id}`;
    case "factura":
    case "nota_credito":
    case "nota_debito":
      return `/facturacion/${evento.documento_id}`;
    default:
      return null;
  }
}

function Fila({ evento, indice }: { evento: EventoTrazabilidad; indice: number }) {
  const ruta = rutaDe(evento);
  const esCompra = evento.lado === "compra";

  return (
    <li
      className={`anim-entrada grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 border-b @2xl:flex @2xl:flex-wrap border-l-2 border-[var(--border-soft)] px-4 py-2.5 text-sm transition-colors hover:bg-[var(--surface-2)] ${
        esCompra ? "border-l-brand-400" : "border-l-[var(--ok)]"
      }`}
      style={{ animationDelay: `${Math.min(indice, 6) * 24}ms` }}
    >
      <Badge tone={tonoEvento(evento.evento)} size="xs" className="shrink-0">
        {ETIQUETA_EVENTO[evento.evento]}
      </Badge>

      {/*
        En el teléfono, tres columnas dejaban al texto del medio 150 px y el
        número de documento se partía en dos («CMP-26-» / «00001»), con la
        explicación en una palabra por línea. Ahora la etiqueta y el precio
        van arriba y el texto debajo, a lo ancho; con la caja desde `@2xl` vuelve a ser una
        fila (revisión por módulos del 02/10).
      */}
      <div className="order-last col-span-2 min-w-0 @2xl:order-none @2xl:flex-1">
        {ruta ? (
          <Link
            href={ruta}
            className="whitespace-nowrap font-mono text-sm font-medium text-brand-600 hover:underline"
          >
            {evento.documento}
          </Link>
        ) : (
          <span className="font-mono text-sm">{evento.documento}</span>
        )}
        <span className="ml-2 text-sm text-[var(--fg-muted)]">
          {evento.contraparte ?? "—"}
        </span>
        {evento.referencia ? (
          <span className="ml-2 text-sm text-[var(--fg-subtle)]">
            {esCompra ? "documento" : "orden del cliente"} {evento.referencia}
          </span>
        ) : null}
        <span
          className="block text-sm text-[var(--fg-subtle)]"
          title={AYUDA_EVENTO[evento.evento]}
        >
          {AYUDA_EVENTO[evento.evento]}
        </span>
      </div>

      {/* Se deja encoger: si no cabe al lado de la etiqueta, parte entre
          «cantidad» y «total», nunca dentro de una cifra. */}
      <div className="ml-auto min-w-0 text-right">
        <span className="whitespace-nowrap tabular text-sm font-medium">
          {dinero(evento.unitario)}
        </span>
        {/* «10 × · $ 360.00» no se leía: ahora dice qué es cada número. */}
        <span className="block text-sm text-[var(--fg-subtle)] tabular">
          <span className="whitespace-nowrap">cantidad {evento.cantidad}</span> ·{" "}
          <span className="whitespace-nowrap">total {dinero(evento.importe)}</span>
        </span>
      </div>
    </li>
  );
}
