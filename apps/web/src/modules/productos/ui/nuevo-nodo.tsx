"use client";

/*
 * "use client" OBLIGATORIO: es un campo que aparece y desaparece junto al
 * desplegable, y llama a una Server Action al confirmar.
 */

import * as React from "react";
import { Button, Input, toast } from "@rodatech/ui";
import { Plus, X } from "lucide-react";

import type { NodoCreado, ResultadoCatalogo } from "../acciones/catalogos";

/**
 * «+ nueva» al lado de cada nivel de la clasificación.
 *
 * Willy, 26/08 (10:40): *«en cada clasificación tendría que haber la opción de
 * crear una nueva familia o sub-familia»*. El caso que puso: le piden unos
 * pernos, que no son rodamientos, y hoy el producto no se puede dar de alta
 * hasta que alguien despliegue una migración.
 *
 * Es un campo EN LÍNEA y no un diálogo. La diferencia importa: esto ocurre en
 * mitad de un formulario a medio llenar, y un diálogo modal tapa lo que se
 * lleva escrito justo cuando hay que decidir dónde va. Al confirmar, el nivel
 * recién creado se queda seleccionado y se sigue hacia abajo.
 */
export function NuevoNodo({
  etiqueta,
  deshabilitado,
  ayudaDeshabilitado,
  crear,
  onCreado,
}: {
  /** «familia», «sub-familia», «descripción». Va en el botón y en el aviso. */
  etiqueta: string;
  deshabilitado?: boolean;
  /** Por qué no se puede: «elige antes la familia». */
  ayudaDeshabilitado?: string;
  crear: (nombre: string) => Promise<ResultadoCatalogo>;
  onCreado: (nodo: NodoCreado) => void;
}) {
  const [abierto, setAbierto] = React.useState(false);
  const [texto, setTexto] = React.useState("");
  const [ocupado, setOcupado] = React.useState(false);

  const confirmar = async () => {
    const nombre = texto.trim();
    if (nombre.length < 2) return;

    setOcupado(true);
    try {
      const r = await crear(nombre);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      // «Ya existía» se dice, no se disimula: si alguien teclea una familia que
      // ya está, lo útil es que sepa que no acaba de crear nada —y que su
      // producto va donde esperaba igual.
      toast.success(
        r.datos.creada
          ? `${etiqueta} «${r.datos.nombre}» creada.`
          : `«${r.datos.nombre}» ya existía. Se usará esa.`,
      );
      onCreado(r.datos);
      setTexto("");
      setAbierto(false);
    } finally {
      setOcupado(false);
    }
  };

  if (!abierto) {
    return (
      <button
        type="button"
        disabled={deshabilitado}
        title={deshabilitado ? ayudaDeshabilitado : `Crear una ${etiqueta} nueva`}
        onClick={() => setAbierto(true)}
        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline disabled:cursor-not-allowed disabled:text-[var(--fg-subtle)] disabled:no-underline"
      >
        <Plus className="size-3" />
        Nueva {etiqueta}
      </button>
    );
  }

  return (
    <div className="mt-1 flex items-center gap-1">
      <Input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={`Nombre de la ${etiqueta}`}
        maxLength={120}
        autoFocus
        // El formulario de producto envuelve todo esto, así que un Enter aquí
        // lo enviaría a medio llenar. Se atrapa y se usa para confirmar el
        // nombre, que es lo que la persona espera que haga.
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void confirmar();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setAbierto(false);
            setTexto("");
          }
        }}
        className="h-control-sm"
      />
      <Button
        type="button"
        size="sm"
        disabled={ocupado || texto.trim().length < 2}
        onClick={() => void confirmar()}
      >
        {ocupado ? "…" : "Crear"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Cancelar"
        onClick={() => {
          setAbierto(false);
          setTexto("");
        }}
      >
        <X />
      </Button>
    </div>
  );
}
