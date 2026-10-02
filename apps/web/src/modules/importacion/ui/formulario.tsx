"use client";

// Cliente porque el flujo es de dos pasos con estado entre ellos: se sube el
// archivo, se mira el plan y recién se confirma. Nada de eso sobrevive a una
// navegación de servidor.

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@rodatech/ui";
import { FileUp } from "lucide-react";

import { analizar, confirmar } from "../acciones/importar";
import type { ResultadoAnalisis, ResumenImportacion } from "../dominio/tipos";
import { Resumen } from "./resumen";

function BotonEnviar({
  children,
  deshabilitado = false,
}: {
  children: React.ReactNode;
  deshabilitado?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || deshabilitado}>
      {pending ? "Procesando…" : children}
    </Button>
  );
}

export function FormularioImportacion() {
  const [analisis, accionAnalizar] = useActionState<ResultadoAnalisis | null, FormData>(
    analizar,
    null,
  );
  const [aplicado, accionConfirmar] = useActionState<
    { ok: boolean; error?: string; resumen?: ResumenImportacion } | null,
    FormData
  >(confirmar, null);

  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ya se aplicó: se muestra el resultado y se ofrece empezar de nuevo.
  if (aplicado?.ok && aplicado.resumen) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-md border border-[var(--ok)] bg-[var(--ok-bg)] p-4">
          <p className="font-medium text-[var(--ok)]">Carga terminada</p>
          <p className="mt-1 text-sm">
            {aplicado.resumen.nuevos} productos nuevos y{" "}
            {aplicado.resumen.actualizados} actualizados.
          </p>
        </div>
        <Resumen resumen={aplicado.resumen} />
        <div>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Cargar otro archivo
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <form action={accionAnalizar} className="flex flex-col gap-3">
        {/*
          El campo de archivo nativo lo dibuja el navegador, y en el suyo
          decía «Choose File · No file chosen», en inglés (revisión por
          módulos del 02/10). Se esconde a la vista —sigue ahí para el
          formulario y el lector de pantalla— y lo que se ve es un botón
          con su palabra y, al lado, el nombre del archivo elegido.
        */}
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Archivo de la plantilla</span>
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor="archivo-plantilla"
              className="inline-flex h-control-md cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-medium hover:bg-[var(--surface-2)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--ring)]"
            >
              <FileUp className="size-4" aria-hidden />
              Elegir archivo
              <input
                id="archivo-plantilla"
                ref={inputRef}
                type="file"
                name="archivo"
                accept=".xlsx"
                required
                onChange={(e) => setNombreArchivo(e.target.files?.[0]?.name ?? null)}
                className="sr-only"
              />
            </label>
            <span
              className={`min-w-0 break-all text-sm ${
                nombreArchivo ? "font-medium" : "text-[var(--fg-muted)]"
              }`}
            >
              {nombreArchivo ?? "Todavía no has elegido ninguno."}
            </span>
          </div>
          <span className="text-sm text-[var(--fg-muted)]">
            Solo .xlsx, hasta 5 MB. No se guarda nada hasta que confirmes.
          </span>
        </div>
        <div>
          <BotonEnviar deshabilitado={!nombreArchivo}>Revisar archivo</BotonEnviar>
        </div>
      </form>

      {analisis && !analisis.ok ? (
        <div className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-4">
          <p className="font-medium text-[var(--danger)]">No se pudo leer</p>
          <p className="mt-1 text-sm">{analisis.error}</p>
          {analisis.problemas && analisis.problemas.length > 0 ? (
            <ul className="mt-2 list-disc pl-5 text-sm">
              {analisis.problemas.slice(0, 10).map((p, i) => (
                <li key={i}>
                  {p.fila !== null ? `Fila ${p.fila}: ` : ""}
                  {p.mensaje}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {analisis?.ok ? (
        <div className="flex flex-col gap-4">
          <Resumen
            resumen={analisis.resumen}
            problemas={analisis.problemas}
            avisos={analisis.avisos}
          />

          {analisis.resumen.nuevos + analisis.resumen.actualizados > 0 ? (
            <form action={accionConfirmar} className="flex flex-wrap items-center gap-3">
              {/* Las filas viajan de vuelta para no obligar a subir otra vez.
                  La acción las revalida enteras antes de tocar la base. */}
              <input type="hidden" name="filas" value={JSON.stringify(analisis.filas)} />
              <BotonEnviar>
                Confirmar y cargar {analisis.resumen.nuevos + analisis.resumen.actualizados}{" "}
                {analisis.resumen.nuevos + analisis.resumen.actualizados === 1
                  ? "producto"
                  : "productos"}
              </BotonEnviar>
              <span className="text-sm text-[var(--fg-muted)]">
                {nombreArchivo}
              </span>
            </form>
          ) : (
            <p className="text-sm text-[var(--danger)]">
              Ninguna fila se puede cargar. Corrige el archivo y vuelve a subirlo.
            </p>
          )}

          {aplicado && !aplicado.ok ? (
            <p className="text-sm text-[var(--danger)]">{aplicado.error}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
