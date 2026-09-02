import { Suspense } from "react";
import Link from "next/link";
import { EstadoError, Skeleton } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { EditorPlantillas, plantillas } from "@/modules/mensajes";

import { conteosCatalogo, empresa, series, usuarios } from "../api/consultas";
import { FormEmpresa } from "./form-empresa";
import { TablaSeries } from "./series";
import { TablaUsuarios } from "./usuarios";

/**
 * Configuración.
 *
 * Tres cosas que hasta hoy solo se podían tocar con SQL contra producción, y
 * las tres hacen falta el día de la puesta en marcha:
 *
 *   · los datos fiscales que viajan en cada comprobante,
 *   · **el correlativo de partida de cada serie** — *«los correlativos van a
 *     iniciar desde el número que usted se quedó»* (06:08)—, y
 *   · quién entra y con qué rol.
 *
 * Lo que NO está aquí se dice en voz alta abajo, en lugar de dejar formularios
 * a medias: los catálogos y las credenciales de SUNAT.
 */
export default async function PaginaConfiguracion() {
  const perfil = await perfilActual();
  const rol = perfil?.activo ? perfil.rol : null;
  const esConfig = rol === "gerencia" || rol === "admin";
  const esGerencia = rol === "gerencia";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          La empresa, las series de numeración y los usuarios.
        </p>
      </div>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">Datos de la empresa</h2>
        <Suspense fallback={<Skeleton className="h-72 w-full" />}>
          <BloqueEmpresa puedeEditar={esConfig} />
        </Suspense>
      </section>

      <section className="card p-4">
        <h2 className="mb-1 text-sm font-semibold">Series y correlativos</h2>
        <Suspense fallback={<Skeleton className="h-56 w-full" />}>
          <BloqueSeries puedeEditar={esConfig} />
        </Suspense>
      </section>

      <section className="card p-4">
        <h2 className="mb-1 text-sm font-semibold">Usuarios</h2>
        <p className="mb-3 text-xs text-[var(--fg-subtle)]">
          El alta se hace en Supabase Auth y el perfil se crea solo. Aquí se
          cambia el rol y se activa o desactiva.
        </p>
        <Suspense fallback={<Skeleton className="h-48 w-full" />}>
          <BloqueUsuarios idPropio={perfil?.id ?? null} puedeEditar={esGerencia} />
        </Suspense>
      </section>

      <section className="card p-4">
        <h2 className="mb-1 text-sm font-semibold">Mensajes que se mandan</h2>
        <p className="mb-3 text-xs text-[var(--fg-subtle)]">
          El texto con el que se le pide precio a un proveedor por WhatsApp o
          por correo. Lo que va entre llaves se rellena solo al mandarlo.
        </p>
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          <BloqueMensajes puedeEditar={esConfig || rol === "compras"} />
        </Suspense>
      </section>

      <section className="card p-4">
        <h2 className="mb-1 text-sm font-semibold">Lo que se toca en otro sitio</h2>
        <p className="mb-3 text-xs text-[var(--fg-subtle)]">
          Se dice aquí en lugar de dejar formularios a medias.
        </p>
        <Suspense fallback={<Skeleton className="h-24 w-full" />}>
          <BloqueResto />
        </Suspense>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

async function BloqueMensajes({ puedeEditar }: { puedeEditar: boolean }) {
  const r = await plantillas();
  if (!r.ok) {
    return (
      <EstadoError
        titulo="No se pudieron cargar los mensajes"
        descripcion={r.error}
      />
    );
  }
  return <EditorPlantillas iniciales={r.datos} puedeEditar={puedeEditar} />;
}

async function BloqueEmpresa({ puedeEditar }: { puedeEditar: boolean }) {
  const r = await empresa();
  if (!r.ok) {
    return <EstadoError titulo="No se pudo cargar la empresa" detalle={r.error} />;
  }
  return <FormEmpresa empresa={r.datos} puedeEditar={puedeEditar} />;
}

async function BloqueSeries({ puedeEditar }: { puedeEditar: boolean }) {
  const r = await series();
  if (!r.ok) {
    return <EstadoError titulo="No se pudieron cargar las series" detalle={r.error} />;
  }
  return <TablaSeries series={r.datos} puedeEditar={puedeEditar} />;
}

async function BloqueUsuarios({
  idPropio,
  puedeEditar,
}: {
  idPropio: string | null;
  puedeEditar: boolean;
}) {
  const r = await usuarios();
  if (!r.ok) {
    return <EstadoError titulo="No se pudieron cargar los usuarios" detalle={r.error} />;
  }
  return <TablaUsuarios usuarios={r.datos} idPropio={idPropio} puedeEditar={puedeEditar} />;
}

async function BloqueResto() {
  const r = await conteosCatalogo();

  return (
    <ul className="flex flex-col gap-2 text-sm">
      <li className="flex flex-wrap items-baseline gap-x-2">
        <Link
          href="/facturacion/configuracion"
          className="font-medium text-brand-600 hover:underline"
        >
          Certificado y credenciales de SUNAT →
        </Link>
        <span className="text-xs text-[var(--fg-muted)]">
          El `.pfx`, su clave y el usuario SOL. Se guardan cifrados.
        </span>
      </li>

      <li className="text-xs text-[var(--fg-muted)]">
        <span className="font-medium text-[var(--fg)]">Catálogos.</span>{" "}
        {r.ok ? (
          <>
            Hay {r.datos.marcas} marcas, {r.datos.familias} familias,{" "}
            {r.datos.subfamilias} subfamilias, {r.datos.tipos} tipos y{" "}
            {r.datos.unidades} unidades de medida.
          </>
        ) : (
          <>No se pudieron contar.</>
        )}{" "}
        Todavía no tienen pantalla de edición: se cargan por migración
        (`007_seed_maestros.sql` y `008_taxonomia_rodatech.sql`). Un producto
        nuevo elige entre lo que ya existe.
      </li>
    </ul>
  );
}
