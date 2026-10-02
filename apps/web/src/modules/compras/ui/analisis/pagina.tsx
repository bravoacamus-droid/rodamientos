import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, EstadoError } from "@rodatech/ui";
import { ChevronLeft, ChevronRight, Download, Eye, Plus } from "lucide-react";
import { perfilActual } from "@rodatech/db/servidor";

import { listarAnalisis, type AnalisisLista } from "../../api/analisis";

const ROLES = ["gerencia", "admin", "compras"];

const dolar = (n: number) =>
  `$ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (iso: string) => iso.split("-").reverse().join("/");

/**
 * El color de la K, el mismo criterio que la pantalla del análisis: rojo si
 * pierde, ámbar si gana poco, verde si conviene. Con su nombre al lado: el
 * color solo nunca es la única pista.
 */
function InsigniaK({ k }: { k: number | null }) {
  if (k === null) return <span className="text-sm text-[var(--fg-muted)]">Sin precio de mercado</span>;
  const margen = k - 1;
  const tono = margen < 0 ? "danger" : margen < 0.3 ? "warning" : "success";
  return (
    <span className="flex flex-wrap items-baseline gap-x-2">
      <Badge tone={tono} className="tabular text-sm">
        K {k.toFixed(2)}
      </Badge>
      <span className="text-sm text-[var(--fg-muted)]">
        {margen >= 0 ? `gana ${Math.round(margen * 100)} %` : `pierde ${Math.round(-margen * 100)} %`}
      </span>
    </span>
  );
}

function Estado({ a }: { a: AnalisisLista }) {
  return a.estado === "comprado" ? (
    <Badge tone="success" className="text-sm">
      Comprado · {a.compra_numero}
    </Badge>
  ) : (
    <Badge tone="warning" className="text-sm">
      En análisis
    </Badge>
  );
}

/** Ver y Excel: dos botones que parecen botones, con su palabra. */
function Acciones({ a }: { a: AnalisisLista }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href={`/compras/analisis/${a.id}`}
        className="inline-flex h-10 items-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
      >
        <Eye className="size-4" aria-hidden />
        Ver
      </Link>
      {/* Un enlace de descarga normal: la ruta arma el .xlsx en el servidor. */}
      <a
        href={`/compras/analisis/${a.id}/excel`}
        download
        className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium hover:bg-[var(--surface-2)]"
      >
        <Download className="size-4" aria-hidden />
        Excel
      </a>
    </div>
  );
}

/**
 * Los análisis de importación guardados (098, §AQ).
 *
 * Son también el historial de lo que cada proveedor de fuera ha cotizado:
 * Willy, 01/10, *«los precios deben quedar en un historial […] para no volver
 * a pedir en otra oportunidad»*.
 *
 * Luis, 02/10: *«no podemos ver los detalles después de guardar, poder
 * descargar el excel […] mejorar el diseño, la escalabilidad, porque hay
 * mucha data en las listas y crece»*. Por eso cada fila dice lo que importa
 * —costo, mercado y la K en color— y lleva su Excel, y la lista va paginada.
 */
export default async function PaginaAnalisis({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) redirect("/login");
  if (!ROLES.includes(perfil.rol)) {
    return <EstadoError titulo="No puedes ver los análisis" descripcion="Los hacen Compras y Gerencia." />;
  }

  const sp = (await searchParams) ?? {};
  const pagina = Number(Array.isArray(sp.pagina) ? sp.pagina[0] : sp.pagina) || 1;
  const r = await listarAnalisis(pagina);
  if (!r.ok) {
    return <EstadoError titulo="No se pudo cargar la lista" descripcion="La consulta no llegó a completarse." detalle={r.error} />;
  }
  const { filas, total, paginas } = r.datos;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Análisis de importación</h1>
          <p className="max-w-2xl text-sm text-[var(--fg-muted)]">
            Antes de comprar: con la proforma del proveedor de fuera, cuánto te cuesta cada
            producto puesto en Lima y cuánto ganas contra el precio de mercado.
          </p>
        </div>
        <Link
          href="/compras/analisis/nuevo"
          className="inline-flex h-10 items-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus className="size-4" aria-hidden />
          Nuevo análisis
        </Link>
      </header>

      {total === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-base font-medium">Todavía no hay ningún análisis.</p>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            Cuando te llegue una proforma de importación, empieza uno con «Nuevo análisis».
          </p>
        </div>
      ) : (
        <section className="card @container overflow-hidden">
          {/* Tarjetas mientras la caja es estrecha; tabla cuando cabe. */}
          <ul className="flex flex-col divide-y divide-[var(--border-soft)] @4xl:hidden">
            {filas.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{a.numero}</span>
                  <Estado a={a} />
                </div>
                <p className="text-base font-medium">{a.proveedor}</p>
                <p className="text-sm text-[var(--fg-muted)]">
                  {fecha(a.fecha)}
                  {a.referencia ? ` · Proforma ${a.referencia}` : ""} · {a.lineas}{" "}
                  {a.lineas === 1 ? "producto" : "productos"}
                </p>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-[var(--fg-muted)]">Costo total</dt>
                    <dd className="tabular font-semibold">{dolar(a.costo_total)}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--fg-muted)]">A precio de mercado</dt>
                    <dd className="tabular font-semibold">{dolar(a.total_mercado)}</dd>
                  </div>
                </dl>
                <InsigniaK k={a.k} />
                <Acciones a={a} />
              </li>
            ))}
          </ul>

          <div className="hidden @4xl:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-2)] text-left text-[var(--fg-muted)]">
                  <th className="px-4 py-3 font-medium">Análisis</th>
                  <th className="px-4 py-3 font-medium">Proveedor</th>
                  <th className="px-4 py-3 text-right font-medium">Costo total</th>
                  <th className="px-4 py-3 text-right font-medium">A precio de mercado</th>
                  <th className="px-4 py-3 font-medium">K</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filas.map((a) => (
                  <tr key={a.id} className="border-b border-[var(--border-soft)] align-top last:border-0">
                    <td className="px-4 py-3">
                      <span className="block font-mono font-semibold">{a.numero}</span>
                      <span className="block text-[var(--fg-muted)]">{fecha(a.fecha)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block font-medium">{a.proveedor}</span>
                      <span className="block text-[var(--fg-muted)]">
                        {a.referencia ? `Proforma ${a.referencia} · ` : ""}
                        {a.lineas} {a.lineas === 1 ? "producto" : "productos"}
                      </span>
                    </td>
                    <td className="tabular px-4 py-3 text-right font-semibold">{dolar(a.costo_total)}</td>
                    <td className="tabular px-4 py-3 text-right">{dolar(a.total_mercado)}</td>
                    <td className="px-4 py-3">
                      <InsigniaK k={a.k} />
                    </td>
                    <td className="px-4 py-3">
                      <Estado a={a} />
                    </td>
                    <td className="px-4 py-3">
                      <Acciones a={a} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {paginas > 1 ? (
            <nav
              aria-label="Páginas de análisis"
              className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3"
            >
              <p className="text-sm text-[var(--fg-muted)]">
                Página {r.datos.pagina} de {paginas} · {total} análisis
              </p>
              <div className="flex gap-2">
                {r.datos.pagina > 1 ? (
                  <Link
                    href={`/compras/analisis?pagina=${r.datos.pagina - 1}`}
                    className="inline-flex h-10 items-center gap-1 rounded-md border border-[var(--border)] px-3 text-sm font-medium hover:bg-[var(--surface-2)]"
                  >
                    <ChevronLeft className="size-4" aria-hidden />
                    Anteriores
                  </Link>
                ) : null}
                {r.datos.pagina < paginas ? (
                  <Link
                    href={`/compras/analisis?pagina=${r.datos.pagina + 1}`}
                    className="inline-flex h-10 items-center gap-1 rounded-md border border-[var(--border)] px-3 text-sm font-medium hover:bg-[var(--surface-2)]"
                  >
                    Siguientes
                    <ChevronRight className="size-4" aria-hidden />
                  </Link>
                ) : null}
              </div>
            </nav>
          ) : null}
        </section>
      )}
    </div>
  );
}
