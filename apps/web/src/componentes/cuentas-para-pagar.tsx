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
 * Van las DOS, y primero la del documento
 * ---------------------------------------------------------------------------
 * Su formato imprime la de dólares y la de soles. Se enseñan las dos porque el
 * cliente que factura en dólares a veces paga en soles, y quitarle la otra le
 * obliga a llamar para pedirla.
 *
 * Pero la de la moneda del documento va PRIMERA. Con las dos seguidas y sin
 * orden, transferir a la que no es cuesta una mañana en el banco.
 *
 * El CCI va al lado del número, no debajo ni escondido: es el que sirve para
 * pagar desde otro banco, y sin él un cliente que no es del BCP no puede
 * transferir.
 */

export interface CuentaParaPagar {
  banco: string;
  moneda: string;
  numero: string;
  cci: string | null;
}

const ETIQUETA_MONEDA: Record<string, string> = {
  USD: "Cuenta dólares US$",
  PEN: "Cuenta soles S/",
};

export function CuentasParaPagar({
  cuentas,
  /** La moneda del documento. La cuenta que la comparte sale primero. */
  moneda,
  titulo = "Cuentas para el pago",
}: {
  cuentas: readonly CuentaParaPagar[];
  moneda?: string | null;
  titulo?: string;
}) {
  if (cuentas.length === 0) return null;

  const preferida = (moneda ?? "").toUpperCase();
  const ordenadas = [...cuentas].sort((a, b) => {
    const ma = a.moneda.toUpperCase() === preferida ? 0 : 1;
    const mb = b.moneda.toUpperCase() === preferida ? 0 : 1;
    return ma - mb;
  });

  return (
    <div className="mt-3 break-inside-avoid border-t border-[#ccc] pt-2">
      <p className="mb-1 font-semibold">{titulo}</p>
      <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2 print:grid-cols-2">
        {ordenadas.map((c) => (
          <div key={c.numero}>
            <p>
              <strong>{c.banco}</strong> · {ETIQUETA_MONEDA[c.moneda.toUpperCase()] ?? c.moneda}
            </p>
            <p className="tabular">
              N.º {c.numero}
              {c.cci ? <> · CCI {c.cci}</> : null}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
