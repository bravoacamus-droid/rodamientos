import type { Metadata } from "next";
import { LogoRodatech, RodamientoMarca } from "@/componentes/marca-rodatech";
import { FormularioLogin } from "./formulario";

export const metadata: Metadata = { title: "Acceso" };

/*
 * Rediseño del 26/11: la pantalla entera es de la marca —azul noche con la
 * cuadrícula de un plano técnico— y el formulario flota encima en blanco.
 * Antes era media pantalla azul y media gris, y el formulario quedaba
 * perdido en el gris.
 *
 * Lo que no cambia, porque es para Willy: los campos son más altos y con
 * letra de 18 px, las etiquetas de 16 px, y «Entrar» es el único bloque
 * dorado de la pantalla, imposible de no ver.
 */
const CUADRICULA = {
  backgroundImage: [
    "linear-gradient(rgb(255 255 255/0.045) 1px, transparent 1px)",
    "linear-gradient(90deg, rgb(255 255 255/0.045) 1px, transparent 1px)",
    "linear-gradient(rgb(255 255 255/0.02) 1px, transparent 1px)",
    "linear-gradient(90deg, rgb(255 255 255/0.02) 1px, transparent 1px)",
  ].join(","),
  backgroundSize: "96px 96px, 96px 96px, 24px 24px, 24px 24px",
};

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
    <main className="relative isolate min-h-dvh overflow-hidden bg-brand-950 text-white">
      {/* Fondo: cuadrícula de plano, una luz dorada y el rodamiento de la
          marca girando despacio. Decoración pura, nada de esto se lee. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(1100px_700px_at_15%_20%,#10527c_0%,transparent_65%),radial-gradient(900px_600px_at_100%_100%,#0b3d5e_0%,transparent_70%)]" />
        <div className="absolute inset-0 [mask-image:radial-gradient(ellipse_at_30%_40%,#000_30%,transparent_80%)]" style={CUADRICULA} />
        <span className="anim-flotar absolute left-[8%] top-[18%] size-[34rem] rounded-full bg-[radial-gradient(circle,rgb(253_190_22/0.14),transparent_65%)]" />
        <RodamientoMarca bolas="currentColor" className="anim-girar-lento absolute -bottom-[22rem] -left-[16rem] size-[46rem] text-white/[0.05]" />
        <RodamientoMarca bolas="currentColor" className="anim-girar-inverso absolute -right-24 -top-24 hidden size-[22rem] text-white/[0.04] lg:block" />
      </div>

      <div className="mx-auto grid min-h-dvh w-full max-w-7xl grid-cols-1 items-center gap-10 px-4 py-10 sm:px-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16 lg:px-12">
        {/* La marca. En el celular se queda solo el logotipo y la frase
            corta, encima del formulario. */}
        <section className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <p className="anim-entrar text-sm font-semibold uppercase tracking-[0.32em] text-white/75">
            Inversiones · E.I.R.L.
          </p>
          <LogoRodatech className="anim-aparecer-escala mt-3 text-5xl sm:text-6xl xl:text-7xl" />
          <span
            aria-hidden="true"
            className="anim-crecer mt-4 block h-2 w-40 -skew-x-[30deg] rounded-sm bg-accent-400 lg:ml-24 lg:w-72"
            style={{ animationDelay: "300ms" }}
          />

          <h2
            className="anim-entrar mt-10 hidden max-w-xl text-4xl font-bold leading-tight tracking-tight lg:block xl:text-5xl"
            style={{ animationDelay: "200ms" }}
          >
            Rodamientos y repuestos industriales,{" "}
            <span className="text-accent-300">sin parar la planta.</span>
          </h2>
          <p
            className="anim-entrar mt-6 text-lg text-white/80 lg:max-w-lg"
            style={{ animationDelay: "300ms" }}
          >
            Su proveedor de soluciones en rodamientos y más.
          </p>
        </section>

        <div className="anim-entrar mx-auto w-full max-w-md lg:mx-0 lg:justify-self-end" style={{ animationDelay: "120ms" }}>
          <div className="overflow-hidden rounded-2xl bg-[var(--surface)] text-[var(--fg)] shadow-[0_30px_80px_-20px_rgb(0_0_0/0.6),0_0_0_1px_rgb(255_255_255/0.06)]">
            <span className="block h-1.5 bg-accent-400" aria-hidden="true" />
            <div className="p-6 sm:p-9">
              <h1 className="text-3xl font-bold tracking-tight text-[var(--titulo)]">
                Iniciar sesión
              </h1>
              <p className="mb-7 mt-2 text-base text-[var(--fg-muted)]">
                Entre con el correo y la contraseña que le dio administración.
              </p>

              {error === "configuracion" ? (
                <p
                  role="alert"
                  className="mb-5 rounded-md bg-[var(--warn-bg)] px-4 py-3 text-base text-[var(--warn)]"
                >
                  Falta configurar la conexión con la base de datos. Avise al
                  administrador del sistema.
                </p>
              ) : null}

              {error === "inactivo" ? (
                <p
                  role="alert"
                  className="mb-5 rounded-md bg-[var(--warn-bg)] px-4 py-3 text-base text-[var(--warn)]"
                >
                  Su cuenta está desactivada o no tiene un perfil asignado. Hable
                  con Gerencia.
                </p>
              ) : null}

              <FormularioLogin destino={destino} />
            </div>
          </div>

          <p className="mt-6 text-center text-sm text-white/70">
            Inversiones Rodatech E.I.R.L. · Lima, Perú
          </p>
        </div>
      </div>
    </main>
  );
}
