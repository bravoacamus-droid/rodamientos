import { Suspense } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { perfilActual } from "@rodatech/db/servidor";
import { formatearMoneda, formatearPorcentaje, variacionPorcentual } from "@rodatech/ui";

import { RodamientoMarca } from "@/componentes/marca-rodatech";
import { leerRango } from "@/modules/reportes";

import { kpisDeRango } from "../api/consultas";
import { nombreDePila, saludoPorHora } from "../dominio/saludo";

/**
 * La portada del tablero (27/11).
 *
 * Antes: la palabra «Tablero» y una frase de manual sobre el azul. El
 * supervisor lo vio «muy plano, neutral». Es la primera pantalla del día, y
 * ahora contesta lo primero que pregunta un dueño al abrir: cómo va el mes.
 *
 * La cifra de la derecha es SIEMPRE el mes en curso, aunque abajo se filtre
 * otro periodo: es la portada, no un informe. El filtro de fechas manda en
 * las tarjetas de abajo, que son las que dicen de qué periodo hablan.
 *
 * El lenguaje es el del login, que Willy ya aprobó: el rodamiento de la
 * marca de agua y la barra dorada inclinada.
 */
export async function Portada({ hoy }: { hoy: string }) {
  const perfil = await perfilActual().catch(() => null);
  const ahora = new Date();
  const hora = Number(
    new Intl.DateTimeFormat("es-PE", { hour: "numeric", hourCycle: "h23", timeZone: "America/Lima" }).format(ahora),
  );
  const fecha = new Intl.DateTimeFormat("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Lima",
  }).format(ahora);
  const nombre = nombreDePila(perfil?.nombre);

  return (
    <section className="fondo-marca relative overflow-hidden rounded-2xl px-5 py-6 text-white shadow-[var(--elev-2)] sm:px-8 sm:py-7">
      <RodamientoMarca
        bolas="currentColor"
        className="anim-girar-lento pointer-events-none absolute -right-20 -top-28 size-[22rem] text-white/[0.06]"
      />
      <div className="relative flex flex-col gap-6 @3xl:flex-row @3xl:items-end @3xl:justify-between">
        <div className="min-w-0">
          <p className="text-lg font-medium text-white first-letter:uppercase">{fecha}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {saludoPorHora(hora)}
            {nombre ? `, ${nombre}` : ""}
          </h1>
          <span
            className="anim-crecer mt-3 block h-2 w-32 -skew-x-[30deg] rounded-sm bg-accent-400"
            aria-hidden="true"
          />
          <p className="mt-3 max-w-xl text-lg text-white">
            Así va el negocio hoy. Lo que necesita tu atención está justo debajo.
          </p>
        </div>

        <Suspense fallback={<div className="h-24 w-56 animate-pulse rounded-xl bg-white/10" />}>
          <VendidoDelMes hoy={hoy} />
        </Suspense>
      </div>
    </section>
  );
}

async function VendidoDelMes({ hoy }: { hoy: string }) {
  const r = await kpisDeRango(leerRango({ atajo: "mes" }, hoy));
  if (!r.ok) return null;
  const k = r.datos;
  const variacion = variacionPorcentual(k.ventaNeta, k.ventaNetaPrevia);
  const sube = variacion !== null && variacion > 0.05;
  const baja = variacion !== null && variacion < -0.05;

  return (
    <div className="min-w-0 rounded-xl bg-white/[0.08] px-5 py-4 ring-1 ring-inset ring-white/15 @3xl:text-right">
      <p className="text-base font-semibold uppercase tracking-wide text-white">Vendido este mes</p>
      <p className="tabular mt-1 break-words text-5xl font-extrabold leading-tight tracking-tight text-white @5xl:text-6xl">
        {formatearMoneda(Math.round(k.ventaNeta)).replace(/.00$/, "")}
      </p>
      {variacion !== null ? (
        <p className="mt-1 inline-flex items-center gap-1.5 text-base font-semibold text-accent-300">
          {sube ? (
            <TrendingUp className="size-5" aria-hidden="true" />
          ) : baja ? (
            <TrendingDown className="size-5" aria-hidden="true" />
          ) : null}
          <span className="tabular">
            {variacion > 0 ? "+" : ""}
            {formatearPorcentaje(variacion, 1)}
          </span>
          <span className="font-normal text-white">frente a los mismos días del mes pasado</span>
        </p>
      ) : (
        <p className="mt-1 text-base text-white">sin IGV</p>
      )}
    </div>
  );
}
