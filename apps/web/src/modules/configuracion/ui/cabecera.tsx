import { IconoNav } from "@/componentes/iconos-nav";
import type { NombreIcono } from "@/lib/navegacion";

/**
 * La cabecera de una pantalla de configuración.
 *
 * Las tres comparten forma a propósito. Hasta el 15/09 la configuración era
 * UNA pantalla con tres bloques encadenados, y al partirla en tres hay un
 * riesgo nuevo: que cada una se vea distinta y parezcan tres sitios sueltos en
 * vez de tres caras de lo mismo. Una cabecera compartida es lo que las ata.
 *
 * El icono repite el del menú, en su pastilla del color de la marca. No es
 * adorno: es lo que confirma, al llegar, que estás donde pulsaste — el mismo
 * dibujo en el menú y en el título.
 */
export function CabeceraConfig({
  icono,
  titulo,
  descripcion,
  accion,
}: {
  icono: NombreIcono;
  titulo: string;
  descripcion: string;
  /** Lo que va a la derecha del todo. Un botón, o nada. */
  accion?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-600/10 text-brand-600"
        >
          <IconoNav nombre={icono} className="size-6" />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
          <p className="text-sm text-[var(--fg-muted)]">{descripcion}</p>
        </div>
      </div>
      {accion ?? null}
    </div>
  );
}
