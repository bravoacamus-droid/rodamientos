import Image from "next/image";
import { cn } from "@/lib/utils";

/** Logotipo completo de Inversiones Rodatech E.I.R.L. */
export function Logo({
  height = 34,
  className,
  priority,
}: {
  height?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/logo.png"
      alt="Inversiones Rodatech E.I.R.L."
      width={Math.round((height * 329) / 150)}
      height={height}
      priority={priority}
      className={cn("select-none object-contain", className)}
    />
  );
}

/** Emblema circular (marca reducida) para estados colapsados y avatares. */
export function Emblema({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/icon-192.png"
      alt="Rodatech"
      width={size}
      height={size}
      className={cn("select-none object-contain", className)}
    />
  );
}

/** Franja diagonal amarillo/azul característica de la marca. */
export function FranjaMarca({ className }: { className?: string }) {
  return <div className={cn("h-1 w-full stripe-brand", className)} aria-hidden />;
}
