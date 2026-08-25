"use client";

import * as React from "react";
import { useActionState } from "react";
import { Button, Input, SelectNativo } from "@rodatech/ui";

import {
  guardarConfigSunat,
  probarConexionSunat,
  type ResultadoConfig,
  type ResultadoPrueba,
} from "../acciones/configurar";
import type { ConfigFiscal } from "../dominio/tipos";

/**
 * Configuración de facturación electrónica.
 *
 * Las claves NUNCA vuelven a la pantalla: los campos salen vacíos aunque haya
 * algo guardado, y dejarlos en blanco significa «no lo toques». Un campo que
 * muestra la clave guardada es un campo del que alguien acaba haciendo una
 * captura para mandarla por WhatsApp.
 *
 * El botón «Probar conexión» está arriba del todo a propósito: es lo primero
 * que hay que pulsar cuando algo falla, y sin él la única forma de saber si
 * las credenciales sirven sería emitir un comprobante real y quemar un
 * correlativo.
 */
export function FormularioConfigSunat({ config }: { config: ConfigFiscal }) {
  const [resultado, guardar, guardando] = useActionState<ResultadoConfig | null, FormData>(
    guardarConfigSunat,
    null,
  );

  const [prueba, setPrueba] = React.useState<ResultadoPrueba | null>(null);
  const [probando, probar] = React.useTransition();
  const [ambiente, setAmbiente] = React.useState(config.ambiente);

  const lanzarPrueba = () => {
    setPrueba(null);
    probar(async () => setPrueba(await probarConexionSunat()));
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ------------------------------------------------ Prueba */}
      <section className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Probar conexión con SUNAT</h2>
            <p className="mt-0.5 text-sm text-[var(--fg-muted)]">
              Comprueba las credenciales sin emitir nada ni gastar un correlativo.
            </p>
            {config.probado_en ? (
              <p className="mt-1 text-xs text-[var(--fg-subtle)]">
                Última prueba: {new Date(config.probado_en).toLocaleString("es-PE")} ·{" "}
                {config.probado_ok ? "correcta" : "falló"}
              </p>
            ) : null}
          </div>
          <Button type="button" variant="outline" onClick={lanzarPrueba} disabled={probando}>
            {probando ? "Probando…" : "Probar ahora"}
          </Button>
        </div>

        {probando ? (
          <p className="anim-latido mt-3 text-xs text-[var(--fg-muted)]">
            Hablando con SUNAT…
          </p>
        ) : null}

        {prueba ? (
          <div
            className={`anim-entrada mt-3 rounded-sm border p-2.5 text-sm ${
              prueba.ok && prueba.funciona
                ? "border-[var(--ok)] bg-[var(--surface-2)]"
                : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger)]"
            }`}
          >
            {prueba.ok ? prueba.mensaje : prueba.error}
          </div>
        ) : null}
      </section>

      {/* ------------------------------------------------ Formulario */}
      <form action={guardar} className="card flex flex-col gap-4 p-4">
        <div>
          <h2 className="text-sm font-semibold">Credenciales</h2>
          <p className="mt-0.5 text-sm text-[var(--fg-muted)]">
            Se guardan cifradas. Deja un campo de clave en blanco para no cambiarlo.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Ambiente</span>
            <SelectNativo
              name="ambiente"
              value={ambiente}
              onChange={(e) => setAmbiente(e.target.value as "beta" | "produccion")}
            >
              <option value="beta">Homologación (beta) — sin valor fiscal</option>
              <option value="produccion">Producción — documentos reales</option>
            </SelectNativo>
            {ambiente === "produccion" ? (
              <span className="anim-entrada text-xs font-medium text-[var(--danger)]">
                En producción, lo que se emita tiene valor fiscal y no se puede
                deshacer sin una nota de crédito.
              </span>
            ) : null}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Usuario SOL secundario</span>
            <Input
              name="usuario_sol"
              defaultValue={config.usuario_sol ?? ""}
              placeholder="20601234567MODDATOS"
              className="font-mono"
              autoComplete="off"
            />
            {/* Es la causa número uno de «error de autenticación» al arrancar:
                se escribe solo el usuario y falta el RUC delante. */}
            <span className="text-xs text-[var(--fg-subtle)]">
              RUC + usuario, todo junto. El usuario PRINCIPAL no vale: SUNAT no lo
              acepta para facturación electrónica.
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Clave SOL</span>
            <Input
              name="clave_sol"
              type="password"
              placeholder="•••••••• (en blanco = no cambiar)"
              autoComplete="new-password"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Clave del certificado</span>
            <Input
              name="certificado_clave"
              type="password"
              placeholder="•••••••• (en blanco = no cambiar)"
              autoComplete="new-password"
            />
          </label>
        </div>

        <div className="grid gap-3 border-t border-[var(--border-soft)] pt-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Certificado digital (.pfx)</span>
            <Input
              name="certificado"
              type="file"
              accept=".pfx,.p12"
              className="file:mr-3 file:rounded-sm file:border-0 file:bg-[var(--surface-2)] file:px-2 file:py-1 file:text-sm"
            />
            {config.certificado_nombre ? (
              <span className="text-xs text-[var(--fg-muted)]">
                Cargado: {config.certificado_nombre}
                {config.certificado_caduca_en
                  ? ` · caduca el ${config.certificado_caduca_en}`
                  : ""}
              </span>
            ) : (
              <span className="text-xs text-[var(--fg-subtle)]">
                Todavía no hay ninguno. Sin él no se puede firmar.
              </span>
            )}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Serie factura</span>
              <Input
                name="serie_factura"
                defaultValue={config.serie_factura}
                className="font-mono"
                maxLength={4}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Serie boleta</span>
              <Input
                name="serie_boleta"
                defaultValue={config.serie_boleta}
                className="font-mono"
                maxLength={4}
              />
            </label>
          </div>
        </div>

        {resultado && !resultado.ok ? (
          <p className="anim-entrada rounded-sm border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm text-[var(--danger)]">
            {resultado.error}
          </p>
        ) : null}

        {resultado?.ok ? (
          <p className="anim-entrada rounded-sm border border-[var(--ok)] bg-[var(--surface-2)] p-2.5 text-sm">
            {resultado.mensaje}
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button type="submit" disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar configuración"}
          </Button>
        </div>
      </form>
    </div>
  );
}
