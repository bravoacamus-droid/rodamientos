"use client";

import {
  Badge,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@rodatech/ui";

import type { LineaConstructor } from "../../dominio/constructor";
import { revisionDe } from "../../dominio/constructor";
import { importeLinea } from "../../dominio/totales";

const dolar = (n: number) =>
  n.toLocaleString("es-PE", { style: "currency", currency: "USD" });

/**
 * Los precios de referencia y el stock de una línea, sin salir de la cotización.
 *
 * Willy, 16/09 (7:30): *«puede verlos los precios como un ojito, y puede ver a
 * cuánto lo compró, a cuánto le costó y a cuánto lo está vendiendo. Cosas
 * referenciales, en un modal»*. Luis, 17/09: *«en las opciones hay que poner
 * ver stock y ver precios, y le salga modal de los precios pues: compra,
 * precio mínimo, precio venta, etc. Algo bonito»*.
 *
 * ---------------------------------------------------------------------------
 * Por qué un modal y no cuatro columnas más
 * ---------------------------------------------------------------------------
 * Porque no se miran a la vez. Al teclear un precio se mira UNO —el costo, o
 * el mínimo— y el resto del tiempo estorban: la fila ya tiene diez columnas y
 * la descripción es lo que hay que poder leer. Un dato que se consulta de vez
 * en cuando no paga su sitio en una tabla.
 *
 * ---------------------------------------------------------------------------
 * Y por qué el margen se enseña aquí, en grande
 * ---------------------------------------------------------------------------
 * Es la cifra que decide si el precio que se está tecleando vale la pena, y va
 * sobre el COSTO (`(venta − costo) / costo`), como en toda la casa desde la
 * 023. Willy lo dijo con un ejemplo: *«si gasté 100 y lo vendí a 130, mi
 * utilidad es 30 sobre 100, el 30 %; no es 30 sobre 130»*.
 */
export function PreciosYStock({
  linea,
  onCerrar,
}: {
  linea: LineaConstructor;
  onCerrar: () => void;
}) {
  const revision = revisionDe(linea);
  const neto = revision.precioNeto;
  const importe = importeLinea({
    cantidad: linea.cantidad,
    valorUnitario: linea.valorUnitario,
    descuentoPct: linea.descuentoPct,
  });

  const hayCosto = linea.costoUnitario > 0;
  const margenPct = hayCosto
    ? ((neto - linea.costoUnitario) / linea.costoUnitario) * 100
    : null;

  const faltaStock = linea.stock < linea.cantidad;

  return (
    <Dialog open onOpenChange={(v) => (v ? null : onCerrar())}>
      <DialogContent ancho="max-w-xl">
        <DialogHeader>
          <DialogTitle>{linea.codigo}</DialogTitle>
          <DialogDescription>
            {linea.marca ? `${linea.marca} · ` : ""}
            {linea.descripcion}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          {/*
            Lo que se está cobrando, arriba y en grande.

            Es contra lo que se comparan las cuatro referencias de abajo, así
            que ponerlo al final obligaría a mirar arriba y abajo alternando.
          */}
          <section className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm text-[var(--fg-muted)]">
                Estás cobrando
              </span>
              <span className="tabular text-2xl font-semibold">
                {dolar(neto)}
              </span>
            </div>

            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2 text-sm text-[var(--fg-muted)]">
              <span>
                {linea.cantidad} {linea.unidad}
                {linea.descuentoPct > 0
                  ? ` · ${linea.descuentoPct}% de descuento sobre ${dolar(linea.valorUnitario)}`
                  : ""}
              </span>
              <span className="tabular">{dolar(importe)} en la línea</span>
            </div>

            {margenPct !== null ? (
              <div className="mt-3 flex items-baseline justify-between border-t border-[var(--border)] pt-3">
                <span className="text-sm">
                  Margen sobre el costo
                  <span className="mt-0.5 block text-sm text-[var(--fg-subtle)]">
                    Ganas {dolar(neto - linea.costoUnitario)} en cada uno.
                  </span>
                </span>
                <span
                  className={`tabular text-xl font-semibold ${
                    margenPct < 12
                      ? "text-[var(--danger)]"
                      : margenPct < 20
                        ? "text-[var(--warn)]"
                        : "text-[var(--ok)]"
                  }`}
                >
                  {margenPct.toFixed(1)}%
                </span>
              </div>
            ) : (
              /* Sin costo no hay margen, y decirlo es mejor que enseñar un
                 0 % que se lee como «pierdo». Es el caso de casi todo el
                 catálogo: 790 productos entraron del Excel sin costo. */
              <p className="mt-3 border-t border-[var(--border)] pt-3 text-sm text-[var(--fg-subtle)]">
                Este producto no tiene costo cargado, así que no se puede
                calcular el margen.
              </p>
            )}
          </section>

          {/* ------------------------------------------------- Referencias */}
          <section>
            <h3 className="mb-2 text-sm font-semibold">Precios de referencia</h3>
            <dl className="flex flex-col">
              {/*
                Se dice DE DÓNDE sale el costo, no solo cuánto es.

                Son dos datos distintos: el del kardex es lo que de verdad se
                pagó al recibirlo, y el de la ficha es lo que alguien anotó.
                Al negociar no pesan igual, y hoy casi todo el catálogo solo
                tiene el segundo — 790 productos entraron del Excel sin una
                sola recepción.
              */}
              <Referencia
                etiqueta="Costo"
                ayuda={
                  linea.costoDelKardex
                    ? "Lo que costó la última vez que entró al almacén."
                    : "Lo anotado en su ficha. Todavía no ha entrado ninguno."
                }
                valor={linea.costoUnitario}
              />
              <Referencia
                etiqueta="Precio mínimo de venta"
                ayuda="El piso que tiene puesto en su ficha."
                valor={linea.precioMinimo}
                alerta={linea.precioMinimo > 0 && neto < linea.precioMinimo}
              />
              <Referencia
                etiqueta="Precio de lista"
                ayuda="El de la ficha, con el que entra a la cotización."
                valor={linea.precioLista}
              />
              <Referencia
                etiqueta="Precio de mercado"
                ayuda="A cuánto se ve en la calle. Solo referencia."
                valor={linea.precioMercado}
              />
            </dl>

            {linea.precioMinimo > 0 && neto < linea.precioMinimo ? (
              <p className="mt-2 rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-2.5 text-sm">
                Vas <strong>{dolar(revision.faltantePorUnidad)}</strong> por
                debajo del mínimo, {dolar(revision.faltanteEnLinea)} en toda la
                línea. Puedes cotizarlo igual.
              </p>
            ) : null}
          </section>

          {/* ------------------------------------------------------ Stock */}
          <section>
            <h3 className="mb-2 text-sm font-semibold">Stock</h3>
            <div className="flex items-center justify-between rounded-md border border-[var(--border)] p-3">
              <span className="text-sm">
                {faltaStock ? "No alcanza para esta línea" : "Hay para despachar"}
                <span className="mt-0.5 block text-sm text-[var(--fg-muted)]">
                  Cotizando {linea.cantidad}.
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="tabular text-xl font-semibold">
                  {linea.stock}
                </span>
                {faltaStock ? (
                  <Badge tone={linea.stock <= 0 ? "danger" : "warning"} size="xs">
                    {linea.stock <= 0 ? "sin stock" : `faltan ${linea.cantidad - linea.stock}`}
                  </Badge>
                ) : (
                  <Badge tone="success" size="xs">alcanza</Badge>
                )}
              </span>
            </div>

            {/* Sin stock NO se bloquea, y conviene recordarlo aquí: Willy
                consigue en el día casi todo lo que no tiene. Lo que hace
                falta es que la línea diga cuándo entrega. */}
            {faltaStock ? (
              <p className="mt-2 text-sm text-[var(--fg-muted)]">
                Se puede cotizar igual. Marca en la columna{" "}
                <strong>Entrega</strong> cuándo lo vas a tener, para que salga
                impreso.
              </p>
            ) : null}
          </section>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Una referencia. Si vale 0, se dice que no está cargada.
 *
 * Enseñar «$ 0.00» sería mentir: en este catálogo un cero casi nunca significa
 * que algo cueste cero, significa que nadie lo ha rellenado. Son 790 productos
 * que entraron de un Excel a medias.
 */
function Referencia({
  etiqueta,
  ayuda,
  valor,
  alerta,
}: {
  etiqueta: string;
  ayuda: string;
  valor: number;
  alerta?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--border-soft)] py-2 last:border-0">
      <span>
        <dt className="text-sm font-medium">{etiqueta}</dt>
        <dd className="text-sm text-[var(--fg-subtle)]">{ayuda}</dd>
      </span>
      <span
        className={`shrink-0 tabular text-sm font-semibold ${
          alerta ? "text-[var(--warn)]" : ""
        }`}
      >
        {valor > 0 ? dolar(valor) : (
          <span className="font-normal text-[var(--fg-subtle)]">sin cargar</span>
        )}
      </span>
    </div>
  );
}
