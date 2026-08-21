import Image from "next/image";

/**
 * Logotipo de Rodatech.
 *
 * El archivo está en public/logo.png. Se sirve con `priority` en el login
 * porque es lo único que se ve mientras carga la página.
 */
export function Logo({
  className,
  priority = true,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/logo.png"
      alt="Inversiones Rodatech E.I.R.L."
      width={320}
      height={96}
      priority={priority}
      className={className}
    />
  );
}
