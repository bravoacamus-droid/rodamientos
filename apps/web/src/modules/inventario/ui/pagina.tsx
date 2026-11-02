import { Suspense } from "react";
import Link from "next/link";
import { Skeleton, buttonVariants, cn } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

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
export default async function PaginaInventario() {
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

      <section className="card">
        <header className="px-4 pt-4">
          <h2 className="text-lg font-semibold">Valorización</h2>
          <p className="text-sm text-[var(--fg-muted)]">
            A costo promedio, por familia y subfamilia. Sin contar archivados.
          </p>
        </header>
        <Suspense fallback={<Skeleton className="m-4 h-64" />}>
          <TablaValorizacion />
        </Suspense>
      </section>

      <section className="card">
        <header className="px-4 pt-4">
          <h2 className="text-lg font-semibold">Reposición y sobrestock</h2>
          <p className="text-sm text-[var(--fg-muted)]">
            Lo que está bajo el mínimo y lo que sobra. La cobertura sale del
            consumo real de los últimos 90 días.
          </p>
        </header>
        <Suspense fallback={<Skeleton className="m-4 h-64" />}>
          <TablaReposicion />
        </Suspense>
      </section>
    </div>
  );
}
