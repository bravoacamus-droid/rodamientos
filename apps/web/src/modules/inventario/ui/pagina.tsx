import { Suspense } from "react";
import Link from "next/link";
import { Skeleton, buttonVariants, cn } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";
import { ChartPie, RefreshCw, type LucideIcon } from "lucide-react";

import { ResumenInventario } from "./resumen";
import { TablaReposicion } from "./reposicion";
import { TablaValorizacion } from "./valorizacion";
import { PanelModulo } from "@/componentes/panel-modulo";

/*
  44 px en el teléfono, como en las demás listas (revisión de entrega, 02/11).
  El secundario aclara el vidrio del panel al pasar el ratón: el
  `hover:bg-brand-50` de `outline` es casi blanco, y sobre el azul la letra
  es blanca — «Ver kardex» desaparecía justo al señalarlo.
*/
const BOTON_PRINCIPAL = cn(buttonVariants({ variant: "primary" }), "h-11 md:h-control-md");
const BOTON_SECUNDARIO = cn(
  buttonVariants({ variant: "outline" }),
  "h-11 md:h-control-md hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)]",
);

type Vista = "valorizacion" | "reposicion";

const VISTAS: { clave: Vista; titulo: string; ayuda: string; icono: LucideIcon; fondoIcono: string }[] = [
  {
    clave: "valorizacion",
    titulo: "Valorización",
    ayuda: "Cuánto vale lo que hay, por familia",
    icono: ChartPie,
    fondoIcono: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-200",
  },
  {
    clave: "reposicion",
    titulo: "Reposición y sobrestock",
    ayuda: "Qué comprar y qué sobra",
    icono: RefreshCw,
    fondoIcono: "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-200",
  },
];

/**
 * Inventario.
 *
 * Dos preguntas, en el orden en que se hacen: **cuánto vale lo que tengo** y
 * **qué está mal repartido**. La valorización primero porque es la que Willy
 * echó de menos por su nombre (24:21); la reposición debajo porque es la que
 * genera trabajo.
 *
 * Cada sección va en su propio Suspense: son consultas independientes y la
 * reposición —que lleva un lateral sobre 90 días de movimientos— no debe
 * retrasar a la valorización.
 */
export default async function PaginaInventario({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const vista: Vista = params.vista === "reposicion" ? "reposicion" : "valorizacion";
  const perfil = await perfilActual();

  const rol = perfil?.activo ? perfil.rol : null;
  // El cuadre es exclusivo de gerencia (26:49) y no pasa por Configuración ›
  // Permisos (143). Que el botón aparezca y luego
  // rebote es peor que no verlo.
  const puedeCuadrar = rol !== null && ["gerencia", "admin"].includes(rol);

  return (
    <div className="flex flex-col gap-5">
      <PanelModulo ruta="/inventario">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Inventario</h1>
            <p className="text-sm text-[var(--fg-muted)]">
              Cuánto vale lo que hay en almacén, y qué conviene mover.
            </p>
          </div>

          {/* Los botones del sistema y no clases copiadas a mano: eran 36 px y
              esquina de 2 px, al lado de botones de 40 y 6 en el resto del ERP
              (revisión por módulos del 02/10). */}
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/inventario/kardex" className={BOTON_SECUNDARIO}>
              Ver kardex
            </Link>
            {puedeCuadrar ? (
              <Link href="/inventario/ajuste" className={BOTON_PRINCIPAL}>
                Cuadrar inventario
              </Link>
            ) : null}
          </div>
        </div>

        <Suspense fallback={<Skeleton className="h-24 w-full" />}>
          <ResumenInventario />
        </Suspense>
      </PanelModulo>

      {/*
        UNA LISTA A LA VEZ (19/11).

        Luis: *«las listas están muy largas, todo de igual»*. Valorización y
        reposición iban una debajo de otra, y para llegar a lo que hay que
        comprar había que bajar 1.800 px de familias. Son dos preguntas
        distintas, así que van en dos pestañas grandes, con su color y una
        frase que dice para qué es cada una. En la URL (`?vista=`), para que
        se pueda volver a la misma con «atrás» y mandar el enlace.
      */}
      <nav className="grid gap-3 sm:grid-cols-2" aria-label="Vistas del inventario">
        {VISTAS.map((v) => {
          const activa = v.clave === vista;
          const Icono = v.icono;
          return (
            <Link
              key={v.clave}
              href={v.clave === "valorizacion" ? "/inventario" : `/inventario?vista=${v.clave}`}
              aria-current={activa ? "page" : undefined}
              className={cn(
                "flex items-center gap-4 rounded-xl border-2 p-4 transition-colors",
                activa
                  ? "border-[var(--color-brand-600)] bg-[var(--color-brand-600)] text-white shadow-md"
                  : "border-[var(--border-strong)] bg-[var(--surface)] hover:border-[var(--color-brand-500)] hover:bg-[var(--color-brand-50)] dark:hover:bg-[var(--surface-2)]",
              )}
            >
              <span
                className={cn(
                  "grid size-12 shrink-0 place-items-center rounded-full",
                  activa ? "bg-[var(--color-accent-400)] text-[#0b3450]" : v.fondoIcono,
                )}
                aria-hidden="true"
              >
                <Icono className="size-6" />
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-bold">{v.titulo}</span>
                <span className={cn("block text-sm", activa ? "text-white/85" : "text-[var(--fg-muted)]")}>
                  {v.ayuda}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>

      <section className="card">
        <header className="px-4 pt-4">
          <h2 className="text-lg font-semibold">
            {vista === "valorizacion" ? "Valorización" : "Reposición y sobrestock"}
          </h2>
          <p className="text-sm text-[var(--fg-muted)]">
            {vista === "valorizacion"
              ? "A costo promedio, por familia y subfamilia. Sin contar archivados. Pulsa una familia para ver sus subfamilias."
              : "Lo que está bajo el mínimo y lo que sobra. La cobertura sale del consumo real de los últimos 90 días."}
          </p>
        </header>
        <Suspense key={vista} fallback={<Skeleton className="m-4 h-64" />}>
          {vista === "valorizacion" ? <TablaValorizacion /> : <TablaReposicion />}
        </Suspense>
      </section>
    </div>
  );
}
