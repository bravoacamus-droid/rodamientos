"use client";

import * as React from "react";
import { Combobox, type OpcionCombobox } from "@rodatech/ui";

/**
 * Un `Combobox` con buscador para un `<form>` de servidor (07/10).
 *
 * Sustituye a un `<select name=…>` largo dentro de una página de servidor, que
 * no puede llevar el estado de lo elegido: lo lleva este envoltorio, y el
 * valor viaja en un campo oculto con el mismo `name` que tenía el select.
 *
 * Luis, 07/10: *«todos los que tienen datos tienen que tener un buscador
 * inteligente, no voy a buscar a mano»*.
 */
export function ComboboxEnFormulario({
  valorInicial,
  ...props
}: {
  id: string;
  name: string;
  opciones: readonly OpcionCombobox[];
  valorInicial: string | null;
  placeholder?: string;
  placeholderBusqueda?: string;
  textoVacio?: string;
  className?: string;
}) {
  const [valor, setValor] = React.useState(valorInicial);
  return <Combobox {...props} valor={valor} onCambio={setValor} />;
}
