import Link from "next/link";
import { MapPin, Factory } from "lucide-react";

import { resumenCartera, type GrupoCartera } from "../api/consultas";

/**
 * Por zona y por rubro: cuántos clientes y cuánto compran (141).
 *
 * Willy, 20/10: *«este módulo de clientes me debe imprimir reportes en los
 * cuales yo pueda filtrar a los clientes por zona»*, y del rubro: *«quiero
 * saber con cuántas empresas agroindustriales contamos… y si vale la pena»*.
 * Cada fila lleva a la lista filtrada, que es por donde se arma la visita.
 *
 * Mientras nadie tenga zona ni rubro dice cómo empezar, en vez de dos tablas
 * con una sola fila «Sin poner».
 */
export async function ResumenCartera({ hoy }: { hoy: string }) {
  const r = await resumenCartera(hoy);

  if (r.conDatos === 0) {
    return (
      <p className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-base">
        <strong>Todavía ningún cliente tiene zona ni rubro.</strong> Pónselos al editar cada cliente y aquí
        verás cuántos hay y cuánto te compran por zona y por rubro.
      </p>
    );
  }

  return (
    <section className="grid gap-3 lg:grid-cols-2">
      <Tabla titulo="Por zona" icono={MapPin} grupos={r.zonas} param="zona" />
      <Tabla titulo="Por rubro" icono={Factory} grupos={r.rubros} param="rubro" />
    </section>
  );
}

function dinero(n: number): string {
  return `$ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Tabla({
  titulo,
  icono: Icono,
  grupos,
  param,
}: {
  titulo: string;
  icono: typeof MapPin;
  grupos: GrupoCartera[];
  param: "zona" | "rubro";
}) {
  return (
    <div className="card overflow-hidden">
      <h2 className="flex items-center gap-2 border-b border-[var(--border-soft)] px-4 py-2.5 text-base font-semibold">
        <Icono className="size-5 text-brand-600" aria-hidden="true" />
        {titulo}
      </h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[var(--fg-muted)]">
            <th className="px-4 py-2 font-medium">{param === "zona" ? "Zona" : "Rubro"}</th>
            <th className="px-4 py-2 text-right font-medium">Clientes</th>
            <th className="px-4 py-2 text-right font-medium">Compró en 12 meses</th>
          </tr>
        </thead>
        <tbody>
          {grupos.slice(0, 12).map((g) => (
            <tr key={g.clave ?? "sin"} className="border-t border-[var(--border-soft)]">
              <td className="px-4 py-2">
                {g.clave ? (
                  <Link
                    href={`/clientes?${param}=${g.clave}`}
                    className="font-medium text-brand-700 underline-offset-4 hover:underline"
                  >
                    {g.nombre}
                  </Link>
                ) : (
                  <span className="text-[var(--fg-muted)]">{g.nombre}</span>
                )}
              </td>
              <td className="px-4 py-2 text-right tabular">{g.clientes}</td>
              <td className="px-4 py-2 text-right tabular">{dinero(g.vendido)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-[var(--border-soft)] px-4 py-2 text-sm text-[var(--fg-subtle)]">
        Facturado sin IGV. Pulsa una {param === "zona" ? "zona" : "fila"} para ver sus clientes.
      </p>
    </div>
  );
}
