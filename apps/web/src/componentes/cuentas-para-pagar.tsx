/**
 * Las cuentas a las que se le paga, impresas al pie del documento.
 *
 * ---------------------------------------------------------------------------
 * De dónde sale
 * ---------------------------------------------------------------------------
 * Willy, 26/08 (14:40): *«últimamente hay algunos clientes que me piden
 * indicar número de cuenta… es una práctica recomendable que ya lleve
 * pre-impresa la cuenta corriente, porque a veces se confunden»*. Y el 07/09
 * (11:50), repasando su cotización: *«abajo de la cotización debe aparecer el
 * número de cuentas siempre»*.
 *
 * ---------------------------------------------------------------------------
 * En TABLA, y con los dólares arriba
 * ---------------------------------------------------------------------------
 * Willy, 16/09, sobre cómo salían —dos bloques de texto corrido, uno al lado
 * del otro—: *«las cuentas de banco ponlas más ordenadas, sería mejor en una
 * tabla como esa… primero DÓLARES y abajo SOLES»*, y mandó el cuadro de su
 * formato: BANCO · TIPO DE CUENTA · N° DE CUENTA · CCI.
 *
 * Lo que arregla la tabla no es la estética: es que **un número de cuenta y un
 * CCI seguidos en la misma línea se confunden**. Son dos cifras largas, sin
 * espacios, y quien transfiere copia una de las dos. En columnas con su título
 * encima, no hay forma de equivocarse.
 *
 * El orden es FIJO —dólares y luego soles— y no «la moneda del documento
 * primero», como estaba. Con el tipo de cuenta escrito en su columna, el orden
 * deja de ser lo que evita el error, y un pie que siempre sale igual se lee
 * más rápido que uno que se reordena solo.
 */

export interface CuentaParaPagar {
  banco: string;
  moneda: string;
  numero: string;
  cci: string | null;
}

/**
 * La moneda, en palabras. Era la columna «Tipo de cuenta» con «CTA. CTE.
 * DÓLARES»; Luis, 06/10: *«en vez de TIPO DE CUENTA, ponle MONEDA»*. Lo que
 * el cliente necesita saber para no equivocarse es en qué moneda deposita.
 */
const MONEDA: Record<string, string> = {
  USD: "DÓLARES",
  PEN: "SOLES",
};

/** Dólares arriba, soles debajo, y lo que no sea ninguno de los dos al final. */
const ORDEN: Record<string, number> = { USD: 0, PEN: 1 };

export function CuentasParaPagar({
  cuentas,
  titulo = "CUENTAS BANCARIAS",
}: {
  cuentas: readonly CuentaParaPagar[];
  /** Willy, 16/09: *«no pongas "Cuentas para el pago", pon CUENTAS BANCARIAS»*. */
  titulo?: string;
}) {
  if (cuentas.length === 0) return null;

  const ordenadas = [...cuentas].sort(
    (a, b) =>
      (ORDEN[a.moneda.toUpperCase()] ?? 9) - (ORDEN[b.moneda.toUpperCase()] ?? 9),
  );

  return (
    <div className="mt-3 break-inside-avoid border-t border-[#ccc] pt-2">
      <p className="mb-1 font-semibold uppercase tracking-wide">{titulo}</p>

      {/*
        COMPACTA, como el cuadro del proveedor que mandó Luis (06/10): «la
        tabla de números de cuenta lo veo muy grande». Iba a `text-sm` y a
        todo el ancho, y con el nombre entero del banco cada cuenta ocupaba
        dos renglones. Ahora va a la letra del resto del papel, una línea por
        cuenta, del ancho de su contenido y con el banco por su sigla.
      */}
      <table className="border-collapse border border-[#999] text-xs">
        <thead>
          {/* En mayúsculas como en el cuadro que mandó Willy (16/09). */}
          <tr className="uppercase">
            <th className="border-b border-[#999] px-3 py-0.5 text-center font-semibold">Banco</th>
            <th className="border-b border-[#999] px-3 py-0.5 text-center font-semibold">Moneda</th>
            <th className="border-b border-[#999] px-3 py-0.5 text-center font-semibold">N.° de cuenta</th>
            <th className="border-b border-[#999] px-3 py-0.5 text-center font-semibold">CCI cta. interbancaria</th>
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((c) => (
            <tr key={c.numero} className="whitespace-nowrap">
              <td className="px-3 py-0.5 text-center font-semibold" title={c.banco}>
                {siglaBanco(c.banco)}
              </td>
              <td className="px-3 py-0.5">{MONEDA[c.moneda.toUpperCase()] ?? c.moneda}</td>
              <td className="px-3 py-0.5 tabular">{c.numero}</td>
              {/* Sin CCI no se puede pagar desde otro banco, así que el hueco
                  se dice en voz alta en vez de dejarlo en blanco. */}
              <td className="px-3 py-0.5 tabular">{c.cci ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * «BANCO DE CREDITO DEL PERU (BCP)» → «BCP». Es como lo escribe todo el
 * mundo en un pie de pago, y el nombre entero partía la fila en dos. Si no
 * trae la sigla entre paréntesis, va el nombre tal cual.
 */
export function siglaBanco(banco: string): string {
  const m = /\(([^)]+)\)\s*$/.exec(banco.trim());
  return m?.[1]?.trim() || banco;
}
