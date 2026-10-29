"use client";

import * as React from "react";
import { useActionState } from "react";
import { Button, Input, SelectNativo } from "@rodatech/ui";
import { CircleCheck, CircleMinus, CircleX, FileUp } from "lucide-react";

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
            <h2 className="text-sm font-semibold">Probar con SUNAT</h2>
            <p className="mt-0.5 text-sm text-[var(--fg-muted)]">
              Comprueba el usuario SOL, el certificado y las credenciales de guías.
              No emite nada de verdad ni gasta ningún número.
            </p>
            {config.probado_en ? (
              <p className="mt-1 text-sm text-[var(--fg-subtle)]">
                Última prueba: {new Date(config.probado_en).toLocaleString("es-PE", { timeZone: "America/Lima" })} ·{" "}
                {config.probado_ok ? "todo correcto" : "algo falló"}
              </p>
            ) : null}
          </div>
          <Button type="button" variant="outline" onClick={lanzarPrueba} disabled={probando}>
            {probando ? "Probando…" : "Probar ahora"}
          </Button>
        </div>

        {probando ? (
          <p className="anim-latido mt-3 text-sm text-[var(--fg-muted)]">
            Hablando con SUNAT… tarda unos segundos.
          </p>
        ) : null}

        {prueba && !prueba.ok ? (
          <div className="anim-entrada mt-3 rounded-sm border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm text-[var(--danger)]">
            {prueba.error}
          </div>
        ) : null}

        {prueba && prueba.ok ? (
          <ul className="anim-entrada mt-3 flex flex-col gap-2">
            {prueba.pasos.map((p) => (
              <li
                key={p.que}
                className={`flex gap-2.5 rounded-sm border p-2.5 text-sm ${
                  p.bien === true
                    ? "border-[var(--ok)] bg-[var(--ok-bg)]"
                    : p.bien === null
                      ? "border-[var(--warn)] bg-[var(--warn-bg)]"
                      : "border-[var(--danger)] bg-[var(--danger-bg)]"
                }`}
              >
                {p.bien === true ? (
                  <CircleCheck className="mt-0.5 size-5 shrink-0 text-[var(--ok)]" aria-hidden="true" />
                ) : p.bien === null ? (
                  <CircleMinus className="mt-0.5 size-5 shrink-0 text-[var(--warn)]" aria-hidden="true" />
                ) : (
                  <CircleX className="mt-0.5 size-5 shrink-0 text-[var(--danger)]" aria-hidden="true" />
                )}
                <span>
                  <strong className="font-semibold">
                    {p.que}: {p.bien === true ? "funciona" : p.bien === null ? "sin probar" : "no funciona"}.
                  </strong>{" "}
                  {p.detalle}
                </span>
              </li>
            ))}
          </ul>
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
              <span className="anim-entrada text-sm font-medium text-[var(--danger)]">
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
            <span className="text-sm text-[var(--fg-subtle)]">
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
            <span className="text-sm text-[var(--fg-subtle)]">
              Al guardar se abre el certificado con esta clave y se comprueba que sea de la empresa y
              que esté vigente. Si algo no cuadra, no se guarda nada.
            </span>
          </label>
        </div>

        <div className="grid gap-3 border-t border-[var(--border-soft)] pt-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Certificado digital (.pfx)</span>
            <CampoCertificado />
            {config.certificado_sujeto && config.certificado_caduca_en ? (
              // Lo que se leyó DENTRO del certificado al subirlo (B2, 28/10),
              // no el nombre del archivo: así se ve a quién pertenece.
              <span className="text-sm text-[var(--fg)]">
                Certificado de <strong>{config.certificado_sujeto}</strong> · vence el{" "}
                <strong>{config.certificado_caduca_en.split("-").reverse().join("/")}</strong>
                {config.certificado_nombre ? (
                  <span className="text-[var(--fg-muted)]"> · archivo {config.certificado_nombre}</span>
                ) : null}
              </span>
            ) : config.certificado_nombre ? (
              <span className="text-sm text-[var(--fg-muted)]">
                Cargado: {config.certificado_nombre}. Se subió antes de que el sistema lo revisara:
                vuelve a subirlo con su clave para ver a quién pertenece y cuándo vence.
              </span>
            ) : (
              <span className="text-sm text-[var(--fg-subtle)]">
                Todavía no hay ninguno. Sin él no se puede firmar.
              </span>
            )}
          </label>

          {/*
            Aquí estaban «Serie factura» y «Serie boleta» (B1, 28/10). La
            factura numeraba por ese campo y no por la tabla de series, así que
            marcar F002 «Usar por defecto» no la movía. Ahora la serie de cada
            documento es la marcada «Por defecto» en «Series y correlativos».
          */}
          <p className="self-end text-sm text-[var(--fg-muted)]">
            La serie de la factura, de las notas y de la guía es la que está marcada{" "}
            <strong>«Por defecto»</strong> en <strong>Series y correlativos</strong>, más abajo.
          </p>
        </div>

        {/*
          Las de la guía (126). La guía no va por el mismo servicio que la
          factura: SUNAT pide además estas dos, que Willy genera una vez en
          SOL › «Credenciales de API SUNAT».
        */}
        <fieldset className="grid gap-3 border-t border-[var(--border-soft)] pt-4 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-semibold">Guías de remisión: credenciales de API</legend>
          <p className="text-sm text-[var(--fg-muted)] sm:col-span-2">
            Se generan una sola vez en SUNAT Operaciones en Línea › «Credenciales de API SUNAT», marcando
            «GREE Emisión de Comprobantes». SUNAT da un ID y una CLAVE; pueden tardar unas horas en activarse.
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">ID (client_id)</span>
            <Input
              name="gre_client_id"
              defaultValue={config.gre_client_id ?? ""}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="font-mono"
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">CLAVE (client_secret)</span>
            <Input
              name="gre_client_secret"
              type="password"
              placeholder="•••••••• (en blanco = no cambiar)"
              autoComplete="new-password"
            />
          </label>
        </fieldset>

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

/**
 * El certificado, con un botón en español.
 *
 * El campo de archivo del navegador sale en el idioma del navegador —«Choose
 * File / No file chosen»— y parece un texto, no un botón (revisión por módulos
 * del 02/10). El campo real va oculto DENTRO del mismo <label>, así que se
 * envía con el formulario igual que antes; lo que se ve es el botón y el
 * nombre del archivo elegido.
 */
function CampoCertificado() {
  const [nombre, setNombre] = React.useState<string | null>(null);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <input
        name="certificado"
        type="file"
        accept=".pfx,.p12"
        className="sr-only"
        onChange={(e) => setNombre(e.target.files?.[0]?.name ?? null)}
      />
      <span className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium hover:bg-[var(--surface-2)]">
        <FileUp className="size-4" aria-hidden />
        Elegir archivo
      </span>
      <span className="min-w-0 text-sm text-[var(--fg-muted)] [overflow-wrap:anywhere]">
        {nombre ?? "Ningún archivo elegido"}
      </span>
    </span>
  );
}
