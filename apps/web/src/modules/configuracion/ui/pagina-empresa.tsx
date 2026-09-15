import { Suspense } from "react";
import { EstadoError, Skeleton } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { conteosCatalogo, cuentasBancarias, empresa } from "../api/consultas";
import { CabeceraConfig } from "./cabecera";
import { CuentasParaCobrar } from "./cuentas";
import { FormEmpresa } from "./form-empresa";

/**
 * Datos de la empresa.
 *
 * Lo que viaja dentro de cada comprobante: quién emite, desde dónde y con qué
 * impuestos. Se toca una vez, el día de la puesta en marcha — y después solo
 * cuando cambia la norma o se muda el local.
 *
 * Era el primer bloque de la pantalla única de configuración. Se separa el
 * 15/09 porque no tiene nada que ver con los otros dos: cambiar el RUC y dar
 * de alta a un vendedor no se hacen ni el mismo día ni por la misma persona.
 */
export default async function PaginaConfigEmpresa() {
  const perfil = await perfilActual();
  const rol = perfil?.activo ? perfil.rol : null;
  const puedeEditar = rol === "gerencia" || rol === "admin";

  return (
    <div className="flex flex-col gap-5">
      <CabeceraConfig
        icono="empresa"
        titulo="Datos de la empresa"
        descripcion="Lo que viaja dentro de cada comprobante: quién emite, desde dónde y con qué impuestos."
      />

      <section className="card p-4">
        <Suspense fallback={<Skeleton className="h-72 w-full" />}>
          <BloqueEmpresa puedeEditar={puedeEditar} />
        </Suspense>
      </section>

      {/*
        Las cuentas para cobrar, en su propio bloque.

        Existen desde la 064 y salen impresas en cada cotización y factura, y
        hasta el 15/09 se daban de alta con SQL contra producción: no había
        pantalla. Luis: *«no puedo ver las cuentas que se crearon, que están en
        cotización»*. El caso veintisiete del patrón de esta casa.
      */}
      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">Cuentas para cobrar</h2>
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          <BloqueCuentas puedeEditar={puedeEditar} />
        </Suspense>
      </section>

      {/*
        Lo que todavía no tiene pantalla, dicho en voz alta.

        Es una costumbre de esta casa: se cuenta lo que falta en vez de dejar
        un formulario a medias que promete algo que no hace.
      */}
      <Suspense fallback={<Skeleton className="h-20 w-full" />}>
        <BloqueCatalogos />
      </Suspense>
    </div>
  );
}

async function BloqueEmpresa({ puedeEditar }: { puedeEditar: boolean }) {
  const r = await empresa();
  if (!r.ok) {
    return <EstadoError titulo="No se pudo cargar la empresa" detalle={r.error} />;
  }
  return <FormEmpresa empresa={r.datos} puedeEditar={puedeEditar} />;
}

async function BloqueCuentas({ puedeEditar }: { puedeEditar: boolean }) {
  const r = await cuentasBancarias();
  if (!r.ok) {
    return <EstadoError titulo="No se pudieron cargar las cuentas" detalle={r.error} />;
  }
  return <CuentasParaCobrar cuentas={r.datos} puedeEditar={puedeEditar} />;
}

async function BloqueCatalogos() {
  const r = await conteosCatalogo();

  return (
    <section className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-4">
      <h2 className="text-sm font-semibold">Los catálogos todavía no se editan aquí</h2>
      <p className="mt-1 text-sm text-[var(--fg-muted)]">
        {r.ok ? (
          <>
            Hay <strong className="tabular text-[var(--fg)]">{r.datos.marcas}</strong>{" "}
            marcas,{" "}
            <strong className="tabular text-[var(--fg)]">{r.datos.familias}</strong>{" "}
            familias,{" "}
            <strong className="tabular text-[var(--fg)]">{r.datos.subfamilias}</strong>{" "}
            subfamilias,{" "}
            <strong className="tabular text-[var(--fg)]">{r.datos.tipos}</strong> tipos y{" "}
            <strong className="tabular text-[var(--fg)]">{r.datos.unidades}</strong>{" "}
            unidades de medida.
          </>
        ) : (
          <>No se pudieron contar.</>
        )}{" "}
        Se cargan por migración, y un producto nuevo elige entre lo que ya
        existe.
      </p>
    </section>
  );
}
