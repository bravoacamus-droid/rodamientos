/**
 * Una sección numerada de un formulario de gestión (27/11).
 *
 * El mismo dibujo que `/accesibilidad`, que Luis ya vio: el círculo azul con
 * el número, el título en `text-xl` negrita y una frase de ayuda debajo. Los
 * números no son adorno: dicen «esto es un recorrido de tantos pasos» y dejan
 * decir por teléfono «baja a la 3, la de las cuentas».
 *
 * La usan Configuración (empresa, SUNAT, usuarios, permisos) y Mi perfil. Si
 * otra pantalla la necesita, el sitio natural es `@rodatech/ui`; no se movió
 * allí hoy porque el paquete está cerrado para este rediseño.
 */
export function SeccionNumerada({
  numero,
  titulo,
  ayuda,
  accion,
  id,
  tono = "normal",
  className = "",
  children,
}: {
  numero?: number;
  titulo: string;
  ayuda?: React.ReactNode;
  /** Un botón a la derecha del título. */
  accion?: React.ReactNode;
  id?: string;
  /** `aviso`: lo que todavía falta, con fondo suave y borde discontinuo. */
  tono?: "normal" | "aviso";
  className?: string;
  children?: React.ReactNode;
}) {
  const idTitulo = id ? `${id}-titulo` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={idTitulo}
      className={`${
        tono === "aviso"
          ? "rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)]"
          : "card elev-1"
      } flex min-w-0 scroll-mt-20 flex-col gap-4 p-4 sm:p-5 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {numero !== undefined ? (
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-base font-bold text-white"
              aria-hidden="true"
            >
              {numero}
            </span>
          ) : (
            <span className="mt-1.5 block h-5 w-2 shrink-0 -skew-x-[20deg] rounded-sm bg-accent-400" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <h2 id={idTitulo} className="text-xl font-bold leading-snug text-[var(--titulo)]">
              {titulo}
            </h2>
            {ayuda ? <div className="mt-0.5 text-base text-[var(--fg-muted)]">{ayuda}</div> : null}
          </div>
        </div>
        {accion ?? null}
      </div>
      {children}
    </section>
  );
}
