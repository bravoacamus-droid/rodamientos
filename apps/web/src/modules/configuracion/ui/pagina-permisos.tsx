import { Suspense } from "react";
import { EstadoError, Skeleton } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { rolesYPermisos } from "../api/consultas";
import { CabeceraConfig } from "./cabecera";
import { RolesYPermisos } from "./roles-permisos";

/**
 * Roles y permisos.
 *
 * Desde el 24/09 se cambiaba aquí qué área tocaba cada rol; desde el 20/10
 * (143) se crean roles y cada uno dice qué puede VER, CREAR, EDITAR y ELIMINAR
 * en cada módulo — y eso es lo que mira la aplicación entera: el menú, los
 * botones, las Server Actions y la base.
 *
 * Va aparte de «Usuarios» a propósito, aunque las dos hablen de roles: en
 * Usuarios se dice **qué rol tiene Julio**, y eso cambia cada vez que entra o
 * sale alguien. Aquí se dice **qué puede hacer el almacén**, y eso se toca una
 * vez al año. Juntarlas pondría la decisión peligrosa al lado de la rutinaria.
 */
export default async function PaginaConfigPermisos() {
  const perfil = await perfilActual();
  const esGerencia = perfil?.activo === true && perfil.rol === "gerencia";

  return (
    <div className="flex flex-col gap-5">
      <CabeceraConfig
        ruta="/configuracion/permisos"
        icono="usuarios"
        titulo="Roles y permisos"
        descripcion="Qué puede ver, crear, editar y eliminar cada rol en cada módulo."
      />

      {!esGerencia ? (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm text-[var(--fg-muted)]">
          Puedes ver qué puede hacer cada rol, pero <strong>cambiarlo es cosa de Gerencia</strong>. No es
          solo esta pantalla: la base lo impide también.
        </p>
      ) : (
        /*
          El aviso va arriba y no al pie. Esta es la pantalla que puede dejar a
          media empresa sin poder trabajar, y quien la abre tiene que saberlo
          ANTES de tocar, no después.
        */
        <p className="rounded-lg border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm">
          Esto cambia lo que los demás pueden hacer, <strong>de inmediato y para todos</strong> los que
          tengan ese rol: el menú y los botones cambian en cuanto recarguen la página.
        </p>
      )}

      <section className="card p-4">
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <Bloque puedeEditar={esGerencia} />
        </Suspense>
      </section>
    </div>
  );
}

async function Bloque({ puedeEditar }: { puedeEditar: boolean }) {
  const r = await rolesYPermisos();
  if (!r.ok) {
    return <EstadoError titulo="No se pudieron cargar los permisos" detalle={r.error} />;
  }
  return <RolesYPermisos {...r.datos} puedeEditar={puedeEditar} />;
}
