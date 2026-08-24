import Link from "next/link";
import { perfilActual } from "@rodatech/db/servidor";

import { FormularioImportacion } from "./formulario";

/**
 * Carga del maestro de productos desde la plantilla.
 *
 * Server Component: solo el formulario es cliente, porque el flujo de dos
 * pasos necesita estado entre subir y confirmar.
 */

const ROLES = ["gerencia", "admin", "compras"];

export default async function PaginaImportacion() {
  const perfil = await perfilActual();
  const puede = perfil !== null && perfil.activo && ROLES.includes(perfil.rol);

  return (
    <div className="flex flex-col gap-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">Cargar productos</h1>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">
          Sube la plantilla llena. Primero se revisa y se muestra qué va a pasar
          con cada fila; nada se guarda hasta que confirmes.
        </p>
      </header>

      {!puede ? (
        <div className="rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-4 text-sm">
          Tu rol no puede cargar el maestro de productos. Lo hacen Compras o
          Gerencia.
        </div>
      ) : (
        <>
          <section className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm">
            <p className="font-medium">Antes de subir</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--fg-muted)]">
              <li>
                Usa la plantilla que te enviamos, sin cambiarle los títulos de
                las columnas ni el orden.
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

          <FormularioImportacion />
        </>
      )}
    </div>
  );
}
