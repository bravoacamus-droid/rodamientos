import Link from "next/link";
import { redirect } from "next/navigation";
import { EstadoError } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { configFiscal, estadoConfiguracion } from "../api/configuracion";
import { FormularioConfigSunat } from "./formulario-config";

/**
 * Configuración de facturación electrónica.
 *
 * Solo gerencia. El usuario SOL identifica a la empresa entera ante SUNAT: no
 * es un dato que tenga que ver quien vende.
 */
export default async function PaginaConfiguracionSunat() {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) redirect("/login");
  if (!["gerencia", "admin"].includes(perfil.rol)) {
    return (
      <EstadoError
        titulo="Solo Gerencia"
        descripcion="Las credenciales fiscales identifican a la empresa ante SUNAT. No están a la vista del resto de roles."
      />
    );
  }

  const [config, estado] = await Promise.all([configFiscal(), estadoConfiguracion()]);

  if (!config.ok) {
    return (
      <EstadoError
        titulo="No se pudo cargar la configuración"
        descripcion="La consulta no llegó a completarse."
        detalle={config.error}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/facturacion" className="text-sm text-[var(--fg-muted)] underline">
          ← Facturación
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Configuración de facturación
        </h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Certificado digital y credenciales SOL. Sin esto se puede emitir y cobrar,
          pero nada llega a SUNAT.
        </p>
      </div>

      {!estado.listo ? (
        <div className="anim-entrada rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm">
          <p className="font-medium">Falta por resolver:</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-[0.8rem]">
            {estado.faltan.map((f) => (
              <li key={f}>· {f}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="anim-entrada rounded-md border border-[var(--ok)] bg-[var(--surface-2)] p-3 text-sm">
          <strong>Todo configurado.</strong> Ambiente:{" "}
          {estado.ambiente === "produccion"
            ? "PRODUCCIÓN — los documentos tienen valor fiscal."
            : "homologación (beta) — sin valor fiscal."}
        </p>
      )}

      {estado.avisoCaducidad ? (
        <p className="anim-entrada rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger)]">
          {estado.avisoCaducidad}
        </p>
      ) : null}

      <FormularioConfigSunat config={config.datos} />

      {/* Lo que hay que pedirle al cliente, escrito donde se necesita. Es la
          lista que más veces se pide por chat y más veces llega incompleta. */}
      <section className="card p-4">
        <h2 className="text-sm font-semibold">Qué hay que pedirle al cliente</h2>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm text-[var(--fg-muted)]">
          <li>
            El <strong>certificado digital .pfx</strong> y su contraseña. Comprueba la
            fecha de caducidad en cuanto llegue: con uno caducado no se puede emitir,
            y SUNAT no lo dice claro.
          </li>
          <li>
            Un <strong>usuario SOL secundario</strong> con el permiso de facturación
            electrónica habilitado, y su clave. El principal no sirve.
          </li>
          <li>
            Los <strong>correlativos de partida</strong> por serie: desde qué número
            sigue su sistema actual, para no repetir ni saltarse ninguno.
          </li>
        </ul>
      </section>
    </div>
  );
}
