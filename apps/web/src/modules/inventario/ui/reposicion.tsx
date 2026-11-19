import { EstadoError, EstadoVacio } from "@rodatech/ui";

import { reposicion } from "../api/consultas";
import { ListaReposicion } from "./lista-reposicion";

/**
 * Lo que hay que reponer y lo que sobra, en la misma lista.
 *
 * El sobrestock va aquí a propósito y no en otra pantalla: *"tengo 80
 * rodamientos que no sé cómo vender"* (25:21) es capital inmovilizado, y a
 * Willy le duele igual que un quiebre. Separarlos obligaría a mirar dos sitios
 * para responder a la misma pregunta —¿dónde está mal repartido mi dinero?—.
 *
 * `dias_cobertura` es la columna que manda: traduce el saldo a tiempo, que es
 * como se decide comprar. Sale del consumo real de los últimos 90 días.
 *
 * Desde el 19/11 se filtra en el navegador (`ListaReposicion`), así que se
 * traen todas y no las cien primeras: un filtro sobre una lista cortada dice
 * «0 sobrestock» cuando el sobrestock estaba en la fila 101.
 */
export async function TablaReposicion() {
  const resultado = await reposicion(2000);

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No se pudo cargar la reposición"
        descripcion="La consulta no llegó a completarse."
        detalle={resultado.error}
      />
    );
  }

  const { filas, omitidos } = resultado.datos;

  // Lo que se deja fuera se dice, con su número: si no, «nada que reponer»
  // con 789 productos a cero se leería como que el almacén está lleno.
  const avisoOmitidos =
    omitidos > 0 ? (
      <p className="px-4 pb-4 pt-1 text-sm text-[var(--fg-muted)]">
        No se listan {omitidos.toLocaleString("es-PE")} productos que están a cero pero
        no tienen stock mínimo ni se han vendido en los últimos 90 días: no hay nada
        que reponer en ellos. Aparecerán aquí cuando se les ponga un mínimo o se
        vendan.
      </p>
    ) : null;

  if (filas.length === 0) {
    return (
      <>
        <EstadoVacio
          titulo="Nada que reponer"
          descripcion="Ningún producto está bajo su mínimo ni por encima de su máximo."
        />
        {avisoOmitidos}
      </>
    );
  }

  return (
    <>
      <ListaReposicion filas={filas} />
      {avisoOmitidos}
    </>
  );
}
