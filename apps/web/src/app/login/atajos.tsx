import { entrarComoDev } from "./acciones";
import { CUENTAS_DEV, hayAtajos } from "./cuentas-dev";

/**
 * Accesos rápidos por rol, solo para desarrollo.
 *
 * Es un Server Component: si `hayAtajos()` da falso —producción, o sin
 * RODATECH_DEV_PASSWORD— no devuelve nada y ni el marcado ni los correos
 * llegan al navegador. La contraseña no aparece por ningún lado; cada botón
 * solo envía el correo a una Server Action que la resuelve en el servidor.
 */
export function AtajosDev({ destino }: { destino: string }) {
  if (!hayAtajos()) return null;

  return (
    <section className="mt-6 border-t border-[var(--border)] pt-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
          Acceso rápido
        </h2>
        <span className="rounded-sm bg-[var(--warn-bg)] px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-[var(--warn)]">
          Solo desarrollo
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {CUENTAS_DEV.map((cuenta) => (
          <form key={cuenta.correo} action={entrarComoDev}>
            <input type="hidden" name="correo" value={cuenta.correo} />
            <input type="hidden" name="destino" value={destino} />
            <button
              type="submit"
              className="w-full rounded-sm border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2 text-left transition-colors hover:border-brand-600 hover:bg-[var(--surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
            >
              <span className="block text-xs font-medium text-[var(--fg)]">
                {cuenta.rol}
              </span>
              <span className="block truncate text-[0.7rem] text-[var(--fg-subtle)]">
                {cuenta.nombre}
              </span>
            </button>
          </form>
        ))}
      </div>
    </section>
  );
}
