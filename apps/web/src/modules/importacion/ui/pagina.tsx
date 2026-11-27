import Link from "next/link";
import { Download } from "lucide-react";
import { sinPermiso } from "@/lib/permisos";
import { AvisoSinPermiso } from "@/componentes/sin-permiso";

import { Volver } from "@/componentes/volver";
import { PanelModulo } from "@/componentes/panel-modulo";
import { buttonVariants } from "@rodatech/ui";
import { TituloPaso } from "@/modules/compras/ui/ficha";

import { FormularioImportacion } from "./formulario";

/**
 * Carga del maestro de productos desde la plantilla.
 *
 * Server Component: solo el formulario es cliente, porque el flujo de dos
 * pasos necesita estado entre subir y confirmar.
 */

export default async function PaginaImportacion() {
  // Cargar es dar de alta productos: «Productos · Crear» (143).
  const prohibido = await sinPermiso("productos", "crear");

  return (
    // Sin `p-6`, que el marco ya pone, y con su «Volver»: era la única
    // pantalla de productos sin camino de vuelta (revisión por módulos del
    // 02/10).
    <div className="flex flex-col gap-6">
      {/* Sobre el azul de la marca y con los pasos numerados (27/11): la
          pantalla eran tres cajas iguales sin orden aparente. */}
      <PanelModulo ruta="/productos">
        <div className="flex flex-col gap-3">
          <Volver href="/productos">Volver a productos</Volver>
          <h1 className="text-3xl font-extrabold tracking-tight text-[var(--titulo)]">Cargar productos</h1>
          <span className="block h-2 w-32 -skew-x-[30deg] rounded-sm bg-accent-400" aria-hidden="true" />
          <p className="max-w-3xl text-lg text-[var(--fg)]">
            Sube la plantilla llena. Primero se revisa y se muestra qué va a pasar
            con cada fila; nada se guarda hasta que confirmes.
          </p>
        </div>
      </PanelModulo>

      {prohibido ? (
        <AvisoSinPermiso mensaje={prohibido} />
      ) : (
        <>
          {/* Willy, 26/08 (13:00): «voy a poner también que usted pueda
              descargar esa planilla, editarla y subirla de nuevo». Hasta ahora
              solo se podía subir, y la plantilla viajaba por WhatsApp.

              Es un enlace normal y no un botón con descarga generada: el
              archivo está en `public/`, así que lo sirve el propio servidor.
              Y es EL MISMO que abre `hoja.test.ts`, o sea que lo que se
              descarga es exactamente lo que está probado. */}
          <section className="card elev-1 flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
            <div className="min-w-0 flex-1 basis-72">
              <TituloPaso
                numero={1}
                titulo="¿No tienes la plantilla a mano?"
                ayuda="Descárgala, llénala en Excel y súbela aquí. Trae los desplegables de familia, sub-familia y descripción ya cargados."
              />
            </div>
            <a
              href="/plantillas/Rodatech - Maestro de productos.xlsx"
              download
              className={buttonVariants({ size: "lg" })}
            >
              <Download className="size-4" />
              Descargar plantilla
            </a>
          </section>

          <section className="card elev-1 flex flex-col gap-3 p-4 sm:p-5">
            <TituloPaso numero={2} titulo="Antes de subir" ayuda="Cuatro cosas que evitan que una fila se rechace." />
            <ul className="list-disc space-y-1.5 pl-14 text-base text-[var(--fg)]">
              <li>
                Usa la plantilla de arriba, sin cambiarle los títulos de las
                columnas ni el orden.
              </li>
              <li>
                La FAMILIA, la SUB-FAMILIA y la DESCRIPCION se eligen de la
                lista. Si escribes una que no existe, esa fila se rechaza y te
                decimos cuál es.
              </li>
              <li>
                El CODIGO es lo que identifica al producto. Si ya existe, se
                actualizan sus datos; si no, se crea.
              </li>
              <li>
                El STOCK ACTUAL solo se carga para productos nuevos. Para uno
                que ya existe se usa{" "}
                <Link href="/inventario/ajuste" className="underline">
                  Ajuste de inventario
                </Link>
                , que deja constancia de quién y por qué.
              </li>
            </ul>
          </section>

          <section className="card elev-1 flex flex-col gap-4 p-4 sm:p-5">
            <TituloPaso numero={3} titulo="Sube la plantilla llena" ayuda="Se revisa primero; nada se guarda hasta que confirmes." />
            <FormularioImportacion />
          </section>
        </>
      )}
    </div>
  );
}
