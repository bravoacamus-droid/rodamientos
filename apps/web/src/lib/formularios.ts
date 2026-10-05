import type { KeyboardEvent } from "react";

/**
 * Enter en un campo NO envía el formulario.
 *
 * En HTML, Enter en un `<input>` de un `<form>` lo envía. En este ERP eso
 * guardó sin querer dos cotizaciones (revisión por módulos del 02/10): se
 * teclea un código, se pulsa Enter para buscarlo, la lista todavía no se ha
 * abierto… y el formulario sale. Pasaba igual en compras y recepciones, y en
 * la emisión de una factura habría gastado un correlativo fiscal y la habría
 * mandado a SUNAT. Se guarda con el botón, nunca con Enter.
 *
 * Uso: `<form onKeyDown={sinEnvioConEnter} …>`. Los diálogos van en un portal
 * y React les hace llegar el evento igual: `contains` los deja fuera, su Enter
 * es suyo. Los `<textarea>` tampoco se tocan (ahí Enter es un salto de línea).
 */
export function sinEnvioConEnter(e: KeyboardEvent<HTMLFormElement>) {
  if (e.key === "Enter" && e.target instanceof HTMLInputElement && e.currentTarget.contains(e.target)) {
    e.preventDefault();
  }
}
