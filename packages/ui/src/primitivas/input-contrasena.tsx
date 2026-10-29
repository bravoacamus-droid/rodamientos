"use client";

/*
 * Campo de contraseña con botón «Ver» / «Ocultar».
 *
 * Luis, 29/10: «en el login puedes poner un ojito animado para ver la
 * contraseña». Para Willy no es un adorno: con los puntos no ve si tecleó
 * mal, y el error que devuelve el login es genérico a propósito (171).
 *
 * El botón lleva la palabra y no solo el ojo: un icono suelto no parece un
 * botón (CLAUDE.md §1). Va DENTRO del campo y con `type="button"`, para que
 * pulsarlo no envíe el formulario. Los dos ojos se cruzan con giro y escala;
 * con «reducir movimiento» el cambio es seco.
 */
import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { cn } from "../lib/utils";
import { Input, type InputProps } from "./input";

export function InputContrasena({ className, ...props }: Omit<InputProps, "type">) {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className={cn("pr-28", className)} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-controls={props.id}
        aria-label={visible ? "Ocultar la contraseña" : "Ver la contraseña"}
        className={cn(
          "absolute inset-y-1 right-1 flex items-center gap-1.5 rounded-md border border-border",
          "bg-surface-2 px-2.5 text-sm font-medium text-fg",
          "transition-colors duration-150 hover:bg-surface hover:border-brand-500",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/30",
        )}
      >
        <span className="relative inline-flex size-[18px]" aria-hidden="true">
          <Eye
            className={cn(
              "absolute inset-0 size-[18px] transition-all duration-300 ease-out motion-reduce:transition-none",
              visible ? "rotate-90 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100",
            )}
          />
          <EyeOff
            className={cn(
              "absolute inset-0 size-[18px] transition-all duration-300 ease-out motion-reduce:transition-none",
              visible ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0",
            )}
          />
        </span>
        <span className="w-[3.4rem] text-left">{visible ? "Ocultar" : "Ver"}</span>
      </button>
    </div>
  );
}
