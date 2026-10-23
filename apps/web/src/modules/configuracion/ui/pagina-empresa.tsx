import { Suspense } from "react";
import { EstadoError, Skeleton, formatearFechaHora } from "@rodatech/ui";
import { DatabaseBackup, TriangleAlert } from "lucide-react";
import { AvisoSinPermiso } from "@/componentes/sin-permiso";
import { misPermisos } from "@/lib/permisos";
import { avisoSinPermiso } from "@/lib/permisos-comun";

import { conteosCatalogo, cuentasBancarias, empresa, ultimosRespaldos } from "../api/consultas";
import { DIAS_MAXIMOS_SIN_COPIA, estadoRespaldo, haceCuanto } from "../dominio/respaldo";
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
  // «Datos de la empresa y numeración» en la matriz (143).
  const permisos = await misPermisos();
  const puedeEditar = permisos.tiene("configuracion", "editar");
  if (!permisos.tiene("configuracion", "ver")) {
    return <AvisoSinPermiso mensaje={avisoSinPermiso("configuracion", "ver", permisos.nombreRol)} />;
  }

  // Solo a quien lo puede leer (147): a otro rol la base le devuelve cero
  // filas, y eso se pintaría como «nunca se hizo una copia».
  const veRespaldos = permisos.rol === "gerencia" || permisos.rol === "admin";

  return (
    <div className="flex flex-col gap-5">
      <CabeceraConfig
        icono="empresa"
        titulo="Datos de la empresa"
        descripcion="Lo que viaja dentro de cada comprobante: quién emite, desde dónde y con qué impuestos."
      />

      {veRespaldos ? (
        <Suspense fallback={<Skeleton className="h-20 w-full" />}>
          <BloqueRespaldo />
        </Suspense>
      ) : null}

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

/**
 * Cuándo fue la última copia de seguridad (147).
 *
 * Arriba del todo y en ámbar cuando toca: el 23/10 se descubrió que la última
 * era del 07/10 y le faltaba un tercio de la base, y nadie lo sabía porque la
 * única constancia era una carpeta en un disco. Lo dice en palabras de Willy
 * —«copia de seguridad», no «respaldo» ni «backup»— y con lo que hay que
 * hacer, no con lo que falló.
 */
async function BloqueRespaldo() {
  const r = await ultimosRespaldos();
  if (!r.ok) return null;
  const e = estadoRespaldo(r.datos.ultimaBuena, r.datos.ultima, new Date());
  const alerta = e.nivel !== "bien" || e.falloDespues;

  return (
    <section
      className={
        alerta
          ? "flex gap-3 rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-4"
          : "flex gap-3 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-4"
      }
    >
      {alerta ? (
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-[var(--warn)]" aria-hidden />
      ) : (
        <DatabaseBackup className="mt-0.5 size-5 shrink-0 text-[var(--ok)]" aria-hidden />
      )}
      <div className="text-sm">
        <h2 className="font-semibold">Copia de seguridad</h2>
        {e.nivel === "nunca" ? (
          <p className="mt-1">
            No hay ninguna copia de seguridad apuntada. Si hoy se pierde la base, se pierde todo.
            Pide a soporte que haga una.
          </p>
        ) : (
          <>
            <p className="mt-1">
              La última copia completa es de <strong>{haceCuanto(e.dias)}</strong> (
              {formatearFechaHora(e.ultimaBuena.fecha)}): {e.ultimaBuena.tablas} tablas y{" "}
              {e.ultimaBuena.filas.toLocaleString("es-PE")} registros.
            </p>
            {e.nivel === "atrasada" ? (
              <p className="mt-1 font-medium">
                Tiene más de {DIAS_MAXIMOS_SIN_COPIA} días. Si hoy se pierde la base, se pierde todo
                lo de después. Pide a soporte que haga una copia.
              </p>
            ) : null}
            {e.falloDespues ? (
              <p className="mt-1 font-medium">
                La última vez que se intentó, la copia salió incompleta. Pide a soporte que la
                revise.
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
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
      {/*
        Decía «todavía no se editan aquí… se cargan por migración»: jerga, y
        además ya no era verdad. Desde la ficha del producto se crean marca,
        familia y subfamilia (§AM.7b). Se dice dónde, que es lo que se busca al
        leer esto (revisión por módulos del 02/10).
      */}
      <h2 className="text-sm font-semibold">Marcas, familias y unidades</h2>
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
        Una marca, familia o subfamilia nueva se crea al dar de alta el
        producto, desde su propia ficha: ahí mismo, al lado de cada lista,
        está el botón para añadirla.
      </p>
    </section>
  );
}
