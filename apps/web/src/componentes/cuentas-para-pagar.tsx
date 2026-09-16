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

/** Como lo escribe Willy en su formato, no como lo guarda la base. */
const TIPO_DE_CUENTA: Record<string, string> = {
  USD: "CTA. CTE. DÓLARES",
  PEN: "CTA. CTE. SOLES",
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

      <table className="w-full border-collapse text-xs">
        <thead>
          {/* En mayúsculas como en el cuadro que mandó Willy, no en
              minúscula como el resto del papel: es una tabla de cifras dentro
              del pie, y los títulos en caja alta la separan de la prosa que
              tiene encima. */}
          <tr className="text-left uppercase">
            <th className="border-b border-[#999] px-2 py-1 font-semibold">Banco</th>
            <th className="border-b border-[#999] px-2 py-1 font-semibold">
              Tipo de cuenta
            </th>
            <th className="border-b border-[#999] px-2 py-1 font-semibold">
              N.° de cuenta
            </th>
            <th className="border-b border-[#999] px-2 py-1 font-semibold">
              CCI cta. interbancaria
            </th>
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((c) => (
            <tr key={c.numero}>
              <td className="border-b border-[#ddd] px-2 py-1 font-semibold">
                {c.banco}
              </td>
              <td className="border-b border-[#ddd] px-2 py-1">
                {TIPO_DE_CUENTA[c.moneda.toUpperCase()] ?? c.moneda}
              </td>
              <td className="border-b border-[#ddd] px-2 py-1 tabular">{c.numero}</td>
              {/* Sin CCI no se puede pagar desde otro banco, así que el hueco
                  se dice en voz alta en vez de dejarlo en blanco. */}
              <td className="border-b border-[#ddd] px-2 py-1 tabular">
                {c.cci ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
