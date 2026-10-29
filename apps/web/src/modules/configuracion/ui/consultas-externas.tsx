import { EstadoError } from "@rodatech/ui";

import { usoConsultasExternas } from "../api/consultas";
import { NOMBRE_CONSULTA, nivelDeUso } from "../dominio/consultas-externas";

/**
 * «Traer datos» y el tipo de cambio: cuántas consultas van este mes.
 *
 * Luis, 29/10: «un contador para que vaya contando las peticiones… si hace una
 * petición pero no guardó, que se guarde en caché, así trae sin hacer una
 * petición nueva». Lo segundo ya pasaba desde la 003; lo que faltaba era
 * poder verlo. Por eso el recuadro dice las dos cosas: lo gastado y lo que
 * contestó la memoria sin gastar.
 */

const MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre"];

function nombreMes(periodo: string): string {
  const [anio, mes] = periodo.split("-").map(Number);
  return `${MES[(mes ?? 1) - 1]} ${anio}`;
}

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-PE", {
    day: "numeric",
    month: "long",
    // El ciclo se corta a medianoche UTC (cuota.ts): en Lima serían las 19:00
    // del día anterior, y «vuelve a cero el 31 de octubre» confunde.
    timeZone: "UTC",
  });
}

const COLOR_BARRA = { bien: "var(--ok)", atento: "var(--warn)", casi: "var(--danger)" } as const;

export async function ConsultasExternas() {
  const r = await usoConsultasExternas();
  if (!r.ok) {
    return <EstadoError titulo="No se pudo leer el contador de consultas" detalle={r.error} />;
  }
  const u = r.datos;
  const quedan = Math.max(0, u.limite - u.usadas);
  const nivel = u.agotadoPorDecolecta ? "casi" : nivelDeUso(u.usadas, u.limite);
  const pct = u.limite > 0 ? Math.min(100, Math.round((u.usadas / u.limite) * 100)) : 100;
  const ahorradas = u.porTipo.reduce((a, c) => a + c.deMemoria, 0);
  // El contador sube ANTES de salir a la red y la bitácora se escribe después,
  // sin reventar si falla: pueden no cuadrar. Se enseña la diferencia en vez
  // de esconderla (en octubre de 2026: 52 contadas, 26 con detalle).
  const sinDetalle = Math.max(0, u.usadas - u.porTipo.reduce((a, c) => a + c.pedidas, 0));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-base">
          En {nombreMes(u.periodo)} van <strong className="text-lg">{u.usadas}</strong> de{" "}
          {u.limite}. {u.agotadoPorDecolecta ? (
            <strong>Decolecta dice que ya no quedan.</strong>
          ) : (
            <>
              Quedan <strong>{quedan}</strong>.
            </>
          )}
          {u.reiniciaEl ? ` El contador vuelve a cero el ${fechaCorta(u.reiniciaEl)}.` : null}
        </p>
        <div
          className="mt-2 h-3 w-full overflow-hidden rounded-full bg-[var(--surface-2)]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={u.limite}
          aria-valuenow={u.usadas}
          aria-label="Consultas usadas este mes"
        >
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: COLOR_BARRA[nivel] }} />
        </div>
        {nivel !== "bien" ? (
          <p className="mt-1.5 text-sm font-medium">
            Quedan pocas: cuando se acaben, los datos se escriben a mano hasta que se reinicie.
          </p>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[var(--fg-muted)]">
              <th className="py-2 pr-3 font-medium">Este mes</th>
              <th className="py-2 pr-3 text-right font-medium">Pedidas</th>
              <th className="py-2 text-right font-medium">De memoria (gratis)</th>
            </tr>
          </thead>
          <tbody>
            {u.porTipo.map((c) => (
              <tr key={c.tipo} className="border-b border-[var(--border)] last:border-0">
                <td className="py-2 pr-3">{NOMBRE_CONSULTA[c.tipo]}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{c.pedidas}</td>
                <td className="py-2 text-right tabular-nums">{c.deMemoria}</td>
              </tr>
            ))}
            {sinDetalle > 0 ? (
              <tr>
                <td className="py-2 pr-3">Contadas sin detalle</td>
                <td className="py-2 pr-3 text-right tabular-nums">{sinDetalle}</td>
                <td className="py-2 text-right">—</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-[var(--fg-muted)]">
        Lo que se trae una vez se guarda, aunque no se llegue a registrar el
        cliente o el proveedor: el RUC 30 días, el DNI 90, y el tipo de cambio
        de cada día para siempre. Este mes la memoria ahorró{" "}
        <strong className="text-[var(--fg)]">{ahorradas}</strong>{" "}
        {ahorradas === 1 ? "consulta" : "consultas"}. Guardados ahora:{" "}
        {u.guardados.ruc} RUC, {u.guardados.dni} DNI y {u.guardados.diasDeCambio} días de tipo de
        cambio.
      </p>

      {u.anteriores.length > 0 ? (
        <p className="text-sm text-[var(--fg-muted)]">
          Meses anteriores:{" "}
          {u.anteriores.map((a, i) => (
            <span key={a.periodo}>
              {i > 0 ? " · " : ""}
              {nombreMes(a.periodo)}, {a.usadas} de {a.limite}
            </span>
          ))}
          .
        </p>
      ) : null}
    </div>
  );
}
