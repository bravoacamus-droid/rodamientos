import Link from "next/link";
import { EstadoError } from "@rodatech/ui";
import { Lightbulb, Minus, Settings, TrendingDown, TrendingUp, TriangleAlert } from "lucide-react";

import { cotizacionesPorCerrar, metaDelMes, ventasPorDia } from "../api/consultas";
import { comoVoy, datosIncompletos, DIA_MINIMO_PARA_PROYECTAR, type Veredicto } from "../dominio/como-voy";
import { etiquetaMes, variacionPct } from "../dominio/periodo";
import { GraficoMeta } from "./graficos";

/**
 * «¿Cómo voy este mes?» (Luis, 20/10). La cuenta está en `dominio/como-voy`;
 * aquí, una frase arriba que contesta la pregunta, cuatro cifras que la
 * justifican, el gráfico de cada mes contra la meta y el tope, y una
 * recomendación con un número que se pueda hacer.
 *
 * Siempre sobre el mes EN CURSO: la pregunta es «cómo voy», y eso es hoy. Lo
 * que cambia con el filtro de arriba son los meses con que se compara.
 */

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function dinero(n: number): string {
  return `$ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function nombreMes(iso: string, conAnio = false): string {
  const m = MESES[Number(iso.slice(5, 7)) - 1] ?? iso;
  return conAnio ? `${m} ${iso.slice(0, 4)}` : m;
}

function fechaCorta(iso: string): string {
  return `${Number(iso.slice(8, 10))} de ${nombreMes(iso)}`;
}

const ASPECTO: Record<Veredicto, { titulo: string; icono: typeof TrendingUp; caja: string; color: string }> = {
  bien: { titulo: "Vas bien", icono: TrendingUp, caja: "border-[var(--ok)] bg-[var(--ok-bg)]", color: "text-[var(--ok)]" },
  justo: { titulo: "Vas justo", icono: Minus, caja: "border-[var(--warn)] bg-[var(--warn-bg)]", color: "text-[var(--warn)]" },
  abajo: { titulo: "Vas por debajo", icono: TrendingDown, caja: "border-[var(--danger)] bg-[var(--danger-bg)]", color: "text-[var(--danger)]" },
  sin_datos: { titulo: "Todavía no hay con qué comparar", icono: Minus, caja: "border-[var(--border)] bg-[var(--surface-2)]", color: "" },
};

export async function ComoVoyBloque({
  hoy,
  referencia,
}: {
  hoy: string;
  /** El rango elegido arriba, o null si no se eligió (de enero al mes anterior). */
  referencia: { desde: string; hasta: string } | null;
}) {
  const [r, cots, metaPuesta] = await Promise.all([
    ventasPorDia(hoy, referencia?.desde),
    cotizacionesPorCerrar(hoy),
    metaDelMes(),
  ]);
  if (!r.ok) return <EstadoError titulo="No se pudo calcular cómo vas este mes" detalle={r.error} />;

  const c = comoVoy(hoy, r.datos, { referencia, meta: metaPuesta });
  const incompleto = datosIncompletos(c);
  const a = ASPECTO[c.veredicto];
  const Icono = a.icono;
  const mes = nombreMes(hoy);
  const contraMismaFecha = variacionPct(c.vendido, c.mismaFechaMesPasado);
  const pronto = c.dia < DIA_MINIMO_PARA_PROYECTAR;

  const deQueMeses =
    c.referenciaDesde && c.referenciaHasta
      ? c.referenciaDesde === c.referenciaHasta
        ? nombreMes(c.referenciaDesde, true)
        : `${nombreMes(c.referenciaDesde, c.referenciaDesde.slice(0, 4) !== c.referenciaHasta.slice(0, 4))} a ${nombreMes(c.referenciaHasta, true)}`
      : null;

  const nombreMeta = c.metaPuesta ? "tu meta del mes" : "tu promedio";

  // La frase que contesta. Con pocos días se compara por la misma fecha; luego,
  // el ritmo contra la meta.
  const frase =
    c.veredicto === "sin_datos"
      ? "No hay ventas de meses anteriores ni meta puesta para saber si este mes va bien o mal."
      : pronto
        ? `Llevas ${dinero(c.vendido)}; el mes pasado a esta fecha llevabas ${dinero(c.mismaFechaMesPasado)}.`
        : `A este ritmo cerrarías ${mes} en ${dinero(c.proyeccion)}, y ${nombreMeta} es ${dinero(c.meta)}.`;

  const datos = c.serie.map((m) => ({
    etiqueta: etiquetaMes(m.mes),
    venta: m.monto,
    resto: m.enCurso && !pronto ? Math.max(0, Math.round((c.proyeccion - m.monto) * 100) / 100) : 0,
    enCurso: m.enCurso,
  }));

  return (
    <section className="card flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">¿Cómo voy este mes?</h2>
          <p className="text-sm text-[var(--fg-muted)]">
            {mes.charAt(0).toUpperCase() + mes.slice(1)}, hasta hoy, sin IGV.
            {deQueMeses ? ` Comparado con ${deQueMeses}; para cambiar los meses, usa las fechas de arriba.` : ""}
          </p>
        </div>
        <Link
          href="/configuracion/empresa"
          className="inline-flex h-10 items-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm font-medium hover:bg-[var(--surface-2)]"
        >
          <Settings className="size-4" aria-hidden="true" />
          {c.metaPuesta ? "Cambiar la meta" : "Poner una meta"}
        </Link>
      </div>

      {incompleto && c.ultimaVenta ? (
        <p className="flex items-start gap-2 rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] px-3 py-2 text-base">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-[var(--warn)]" aria-hidden="true" />
          <span>
            <strong>Ojo: la última factura registrada es del {fechaCorta(c.ultimaVenta)}.</strong> Si sigues
            facturando en el sistema anterior, esas ventas no están aquí y estas cifras se quedan cortas.
          </span>
        </p>
      ) : null}

      <div className={`flex items-start gap-3 rounded-md border-2 px-4 py-3 ${a.caja}`}>
        <Icono className={`mt-0.5 size-7 shrink-0 ${a.color}`} aria-hidden="true" />
        <div>
          <p className={`text-xl font-bold ${a.color}`}>{a.titulo}</p>
          <p className="text-base">{frase}</p>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cifra
          etiqueta={`Llevas vendido (del 1 al ${c.dia})`}
          valor={dinero(c.vendido)}
          pie={
            contraMismaFecha === null
              ? "el mes pasado no había ventas a esta fecha"
              : `${contraMismaFecha >= 0 ? `${contraMismaFecha} % más` : `${Math.abs(contraMismaFecha)} % menos`} que el mes pasado a esta fecha (${dinero(c.mismaFechaMesPasado)})`
          }
          tono={contraMismaFecha === null ? undefined : contraMismaFecha >= 0 ? "ok" : "malo"}
        />
        <Cifra
          etiqueta="Meta del mes"
          valor={c.meta > 0 ? dinero(c.meta) : "—"}
          pie={
            c.metaPuesta
              ? `la que pusiste · tu promedio es ${dinero(c.promedio)}`
              : deQueMeses
                ? `tu promedio de ${deQueMeses}`
                : "sin meses con que comparar"
          }
        />
        <Cifra
          etiqueta="Tope: tu mejor mes"
          valor={c.mejorMes ? dinero(c.mejorMes.monto) : "—"}
          pie={c.mejorMes ? nombreMes(c.mejorMes.mes, true) : "sin meses con ventas"}
        />
        <Cifra
          etiqueta="Si sigues a este ritmo"
          valor={pronto ? "—" : dinero(c.proyeccion)}
          pie={pronto ? `se calcula desde el día ${DIA_MINIMO_PARA_PROYECTAR}` : `al cerrar ${mes}`}
          tono={pronto || c.meta <= 0 ? undefined : c.proyeccion >= c.meta ? "ok" : "malo"}
        />
      </dl>

      {c.serie.length > 1 && c.meta > 0 ? (
        <div>
          <h3 className="mb-1 text-base font-semibold">Cada mes contra tu meta</h3>
          <GraficoMeta datos={datos} meta={c.meta} tope={c.mejorMes?.monto ?? null} />
        </div>
      ) : null}

      {c.veredicto !== "sin_datos" ? (
        <div className="flex items-start gap-3 rounded-md bg-[var(--surface-2)] px-4 py-3">
          <Lightbulb className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden="true" />
          <div className="flex flex-col gap-2 text-base">
            <p className="font-semibold">Mi recomendación</p>
            {c.faltaParaMeta > 0 ? (
              <p>
                Para llegar a {nombreMeta} te faltan <strong>{dinero(c.faltaParaMeta)}</strong> este mes.
              </p>
            ) : (
              <p>
                Ya pasaste {nombreMeta}, con <strong>{dinero(c.vendido - c.meta)}</strong> de más. Lo que entre desde
                aquí es ganancia sobre un mes normal
                {c.mejorMes && c.vendido < c.mejorMes.monto
                  ? `; para igualar tu mejor mes te faltan ${dinero(c.mejorMes.monto - c.vendido)}`
                  : ""}
                .
              </p>
            )}
            {cots.ok && cots.datos.cantidad > 0 ? (
              <>
                <p>
                  Tienes{" "}
                  <strong>
                    {cots.datos.cantidad} {cots.datos.cantidad === 1 ? "cotización enviada" : "cotizaciones enviadas"}
                  </strong>{" "}
                  esperando respuesta por <strong>{dinero(cots.datos.monto)}</strong>
                  {cots.datos.vencenPronto > 0
                    ? `, y ${cots.datos.vencenPronto === 1 ? "una vence" : `${cots.datos.vencenPronto} vencen`} en los próximos tres días`
                    : ""}
                  . Es la venta más cercana: llama a esos clientes.
                </p>
                <Link
                  href="/cotizaciones?estado=enviada"
                  className="inline-flex h-10 w-fit items-center rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-base font-medium hover:bg-[var(--surface-2)]"
                >
                  Ver las cotizaciones enviadas
                </Link>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Cifra({ etiqueta, valor, pie, tono }: { etiqueta: string; valor: string; pie?: string; tono?: "ok" | "malo" }) {
  return (
    <div className="rounded-md border border-[var(--border)] p-3">
      <dt className="text-sm text-[var(--fg-muted)]">{etiqueta}</dt>
      <dd className="mt-0.5 text-xl font-semibold tabular">{valor}</dd>
      {pie ? (
        <dd
          className={`mt-0.5 text-sm ${tono === "ok" ? "text-[var(--ok)]" : tono === "malo" ? "text-[var(--danger)]" : "text-[var(--fg-subtle)]"}`}
        >
          {pie}
        </dd>
      ) : null}
    </div>
  );
}
