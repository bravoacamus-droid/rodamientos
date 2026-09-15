import { redirect } from "next/navigation";
import { EstadoError } from "@rodatech/ui";

import { miPerfil } from "../api/consultas";
import { FormContrasena, FormMisDatos } from "./formulario";

/** Cómo se llama cada rol de cara a una persona. */
const ETIQUETA_ROL: Record<string, string> = {
  gerencia: "Gerencia",
  admin: "Administración",
  ventas: "Ventas",
  almacen: "Almacén",
  compras: "Compras",
  cobranzas: "Cobranzas",
};

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
  const r = await miPerfil();

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
      <div className="flex min-w-0 items-start gap-3">
        {/*
          Las iniciales, no una foto.

          No hay dónde subir una, y un icono de persona genérico repetido en
          todas las fichas no distingue a nadie. Dos letras sí.
        */}
        <span
          aria-hidden="true"
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-600 text-base font-semibold text-white"
        >
          {iniciales(perfil.nombre)}
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{perfil.nombre}</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            {ETIQUETA_ROL[perfil.rol] ?? perfil.rol}
            {perfil.cargo ? ` · ${perfil.cargo}` : ""}
          </p>
        </div>
      </div>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">Tus datos</h2>
        <FormMisDatos perfil={perfil} />
      </section>

      <section className="card p-4">
        <h2 className="text-sm font-semibold">Tu contraseña</h2>
        <p className="mb-3 text-sm text-[var(--fg-muted)]">
          Si sigues entrando con la que te dieron al principio, cámbiala: es la
          misma para todos.
        </p>
        <FormContrasena />
      </section>

      {/*
        Lo que no se toca aquí, dicho en voz alta en vez de con campos
        apagados sin explicación.
      */}
      <section className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-4">
        <h2 className="text-sm font-semibold">Lo que no puedes cambiar tú</h2>
        <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Dato etiqueta="Correo con el que entras">
            {perfil.email ?? "—"}
          </Dato>
          <Dato etiqueta="Rol">{ETIQUETA_ROL[perfil.rol] ?? perfil.rol}</Dato>
          <Dato etiqueta="Último acceso">
            {perfil.ultimo_acceso ? perfil.ultimo_acceso.slice(0, 16).replace("T", " ") : "—"}
          </Dato>
        </dl>
        <p className="mt-3 text-sm text-[var(--fg-muted)]">
          El correo es la credencial con la que entras y el rol decide lo que
          puedes hacer. Los dos los cambia <strong>Gerencia</strong>, desde
          Configuración → Usuarios.
        </p>
      </section>
    </div>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--fg-subtle)]">{etiqueta}</dt>
      <dd className="min-w-0 truncate">{children}</dd>
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
