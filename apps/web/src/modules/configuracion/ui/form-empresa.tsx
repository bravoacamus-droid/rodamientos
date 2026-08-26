"use client";

/*
 * "use client" OBLIGATORIO: formulario con estado y envío por Server Action.
 */

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Button, Campo, Input, SwitchCampo, Textarea, toast } from "@rodatech/ui";

import { guardarEmpresa, type ResultadoConfig } from "../acciones/guardar";
import type { Empresa } from "../dominio/tipos";

/**
 * Los datos fiscales del emisor.
 *
 * Lo que se teclea aquí viaja en cada comprobante que sale a SUNAT, así que el
 * formulario no adivina nada: los porcentajes de IGV, detracción y retención
 * salen de la base y se editan como números, no como constantes escondidas en
 * el código. Cambian por norma, no por gusto.
 */
export function FormEmpresa({ empresa, puedeEditar }: { empresa: Empresa; puedeEditar: boolean }) {
  const router = useRouter();
  const [datos, setDatos] = React.useState(empresa);

  const [resultado, enviar, guardando] = useActionState<ResultadoConfig | null, FormData>(
    async (previo, formData) => {
      const r = await guardarEmpresa(previo, formData);
      if (r.ok) {
        toast.success(r.mensaje);
        router.refresh();
      } else {
        toast.error(r.error);
      }
      return r;
    },
    null,
  );

  const texto = <K extends keyof Empresa>(clave: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDatos((d) => ({ ...d, [clave]: e.target.value }));

  const numero = <K extends keyof Empresa>(clave: K) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDatos((d) => ({ ...d, [clave]: Number(e.target.value) }));

  return (
    <form
      action={enviar}
      className="flex flex-col gap-4"
      // El estado va en un solo campo JSON en lugar de veinte `name=`: así el
      // esquema de zod del servidor y el objeto de aquí son la misma forma, y
      // un campo nuevo no se puede olvidar a medio camino.
    >
      <input type="hidden" name="empresa" value={JSON.stringify(datos)} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="razon_social" label="Razón social" requerido>
          <Input
            id="razon_social"
            value={datos.razon_social}
            onChange={texto("razon_social")}
            disabled={!puedeEditar}
          />
        </Campo>

        <Campo id="nombre_comercial" label="Nombre comercial" requerido>
          <Input
            id="nombre_comercial"
            value={datos.nombre_comercial}
            onChange={texto("nombre_comercial")}
            disabled={!puedeEditar}
          />
        </Campo>

        <Campo id="ruc" label="RUC" requerido ayuda="Once dígitos. Viaja en cada comprobante.">
          <Input
            id="ruc"
            value={datos.ruc}
            onChange={texto("ruc")}
            inputMode="numeric"
            maxLength={11}
            disabled={!puedeEditar}
          />
        </Campo>

        <Campo id="eslogan" label="Eslogan">
          <Input
            id="eslogan"
            value={datos.eslogan ?? ""}
            onChange={texto("eslogan")}
            disabled={!puedeEditar}
          />
        </Campo>
      </div>

      <Campo id="direccion" label="Dirección fiscal">
        <Textarea
          id="direccion"
          rows={2}
          value={datos.direccion ?? ""}
          onChange={texto("direccion")}
          disabled={!puedeEditar}
        />
      </Campo>

      <div className="grid gap-3 sm:grid-cols-3">
        <Campo id="telefono" label="Teléfono">
          <Input id="telefono" value={datos.telefono ?? ""} onChange={texto("telefono")} disabled={!puedeEditar} />
        </Campo>
        <Campo id="celular" label="Celular">
          <Input id="celular" value={datos.celular ?? ""} onChange={texto("celular")} disabled={!puedeEditar} />
        </Campo>
        <Campo id="web" label="Web">
          <Input id="web" value={datos.web ?? ""} onChange={texto("web")} disabled={!puedeEditar} />
        </Campo>
        <Campo id="email" label="Correo">
          <Input id="email" value={datos.email ?? ""} onChange={texto("email")} disabled={!puedeEditar} />
        </Campo>
        <Campo id="email_ventas" label="Correo de ventas" ayuda="El que se enseña en la cotización.">
          <Input
            id="email_ventas"
            value={datos.email_ventas ?? ""}
            onChange={texto("email_ventas")}
            disabled={!puedeEditar}
          />
        </Campo>
      </div>

      <div className="rounded-md border border-[var(--border-soft)] p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
          Impuestos y retenciones
        </h3>
        <p className="mt-0.5 text-xs text-[var(--fg-subtle)]">
          Salen de la norma, no del gusto de nadie. Se editan aquí porque cuando
          cambian, cambian para todo el mundo el mismo día.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Campo id="igv" label="IGV %">
            <Input
              id="igv"
              type="number"
              step="0.01"
              value={datos.igv_porcentaje}
              onChange={numero("igv_porcentaje")}
              disabled={!puedeEditar}
            />
          </Campo>
          <Campo id="det_min" label="Detracción desde" ayuda="Umbral SPOT en soles.">
            <Input
              id="det_min"
              type="number"
              step="0.01"
              value={datos.detraccion_monto_minimo}
              onChange={numero("detraccion_monto_minimo")}
              disabled={!puedeEditar}
            />
          </Campo>
          <Campo id="det_pct" label="Detracción %">
            <Input
              id="det_pct"
              type="number"
              step="0.01"
              value={datos.detraccion_porcentaje}
              onChange={numero("detraccion_porcentaje")}
              disabled={!puedeEditar}
            />
          </Campo>
          <Campo id="ret_pct" label="Retención %">
            <Input
              id="ret_pct"
              type="number"
              step="0.01"
              value={datos.retencion_porcentaje}
              onChange={numero("retencion_porcentaje")}
              disabled={!puedeEditar}
            />
          </Campo>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Campo id="cuenta_det" label="Cuenta de detracción" ayuda="Banco de la Nación.">
            <Input
              id="cuenta_det"
              value={datos.cuenta_detraccion ?? ""}
              onChange={texto("cuenta_detraccion")}
              disabled={!puedeEditar}
            />
          </Campo>
          <SwitchCampo
            id="agente_ret"
            label="Somos agente de retención"
            ayuda="Si SUNAT nos designó agente, la retención se aplica al comprar."
            checked={datos.agente_retencion}
            onCheckedChange={(v) => setDatos((d) => ({ ...d, agente_retencion: v }))}
            disabled={!puedeEditar}
          />
        </div>
      </div>

      {resultado && !resultado.ok ? (
        <p className="text-sm text-[var(--danger)]">{resultado.error}</p>
      ) : null}

      {puedeEditar ? (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
          <span className="text-xs text-[var(--fg-subtle)]">
            Última modificación: {empresa.actualizado_en.slice(0, 10)}
          </span>
        </div>
      ) : (
        <p className="text-xs text-[var(--fg-subtle)]">
          Solo gerencia y administración pueden cambiar estos datos.
        </p>
      )}
    </form>
  );
}
