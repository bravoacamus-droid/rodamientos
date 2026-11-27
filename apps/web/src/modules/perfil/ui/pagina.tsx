import { redirect } from "next/navigation";
import { EstadoError } from "@rodatech/ui";

import { misPermisos } from "@/lib/permisos";
import { misAvisos, PanelAvisos } from "@/modules/avisos";

import { miPerfil } from "../api/consultas";
import { FormContrasena, FormMisDatos } from "./formulario";
import { RodamientoMarca } from "@/componentes/marca-rodatech";
import { SeccionNumerada } from "@/modules/configuracion/ui/seccion";

/**
 * Mi perfil.
 *
 * Luis, 15/09, enseñando el menú de arriba a la derecha: *«falta editar perfil
 * para que pueda editar su perfil»*. Y no había nada: ese menú solo sabía
 * cerrar sesión.
 *
 * La ve CUALQUIERA con sesión, y ahí está la diferencia con la pantalla de
 * usuarios de configuración: aquella es «los demás» y la ve gerencia; esta es
 * «yo» y la ve todo el mundo. Por eso vive en su propio módulo y no cuelga de
 * configuración, que es de gerencia y administración.
 */
export default async function PaginaMiPerfil() {
  // El nombre del rol sale de la base: puede ser uno creado por gerencia (143).
  const [r, { nombreRol }, avisos] = await Promise.all([miPerfil(), misPermisos(), misAvisos()]);

  if (!r.ok) {
    return (
      <EstadoError
        titulo="No se pudo cargar tu perfil"
        descripcion="La consulta no llegó a completarse. No se ha modificado nada."
        detalle={r.error}
      />
    );
  }
  if (!r.datos) redirect("/login");

  const perfil = r.datos;

  return (
    <div className="flex flex-col gap-5">
      {/*
        Cabecera de marca (27/11), como la portada del tablero: el azul con el
        rodamiento de agua y la barra dorada. Es «tu» pantalla, y es la única
        del ERP que habla de una persona y no de un documento.
      */}
      <section className="fondo-marca relative overflow-hidden rounded-2xl px-5 py-6 text-white shadow-[var(--elev-2)] sm:px-8">
        <RodamientoMarca
          bolas="currentColor"
          className="pointer-events-none absolute -right-16 -top-24 size-[18rem] text-white/[0.06]"
        />
        <div className="relative flex min-w-0 flex-wrap items-center gap-4">
          {/*
            Las iniciales, no una foto.

            No hay dónde subir una, y un icono de persona genérico repetido en
            todas las fichas no distingue a nadie. Dos letras sí.
          */}
          <span
            aria-hidden="true"
            className="flex size-16 shrink-0 items-center justify-center rounded-full bg-accent-400 text-2xl font-extrabold text-brand-950 ring-4 ring-white/20"
          >
            {iniciales(perfil.nombre)}
          </span>
          <div className="min-w-0">
            <p className="text-base font-semibold uppercase tracking-wide text-white">Mi perfil</p>
            <h1 className="break-words text-3xl font-bold tracking-tight text-white">{perfil.nombre}</h1>
            <span className="mt-2 block h-2 w-24 -skew-x-[30deg] rounded-sm bg-accent-400" aria-hidden="true" />
            <p className="mt-2 text-lg text-white">{nombreRol ?? perfil.rol}</p>
          </div>
        </div>
      </section>

      <SeccionNumerada
        numero={1}
        titulo="Tus datos"
        ayuda="Tu nombre, tu cargo y tu teléfono."
      >
        <FormMisDatos perfil={perfil} />
      </SeccionNumerada>

      {/*
        162. Willy: «pero no te llega como una alerta, tú tienes que entrar y
        ver» (25:21). Aquí es donde se enciende que le llegue.
      */}
      <SeccionNumerada
        id="avisos"
        numero={2}
        titulo="Avisos en el celular"
        ayuda="Para que las alertas te lleguen al teléfono sin tener que entrar a mirarlas."
      >
        {avisos.ok ? (
          <PanelAvisos aparatos={avisos.datos.aparatos} clavePublica={avisos.datos.clavePublica} />
        ) : (
          <p className="text-base text-[var(--danger)]">
            No se pudieron leer tus aparatos: {avisos.error}
          </p>
        )}
      </SeccionNumerada>

      <SeccionNumerada
        numero={3}
        titulo="Tu contraseña"
        ayuda="Si sigues entrando con la que te dieron al principio, cámbiala: es la misma para todos."
      >
        <FormContrasena />
      </SeccionNumerada>

      {/*
        Lo que no se toca aquí, dicho en voz alta en vez de con campos
        apagados sin explicación.
      */}
      <SeccionNumerada tono="aviso" titulo="Lo que no puedes cambiar tú">
        <dl className="grid gap-x-6 gap-y-3 text-base @container sm:grid-cols-2">
          <Dato etiqueta="Correo con el que entras">
            {perfil.email ?? "—"}
          </Dato>
          <Dato etiqueta="Rol">{nombreRol ?? perfil.rol}</Dato>
          <Dato etiqueta="Último acceso">
            {/* En hora de Lima: cortar el ISO enseñaba la hora UTC, cinco
                horas por delante (revisión por módulos del 02/10). */}
            {perfil.ultimo_acceso
              ? new Intl.DateTimeFormat("es-PE", {
                  timeZone: "America/Lima",
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(perfil.ultimo_acceso))
              : "—"}
          </Dato>
        </dl>
        <p className="text-base text-[var(--fg-muted)]">
          El correo es la credencial con la que entras y el rol decide lo que
          puedes hacer. Los dos los cambia <strong>Gerencia</strong>, en
          Configuración, «Usuarios».
        </p>
      </SeccionNumerada>
    </div>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-[var(--fg-muted)]">{etiqueta}</dt>
      {/* Sin `truncate`: un correo largo cortado con «…» ya no sirve para
          saber con cuál entras (27/11). */}
      <dd className="min-w-0 break-words font-semibold">{children}</dd>
    </div>
  );
}

/** Dos letras: la primera del nombre y la del primer apellido. */
function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase();
  return (partes[0]![0]! + partes[1]![0]!).toUpperCase();
}
