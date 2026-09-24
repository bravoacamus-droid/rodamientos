import { Suspense } from "react";
import { EstadoError, Skeleton } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import type { Rol } from "../dominio/tipos";

import { permisosGuardados } from "../api/consultas";
import { CabeceraConfig } from "./cabecera";
import { MatrizPermisos } from "./matriz-permisos";

/**
 * Permisos.
 *
 * La cuarta pantalla de Configuración, desde el 24/09. `permisos_rol` existe
 * desde la 002 y su comentario dice que la gracia es «cambiar quién escribe
 * qué sin tocar una política» — pero no había dónde cambiarlo, así que en la
 * práctica era un `insert` a mano contra producción.
 *
 * Va aparte de «Usuarios» a propósito, aunque las dos hablen de roles: en
 * Usuarios se dice **qué rol tiene Julio**, y eso cambia cada vez que entra o
 * sale alguien. Aquí se dice **qué puede hacer el almacén**, y eso se toca una
 * vez al año. Juntarlas pondría la decisión peligrosa al lado de la rutinaria.
 */
export default async function PaginaConfigPermisos() {
  const perfil = await perfilActual();
  const rol = perfil?.activo ? perfil.rol : null;
  const esGerencia = rol === "gerencia";

  return (
    <div className="flex flex-col gap-5">
      <CabeceraConfig
        icono="usuarios"
        titulo="Permisos"
        descripcion="Qué puede tocar cada rol dentro del sistema."
      />

      {!esGerencia ? (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm text-[var(--fg-muted)]">
          Puedes ver quién puede hacer qué, pero{" "}
          <strong>cambiarlo es cosa de Gerencia</strong>. No es solo esta
          pantalla: la base lo impide también.
        </p>
      ) : (
        /*
          El aviso va arriba y no al pie. Esta es la pantalla que puede dejar a
          media empresa sin poder trabajar, y quien la abre tiene que saberlo
          ANTES de tocar, no después.
        */
        <p className="rounded-lg border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm">
          Esto cambia lo que los demás pueden hacer, de inmediato y para todos.
          Si le quitas un grupo a un rol, quien lo tenga verá el módulo pero no
          podrá guardar nada.
        </p>
      )}

      <section className="card p-4">
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <BloquePermisos puedeEditar={esGerencia} rolPropio={rol} />
        </Suspense>
      </section>
    </div>
  );
}

async function BloquePermisos({
  puedeEditar,
  rolPropio,
}: {
  puedeEditar: boolean;
  rolPropio: Rol | null;
}) {
  const r = await permisosGuardados();
  if (!r.ok) {
    return <EstadoError titulo="No se pudieron cargar los permisos" detalle={r.error} />;
  }
  return (
    <MatrizPermisos
      guardados={r.datos}
      puedeEditar={puedeEditar}
      rolPropio={rolPropio}
    />
  );
}
