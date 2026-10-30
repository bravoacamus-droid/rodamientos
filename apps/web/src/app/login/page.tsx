import type { Metadata } from "next";
import { Logo } from "@/componentes/logo";
import { Rodamiento } from "@/componentes/rodamiento";
import { FormularioLogin } from "./formulario";

export const metadata: Metadata = { title: "Acceso" };

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ destino?: string; error?: string }>;
}) {
  // El destino se lee aquí, en el servidor, y baja como campo oculto. Así el
  // formulario no necesita useSearchParams(), que a su vez obligaba a un
  // límite de Suspense para poder prerenderizar la página.
  const { destino = "/dashboard", error } = await searchParams;

  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/*
        El panel de marca, solo en pantalla ancha. Es decoración: el formulario
        de la derecha no depende de él, y en el celular se queda solo el
        formulario, que es lo que hay que hacer.
      */}
      <section
        aria-hidden="true"
        className="fondo-marca relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12"
      >
        {/* Movimiento (30/10): los rodamientos giran despacio y una luz
            dorada flota detrás. Nada de esto está donde se lee. */}
        <span className="anim-flotar pointer-events-none absolute left-1/3 top-1/4 size-[26rem] rounded-full bg-[radial-gradient(circle,rgb(253_190_22/0.16),transparent_65%)]" />
        <Rodamiento className="anim-girar-lento pointer-events-none absolute -right-28 -top-28 size-[30rem] text-white/[0.07]" />
        <Rodamiento className="anim-girar-inverso pointer-events-none absolute -bottom-40 -left-24 size-[26rem] text-accent-400/[0.12]" />

        <span className="anim-aparecer-escala relative w-fit rounded-2xl bg-white px-4 py-3 shadow-[0_10px_30px_rgb(0_0_0/0.3)]">
          <Logo className="h-16 w-auto" />
        </span>

        <div className="relative max-w-md">
          <p className="anim-entrar text-sm font-semibold uppercase tracking-[0.18em] text-accent-300" style={{ animationDelay: "150ms" }}>
            Sistema de gestión
          </p>
          <p className="anim-entrar mt-3 text-4xl font-bold leading-tight tracking-tight" style={{ animationDelay: "250ms" }}>
            Su proveedor de soluciones en rodamientos y más
          </p>
          <span className="filo-marca anim-crecer mt-6 block h-1 w-24 rounded-full" style={{ animationDelay: "450ms" }} />
        </div>

        <p className="anim-entrar relative text-sm text-white/80" style={{ animationDelay: "550ms" }}>
          Inversiones Rodatech E.I.R.L. · Lima, Perú
        </p>
      </section>

      <div className="grid place-items-center px-4 py-10">
        <div className="anim-entrar w-full max-w-sm" style={{ animationDelay: "120ms" }}>
          <div className="mb-8 flex flex-col items-center gap-3 text-center lg:hidden">
            <Logo className="h-12 w-auto" />
            <p className="text-sm text-[var(--fg-muted)]">
              Su proveedor de soluciones en rodamientos y más
            </p>
          </div>

          <div className="card elev-3 overflow-hidden">
            <span className="filo-marca block h-1" aria-hidden="true" />
            <div className="p-6 sm:p-7">
              <h1 className="mb-1 text-2xl font-bold tracking-tight text-[var(--titulo)]">
                Iniciar sesión
              </h1>
              <p className="mb-5 text-sm text-[var(--fg-muted)]">
                Acceda con la cuenta que le asignó administración.
              </p>

              {error === "configuracion" ? (
                <p
                  role="alert"
                  className="mb-4 rounded-md bg-[var(--warn-bg)] px-3 py-2 text-sm text-[var(--warn)]"
                >
                  Falta configurar la conexión con la base de datos. Avise al
                  administrador del sistema.
                </p>
              ) : null}

              {error === "inactivo" ? (
                <p
                  role="alert"
                  className="mb-4 rounded-md bg-[var(--warn-bg)] px-3 py-2 text-sm text-[var(--warn)]"
                >
                  Su cuenta está desactivada o no tiene un perfil asignado. Hable
                  con Gerencia.
                </p>
              ) : null}

              <FormularioLogin destino={destino} />
            </div>
          </div>

          <p className="mt-6 text-center text-sm text-[var(--fg-subtle)] lg:hidden">
            Inversiones Rodatech E.I.R.L. · Lima, Perú
          </p>
        </div>
      </div>
    </main>
  );
}
