import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { perfilActual } from "@rodatech/db/servidor";

import { inicioPara } from "@/lib/navegacion";
import { misPermisos } from "@/lib/permisos";
import { PaginaTablero } from "@/modules/tablero";

export const metadata: Metadata = { title: "Tablero" };

/**
 * El tablero es la portada: aquí llegan el login, el logo y «Volver». Quien no
 * lo tiene en su rol (184; Willy, 02/11: Administración no lo ve) va a la
 * primera pantalla de su menú en vez de a un «no puedes».
 */
export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const permisos = await misPermisos();
  if (!permisos.tiene("tablero", "ver")) {
    const perfil = await perfilActual();
    redirect(inicioPara(perfil?.rol ?? null, permisos.lista));
  }
  return <PaginaTablero searchParams={searchParams} />;
}
