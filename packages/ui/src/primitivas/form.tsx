"use client";
/*
 * "use client" OBLIGATORIO: react-hook-form vive entero en el navegador
 * (contexto, registro de campos, validación en `onBlur`).
 *
 * CUÁNDO USARLO: formularios largos con validación cruzada y guardado en
 * borrador — constructor de cotización, alta de producto, emisión de guía.
 * Para un formulario de dos campos que solo hace POST a una Server Action, NO
 * uses esto: un `<form action={accion}>` con `Campo` (label.tsx) se renderiza
 * en el servidor, funciona sin JavaScript y no manda nada al bundle.
 *
 * Este es el `form.tsx` de shadcn, con los mensajes en español y el cableado
 * ARIA intacto: cada control recibe `aria-describedby` con su descripción y su
 * error, y `aria-invalid` cuando falla.
 */
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { cn } from "../lib/utils";
import { Label } from "./label";

/** Envoltorio del `FormProvider` de react-hook-form. */
export const Form = FormProvider;

interface ContextoCampo {
  name: string;
}
const CampoContext = React.createContext<ContextoCampo | null>(null);

interface ContextoItem {
  id: string;
}
const ItemContext = React.createContext<ContextoItem | null>(null);

export function FormField<TCampos extends FieldValues, TNombre extends FieldPath<TCampos>>(
  props: ControllerProps<TCampos, TNombre>,
) {
  const valor = React.useMemo<ContextoCampo>(() => ({ name: props.name }), [props.name]);
  return (
    <CampoContext.Provider value={valor}>
      <Controller {...props} />
    </CampoContext.Provider>
  );
}

function useCampoForm() {
  const campo = React.useContext(CampoContext);
  const item = React.useContext(ItemContext);
  const { getFieldState } = useFormContext();
  const formState = useFormState();

  if (!campo) throw new Error("useCampoForm debe usarse dentro de un <FormField>.");
  if (!item) throw new Error("useCampoForm debe usarse dentro de un <FormItem>.");

  const estado = getFieldState(campo.name, formState);
  const { id } = item;

  return {
    id,
    name: campo.name,
    idItem: id,
    idDescripcion: `${id}-descripcion`,
    idMensaje: `${id}-mensaje`,
    ...estado,
  };
}

export function FormItem({ className, ...props }: React.ComponentPropsWithRef<"div">) {
  const id = React.useId();
  const valor = React.useMemo<ContextoItem>(() => ({ id }), [id]);
  return (
    <ItemContext.Provider value={valor}>
      <div data-slot="form-item" className={cn("space-y-0", className)} {...props} />
    </ItemContext.Provider>
  );
}

export function FormLabel({
  className,
  ...props
}: React.ComponentPropsWithRef<"label"> & { requerido?: boolean }) {
  const { error, idItem } = useCampoForm();
  return <Label htmlFor={idItem} className={cn(error && "text-danger", className)} {...props} />;
}

/** Pasa id + ARIA al control real. Úsalo con `asChild`: `<FormControl><Input …/></FormControl>`. */
export function FormControl(props: React.ComponentPropsWithRef<typeof Slot>) {
  const { error, idItem, idDescripcion, idMensaje } = useCampoForm();
  return (
    <Slot
      id={idItem}
      aria-describedby={error ? `${idDescripcion} ${idMensaje}` : idDescripcion}
      aria-invalid={Boolean(error)}
      {...props}
    />
  );
}

export function FormDescription({ className, ...props }: React.ComponentPropsWithRef<"p">) {
  const { idDescripcion } = useCampoForm();
  return <p id={idDescripcion} className={cn("mt-1 text-xs text-subtle", className)} {...props} />;
}

/**
 * Mensaje de error. `role="alert"` para que el lector de pantalla lo anuncie
 * en cuanto aparece: en una emisión a SUNAT el operador tiene que enterarse
 * del fallo sin volver a recorrer el formulario.
 */
export function FormMessage({ className, children, ...props }: React.ComponentPropsWithRef<"p">) {
  const { error, idMensaje } = useCampoForm();
  const cuerpo = error ? String(error.message ?? "") : children;
  if (!cuerpo) return null;
  return (
    <p
      id={idMensaje}
      role="alert"
      className={cn("mt-1 text-xs font-medium text-danger", className)}
      {...props}
    >
      {cuerpo}
    </p>
  );
}

/**
 * Resumen de errores al principio del formulario.
 * En formularios de 30 campos, ver el error solo junto al campo obliga a
 * buscarlo a ojo. Este bloque los junta y enlaza a cada uno.
 */
export function FormResumenErrores({ className }: { className?: string }) {
  const { errors } = useFormState();
  const entradas = Object.entries(errors);
  if (entradas.length === 0) return null;
  return (
    <div
      role="alert"
      className={cn("rounded-lg border border-danger/40 bg-danger-bg px-4 py-3", className)}
    >
      <p className="text-xs font-semibold text-danger">
        {entradas.length === 1 ? "Hay un campo con error" : `Hay ${entradas.length} campos con error`}
      </p>
      <ul className="mt-1.5 space-y-0.5">
        {entradas.map(([nombre, error]) => (
          <li key={nombre} className="text-xs text-danger">
            {String((error as { message?: unknown } | undefined)?.message ?? nombre)}
          </li>
        ))}
      </ul>
    </div>
  );
}
