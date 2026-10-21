import { Suspense } from "react";
import Link from "next/link";
import { CifraAnimada, EstadoError, EstadoVacio, Skeleton } from "@rodatech/ui";

import {
  agingCartera,
  embudoComercial,
  resumen,
  serieCompras,
  serieVentas,
  topClientesRango,
  topProductosRango,
  valorizacionPorFamilia,
} from "../api/consultas";
import { margenDeLoFacturado } from "../dominio/margen";
import { COLORES_FAMILIA, etiquetaAging } from "../dominio/periodo";
import { describirRango, leerRango, type Rango } from "../dominio/rango";
import { FiltroRango } from "./filtro-rango";
import { ComoVoyBloque } from "./como-voy";
import { sinPermiso } from "@/lib/permisos";
import { AvisoSinPermiso } from "@/componentes/sin-permiso";
import { datosVentas } from "@/modules/tablero/api/ejecutivo";
import {
  GraficoAging,
  GraficoSerieCompras,
  GraficoSerieVentas,
  GraficoValorizacion,
} from "./graficos";

/**
 * Informes.
 *
 * Cada bloque va en su propio `<Suspense>`: son cinco consultas independientes
 * y encadenarlas haría esperar el gráfico rápido por el lento. Así el tablero
 * se va rellenando en vez de aparecer de golpe al final.
 *
 * La fecha se calcula en el servidor con la zona de Lima. Sin fijarla, un
 * informe abierto a las 7 de la tarde contaría el mes siguiente.
 */
interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function uno(v: string | string[] | undefined): string | undefined {
  const valor = Array.isArray(v) ? v[0] : v;
  return valor && valor.length > 0 ? valor : undefined;
}

/**
 * «$ 114,882.71» y no «$ 114882.71».
 *
 * Revisión por módulos del 02/10: las cifras salían con `toFixed(2)`, sin
 * separador de miles, y una de seis dígitos hay que contarla con el dedo. El
 * espacio entre el signo y la cifra es de no separación, para que el «$» no se
 * quede solo al final de una línea.
 */
function dinero(n: number): string {
  return `$\u00a0${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function PaginaReportes({ searchParams }: Props) {
  // Hasta el 20/10 solo lo escondía el menú: la URL abría para cualquiera.
  // Ahora es «Informe general · Ver» (143).
  const prohibido = await sinPermiso("informe", "ver");
  if (prohibido) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Informe general</h1>
        <AvisoSinPermiso mensaje={prohibido} />
      </div>
    );
  }
  const sp = await searchParams;
  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(
    new Date(),
  );

  const rango = leerRango(
    {
      desde: uno(sp.desde),
      hasta: uno(sp.hasta),
      grano: uno(sp.grano),
      atajo: uno(sp.atajo),
    },
    hoy,
  );

  // La clave del Suspense incluye el rango: sin ella, React reutiliza el
  // resultado anterior al cambiar de fechas y la pantalla se queda con los
  // datos viejos hasta que algo más la obliga a repintar.
  const clave = `${rango.desde}|${rango.hasta}|${rango.grano}`;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Informes</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Cómo va el negocio {describirRango(rango, hoy)}: qué se vende, qué margen
          deja, qué falta por cobrar y cuánto capital hay parado en el almacén.
        </p>
      </div>

      <FiltroRango
        desde={rango.desde}
        hasta={rango.hasta}
        grano={rango.grano}
        atajo={rango.atajo}
      />

      {/* «¿Cómo voy este mes?» (20/10): lo primero, porque es la pregunta con
          que se abre esta pantalla. Compara con el rango elegido arriba; sin
          elegir, con los meses de enero al anterior. */}
      <Suspense key={`cv|${clave}`} fallback={<FilaSkeleton alto="h-64" columnas={1} />}>
        <ComoVoyBloque
          hoy={hoy}
          referencia={uno(sp.desde) || uno(sp.atajo) ? { desde: rango.desde, hasta: rango.hasta } : null}
        />
      </Suspense>

      <Suspense fallback={<FilaSkeleton alto="h-24" columnas={3} />}>
        <Indicadores hoy={hoy} />
      </Suspense>

      {/* Lo vendido (132): los pedidos del periodo, que es cuando la venta se
          concreta. Antes que lo facturado, porque va antes en el tiempo. */}
      <Bloque
        titulo="Lo vendido (pedidos)"
        nota="Cada vez que un cliente confirma: los pedidos del periodo —también los repetidos— y lo del sistema anterior. Sin IGV."
      >
        <Suspense key={`p-${clave}`} fallback={<FilaSkeleton alto="h-20" columnas={4} />}>
          <BloquePedidos rango={rango} />
        </Suspense>
      </Bloque>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Bloque
          titulo="Lo facturado"
          nota="Lo facturado en cada periodo, sin IGV: lo declarado a SUNAT. En verde, lo que queda después del costo, cuando se conoce."
        >
          <Suspense key={`v-${clave}`} fallback={<Skeleton className="h-64 w-full" />}>
            <BloqueVentas rango={rango} />
          </Suspense>
        </Bloque>

        <Bloque
          titulo="Capital en el almacén"
          nota="A costo, por familia. Lo que está aquí no está en la cuenta."
        >
          <Suspense fallback={<Skeleton className="h-60 w-full" />}>
            <BloqueValorizacion />
          </Suspense>
        </Bloque>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Bloque
          titulo="Costo de las compras"
          nota="Lo que se PIDIÓ y cuándo, de las órdenes de compra. No es lo que entró al almacén ni lo que costó lo vendido: son tres preguntas distintas."
        >
          <Suspense key={`c-${clave}`} fallback={<Skeleton className="h-64 w-full" />}>
            <BloqueCompras rango={rango} />
          </Suspense>
        </Bloque>

        <Bloque
          titulo="Cobranzas"
          nota="Cuánto se debe y desde cuándo. De izquierda a derecha, de menos a más urgente."
        >
          <Suspense fallback={<Skeleton className="h-60 w-full" />}>
            <BloqueAging />
          </Suspense>
        </Bloque>
      </div>

      {/* Estas dos van a ANCHO COMPLETO y no en dos columnas.
          Puestas al lado, la última columna de cada una —el cliente que se
          lleva el producto, y los días sin comprar— quedaba fuera de la
          pantalla. Se podía desplazar, pero una tabla cuyo dato nuevo hay que
          buscar arrastrando es una tabla que nadie mira. */}
      <Bloque
        titulo="Lo que más se vende, y a quién"
        nota="La última columna es el cliente que más se lleva de ese código. Si uno solo se lleva casi todo, reponer es una conversación con él."
      >
        <Suspense key={`p-${clave}`} fallback={<Skeleton className="h-64 w-full" />}>
          <BloqueTop rango={rango} />
        </Suspense>
      </Bloque>

      <Bloque
        titulo="Quién más compra"
        nota="Cuánto se llevan y cada cuánto vuelven. La última columna es lo que llevan sin aparecer."
      >
        <Suspense key={`cl-${clave}`} fallback={<Skeleton className="h-64 w-full" />}>
          <BloqueClientes rango={rango} />
        </Suspense>
      </Bloque>

      <Bloque
        titulo="Del presupuesto al cobro"
        nota="Dónde se queda el dinero por el camino."
      >
        <Suspense fallback={<Skeleton className="h-32 w-full" />}>
          <BloqueEmbudo />
        </Suspense>
      </Bloque>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Bloque({
  titulo,
  nota,
  children,
}: {
  titulo: string;
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="anim-entrada card @container p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">{titulo}</h2>
        {/* La nota explica CÓMO leer el gráfico. Un gráfico sin instrucciones
            se mira una vez y no se vuelve a abrir. */}
        {nota ? (
          <p className="mt-0.5 text-sm text-[var(--fg-muted)]">{nota}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function FilaSkeleton({ alto, columnas }: { alto: string; columnas: number }) {
  return (
    <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-${columnas}`}>
      {Array.from({ length: columnas }, (_, i) => (
        <Skeleton key={i} className={`${alto} w-full`} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

async function Indicadores({ hoy }: { hoy: string }) {
  const r = await resumen(hoy);
  if (!r.ok) {
    return <EstadoError titulo="No se pudieron cargar los indicadores" detalle={r.error} />;
  }

  const d = r.datos;

  // «Vendido este mes» se fue a «¿Cómo voy?» (20/10): comparaba el mes a
  // medias con el mes pasado entero, y el día 10 siempre decía «−70 %».
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {/* Con el costo en cero, «0.0 %» no es un margen del cero por ciento:
          es que no se sabe. El histórico se cargó sin costo (059). */}
      {d.costoMes > 0 ? (
        <Kpi
          etiqueta="Margen del mes"
          valor={d.margenPct}
          sufijo=" %"
          decimales={2}
          pie="sobre el costo"
          tono={d.margenPct >= 15 ? "ok" : d.margenPct > 0 ? "aviso" : undefined}
        />
      ) : (
        <Kpi etiqueta="Margen del mes" texto="—" pie="sin costo registrado" />
      )}
      <Kpi
        etiqueta="Por cobrar"
        valor={d.porCobrar}
        prefijo="$ "
        decimales={2}
        pie={d.vencido > 0 ? `${dinero(d.vencido)} ya vencido` : "nada vencido"}
        tono={d.vencido > 0 ? "malo" : "ok"}
      />
      <Kpi
        etiqueta="Capital en almacén"
        valor={d.inventarioCosto}
        prefijo="$ "
        decimales={2}
        pie={
          d.skusBajoMinimo > 0
            ? `${d.skusBajoMinimo} ${d.skusBajoMinimo === 1 ? "producto" : "productos"} bajo mínimo`
            : "nada bajo mínimo"
        }
        tono={d.skusBajoMinimo > 0 ? "aviso" : undefined}
      />
    </div>
  );
}

function Kpi({
  etiqueta,
  valor,
  prefijo = "",
  sufijo = "",
  decimales = 0,
  pie,
  tono,
  texto,
}: {
  etiqueta: string;
  valor?: number;
  prefijo?: string;
  sufijo?: string;
  decimales?: number;
  pie?: string;
  tono?: "ok" | "aviso" | "malo";
  /**
   * Para cuando la respuesta NO es un número: «—», «sin datos».
   *
   * Un indicador que no se puede calcular tiene que decirlo con una palabra.
   * Pintar un cero en su lugar es dar por sabido lo que no se sabe, que es
   * justo lo que hacía el margen con el costo en cero (059).
   */
  texto?: string;
}) {
  const color =
    tono === "malo"
      ? "text-[var(--danger)]"
      : tono === "aviso"
        ? "text-[var(--warn)]"
        : tono === "ok"
          ? "text-[var(--ok)]"
          : "";
  return (
    <div className="card anim-entrada p-3">
      <p className="text-sm text-[var(--fg-muted)]">{etiqueta}</p>
      <p className="mt-0.5 text-xl font-semibold">
        {texto !== undefined ? (
          <span className="text-[var(--fg-subtle)]">{texto}</span>
        ) : (
          <CifraAnimada
            valor={valor ?? 0}
            decimales={decimales}
            prefijo={prefijo}
            sufijo={sufijo}
          />
        )}
      </p>
      {pie ? <p className={`mt-0.5 text-sm ${color || "text-[var(--fg-subtle)]"}`}>{pie}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Lo vendido del periodo (132), en cuatro cifras. */
async function BloquePedidos({ rango }: { rango: Rango }) {
  const r = await datosVentas(rango);
  if (!r.ok) return <EstadoError titulo="No se pudo cargar lo vendido" detalle={r.error} />;
  const d = r.datos.resumen;
  return (
    <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
      <Kpi
        etiqueta="Vendido"
        valor={d.vendido}
        prefijo="$ "
        decimales={2}
        pie={`${d.ventas} ${d.ventas === 1 ? "venta" : "ventas"} a ${d.clientes} ${d.clientes === 1 ? "cliente" : "clientes"}`}
      />
      <Kpi
        etiqueta="Margen de lo vendido"
        valor={d.margen ?? undefined}
        texto={d.margen === null ? "sin costo" : undefined}
        sufijo=" %"
        decimales={1}
        pie="sobre el costo analizado al cotizar"
        tono={d.margen !== null && d.margen < 10 ? "aviso" : undefined}
      />
      <Kpi
        etiqueta="Pedidos repetidos"
        valor={d.repetidos}
        pie={d.repetidos > 0 ? "clientes que volvieron a pedir lo mismo" : "ninguno en este periodo"}
      />
      <Kpi
        etiqueta="Vendido sin facturar"
        valor={d.montoSinFacturar}
        prefijo="$ "
        decimales={2}
        pie={d.sinFacturar > 0 ? `${d.sinFacturar} ${d.sinFacturar === 1 ? "pedido" : "pedidos"} por facturar` : "todo lo vendido está facturado"}
        tono={d.sinFacturar > 0 ? "aviso" : "ok"}
      />
    </div>
  );
}

async function BloqueVentas({ rango }: { rango: Rango }) {
  const r = await serieVentas(rango);
  if (!r.ok) return <EstadoError titulo="No se pudo cargar la serie" detalle={r.error} />;

  if (r.datos.length === 0) {
    return (
      <EstadoVacio
        titulo="No hay ventas en este periodo"
        descripcion="Prueba con un rango más amplio, o mira «Todo»."
      />
    );
  }

  const venta = r.datos.reduce((a, p) => a + p.venta, 0);
  const costo = r.datos.reduce((a, p) => a + p.costo, 0);
  const documentos = r.datos.reduce((a, p) => a + p.documentos, 0);
  const margen = margenDeLoFacturado(venta, costo);

  return (
    <>
      <GraficoSerieVentas datos={r.datos} mostrarMargen={margen.tipo === "ok"} />
      <p className="mt-3 border-t border-[var(--border-soft)] pt-3 text-sm text-[var(--fg-muted)]">
        <span className="font-medium text-[var(--fg)]">{dinero(venta)}</span> en{" "}
        {documentos} {documentos === 1 ? "documento" : "documentos"} ·{" "}
        {/* «margen 0.0 %» con el costo en cero no es un margen del cero por
            ciento: es que no se sabe. El histórico se cargó sin costo, así que
            este es el caso normal mirando hacia atrás. */}
        {margen.tipo === "ok"
          ? `costo ${dinero(costo)} · margen ${margen.pct.toFixed(2)} % sobre el costo`
          : margen.tipo === "incompleto"
            ? "margen sin calcular: falta el costo en la mayoría de las ventas"
            : "sin costo registrado, así que no hay margen que calcular"}
      </p>
    </>
  );
}

/**
 * El costo de las órdenes de compra.
 *
 * Willy lo pidió así de explícito (28:47): «el costo también, que se va a
 * jalar directamente las órdenes de compra». Conviene que la pantalla diga qué
 * mide, porque hay tres «costos» distintos en el ERP y solo uno cuadra con
 * cada pregunta.
 */
async function BloqueCompras({ rango }: { rango: Rango }) {
  const r = await serieCompras(rango);
  if (!r.ok) return <EstadoError titulo="No se pudo cargar la serie" detalle={r.error} />;

  if (r.datos.length === 0) {
    return (
      <EstadoVacio
        titulo="No hay compras en este periodo"
        descripcion="Aquí sale lo que se pidió a los proveedores, por fecha de la orden."
      />
    );
  }

  const total = r.datos.reduce((a, p) => a + p.costoTotal, 0);
  const gastos = r.datos.reduce((a, p) => a + p.gastos, 0);
  const ordenes = r.datos.reduce((a, p) => a + p.ordenes, 0);

  return (
    <>
      <GraficoSerieCompras datos={r.datos} />
      <p className="mt-3 border-t border-[var(--border-soft)] pt-3 text-sm text-[var(--fg-muted)]">
        <span className="font-medium text-[var(--fg)]">{dinero(total)}</span> en{" "}
        {ordenes} {ordenes === 1 ? "orden" : "órdenes"}
        {gastos > 0
          ? ` · de los cuales ${dinero(gastos)} son gastos de importación`
          : " · sin gastos de importación"}
        . Sin IGV: es crédito fiscal, no costo.
      </p>
    </>
  );
}

/**
 * Lo más vendido, y a QUIÉN.
 *
 * La columna del cliente es la que Willy pidió (9:01): «si yo compro una
 * mercadería, ¿para quién va dirigida? Puede que lo consuma uno o puede que lo
 * consuman dos clientes». Con el porcentaje al lado, porque «tres clientes» y
 * «tres clientes de los que uno se lleva el 95 %» son situaciones distintas.
 */
async function BloqueTop({ rango }: { rango: Rango }) {
  const r = await topProductosRango(rango, 15);
  if (!r.ok) return <EstadoError titulo="No se pudo cargar el ranking" detalle={r.error} />;

  if (r.datos.length === 0) {
    return (
      <EstadoVacio
        titulo="No se vendió nada en este periodo"
        descripcion="El ranking se llena solo conforme se factura."
      />
    );
  }

  return (
    <>
      {/*
        EN MÓVIL, TARJETAS. Medido a 390 px: la tabla pide 704.

        Un ranking se lee de arriba abajo, así que en el teléfono la tarjeta
        deja el código y el margen en la primera línea —que es la comparación
        que se viene a hacer— y debajo lo vendido y quién se lo lleva.
      */}
      <div className="flex flex-col gap-2.5 @3xl:hidden">
        {r.datos.map((p) => (
          <div key={p.id} className="rounded-lg border border-[var(--border)] p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link
                href={`/productos/${p.id}/trazabilidad`}
                className="font-mono text-sm font-medium text-brand-600 hover:underline"
              >
                {p.codigo}
              </Link>
              <span
                className={`tabular text-sm font-medium ${
                  p.costo <= 0
                    ? "text-[var(--fg-subtle)]"
                    : p.margenPct >= 20
                    ? "text-[var(--ok)]"
                    : p.margenPct < 12
                      ? "text-[var(--warn)]"
                      : ""
                }`}
              >
                {p.costo > 0 ? `${p.margenPct.toFixed(2)} % de margen` : "sin costo"}
              </span>
            </div>

            <p className="mt-1 text-sm">{p.descripcion}</p>

            <p className="mt-2 text-sm text-[var(--fg-muted)]">
              <span className="tabular font-medium text-[var(--fg)]">{p.unidades}</span>{" "}
              uds. ·{" "}
              <span className="tabular font-medium text-[var(--fg)]">
                {dinero(p.venta)}
              </span>{" "}
              vendido
            </p>

            {p.clientePrincipal ? (
              <p className="mt-1 text-sm">
                <span className="text-[var(--fg-muted)]">Se lo lleva </span>
                {p.clientePrincipalId ? (
                  <Link
                    href={`/clientes/${p.clientePrincipalId}`}
                    className="font-medium text-brand-600 hover:underline"
                  >
                    {p.clientePrincipal}
                  </Link>
                ) : (
                  <span className="font-medium">{p.clientePrincipal}</span>
                )}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="hidden scroll-x @3xl:block">
      {/* `text-sm`: era `text-sm` y un informe está para leerse. */}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left uppercase tracking-wide text-[var(--fg-subtle)]">
            <th className="py-1.5 pr-3 font-medium">Código</th>
            <th className="py-1.5 pr-3 text-right font-medium">Uds.</th>
            <th className="py-1.5 pr-3 text-right font-medium">Vendido</th>
            <th className="py-1.5 pr-3 text-right font-medium">Margen</th>
            <th className="py-1.5 font-medium">Quién se lo lleva</th>
          </tr>
        </thead>
        <tbody>
          {r.datos.map((p, i) => (
            <tr
              key={p.id}
              className="anim-entrada border-t border-[var(--border-soft)]"
              style={{ animationDelay: `${Math.min(i, 6) * 24}ms` }}
            >
              <td className="py-1.5 pr-3">
                <Link
                  href={`/productos/${p.id}/trazabilidad`}
                  className="font-mono font-medium text-brand-600 hover:underline"
                  title="Ver la trazabilidad de este código"
                >
                  {p.codigo}
                </Link>
                <span className="block max-w-[16rem] truncate text-[var(--fg-subtle)]">
                  {p.descripcion}
                </span>
              </td>
              <td className="py-1.5 pr-3 text-right tabular">{p.unidades}</td>
              <td className="py-1.5 pr-3 text-right tabular">{dinero(p.venta)}</td>
              <td
                className={`py-1.5 pr-3 text-right tabular font-medium ${
                  p.costo <= 0
                    ? "text-[var(--fg-subtle)]"
                    : p.margenPct >= 20
                    ? "text-[var(--ok)]"
                    : p.margenPct < 12
                      ? "text-[var(--warn)]"
                      : ""
                }`}
              >
                {/* Sin costo no hay margen que decir. «0 %» en ámbar se leía
                    como «se vende sin ganar nada» (revisión del 02/10). */}
                {p.costo > 0 ? `${p.margenPct.toFixed(2)} %` : "—"}
              </td>
              <td className="py-1.5">
                {p.clientePrincipal ? (
                  <>
                    {p.clientePrincipalId ? (
                      <Link
                        href={`/clientes/${p.clientePrincipalId}`}
                        className="block max-w-[14rem] truncate font-medium text-brand-600 hover:underline"
                      >
                        {p.clientePrincipal}
                      </Link>
                    ) : (
                      <span className="block max-w-[14rem] truncate">{p.clientePrincipal}</span>
                    )}
                    <span className="text-[var(--fg-subtle)]">
                      {p.clientes === 1
                        ? "el único que lo compra"
                        : `${p.clientePrincipalPct} % de ${p.clientes} clientes`}
                    </span>
                  </>
                ) : (
                  <span className="text-[var(--fg-subtle)]">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}

/**
 * Quién más compra, y cada cuánto.
 *
 * «Cuánto le compran y en qué tiempo le compran» (28:47). Lo segundo es lo que
 * no había: una lista ordenada por importe dice quién es grande, pero no quién
 * dejó de aparecer. `dias_sin_comprar` se mide contra hoy, no contra el fin
 * del rango, o contaría días que todavía no han pasado.
 */
async function BloqueClientes({ rango }: { rango: Rango }) {
  const r = await topClientesRango(rango, 15);
  if (!r.ok) return <EstadoError titulo="No se pudo cargar el ranking" detalle={r.error} />;

  if (r.datos.length === 0) {
    return (
      <EstadoVacio
        titulo="Nadie compró en este periodo"
        descripcion="Prueba con un rango más amplio."
      />
    );
  }

  return (
    <>
      {/*
        EN MÓVIL, TARJETAS. Medido a 390 px: la tabla pide 490.

        Lo que se viene a buscar aquí es quién dejó de aparecer, así que «sin
        venir» sube a la primera línea junto al nombre — en la tabla es la
        última columna, la primera que se pierde al arrastrar.
      */}
      <div className="flex flex-col gap-2.5 @3xl:hidden">
        {r.datos.map((c) => (
          <div key={c.id} className="rounded-lg border border-[var(--border)] p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link
                href={`/clientes/${c.id}`}
                className="min-w-0 text-sm font-medium text-brand-600 hover:underline"
              >
                {c.cliente}
              </Link>
              <span
                className={`tabular text-sm ${
                  c.diasSinComprar > 90 ? "font-medium text-[var(--warn)]" : "text-[var(--fg-muted)]"
                }`}
              >
                {c.diasSinComprar} días sin comprar
              </span>
            </div>

            <p className="mt-2 text-sm text-[var(--fg-muted)]">
              <span className="tabular font-medium text-[var(--fg)]">
                {dinero(c.venta)}
              </span>{" "}
              en {c.documentos} {c.documentos === 1 ? "documento" : "documentos"} ·{" "}
              <span
                className={`tabular font-medium ${
                  c.costo <= 0
                    ? "text-[var(--fg-subtle)]"
                    : c.margenPct >= 20
                    ? "text-[var(--ok)]"
                    : c.margenPct < 12
                      ? "text-[var(--warn)]"
                      : "text-[var(--fg)]"
                }`}
              >
                {c.costo > 0 ? `${c.margenPct.toFixed(2)} %` : "sin costo"}
              </span>
              {c.costo > 0 ? " de margen" : ""}
            </p>

            <p className="mt-1 text-sm text-[var(--fg-subtle)]">
              {c.diasEntreCompras === null
                ? "Solo compró una vez"
                : `Compra cada ${c.diasEntreCompras} días`}
            </p>
          </div>
        ))}
      </div>

      <div className="hidden scroll-x @3xl:block">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left uppercase tracking-wide text-[var(--fg-subtle)]">
            <th className="py-1.5 pr-3 font-medium">Cliente</th>
            <th className="py-1.5 pr-3 text-right font-medium">Comprado</th>
            <th className="py-1.5 pr-3 text-right font-medium">Margen</th>
            <th className="py-1.5 pr-3 text-right font-medium">Cada</th>
            <th className="py-1.5 text-right font-medium">Sin venir</th>
          </tr>
        </thead>
        <tbody>
          {r.datos.map((c, i) => (
            <tr
              key={c.id}
              className="anim-entrada border-t border-[var(--border-soft)]"
              style={{ animationDelay: `${Math.min(i, 6) * 24}ms` }}
            >
              <td className="py-1.5 pr-3">
                <Link
                  href={`/clientes/${c.id}`}
                  className="block max-w-[14rem] truncate font-medium text-brand-600 hover:underline"
                >
                  {c.cliente}
                </Link>
                <span className="text-[var(--fg-subtle)]">
                  {c.documentos} {c.documentos === 1 ? "documento" : "documentos"}
                </span>
              </td>
              <td className="py-1.5 pr-3 text-right tabular">{dinero(c.venta)}</td>
              <td
                className={`py-1.5 pr-3 text-right tabular font-medium ${
                  c.costo <= 0
                    ? "text-[var(--fg-subtle)]"
                    : c.margenPct >= 20
                    ? "text-[var(--ok)]"
                    : c.margenPct < 12
                      ? "text-[var(--warn)]"
                      : ""
                }`}
              >
                {c.costo > 0 ? `${c.margenPct.toFixed(2)} %` : "—"}
              </td>
              <td className="py-1.5 pr-3 text-right tabular">
                {c.diasEntreCompras === null ? (
                  // Con una sola compra no hay intervalo. Un cero diría
                  // «compra todos los días», que es lo contrario de la verdad.
                  <span className="text-[var(--fg-subtle)]">una vez</span>
                ) : (
                  `${c.diasEntreCompras} d`
                )}
              </td>
              <td
                className={`py-1.5 text-right tabular ${
                  c.diasSinComprar > 90 ? "font-medium text-[var(--warn)]" : ""
                }`}
              >
                {c.diasSinComprar} d
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}

async function BloqueAging() {
  const r = await agingCartera();
  if (!r.ok) return <EstadoError titulo="No se pudo cargar la cartera" detalle={r.error} />;

  if (r.datos.length === 0) {
    return (
      <EstadoVacio
        titulo="No hay nada por cobrar"
        descripcion="Todo lo facturado está cobrado."
      />
    );
  }

  const total = r.datos.reduce((a, t) => a + t.saldo, 0);

  return (
    <>
      <GraficoAging datos={r.datos} />
      <ul className="mt-3 flex flex-col gap-1 border-t border-[var(--border-soft)] pt-3 text-sm">
        {r.datos.map((t) => (
          <li key={t.tramo} className="flex items-baseline justify-between gap-2">
            <span className="text-[var(--fg-muted)]">
              {etiquetaAging(t.tramo)}
              <span className="ml-1.5 text-[var(--fg-subtle)]">
                ({t.documentos} {t.documentos === 1 ? "doc." : "docs."})
              </span>
            </span>
            <span className="tabular font-medium">{dinero(t.saldo)}</span>
          </li>
        ))}
        <li className="mt-1 flex items-baseline justify-between gap-2 border-t border-[var(--border-soft)] pt-1.5">
          <span className="font-medium">Total</span>
          <span className="tabular font-semibold">{dinero(total)}</span>
        </li>
      </ul>
    </>
  );
}

async function BloqueValorizacion() {
  const r = await valorizacionPorFamilia();
  if (!r.ok) {
    return <EstadoError titulo="No se pudo cargar la valorización" detalle={r.error} />;
  }

  if (r.datos.every((f) => f.valorCosto === 0)) {
    return (
      <EstadoVacio
        titulo="El almacén está vacío"
        descripcion="Cuando entre mercadería con una recepción, aparecerá aquí."
      />
    );
  }

  /*
    Solo se listan las familias con capital (revisión por módulos del 02/10).
    Eran once líneas y ocho decían «$ 0.00»: el catálogo entró de un Excel y
    casi nada tiene stock. Las vacías se nombran juntas en una línea.
  */
  const conCapital = r.datos.filter((f) => f.valorCosto !== 0);
  const vacias = r.datos.filter((f) => f.valorCosto === 0);

  return (
    <>
      <GraficoValorizacion datos={conCapital} />
      <ul className="mt-3 flex flex-col gap-1 border-t border-[var(--border-soft)] pt-3 text-sm">
        {conCapital.map((f, i) => (
          <li key={f.familia} className="flex items-baseline justify-between gap-2">
            <span className="flex min-w-0 items-baseline gap-2 truncate text-[var(--fg-muted)]">
              <span
                aria-hidden="true"
                className="inline-block size-3 shrink-0 self-center rounded-[3px]"
                style={{ background: COLORES_FAMILIA[i % COLORES_FAMILIA.length] }}
              />
              {f.familia}
              <span className="ml-1.5 text-[var(--fg-subtle)]">({f.skus} productos)</span>
            </span>
            <span className="tabular font-medium">{dinero(f.valorCosto)}</span>
          </li>
        ))}
      </ul>
      {vacias.length > 0 ? (
        <p className="mt-2 text-sm text-[var(--fg-subtle)]">
          Sin stock: {vacias.map((f) => f.familia).join(", ")}.
        </p>
      ) : null}
    </>
  );
}

async function BloqueEmbudo() {
  const r = await embudoComercial();
  if (!r.ok) return <EstadoError titulo="No se pudo cargar el embudo" detalle={r.error} />;

  const e = r.datos;
  if (e.cotizado === 0) {
    return (
      <EstadoVacio
        titulo="Sin cotizaciones todavía"
        descripcion="El embudo se dibuja a partir de la primera cotización."
      />
    );
  }

  /** «1 cotización», no «1 cotizaciones». */
  const plural = (n: number, singular: string, plural: string) =>
    `${n} ${n === 1 ? singular : plural}`;

  const pasos = [
    {
      nombre: "Cotizado",
      valor: e.cotizado,
      pie: plural(e.cotizaciones, "cotización", "cotizaciones"),
    },
    {
      nombre: "Despachado",
      valor: e.despachado,
      pie: e.guias > 0 ? plural(e.guias, "guía", "guías") : "sin guías todavía",
    },
    {
      nombre: "Facturado",
      valor: e.facturado,
      pie: plural(e.comprobantes, "comprobante", "comprobantes"),
    },
    { nombre: "Cobrado", valor: e.cobrado, pie: "" },
  ];

  return (
    <div className="flex flex-col gap-2.5">
      {pasos.map((p, i) => {
        // El ancho es relativo al primer paso, que es el 100 %. Así se ve de un
        // vistazo cuánto se cae por el camino.
        const pct = e.cotizado > 0 ? (p.valor / e.cotizado) * 100 : 0;
        // Por debajo del 18 % la cifra no cabe dentro de la barra y sale
        // recortada. A partir de ahí se escribe fuera, en color normal.
        const dentro = pct >= 18;

        return (
          /* En el teléfono, el nombre y su nota arriba y la barra debajo a
             lo ancho: en una sola fila la barra se quedaba en 70 px y la
             cifra no cabía (revisión por módulos del 02/10). */
          <div
            key={p.nombre}
            className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[6rem_1fr_8rem]"
          >
            <span className="text-sm text-[var(--fg-muted)]">{p.nombre}</span>

            <div className="order-last col-span-2 flex h-7 items-center gap-2 sm:order-none sm:col-span-1">
              <div
                className="h-full overflow-hidden rounded-sm bg-[var(--surface-2)]"
                style={{ width: dentro ? `${pct}%` : undefined, flex: dentro ? "none" : 1 }}
              >
                <div
                  className="anim-crecer flex h-full items-center justify-end rounded-sm pr-2"
                  style={{
                    // Un mínimo visible para que un paso en cero se vea como
                    // «no pasó nada» y no como «no existe este paso».
                    width: dentro ? "100%" : `${Math.max(1.5, pct)}%`,
                    animationDelay: `${i * 90}ms`,
                    background:
                      i === 3
                        ? "var(--ok)"
                        : `color-mix(in srgb, var(--color-brand-600) ${100 - i * 18}%, var(--color-brand-300))`,
                  }}
                >
                  {dentro ? (
                    <span className="tabular text-sm font-medium text-white">
                      {dinero(p.valor)}
                    </span>
                  ) : null}
                </div>
              </div>

              {!dentro ? (
                <span className="tabular shrink-0 text-sm font-medium text-[var(--fg-muted)]">
                  {dinero(p.valor)}
                </span>
              ) : null}
            </div>

            <span className="text-right text-sm text-[var(--fg-subtle)]">
              {p.pie}
            </span>
          </div>
        );
      })}

      {e.porCobrar > 0 ? (
        <p className="mt-1 text-sm text-[var(--fg-muted)]">
          Quedan <strong className="text-[var(--warn)]">{dinero(e.porCobrar)}</strong> sin
          cobrar de lo ya facturado.
        </p>
      ) : null}
    </div>
  );
}
