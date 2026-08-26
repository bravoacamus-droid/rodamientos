"use client";
/*
 * "use client" OBLIGATORIO: sonner monta un contenedor con estado global de
 * notificaciones y las anuncia por una región `aria-live`.
 *
 * `Toaster` se monta UNA vez en el layout del ERP. Para lanzar avisos desde
 * cualquier sitio se usa `toast` — que también se reexporta aquí para que
 * ningún módulo tenga que depender de `sonner` directamente.
 *
 * Los colores se pasan por CSS custom properties de sonner apuntando a
 * nuestros tokens: así el aviso cambia con el tema sin leer el tema en JS
 * (nada de parpadeo en la hidratación).
 */
import * as React from "react";
import { Toaster as Sonner, toast, type ToasterProps } from "sonner";

export { toast };

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-right"
      // 5 s: lo justo para leer "Factura F001-000123 aceptada por SUNAT" sin
      // que el aviso estorbe mientras se sigue operando.
      duration={5000}
      closeButton
      toastOptions={{
        classNames: {
          toast: "!rounded-lg !border !text-[0.8rem] elev-2",
          description: "!text-xs !text-[var(--fg-muted)]",
          actionButton: "!bg-brand-600 !text-white !text-xs",
          cancelButton: "!bg-[var(--surface-2)] !text-[var(--fg-muted)] !text-xs",
        },
      }}
      style={
        {
          "--normal-bg": "var(--surface)",
          "--normal-text": "var(--fg)",
          "--normal-border": "var(--border)",
          "--success-bg": "var(--ok-bg)",
          "--success-text": "var(--ok)",
          "--success-border": "var(--ok)",
          "--error-bg": "var(--danger-bg)",
          "--error-text": "var(--danger)",
          "--error-border": "var(--danger)",
          "--warning-bg": "var(--warn-bg)",
          "--warning-text": "var(--warn)",
          "--warning-border": "var(--warn)",
          "--info-bg": "var(--info-bg)",
          "--info-text": "var(--info)",
          "--info-border": "var(--info)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}
