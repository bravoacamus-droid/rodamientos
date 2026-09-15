import { Suspense } from "react";
import Link from "next/link";
import { EstadoError, Skeleton } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { estadoConfiguracion } from "@/modules/facturacion";

import { series } from "../api/consultas";
import { CabeceraConfig } from "./cabecera";
import { TablaSeries } from "./series";

/**
 * SUNAT y numeración.
 *
 * Dos cosas que se tocan el mismo día y por el mismo motivo —poder emitir—, y
 * que hasta el 15/09 vivían en dos sitios distintos: las series, al final de
 * la pantalla de configuración; el certificado, colgando de facturación.
 *
 * Luis: *«configuración de SUNAT con sus series y correlativos»*. Aquí están.
 *
 * El nombre es «SUNAT y numeración» y no «SUNAT» a secas porque dentro hay
 * series que no son de SUNAT: la cotización, la orden de compra, el ajuste de
 * inventario y la recepción se numeran para nosotros. Llamar SUNAT a la
 * pantalla sería enseñar mal lo que hay dentro.
 *
 * El certificado NO se duplica aquí: sigue teniendo su propia pantalla, con su
 * propio candado de rol. Lo que se trae es el ESTADO —qué falta para poder
 * emitir— que es lo que hay que saber antes de decidir si hace falta entrar.
 */
export default async function PaginaConfigSunat() {
  const perfil = await perfilActual();
  const rol = perfil?.activo ? perfil.rol : null;
  const puedeEditar = rol === "gerencia" || rol === "admin";

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
        <h2 className="text-sm font-semibold">Series y correlativos</h2>
        <Suspense fallback={<Skeleton className="h-56 w-full" />}>
          <BloqueSeries puedeEditar={puedeEditar} />
        </Suspense>
      </section>
    </div>
  );
}

/**
 * Qué falta para poder emitir, y por dónde se arregla.
 *
 * Verde o ámbar, y en el ámbar la lista de lo que falta: «no se puede emitir»
 * sin decir por qué es lo que hace que alguien llame por teléfono. El mismo
 * criterio que el aviso de la pantalla de facturación, que es de donde sale.
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">
            {estado.listo
              ? "Todo listo para emitir ante SUNAT"
              : "Se puede emitir y cobrar, pero nada llega a SUNAT todavía"}
          </h2>

          {estado.listo ? (
            <p className="mt-1 text-sm">
              Ambiente:{" "}
              <strong>
                {estado.ambiente === "produccion" ? "producción" : "pruebas (beta)"}
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
        </div>

        {/* Un botón, no un enlace en gris: es el camino para arreglar lo de
            arriba, y en esta casa lo que se pulsa tiene que parecer que se
            pulsa. */}
        <Link
          href="/facturacion/configuracion"
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md bg-brand-600 px-3.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] md:h-control-md"
        >
          Certificado y credenciales
        </Link>
      </div>
    </section>
  );
}

async function BloqueSeries({ puedeEditar }: { puedeEditar: boolean }) {
  const r = await series();
  if (!r.ok) {
    return <EstadoError titulo="No se pudieron cargar las series" detalle={r.error} />;
  }
  return <TablaSeries series={r.datos} puedeEditar={puedeEditar} />;
}
