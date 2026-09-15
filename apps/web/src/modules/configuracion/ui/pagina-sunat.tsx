import { Suspense } from "react";
import { EstadoError, Skeleton } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import {
  FormularioConfigSunat,
  configFiscal,
  estadoConfiguracion,
} from "@/modules/facturacion";

import { series } from "../api/consultas";
import { CabeceraConfig } from "./cabecera";
import { TablaSeries } from "./series";

/**
 * SUNAT y numeración.
 *
 * Todo lo que hace falta para emitir, en una pantalla: con qué se firma
 * —certificado y usuario SOL— y con qué número sale cada documento.
 *
 * Hasta el 15/09 estaban en dos sitios: las series al final de la pantalla
 * única de configuración, y el certificado colgando de facturación, que es
 * donde se construyó primero. Luis: *«en lo que es SUNAT y numeración falta la
 * configuración de SUNAT… lo ponemos en un módulo dentro de configuración»*.
 *
 * Sí: es configuración. Que estuviera bajo facturación era un accidente de la
 * historia, no una decisión — y obligaba a saber que para cambiar el
 * certificado había que entrar a emitir una factura.
 *
 * `/facturacion/configuracion` sigue existiendo y redirige aquí: es la
 * dirección que enlazaban las pantallas viejas.
 *
 * El nombre es «SUNAT y numeración» y no «SUNAT» a secas porque dentro hay
 * series que no son de SUNAT —cotización, orden de compra, ajuste de
 * inventario, recepción— y se numeran para nosotros.
 */
export default async function PaginaConfigSunat() {
  const perfil = await perfilActual();
  const rol = perfil?.activo ? perfil.rol : null;
  const puedeEditar = rol === "gerencia" || rol === "admin";

  /*
    El candado, y no solo el del menú.

    El usuario SOL identifica a la empresa entera ante SUNAT: no es un dato que
    tenga que ver quien vende. Lo traía la pantalla de facturación y se
    mantiene aquí — una pantalla se alcanza escribiendo su dirección, y el menú
    solo decide qué se enseña.
  */
  if (!puedeEditar) {
    return (
      <EstadoError
        titulo="Solo Gerencia y Administración"
        descripcion="Las credenciales fiscales identifican a la empresa ante SUNAT. No están a la vista del resto de roles."
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <CabeceraConfig
        icono="sunat"
        titulo="SUNAT y numeración"
        descripcion="Con qué se firma ante SUNAT, y con qué número sale cada documento."
      />

      <Suspense fallback={<Skeleton className="h-28 w-full" />}>
        <BloqueEstado />
      </Suspense>

      <section className="card p-4">
        <h2 className="text-sm font-semibold">Certificado y credenciales</h2>
        <p className="mb-3 text-sm text-[var(--fg-muted)]">
          El <code>.pfx</code>, su clave y el usuario SOL. Se guardan cifrados.
          Sin esto se puede emitir y cobrar, pero nada llega a SUNAT.
        </p>
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <BloqueCredenciales />
        </Suspense>
      </section>

      <section className="card p-4">
        <h2 className="text-sm font-semibold">Series y correlativos</h2>
        <Suspense fallback={<Skeleton className="h-56 w-full" />}>
          <BloqueSeries puedeEditar={puedeEditar} />
        </Suspense>
      </section>

      {/* Lo que hay que pedirle al cliente, escrito donde se necesita. Es la
          lista que más veces se pide por chat y más veces llega incompleta. */}
      <section className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-4">
        <h2 className="text-sm font-semibold">Qué hay que pedirle a Willy</h2>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm text-[var(--fg-muted)]">
          <li>
            El <strong>certificado digital .pfx</strong> y su contraseña.
            Comprueba la fecha de caducidad en cuanto llegue: con uno caducado
            no se puede emitir, y SUNAT no lo dice claro.
          </li>
          <li>
            Un <strong>usuario SOL secundario</strong> con el permiso de
            facturación electrónica habilitado, y su clave. El principal no
            sirve.
          </li>
          <li>
            Los <strong>correlativos de partida</strong> por serie: desde qué
            número sigue su sistema actual, para no repetir ni saltarse ninguno.
          </li>
        </ul>
      </section>
    </div>
  );
}

/**
 * Qué falta para poder emitir, y en qué ambiente se está.
 *
 * Verde o ámbar, y en el ámbar la lista de lo que falta: «no se puede emitir»
 * sin decir por qué es lo que hace que alguien llame por teléfono.
 */
async function BloqueEstado() {
  const estado = await estadoConfiguracion();

  return (
    <section
      className={`rounded-lg border p-4 ${
        estado.listo
          ? "border-[var(--ok)] bg-[var(--ok-bg)]"
          : "border-[var(--warn)] bg-[var(--warn-bg)]"
      }`}
    >
      <h2 className="text-sm font-semibold">
        {estado.listo
          ? "Todo listo para emitir ante SUNAT"
          : "Se puede emitir y cobrar, pero nada llega a SUNAT todavía"}
      </h2>

      {estado.listo ? (
        <p className="mt-1 text-sm">
          Ambiente:{" "}
          <strong>
            {estado.ambiente === "produccion"
              ? "PRODUCCIÓN — los documentos tienen valor fiscal"
              : "homologación (beta) — sin valor fiscal"}
          </strong>
          .
        </p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1 text-sm">
          {estado.faltan.map((f) => (
            <li key={f} className="flex gap-2">
              <span aria-hidden="true">·</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}

      {estado.avisoCaducidad ? (
        <p className="mt-1.5 text-sm font-medium">{estado.avisoCaducidad}</p>
      ) : null}
    </section>
  );
}

async function BloqueCredenciales() {
  const r = await configFiscal();
  if (!r.ok) {
    return (
      <EstadoError
        titulo="No se pudo cargar la configuración de SUNAT"
        descripcion="La consulta no llegó a completarse."
        detalle={r.error}
      />
    );
  }
  return <FormularioConfigSunat config={r.datos} />;
}

async function BloqueSeries({ puedeEditar }: { puedeEditar: boolean }) {
  const r = await series();
  if (!r.ok) {
    return <EstadoError titulo="No se pudieron cargar las series" detalle={r.error} />;
  }
  return <TablaSeries series={r.datos} puedeEditar={puedeEditar} />;
}
