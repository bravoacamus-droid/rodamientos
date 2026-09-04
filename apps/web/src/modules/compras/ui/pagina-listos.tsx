import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, EstadoError, EstadoVacio, formatearFecha } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { listosParaEntregar } from "../api/por-comprar";
import { ETIQUETA_URGENCIA } from "../dominio/por-comprar";

/**
 * A quién se le puede entregar ya.
 *
 * ---------------------------------------------------------------------------
 * La pantalla que faltaba
 * ---------------------------------------------------------------------------
 * El ERP tenía cerrada toda la cadena menos el último paso. Cotización →
 * pedido → bandeja → precios → compra → recepción → stock, y ahí se paraba.
 * Nadie volvía a mirar al cliente que la había empezado.
 *
 * En la práctica eso significa que llega la caja, sube el stock, y el pedido
 * de INDUSTRIAL TECHNOLOGY sigue esperando encima de un estante que ya tiene
 * lo suyo — hasta que Willy se acuerda o hasta que el cliente llama.
 *
 * Esta lista es ese «acordarse», puesto por escrito.
 *
 * ---------------------------------------------------------------------------
 * Por qué salen también los parciales
 * ---------------------------------------------------------------------------
 * Porque desde la 047 se factura por partes, así que un pedido con la mitad en
 * almacén es media entrega que se puede hacer hoy y media cobranza que se
 * puede empezar. Van detrás de los completos: cerrar un pedido entero libera
 * al cliente, al almacén y a la cobranza de una vez.
 *
 * Y no dice «es suyo» en ningún sitio, dice «se le puede entregar». Mientras
 * `stock.reservado` siga sin escribirlo nadie, el reparto por antigüedad es un
 * cálculo y no una decisión que Willy haya tomado.
 */
export default async function PaginaListos() {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) redirect("/login");

  const r = await listosParaEntregar();

  if (!r.ok) {
    return (
      <EstadoError
        titulo="No se pudo calcular qué está listo"
        descripcion="La consulta no llegó a completarse."
        detalle={r.error}
      />
    );
  }

  const listos = r.datos;
  const completos = listos.filter((p) => p.estado === "completo");

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Listos para entregar</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Pedidos confirmados que el almacén ya puede cubrir, del que lleva más
          esperando al que menos.
        </p>
      </header>

      {listos.length === 0 ? (
        <EstadoVacio
          titulo="Nada pendiente de entregar"
          descripcion="Cuando entre mercadería que algún pedido esté esperando, aparecerá aquí sola."
        />
      ) : (
        <>
          {/* Empezar por el 0 —«0 pedidos se pueden cerrar»— era leer primero
              lo que NO hay. Cuando no hay ninguno completo, la frase arranca
              por lo que sí se puede hacer. */}
          <p className="text-sm">
            {completos.length > 0 ? (
              <>
                <strong className="text-base tabular">{completos.length}</strong>{" "}
                {completos.length === 1
                  ? "pedido se puede cerrar entero"
                  : "pedidos se pueden cerrar enteros"}
                {listos.length > completos.length
                  ? ` · ${listos.length - completos.length} a medias, que también se factura`
                  : ""}
                .
              </>
            ) : (
              <>
                <strong className="text-base tabular">{listos.length}</strong>{" "}
                {listos.length === 1 ? "pedido tiene" : "pedidos tienen"} algo que
                entregar hoy, aunque todavía no esté completo. Se factura por
                partes.
              </>
            )}
          </p>

          <div className="card overflow-hidden">
            <div className="scroll-x">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Pedido</th>
                    <th className="px-3 py-2.5 font-medium">Cliente</th>
                    <th className="px-3 py-2.5 text-right font-medium">Se entrega</th>
                    <th className="px-3 py-2.5 font-medium">Prometido</th>
                    <th className="px-4 py-2.5 font-medium">Qué se puede hacer</th>
                  </tr>
                </thead>
                <tbody>
                  {listos.map((p) => (
                    <tr
                      key={p.cotizacion_id}
                      className="border-b border-[var(--border)] last:border-0"
                    >
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/cotizaciones/${p.cotizacion_id}`}
                          className="font-mono text-[0.8rem] font-medium text-brand-600 hover:underline"
                        >
                          {p.cotizacion}
                        </Link>
                        <span className="block text-xs text-[var(--fg-subtle)]">
                          {formatearFecha(p.fecha)}
                        </span>
                      </td>
                      <td className="max-w-xs px-3 py-2.5">
                        <span className="block truncate" title={p.cliente}>
                          {p.cliente}
                        </span>
                      </td>
                      {/* En unidades y no en líneas. «0 de 2 líneas» al lado
                          de «listo» se contradicen a la vista, y lo que se
                          saca del almacén son unidades. */}
                      <td className="px-3 py-2.5 text-right">
                        <span className="tabular">
                          {p.estado === "completo"
                            ? p.unidades
                            : `${p.unidades} de ${p.pendientes}`}
                        </span>
                        <span className="block text-xs text-[var(--fg-subtle)]">
                          {p.lineas === 1 ? "1 producto" : `${p.lineas} productos`}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge
                          tone={
                            p.urgencia === "vencido"
                              ? "danger"
                              : p.urgencia === "hoy"
                                ? "warning"
                                : "neutral"
                          }
                          size="xs"
                        >
                          {ETIQUETA_URGENCIA[p.urgencia]}
                        </Badge>
                        <span className="ml-1.5 text-xs text-[var(--fg-subtle)]">
                          {formatearFecha(p.prometida)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {p.estado === "completo" ? (
                          <span className="text-[var(--ok)]">Entregarlo entero</span>
                        ) : (
                          <span className="text-[var(--fg-muted)]">
                            Entregar lo que hay · el resto sigue en compras
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-[var(--fg-muted)]">
            El stock se reparte por orden de confirmación, el más antiguo
            primero — es el mismo reparto que usa la bandeja «Por comprar», para
            que las dos pantallas no puedan contradecirse.
          </p>
        </>
      )}
    </div>
  );
}
