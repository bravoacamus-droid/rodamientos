import { EstadoError } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";
import { AvisoSinPermiso } from "@/componentes/sin-permiso";
import { Volver } from "@/componentes/volver";
import { misPermisos } from "@/lib/permisos";
import { avisoSinPermiso } from "@/lib/permisos-comun";

import { clientesParaCotizar } from "../api/consultas";
import { Constructor } from "./constructor";

/**
 * Página del constructor.
 *
 * Server Component: resuelve en el servidor lo que el constructor necesita para
 * el primer pintado —los últimos clientes cotizados y, si se llegó desde una
 * ficha, ese cliente ya resuelto— y se lo pasa al constructor, que es cliente
 * porque el cotizador es puro estado local.
 *
 * Ya NO baja la cartera entera: el buscador consulta la base mientras se
 * teclea. Con dos clientes daba igual; con la cartera de verdad, la lista
 * completa viajaba en el HTML de cada carga para usar una fila.
 *
 * El `hoy` también sale de aquí. Es la misma regla de los informes: ninguna
 * función de dominio lee el reloj, porque «cotizado ayer» no puede depender de
 * la zona horaria del equipo que abre la pantalla.
 */
export default async function PaginaNuevaCotizacion({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const cliente = typeof sp.cliente === "string" ? sp.cliente : null;

  const [resultado, perfil, permisos] = await Promise.all([
    clientesParaCotizar(cliente),
    perfilActual(),
    misPermisos(),
  ]);
  // Se dice antes de llenar nada, no al guardar (QA, 20/10).
  if (!permisos.tiene("cotizaciones", "crear")) {
    return (
      <div className="flex flex-col gap-4">
        <Volver href="/cotizaciones">Volver a cotizaciones</Volver>
        <AvisoSinPermiso mensaje={avisoSinPermiso("cotizaciones", "crear", permisos.nombreRol)} />
      </div>
    );
  }
  // El mismo permiso que `guardarKit`: a quien no puede cambiar un kit no se
  // le ofrece el botón.
  const puedeEditarKit = permisos.tiene("productos", "editar");
  if (!resultado.ok) {
    return (
      <div className="p-6">
        <EstadoError
          titulo="No se pudo cargar la lista de clientes"
          descripcion={resultado.error}
        />
      </div>
    );
  }

  return (
    <Constructor
      sugeridos={resultado.datos.sugeridos}
      clienteInicial={resultado.datos.inicial}
      hoy={new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date())}
      puedeEditarKit={puedeEditarKit}
      // Los mismos que `ajustarStock` y `registrar_ajuste_inventario` (06/10).
      puedeAjustarStock={!!perfil?.activo && ["gerencia", "admin"].includes(perfil.rol)}
    />
  );
}
