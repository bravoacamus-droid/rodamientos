import type { Metadata } from "next";
import { Logo } from "@/componentes/logo";
import { FormularioLogin } from "./formulario";
import { AtajosDev } from "./atajos";

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
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo className="h-12 w-auto" />
          <p className="text-sm text-[var(--fg-muted)]">
            Su proveedor de soluciones en rodamientos y más
          </p>
        </div>

        <div className="card p-6">
          <h1 className="mb-1 text-lg font-semibold">Iniciar sesión</h1>
          <p className="mb-5 text-sm text-[var(--fg-muted)]">
            Acceda con la cuenta que le asignó administración.
          </p>

          {error === "configuracion" ? (
            <p
              role="alert"
              className="mb-4 rounded-sm bg-[var(--warn-bg)] px-3 py-2 text-sm text-[var(--warn)]"
            >
              Falta configurar la conexión con la base de datos. Avise al
              administrador del sistema.
            </p>
          ) : null}

          <FormularioLogin destino={destino} />
          <AtajosDev destino={destino} />
        </div>

        <p className="mt-6 text-center text-xs text-[var(--fg-subtle)]">
          Inversiones Rodatech E.I.R.L. · Lima, Perú
        </p>
      </div>
    </main>
  );
}
