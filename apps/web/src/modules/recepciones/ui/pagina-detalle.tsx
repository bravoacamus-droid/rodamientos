// «NIU» es el código de SUNAT; en la tienda se dice «UND» (revisión por módulos del 02/10).
import { unidadLegible } from "@/modules/cotizaciones/dominio/unidades";
import { enDolares } from "@/modules/compras/dominio/moneda";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Button, EstadoError, Moneda } from "@rodatech/ui";
import { ArrowRight, Info, MessageSquareText, PackageCheck } from "lucide-react";

import { AvisarAQuien } from "@/modules/compras/ui/avisar-a-quien";
import { BloqueFicha, CabeceraFicha, DatoFicha } from "@/modules/compras/ui/ficha";

import { misPermisos } from "@/lib/permisos";
import { HistorialDocumento } from "@/modules/bitacora/ui/historial-documento";

import { detalleRecepcion, papelesDeRecepcion } from "../api/consultas";
import {
  EditarPapelesDelProveedor,
  PapelesDelProveedor,
} from "./papeles-proveedor";

/**
 * Ficha de una recepción.
 *
 * Es un documento CERRADO: no hay botón de editar y no es un olvido. El
 * ingreso ya está en el kardex, y el saldo de almacén es la suma de sus
 * movimientos. Corregir una recepción mal registrada es un ajuste de
 * inventario de gerencia, con su documento, su motivo y su responsable — que
 * es exactamente lo que Willy pidió con el «botón que se usa con cuidado»
 * (26:49).
 *
 * Los costos que se ven aquí son los que se le pagaron al proveedor, sin
 * gastos prorrateados: es contra lo que se cuadra la factura. El costo que
 * entró al kardex, con los gastos ya dentro, vive en el kardex del producto.
 */
export default async function PaginaDetalleRecepcion({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [resultado, permisos, papeles] = await Promise.all([
    detalleRecepcion(id),
    misPermisos(),
    papelesDeRecepcion(id),
  ]);

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No se pudo cargar la recepción"
        descripcion="La consulta no llegó a completarse."
        detalle={resultado.error}
      />
    );
  }
  if (!resultado.datos) notFound();

  const r = resultado.datos;
  // Colgarle papeles o corregir números es «Almacén · Editar» (143).
  const puedeAdjuntar = permisos.tiene("almacen", "editar");
  const total = r.lineas.reduce((a, l) => a + l.importe, 0);
  // En soles, lo que es en dólares: es lo que entró al kardex (042, 06/11).
  const enDolaresTexto =
    r.moneda === "PEN" && r.tipo_cambio
      ? `US$ ${enDolares(total, r.tipo_cambio).toFixed(2)} al T.C. ${r.tipo_cambio.toFixed(3)}`
      : null;
  const unidades = r.lineas.reduce((a, l) => a + l.cantidad, 0);

  return (
    <div className="flex flex-col gap-5">
      {/* El mismo «Volver» que el resto de fichas, encima del número.
          Era un botón «Volver al listado» al lado de «Editar papeles»: la
          cuarta manera de volver que tenía el ERP (revisión por módulos
          del 02/10). Desde el 27/11, dentro de la cabecera de ficha: número
          grande, el proveedor y lo que entró como cifra principal. */}
      <CabeceraFicha
        ruta="/recepciones"
        volver={{ href: "/recepciones", texto: "Volver a recepciones" }}
        tipo="Recepción de mercadería"
        numero={r.numero}
        estado={
          r.anulada ? (
            <Badge tone="danger">Anulada</Badge>
          ) : (
            <Badge tone="success">Ya entró al almacén</Badge>
          )
        }
        quien={{
          rotulo: "Proveedor",
          nombre: r.proveedor ?? "—",
          detalle: `Recibido el ${r.fecha}${r.recibido_por ? ` por ${r.recibido_por}` : ""}`,
        }}
        cifra={{
          rotulo: "Entraron",
          valor: `${unidades.toLocaleString("es-PE")} ${unidades === 1 ? "unidad" : "unidades"}`,
          pie: (
            <>
              Valor al proveedor <Moneda valor={total} moneda={r.moneda} enfasis="fuerte" className="text-[var(--fg)]" />
              {enDolaresTexto ? <span className="block">{enDolaresTexto}</span> : null}
            </>
          ),
        }}
        acciones={
          /*
            El botón de los papeles va aquí arriba y en color. Luis, 09/09:
            *«ponlo pero que tenga color; por eso yo te decía poner un botón
            editar al costado de Volver al listado»*. Metido dentro de la sección
            de papeles y en gris no lo veía. Desde el 02/10 «Volver» está encima
            del número, como en las demás fichas, y este sigue arriba y en azul.
          */
          puedeAdjuntar && !r.anulada ? (
            <EditarPapelesDelProveedor
              recepcionId={r.id}
              hayPapeles={papeles.ok && papeles.datos.length > 0}
              guiaProveedor={r.guia_proveedor}
              facturaProveedor={r.factura_proveedor}
            />
          ) : r.compra_id && r.compra_numero ? (
            <Button asChild variant="outline">
              <Link href={`/compras/${r.compra_id}`}>
                Ver la compra {r.compra_numero}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          ) : undefined
        }
      />

      <BloqueFicha icono={<Info />} titulo="Datos de la recepción">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 @md:grid-cols-2 @4xl:grid-cols-4">
          <DatoFicha
            etiqueta="Proveedor"
            valor={
              <>
                {r.proveedor ?? "—"}
                {r.proveedor_documento ? (
                  <span className="block text-sm font-normal text-[var(--fg-muted)]">{r.proveedor_documento}</span>
                ) : null}
              </>
            }
          />
          <DatoFicha etiqueta="Guía del proveedor" valor={r.guia_proveedor ?? "—"} />
          <DatoFicha etiqueta="Factura del proveedor" valor={r.factura_proveedor ?? "—"} />
          {r.compra_id && r.compra_numero ? (
            // La compra, con su botón: el número en texto plano no llevaba a
            // ninguna parte (revisión por módulos del 02/10).
            <div>
              <dt className="etiqueta-dato">Compra</dt>
              <dd className="mt-1">
                <Button asChild variant="outline">
                  <Link href={`/compras/${r.compra_id}`}>
                    Ver {r.compra_numero}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              </dd>
            </div>
          ) : (
            <DatoFicha
              etiqueta="Compra"
              valor={
                <>
                  Recepción suelta
                  <span className="block text-sm font-normal text-[var(--fg-muted)]">
                    No viene de una compra registrada
                  </span>
                </>
              }
            />
          )}
        </dl>
      </BloqueFicha>

      <BloqueFicha
        icono={<PackageCheck />}
        tono="entra"
        titulo="Qué entró"
        ayuda={`${r.lineas.length} ${r.lineas.length === 1 ? "línea" : "líneas"} · ${unidades.toLocaleString("es-PE")} ${
          unidades === 1 ? "unidad" : "unidades"
        }`}
      >
        {/*
          Revisión de diseño del 02/10: en el teléfono esta tabla se
          desplazaba de lado (390 px: 353 → 765). Por debajo de `@3xl`
          (48 rem, 816 px con la base de 17 px) cada línea es una tarjeta con
          lo mismo apilado; se mide ESTA caja (`@container`), no la pantalla.
          Los totales del pie van al final, en su propio bloque.
        */}
        <ul className="flex flex-col gap-2.5 @3xl:hidden">
          {r.lineas.map((l) => (
            <li
              key={l.id}
              className="flex flex-col gap-2 rounded-lg border border-l-4 border-[var(--border)] border-l-[var(--ok)] bg-[var(--surface-2)] p-3"
            >
              <div>
                <p className="font-mono text-base font-bold">{l.codigo}</p>
                <p className="text-base">{l.descripcion}</p>
                {l.marca ? (
                  <p className="text-sm text-[var(--fg-subtle)]">{l.marca}</p>
                ) : null}
              </div>
              <dl className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-sm">
                <div className="min-w-0">
                  <dt className="text-[var(--fg-subtle)]">Cantidad</dt>
                  <dd className="tabular">
                    {l.cantidad.toLocaleString("es-PE")}
                    <span className="ml-1 text-[var(--fg-subtle)]">{unidadLegible(l.unidad)}</span>
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[var(--fg-subtle)]">Costo c/u</dt>
                  <dd>
                    <Moneda valor={l.costo_unitario} moneda={r.moneda} tamano="sm" enfasis="suave" />
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[var(--fg-subtle)]">Importe</dt>
                  <dd>
                    <Moneda valor={l.importe} moneda={r.moneda} tamano="sm" />
                  </dd>
                </div>
              </dl>
              {/* En la tabla se entra por el código; aquí, con un botón que
                  se vea como tal. */}
              <Button asChild variant="outline" className="w-full">
                <Link href={`/productos/${l.producto_id}`}>
                  Ver el producto
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </li>
          ))}
          <li className="flex flex-wrap items-baseline justify-between gap-2 px-1 pt-1 text-sm font-medium">
            <span>
              {r.lineas.length} {r.lineas.length === 1 ? "línea" : "líneas"} ·{" "}
              <span className="tabular">{unidades.toLocaleString("es-PE")}</span>{" "}
              {unidades === 1 ? "unidad" : "unidades"}
            </span>
            <span className="flex items-baseline gap-2">
              <span className="text-[var(--fg-muted)]">Valor al proveedor</span>
              <Moneda valor={total} moneda={r.moneda} enfasis="fuerte" />
            </span>
            {enDolaresTexto ? <span className="text-[var(--fg-muted)]">{enDolaresTexto}</span> : null}
          </li>
        </ul>
        <div className="scroll-x hidden @3xl:block">
          <table className="w-full text-base">
            <thead>
              <tr className="cabecera-tabla">
                <th className="px-4 py-2.5 font-medium">Código</th>
                <th className="px-4 py-2.5 font-medium">Marca</th>
                <th className="px-4 py-2.5 font-medium">Descripción</th>
                <th className="px-4 py-2.5 text-right font-medium">Cantidad</th>
                <th className="px-4 py-2.5 text-right font-medium">Costo unit.</th>
                <th className="px-4 py-2.5 text-right font-medium">Importe</th>
              </tr>
            </thead>
            <tbody>
              {r.lineas.map((l) => (
                <tr key={l.id} className="border-b border-[var(--border-soft)]">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/productos/${l.producto_id}`}
                      className="font-mono text-sm font-medium text-brand-600 hover:underline"
                    >
                      {l.codigo}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">{l.marca ?? "—"}</td>
                  <td className="min-w-[12rem] max-w-md px-4 py-2.5">
                    {/* Entera, sin «…» (27/11). */}
                    <span className="block break-words">{l.descripcion}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">
                    {l.cantidad.toLocaleString("es-PE")}
                    <span className="ml-1 text-sm text-[var(--fg-subtle)]">
                      {unidadLegible(l.unidad)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Moneda valor={l.costo_unitario} moneda={r.moneda} tamano="sm" enfasis="suave" />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Moneda valor={l.importe} moneda={r.moneda} tamano="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="text-sm font-medium">
                <td className="px-4 py-3" colSpan={3}>
                  {r.lineas.length} {r.lineas.length === 1 ? "línea" : "líneas"}
                </td>
                <td className="px-4 py-3 text-right tabular">
                  {unidades.toLocaleString("es-PE")}
                </td>
                <td className="px-4 py-3 text-right text-[var(--fg-muted)]">
                  Valor al proveedor
                </td>
                <td className="px-4 py-3 text-right">
                  <Moneda valor={total} moneda={r.moneda} enfasis="fuerte" />
                  {enDolaresTexto ? (
                    <span className="block text-sm text-[var(--fg-muted)]">{enDolaresTexto}</span>
                  ) : null}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </BloqueFicha>

      {r.observaciones ? (
        <BloqueFicha icono={<MessageSquareText />} titulo="Observaciones">
          <p className="whitespace-pre-wrap text-base text-[var(--fg)]">{r.observaciones}</p>
        </BloqueFicha>
      ) : null}

      {/* El momento de acordarse: la caja acaba de entrar y el cliente que
          lleva semanas esperando es justo el que se olvida. */}
      {/* Los papeles del proveedor (068).

          La recepción sigue siendo un documento cerrado: esto no la edita,
          le cuelga el papel con el que llegó. Willy: *«siempre nos atienden
          con guía y factura»*. */}
      {r.anulada ? null : (
        <PapelesDelProveedor
          papeles={papeles.ok ? papeles.datos : []}
          puedeEditar={puedeAdjuntar && !r.anulada}
        />
      )}

      <AvisarAQuien />

      {/* Quién la recibió o la anuló, y cuándo (TR-03). */}
      <HistorialDocumento entidad="recepciones" id={r.id} />
    </div>
  );
}
