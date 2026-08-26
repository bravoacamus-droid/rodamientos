import { Badge, Table, TableContenedor, TBody, TdNum, THead, ThNum } from "@rodatech/ui";

import type { AvisoLectura, ProblemaArchivo, ResumenImportacion } from "../dominio/tipos";

/**
 * El plan, antes de aplicarlo.
 *
 * Lo primero que se ve son los rechazos, no los aciertos: quien abre esta
 * pantalla necesita saber qué NO va a entrar y por qué, que es lo único sobre
 * lo que puede actuar. Los que están bien no necesitan su atención.
 */

const TOPE_DETALLE = 50;

function Cifra({
  valor,
  etiqueta,
  tono = "neutro",
}: {
  valor: number;
  etiqueta: string;
  tono?: "neutro" | "ok" | "aviso" | "malo";
}) {
  const color = {
    neutro: "text-[var(--fg)]",
    ok: "text-[var(--ok)]",
    aviso: "text-[var(--warn)]",
    malo: "text-[var(--danger)]",
  }[tono];

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
      <p className={`text-2xl font-semibold tabular ${color}`}>{valor}</p>
      <p className="mt-0.5 text-xs text-[var(--fg-muted)]">{etiqueta}</p>
    </div>
  );
}

export function Resumen({
  resumen,
  problemas = [],
  avisos = [],
}: {
  resumen: ResumenImportacion;
  problemas?: ProblemaArchivo[];
  /** Cómo se va a leer el archivo. No son errores: son decisiones. */
  avisos?: AvisoLectura[];
}) {
  const rechazadas = resumen.detalle.filter((d) => d.accion === "rechazado");
  const buenas = resumen.detalle.filter((d) => d.accion !== "rechazado");

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra valor={resumen.nuevos} etiqueta="productos nuevos" tono="ok" />
        <Cifra valor={resumen.actualizados} etiqueta="se actualizan" />
        <Cifra
          valor={resumen.rechazados}
          etiqueta="rechazados"
          tono={resumen.rechazados > 0 ? "malo" : "neutro"}
        />
        {/* «Con peso» y no «con stock inicial»: el stock inicial se mira una
            vez, y el peso decide si se van a poder emitir guías o si habrá que
            teclearlo en cada una. */}
        <Cifra
          valor={resumen.con_peso}
          etiqueta="traen peso"
          tono={resumen.con_peso === 0 ? "malo" : "neutro"}
        />
      </div>

      {/* Los avisos van ARRIBA del todo, antes que las cifras y que los
          problemas: son decisiones sobre cómo se va a leer el archivo, y una
          vez aplicado ya no hay dónde tomarlas. */}
      {avisos.map((a, i) => (
        <div
          key={i}
          className="rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm"
        >
          <p className="font-medium">{a.titulo}</p>
          <p className="mt-0.5">{a.detalle}</p>
        </div>
      ))}

      {resumen.marcas_nuevas.length > 0 ? (
        <p className="text-sm">
          <span className="font-medium">Marcas que se van a crear: </span>
          {resumen.marcas_nuevas.join(", ")}
        </p>
      ) : null}

      {resumen.proveedores_desconocidos.length > 0 ? (
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
          <p className="font-medium">
            {resumen.proveedores_desconocidos.length}{" "}
            {resumen.proveedores_desconocidos.length === 1
              ? "proveedor del archivo no está en el maestro"
              : "proveedores del archivo no están en el maestro"}
          </p>
          <p className="mt-0.5">
            {resumen.proveedores_desconocidos.join(", ")}.
          </p>
          <p className="mt-1 text-xs text-[var(--fg-muted)]">
            Las filas entran igual, solo que sin proveedor habitual. No se crean
            solos a propósito: un proveedor lleva RUC, condiciones de pago y
            plazo de entrega, y darlo de alta desde un nombre suelto llenaría el
            maestro de fichas a medias. Se dan de alta en Proveedores y se
            vuelve a subir el archivo.
          </p>
        </div>
      ) : null}

      {resumen.stock_ignorado > 0 ? (
        <div className="rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm">
          <span className="font-medium">
            {resumen.stock_ignorado}{" "}
            {resumen.stock_ignorado === 1 ? "fila trae" : "filas traen"} stock de
            un producto que ya existe, y ese stock NO se va a tocar.
          </span>{" "}
          El saldo de almacén es la suma de sus movimientos; sobrescribirlo desde
          un Excel rompería el kardex. Si hay diferencia, se corrige por Ajuste de
          inventario, que sí deja constancia de quién y por qué.
        </div>
      ) : null}

      {problemas.length > 0 ? (
        <div className="rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3">
          <p className="text-sm font-medium">
            {problemas.length}{" "}
            {problemas.length === 1 ? "fila se omitió" : "filas se omitieron"} al
            leer el archivo
          </p>
          <ul className="mt-1.5 list-disc pl-5 text-sm">
            {problemas.slice(0, 10).map((p, i) => (
              <li key={i}>
                {p.fila !== null ? `Fila ${p.fila}: ` : ""}
                {p.mensaje}
              </li>
            ))}
          </ul>
          {problemas.length > 10 ? (
            <p className="mt-1 text-xs text-[var(--fg-muted)]">
              y {problemas.length - 10} más.
            </p>
          ) : null}
        </div>
      ) : null}

      {rechazadas.length > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-[var(--danger)]">
            No van a entrar ({rechazadas.length})
          </h3>
          <Tabla filas={rechazadas} conMotivo />
        </section>
      ) : null}

      {buenas.length > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold">
            Van a entrar ({buenas.length})
          </h3>
          <Tabla filas={buenas} />
        </section>
      ) : null}
    </div>
  );
}

function Tabla({
  filas,
  conMotivo = false,
}: {
  filas: ResumenImportacion["detalle"];
  conMotivo?: boolean;
}) {
  const visibles = filas.slice(0, TOPE_DETALLE);

  return (
    <TableContenedor>
      <Table>
        <THead>
          <tr>
            <th className="text-left">Fila</th>
            <th className="text-left">Código</th>
            <th className="text-left">Qué pasa</th>
            {conMotivo ? (
              <th className="text-left">Por qué</th>
            ) : (
              <>
                <ThNum>P.V. $</ThNum>
                <ThNum>P.M. $</ThNum>
              </>
            )}
          </tr>
        </THead>
        <TBody>
          {visibles.map((d) => (
            <tr key={`${d.fila}-${d.codigo}`}>
              <TdNum className="text-[var(--fg-muted)]">{d.fila}</TdNum>
              <td className="font-medium">{d.codigo}</td>
              <td>
                <Badge
                  tone={
                    d.accion === "rechazado"
                      ? "danger"
                      : d.accion === "nuevo"
                        ? "success"
                        : "neutral"
                  }
                >
                  {d.accion === "rechazado"
                    ? "Rechazado"
                    : d.accion === "nuevo"
                      ? "Nuevo"
                      : "Se actualiza"}
                </Badge>
              </td>
              {conMotivo ? (
                <td className="text-[var(--danger)]">{d.motivo}</td>
              ) : (
                <>
                  <TdNum>{d.precio_venta.toFixed(2)}</TdNum>
                  <TdNum>
                    {d.precio_minimo > 0 ? d.precio_minimo.toFixed(2) : "—"}
                  </TdNum>
                </>
              )}
            </tr>
          ))}
        </TBody>
      </Table>
      {filas.length > TOPE_DETALLE ? (
        <p className="mt-1.5 text-xs text-[var(--fg-muted)]">
          Se muestran {TOPE_DETALLE} de {filas.length}. Las demás siguen la misma
          suerte.
        </p>
      ) : null}
    </TableContenedor>
  );
}
