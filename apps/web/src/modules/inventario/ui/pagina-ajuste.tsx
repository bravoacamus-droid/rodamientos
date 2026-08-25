import { redirect } from "next/navigation";
import { EstadoError } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { opcionesDeInventario } from "../api/consultas";
import { HojaDeConteo } from "./conteo";

/** Solo gerencia (26:49). Es la misma que impone `es_gerencia()` en Postgres. */
const ROLES = ["gerencia", "admin"];

/**
 * Pantalla del cuadre de inventario.
 *
 * Server Component: resuelve permisos, catálogos y la fecha, y le pasa todo a
 * la hoja de conteo, que sí es de cliente. La fecha se calcula AQUÍ para que
 * sea la del servidor y no la del reloj del equipo del almacén, que es el que
 * suele estar mal.
 */
export default async function PaginaAjusteInventario() {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) redirect("/login");

  if (!ROLES.includes(perfil.rol)) {
    return (
      <EstadoError
        titulo="El cuadre está restringido a Gerencia"
        descripcion="Es un ajuste que reescribe el saldo del almacén, así que solo Gerencia puede firmarlo. Si has contado algo que no cuadra, pásaselo."
      />
    );
  }

  const opciones = await opcionesDeInventario();

  // `sv-SE` da `yyyy-mm-dd`, que es lo que espera un <input type="date"> y lo
  // que valida el dominio. La zona es explícita: el servidor corre en UTC y
  // sin fijarla un conteo de las 7 de la tarde en Lima se registraría con la
  // fecha del día siguiente.
  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(
    new Date(),
  );

  return (
    <HojaDeConteo
      // Que fallen los catálogos no impide contar: los desplegables se quedan
      // en «todas» y se carga el almacén entero.
      familias={opciones.ok ? opciones.datos.familias : []}
      marcas={opciones.ok ? opciones.datos.marcas : []}
      hoy={hoy}
    />
  );
}
