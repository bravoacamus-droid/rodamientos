import { EstadoError } from "@rodatech/ui";

import { clientesParaCotizar } from "../api/consultas";
import { Constructor } from "./constructor";

/**
 * Página del constructor.
 *
 * Server Component: carga los clientes en el servidor y le pasa la lista al
 * constructor, que es cliente porque el cotizador es puro estado local. Así el
 * selector está lleno en el primer pintado, sin un `useEffect` que pida los
 * clientes después de montar.
 */
export default async function PaginaNuevaCotizacion({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const cliente = typeof sp.cliente === "string" ? sp.cliente : null;

  const resultado = await clientesParaCotizar();
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

  return <Constructor clientes={resultado.datos} clienteInicial={cliente} />;
}
