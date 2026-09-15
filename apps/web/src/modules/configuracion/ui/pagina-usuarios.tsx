import { Suspense } from "react";
import { EstadoError, Skeleton } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { usuarios } from "../api/consultas";
import { CabeceraConfig } from "./cabecera";
import { TablaUsuarios } from "./usuarios";

/**
 * Usuarios.
 *
 * Quién entra y con qué rol. Es la pantalla que más se vuelve a abrir de las
 * tres —cada vez que entra o sale alguien— y era la que estaba más abajo del
 * todo, después de catorce series. Por eso se separa.
 *
 * El alta no se hace aquí: el usuario nace en Supabase Auth y el trigger
 * `trg_usuario_nuevo` (004) le crea el perfil. Aquí se le pone el rol y se le
 * activa o desactiva.
 *
 * **Cambiar el rol es cosa de gerencia, y ahora también lo dice la base**: la
 * migración 077 (11/09) puso un trigger, porque hasta entonces cualquier
 * empleado podía ascenderse a gerencia escribiendo su propia fila por REST.
 * Admin entra y ve, pero no toca.
 */
export default async function PaginaConfigUsuarios() {
  const perfil = await perfilActual();
  const rol = perfil?.activo ? perfil.rol : null;
  const esGerencia = rol === "gerencia";

  return (
    <div className="flex flex-col gap-5">
      <CabeceraConfig
        icono="usuarios"
        titulo="Usuarios"
        descripcion="Quién entra al sistema y qué puede hacer dentro."
      />

      {!esGerencia ? (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm text-[var(--fg-muted)]">
          Puedes ver quién entra, pero <strong>cambiar un rol es cosa de
          Gerencia</strong>. No es solo esta pantalla: la base lo impide
          también.
        </p>
      ) : null}

      <section className="card p-4">
        <p className="mb-3 text-sm text-[var(--fg-muted)]">
          El alta se hace en Supabase Auth y el perfil se crea solo. Aquí se
          cambia el rol y se activa o desactiva.
        </p>
        <Suspense fallback={<Skeleton className="h-48 w-full" />}>
          <BloqueUsuarios idPropio={perfil?.id ?? null} puedeEditar={esGerencia} />
        </Suspense>
      </section>
    </div>
  );
}

async function BloqueUsuarios({
  idPropio,
  puedeEditar,
}: {
  idPropio: string | null;
  puedeEditar: boolean;
}) {
  const r = await usuarios();
  if (!r.ok) {
    return <EstadoError titulo="No se pudieron cargar los usuarios" detalle={r.error} />;
  }
  return (
    <TablaUsuarios usuarios={r.datos} idPropio={idPropio} puedeEditar={puedeEditar} />
  );
}
