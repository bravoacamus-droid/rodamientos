import { EstadoError } from "@rodatech/ui";

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

  const resultado = await clientesParaCotizar(cliente);
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
      hoy={new Date().toISOString().slice(0, 10)}
    />
  );
}
