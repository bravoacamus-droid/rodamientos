import { Boxes, FileText, ShoppingCart, Users } from "lucide-react";
import { EstadoError, KpiCard } from "@rodatech/ui";

import { periodoAnterior, type Rango } from "@/modules/reportes";
import {
  resumen,
  serieCompras,
  serieVentas,
  topClientesRango,
  topProductosRango,
} from "@/modules/reportes/api/consultas";

import { datosCotizaciones } from "../api/ejecutivo";
import { GraficoBarras } from "./ejecutivo/grafico-lazy";
import { Bloque, Partes, Ranking, dinero, entero, pct } from "./ejecutivo/piezas";

/**
 * El resto del negocio en el Tablero (07/10).
 *
 * Luis, 07/10: *«el tablero va a ser un card de KPIs de todo el negocio,
 * resumido, con gráficos, más gráficos bonitos de todo, con filtros; después
 * ya tenemos en el módulo de reportes cada uno solo»*.
 *
 * Así que aquí va UNA cifra de cada parte del negocio —lo cotizado, lo
 * comprado, lo que hay en el almacén, quién compra— y su gráfico, cada uno con
 * su enlace al reporte o al módulo que lo explica entero. El detalle no se
 * repite aquí: para eso están los reportes.
 */

const dolares = (n: number) =>
  n.toLocaleString("es-PE", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Cotizado, comprado, almacén y clientes: las cuatro tarjetas de la segunda fila. */
export async function TarjetasNegocio({ rango, hoy }: { rango: Rango; hoy: string }) {
  const previo = { ...periodoAnterior(rango), grano: rango.grano };
  const [cot, cotPrevio, compras, comprasPrevio, res, clientes, clientesPrevio] = await Promise.all([
    datosCotizaciones(rango),
    datosCotizaciones(previo),
    serieCompras(rango),
    serieCompras(previo),
    resumen(hoy),
    topClientesRango(rango, 1000),
    topClientesRango(previo, 1000),
  ]);
  if (!cot.ok) return <EstadoError titulo="No se pudieron cargar las cotizaciones" detalle={cot.error} />;

  const c = cot.datos.resumen;
  // Se gana sobre lo que ya se decidió, no sobre lo que sigue en juego: si no,
  // un mes con muchas cotizaciones recién enviadas parecería un mes malo.
  const decididas = c.aprobada + c.rechazada + c.vencida;
  const tasa = decididas > 0 ? (c.aprobada / decididas) * 100 : null;
  const sumaCompras = (r: typeof compras) => (r.ok ? r.datos.reduce((s, p) => s + p.costoTotal, 0) : 0);
  const ordenes = compras.ok ? compras.datos.reduce((s, p) => s + p.ordenes, 0) : 0;
  const comparacion = "vs. el periodo anterior";

  return (
    <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @4xl:grid-cols-4">
      <KpiCard
        etiqueta="Cotizado"
        icono={<FileText aria-hidden="true" />}
        valor={dolares(c.monto)}
        actual={c.monto}
        previo={cotPrevio.ok ? cotPrevio.datos.resumen.monto : undefined}
        etiquetaComparacion={comparacion}
        serie={cot.datos.serie.map((p) => p.monto)}
        colorSerie="var(--viz-2)"
        detalle={`${entero(c.cotizaciones)} cotizaciones · se gana el ${pct(tasa)}`}
        href="/reportes/cotizaciones"
      />
      <KpiCard
        etiqueta="Comprado"
        icono={<ShoppingCart aria-hidden="true" />}
        valor={dolares(sumaCompras(compras))}
        actual={sumaCompras(compras)}
        previo={comprasPrevio.ok ? sumaCompras(comprasPrevio) : undefined}
        etiquetaComparacion={comparacion}
        // Gastar más no es ni bueno ni malo: sin color en la flecha.
        mejorSi={undefined}
        serie={compras.ok ? compras.datos.map((p) => p.costoTotal) : undefined}
        colorSerie="var(--viz-3)"
        detalle={`${entero(ordenes)} ${ordenes === 1 ? "compra" : "compras"} · costo puesto en almacén`}
        href="/compras"
      />
      <KpiCard
        etiqueta="Capital en el almacén"
        icono={<Boxes aria-hidden="true" />}
        valor={res.ok ? dolares(res.datos.inventarioCosto) : "—"}
        // Es de HOY, no del periodo: el stock no se filtra por fechas.
        detalle={
          res.ok
            ? res.datos.skusBajoMinimo > 0
              ? `hoy, al costo · ${entero(res.datos.skusBajoMinimo)} productos bajo el mínimo`
              : "hoy, al costo"
            : "no se pudo calcular"
        }
        href="/inventario"
      />
      <KpiCard
        etiqueta="Clientes que compraron"
        icono={<Users aria-hidden="true" />}
        valor={clientes.ok ? entero(clientes.datos.length) : "—"}
        actual={clientes.ok ? clientes.datos.length : undefined}
        previo={clientesPrevio.ok ? clientesPrevio.datos.length : undefined}
        etiquetaComparacion={comparacion}
        detalle={`${entero(c.clientes)} clientes cotizados en el periodo`}
        href="/reportes/clientes"
      />
    </div>
  );
}

/** Lo vendido contra lo comprado, por periodo, en la misma escala de dólares. */
export async function VendidoComprado({ rango }: { rango: Rango }) {
  const [ventas, compras] = await Promise.all([serieVentas(rango), serieCompras(rango)]);
  if (!ventas.ok) return <EstadoError titulo="No se pudo cargar la serie" detalle={ventas.error} />;

  const porPeriodo = new Map((compras.ok ? compras.datos : []).map((p) => [p.periodo, p.costoTotal]));
  const datos = ventas.datos.map((v) => ({
    etiqueta: v.etiqueta,
    vendido: Math.round(v.venta),
    comprado: Math.round(porPeriodo.get(v.periodo) ?? 0),
  }));

  return (
    <Bloque
      titulo="Lo vendido y lo comprado"
      descripcion="En dólares sin IGV, por periodo. Si lo comprado pasa a lo vendido, se está llenando el almacén."
      accion={{ href: "/reportes/facturacion", texto: "Ver lo facturado" }}
    >
      <GraficoBarras
        datos={datos}
        series={[
          { clave: "vendido", nombre: "Vendido", color: "var(--viz-1)" },
          { clave: "comprado", nombre: "Comprado", color: "var(--viz-3)" },
        ]}
      />
    </Bloque>
  );
}

/** Los cinco que más compran y los cinco productos que más se venden. */
export async function LosQueMas({ rango }: { rango: Rango }) {
  const [clientes, productos] = await Promise.all([topClientesRango(rango, 5), topProductosRango(rango, 5)]);
  return (
    <div className="grid gap-4 @4xl:grid-cols-2">
      <Bloque
        titulo="Quién más compra"
        descripcion="Los cinco clientes con más venta en el periodo."
        accion={{ href: "/reportes/clientes", texto: "Ver todos" }}
      >
        {clientes.ok ? (
          <Ranking
            filas={clientes.datos.map((c) => ({
              clave: c.id,
              nombre: c.cliente,
              detalle: `${entero(c.documentos)} ${c.documentos === 1 ? "comprobante" : "comprobantes"}`,
              valor: c.venta,
              cifra: dinero(c.venta),
              href: `/clientes/${c.id}`,
            }))}
            vacio="Nadie compró en este periodo."
          />
        ) : (
          <EstadoError titulo="No se pudo cargar" detalle={clientes.error} />
        )}
      </Bloque>
      <Bloque
        titulo="Lo que más se vende"
        descripcion="Los cinco productos con más venta en el periodo."
        accion={{ href: "/reportes", texto: "Ver el informe" }}
      >
        {productos.ok ? (
          <Ranking
            color="var(--viz-2)"
            filas={productos.datos.map((p) => ({
              clave: p.id,
              nombre: p.descripcion,
              detalle: `${p.codigo}${p.marca ? ` · ${p.marca}` : ""} · ${entero(p.unidades)} unidades`,
              valor: p.venta,
              cifra: dinero(p.venta),
              href: `/productos/${p.id}`,
            }))}
            vacio="No se vendió nada en este periodo."
          />
        ) : (
          <EstadoError titulo="No se pudo cargar" detalle={productos.error} />
        )}
      </Bloque>
    </div>
  );
}

/** En qué quedó lo cotizado del periodo, en dólares. */
export async function CotizacionesEnQueQuedan({ rango }: { rango: Rango }) {
  const r = await datosCotizaciones(rango);
  if (!r.ok) return <EstadoError titulo="No se pudieron cargar las cotizaciones" detalle={r.error} />;
  const c = r.datos.resumen;
  return (
    <Bloque
      titulo="En qué quedó lo cotizado"
      descripcion="Lo cotizado en el periodo, repartido por cómo terminó."
      accion={{ href: "/reportes/cotizaciones", texto: "Ver el reporte" }}
    >
      <Partes
        vacio="No se cotizó nada en este periodo."
        partes={[
          { clave: "ganado", texto: "Se ganó", valor: c.montoAprobado, cifra: dinero(c.montoAprobado), color: "var(--viz-good)" },
          { clave: "juego", texto: "Sigue en juego", valor: c.montoProceso, cifra: dinero(c.montoProceso), color: "var(--viz-1)", href: "/cotizaciones?estado=enviada" },
          { clave: "perdido", texto: "Se perdió o venció", valor: c.montoPerdido, cifra: dinero(c.montoPerdido), color: "var(--viz-critical)" },
        ]}
      />
    </Bloque>
  );
}
