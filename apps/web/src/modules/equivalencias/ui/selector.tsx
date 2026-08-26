"use client";

/*
 * "use client" OBLIGATORIO: es un buscador asíncrono con foco y navegación.
 *
 * El producto elegido va a la URL (`?producto=<uuid>`) y no a un estado local.
 * Es la misma regla que el resto del ERP: la URL es el estado, y así el
 * cross-reference del 6205 se pega en un WhatsApp y abre esa vista.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { BuscadorProductos, type ProductoBuscado } from "@rodatech/ui";

import { buscarEnCatalogo } from "../acciones/declarar";

export function SelectorProducto({
  /** El producto que ya se está mirando: no tiene sentido ofrecerlo otra vez. */
  excluir,
  autoFocus,
  placeholder,
  /** Qué hacer con el elegido. Por defecto, cambiar el producto de la pantalla. */
  onElegir,
}: {
  excluir?: string;
  autoFocus?: boolean;
  placeholder?: string;
  onElegir?: (producto: ProductoBuscado) => void;
}) {
  const router = useRouter();

  // `buscar` tiene que ser ESTABLE entre renders o el buscador relanza la
  // consulta sin motivo. La Server Action lo es; la envoltura hay que fijarla.
  const buscar = React.useCallback(async (termino: string): Promise<ProductoBuscado[]> => {
    const r = await buscarEnCatalogo(termino);
    return r.ok ? r.datos : [];
  }, []);

  const elegir = React.useCallback(
    (producto: ProductoBuscado) => {
      if (onElegir) onElegir(producto);
      else router.push(`/equivalencias?producto=${producto.id}`);
    },
    [onElegir, router],
  );

  return (
    <BuscadorProductos
      id="buscador-equivalencias"
      buscar={buscar}
      onSeleccionar={elegir}
      excluirIds={excluir ? [excluir] : undefined}
      autoFocus={autoFocus}
      placeholder={placeholder ?? "Buscar por código, marca o descripción…"}
      onIrAlMaestro={() => router.push("/productos")}
    />
  );
}
