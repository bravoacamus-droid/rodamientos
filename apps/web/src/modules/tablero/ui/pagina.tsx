import { Suspense } from "react";
import { Skeleton } from "@rodatech/ui";

import { FiltroRango, leerRango } from "@/modules/reportes";

import { PanelAlertas } from "./panel-alertas";
import { PanelCartera } from "./panel-cartera";
import { SeccionVentas } from "./ventas";

/**
 * Tablero.
 *
 * Conserva la composición de la demo: indicadores del periodo, evolución de
 * venta y margen, cartera y alertas prioritarias.
 *
 * Lo nuevo del 26/08 es el filtro de fechas. Fue lo primero que Willy echó en
 * falta, a los dos minutos de abrirlo (2:00): *«faltaría aquí los filtros por
 * día, por mes, por año, entre fechas. De tal fecha a tal fecha cuánto he
 * vendido»*. Es la MISMA barra que la de informes, no una parecida: dos
 * controles de fecha que se comportan distinto en dos pantallas del mismo
 * sistema es de lo que más desconfianza genera.
 *
 * La cartera y las alertas NO llevan rango, y es a propósito: lo que se debe
 * hoy se debe hoy, no «entre enero y marzo». Filtrarlas por fecha daría un
 * número que no es el saldo de nadie.
 *
 * Cada bloque va en su propio Suspense y consulta por separado. Así el panel
 * de alertas aparece sin esperar a que se agreguen doce meses de ventas, en
 * vez de que toda la pantalla quede en blanco hasta que la más lenta termine.
 */

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function uno(v: string | string[] | undefined): string | undefined {
  const valor = Array.isArray(v) ? v[0] : v;
  return valor && valor.length > 0 ? valor : undefined;
}

export default async function PaginaTablero({ searchParams }: Props) {
  const sp = await searchParams;
  // La fecha la fija el servidor con la zona de Lima. Sin fijarla, un tablero
  // abierto a las 7 de la tarde contaría el día siguiente.
  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(
    new Date(),
  );

  const rango = leerRango(
    {
      desde: uno(sp.desde),
      hasta: uno(sp.hasta),
      grano: uno(sp.grano),
      // Sin nada en la URL, el tablero abre en «este mes».
      //
      // No en los doce meses que usa informes: el tablero se abre por la
      // mañana para ver cómo va lo de AHORA, y arrancar en un año de historia
      // obligaría a filtrar cada vez para responder la pregunta de siempre.
      atajo: uno(sp.atajo) ?? (uno(sp.desde) ? undefined : "mes"),
    },
    hoy,
  );

  const clave = `${rango.desde}|${rango.hasta}|${rango.grano}`;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tablero</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Cómo va el negocio, la cartera y lo que necesita atención.
        </p>
      </div>

      <FiltroRango
        desde={rango.desde}
        hasta={rango.hasta}
        grano={rango.grano}
        atajo={rango.atajo}
      />

      <Suspense key={clave} fallback={<Skeleton className="h-[26rem] w-full" />}>
        <SeccionVentas rango={rango} hoy={hoy} />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-2">
        <Suspense fallback={<Skeleton className="h-72 w-full" />}>
          <PanelCartera />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-72 w-full" />}>
          <PanelAlertas />
        </Suspense>
      </div>
    </div>
  );
}
