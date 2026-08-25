"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@rodatech/ui";

import { enviarASunat, type ResultadoEnvio } from "../acciones/enviar";

/**
 * Botón de envío a SUNAT.
 *
 * El envío puede tardar varios segundos —es una llamada SOAP a un servicio de
 * terceros— así que el estado de espera no es cosmético: sin él, el operador
 * pulsa dos veces y SUNAT rechaza el segundo por duplicado, que es un error
 * que asusta mucho más de lo que debería.
 *
 * El resultado se enseña ENTERO, incluidas las observaciones. Un comprobante
 * «observado» está aceptado, pero con reparos que hay que leer; esconderlos
 * detrás de un tic verde es cómo se acumulan.
 */
export function EnviarASunat({
  id,
  numero,
  configurado,
  yaAceptado,
}: {
  id: string;
  numero: string;
  /** Si falta el certificado, el botón se explica en vez de fallar al pulsarlo. */
  configurado: boolean;
  yaAceptado: boolean;
}) {
  const router = useRouter();
  const [resultado, setResultado] = React.useState<ResultadoEnvio | null>(null);
  const [enviando, enviar] = React.useTransition();

  if (yaAceptado) return null;

  const lanzar = () => {
    setResultado(null);
    enviar(async () => {
      const datos = new FormData();
      datos.set("id", id);
      const r = await enviarASunat(null, datos);
      setResultado(r);
      if (r.ok) router.refresh();
    });
  };

  if (!configurado) {
    return (
      <div className="rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm">
        <p className="font-medium">{numero} está emitido pero no se ha enviado.</p>
        <p className="mt-0.5 text-[0.8rem]">
          Falta configurar el certificado y las credenciales SOL. El documento
          queda esperando: cuando estén, se envía desde aquí sin volver a
          emitirlo.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={lanzar} disabled={enviando}>
        {enviando ? "Enviando a SUNAT…" : "Enviar a SUNAT"}
      </Button>

      {enviando ? (
        <p className="anim-latido text-xs text-[var(--fg-muted)]">
          SUNAT puede tardar unos segundos. No cierres esta pantalla.
        </p>
      ) : null}

      {resultado && !resultado.ok ? (
        <div className="anim-entrada rounded-sm border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm text-[var(--danger)]">
          {resultado.error}
        </div>
      ) : null}

      {resultado?.ok ? (
        <div
          className={`anim-entrada rounded-sm border p-2.5 text-sm ${
            resultado.aceptado
              ? "border-[var(--ok)] bg-[var(--ok-bg,var(--surface-2))]"
              : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger)]"
          }`}
        >
          <p className="font-medium">
            {resultado.aceptado ? "Aceptado por SUNAT." : "SUNAT lo rechazó."}
            {resultado.codigo ? (
              <span className="ml-1.5 font-mono text-xs">({resultado.codigo})</span>
            ) : null}
          </p>
          <p className="mt-0.5 text-[0.8rem]">{resultado.mensaje}</p>

          {resultado.observaciones.length > 0 ? (
            <>
              <p className="mt-2 text-[0.8rem] font-medium">
                Aceptado CON observaciones:
              </p>
              <ul className="mt-0.5 flex flex-col gap-0.5 text-[0.8rem]">
                {resultado.observaciones.map((o) => (
                  <li key={o}>· {o}</li>
                ))}
              </ul>
            </>
          ) : null}

          {!resultado.aceptado ? (
            <p className="mt-2 text-[0.8rem]">
              {resultado.reintentable
                ? "Se puede volver a intentar: el problema es transitorio."
                : "Reenviarlo no sirve de nada. Hay que corregir y emitir otro documento."}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
