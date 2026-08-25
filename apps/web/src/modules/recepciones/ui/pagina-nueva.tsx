import { redirect } from "next/navigation";
import { EstadoError } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { comprasPendientes, proveedoresActivos } from "../api/consultas";
import { ConstructorRecepcion } from "./constructor";

/** La misma lista que `permisos_rol` tiene para `recepciones`. */
const ROLES = ["gerencia", "admin", "almacen", "compras"];

/**
 * Pantalla de alta de una recepción.
 *
 * Server Component: resuelve permisos, catálogos y la fecha, y le pasa todo al
 * constructor, que sí es de cliente. La fecha se calcula AQUÍ y no en el
 * navegador para que sea la del servidor y no la del reloj del equipo del
 * almacén, que es el que suele estar mal.
 */
export default async function PaginaNuevaRecepcion({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  // `?compra=` lo pone el botón «Recibir mercadería» de la ficha de compra.
  const crudo = Array.isArray(sp.compra) ? sp.compra[0] : sp.compra;
  const compraInicial = crudo && crudo.length > 0 ? crudo : null;

  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) redirect("/login");
  if (!ROLES.includes(perfil.rol)) {
    return (
      <EstadoError
        titulo="No puedes recepcionar mercadería"
        descripcion="Tu rol no tiene permiso para registrar entradas al almacén. Habla con Gerencia si crees que debería."
      />
    );
  }

  const [proveedores, compras] = await Promise.all([
    proveedoresActivos(),
    comprasPendientes(),
  ]);

  if (!proveedores.ok) {
    return (
      <EstadoError
        titulo="No se pudo cargar el maestro de proveedores"
        descripcion="Sin él no se puede registrar de quién llega la mercadería."
        detalle={proveedores.error}
      />
    );
  }

  // `sv-SE` da `yyyy-mm-dd` directamente, que es lo que espera un <input
  // type="date"> y lo que valida el dominio. La zona es explícita: el servidor
  // corre en UTC y sin fijarla una recepción de las 7 de la tarde en Lima se
  // registraría con la fecha del día siguiente.
  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(
    new Date(),
  );

  return (
    <ConstructorRecepcion
      proveedores={proveedores.datos}
      // Que fallen las compras pendientes no impide recibir: es una comodidad,
      // no un requisito. Se degrada a recepción suelta.
      compras={compras.ok ? compras.datos : []}
      hoy={hoy}
      compraInicial={compraInicial}
    />
  );
}
