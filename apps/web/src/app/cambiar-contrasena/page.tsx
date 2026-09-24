import { redirect } from "next/navigation";
import { perfilActual } from "@rodatech/db/servidor";

import { Logo } from "@/componentes/logo";
import { FormPrimeraContrasena } from "@/modules/perfil/ui/primera-contrasena";

// El sufijo lo pone la plantilla del layout raíz («%s · Rodatech ERP»).
export const metadata = { title: "Cambia tu contraseña" };

/**
 * La contraseña del primer día.
 *
 * Aquí llega —obligado, desde el layout del ERP— quien todavía usa la
 * contraseña con la que le crearon la cuenta. Luis, 24/09: «antes de q vean
 * todo pues le salga q tiene q cambiar su contraseña antes de tocar cualquier
 * cosa».
 *
 * Vive FUERA del grupo `(erp)` por dos motivos, y los dos importan:
 *
 *   · Si colgara de él, el redirect del layout se llamaría a sí mismo.
 *   · No tiene menú ni barra. No es descuido: la idea es que no haya nada más
 *     donde ir, y un menú a medio funcionar invita a probar.
 */
export default async function PaginaCambiarContrasena() {
  const perfil = await perfilActual().catch(() => null);

  // Quien ya la cambió no tiene nada que hacer aquí. Sin esto, la pantalla
  // quedaría accesible para siempre escribiendo la dirección a mano.
  if (perfil && !perfil.debe_cambiar_contrasena) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--surface-2)] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Logo className="h-12 w-auto" priority />
          <p className="text-sm text-[var(--fg-muted)]">
            Su proveedor de soluciones en rodamientos y más
          </p>
        </div>

        <div className="card p-5">
          <h1 className="text-lg font-semibold">Cambia tu contraseña</h1>
          {/*
            Se dice POR QUÉ, no solo QUÉ. Quien llega aquí acaba de recibir una
            contraseña de manos de su jefe y no entiende por qué el sistema le
            para; sin esta frase parece un error.
          */}
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            {perfil?.nombre ? `${perfil.nombre}, ` : ""}
            entraste con la contraseña que te dieron al crear tu cuenta. Elige
            una tuya para continuar: nadie más va a conocerla, ni siquiera
            quien te dio de alta.
          </p>

          <FormPrimeraContrasena />
        </div>
      </div>
    </main>
  );
}
