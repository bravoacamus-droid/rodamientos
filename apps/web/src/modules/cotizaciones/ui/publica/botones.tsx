"use client";

import { Download, Printer } from "lucide-react";
import { Button } from "@rodatech/ui";

/**
 * Los dos botones de la página del cliente.
 *
 * Luis, 08/09: *«siempre y cuando ese PDF tenga un botón de descargar la
 * cotización»*.
 *
 * Los dos llaman a `window.print()`, y eso NO es un descuido ni un botón
 * repetido: en el diálogo de impresión del navegador, «Guardar como PDF» es
 * uno de los destinos, junto a la impresora. Es la misma ventana y dos salidas
 * distintas.
 *
 * Se ponen los dos porque el cliente no piensa en «imprimir» cuando lo que
 * quiere es el archivo, ni al revés. Un solo botón dejaría a la mitad de la
 * gente buscando el otro — y esta página la abre alguien que no conoce el
 * sistema y a quien no le podemos explicar nada.
 *
 * Es cliente por esto y solo por esto: `window.print()` no existe en el
 * servidor. Todo lo demás de esta pantalla se pinta en el servidor.
 */
export function BotonesDelCliente() {
  return (
    <div className="flex items-center gap-2">
      <Button type="button" onClick={() => window.print()}>
        <Download className="size-[18px] shrink-0" />
        Descargar
      </Button>
      <Button type="button" variant="outline" onClick={() => window.print()}>
        <Printer className="size-[18px] shrink-0" />
        Imprimir
      </Button>
    </div>
  );
}

