"use client";

import * as React from "react";
import { Button } from "@rodatech/ui";

/**
 * Descargar e imprimir, para cualquiera de los documentos.
 *
 * ---------------------------------------------------------------------------
 * Por qué los dos hacen lo mismo, y por qué está bien
 * ---------------------------------------------------------------------------
 * Los dos llaman a `window.print()`. No es un descuido ni un botón repetido:
 * en el diálogo de impresión del navegador, **«Guardar como PDF» es uno de los
 * destinos**, junto a la impresora. Es la misma ventana y dos salidas.
 *
 * Se ponen los dos porque son dos intenciones distintas y nadie las traduce
 * sola: quien quiere el archivo para mandarlo por WhatsApp no piensa en
 * «imprimir», y quien va a meter el papel en la caja no piensa en «descargar».
 * Con un solo botón, la mitad de la gente se queda buscando el otro.
 *
 * Descargar de verdad —generar el PDF en el servidor— pediría Chromium en el
 * despliegue: caro, frágil y para el mismo resultado que ya da el navegador.
 * Luis, 09/09: *«un botón de acceso rápido para descargar el documento»*.
 *
 * ---------------------------------------------------------------------------
 * `auto`: llegar imprimiendo
 * ---------------------------------------------------------------------------
 * Desde la ficha, «Imprimir» llevaba a la hoja y ahí se acababa: había que
 * pulsar Ctrl+P a mano. Un botón que dice imprimir y no imprime es de los que
 * enseñan a desconfiar del resto.
 *
 * Con `auto`, la página de la hoja dispara la impresión sola al abrirse, así
 * que desde la ficha es un clic. El latido es para que el navegador termine de
 * pintar la hoja: sin él captura la página a medio montar.
 */
export function BotonesDocumento({ auto = false }: { auto?: boolean }) {
  React.useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [auto]);

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        onClick={() => window.print()}
        title="Se abre la ventana de imprimir: elige «Guardar como PDF»."
      >
        <IconoDescargar />
        Descargar
      </Button>
      <Button type="button" variant="outline" onClick={() => window.print()}>
        <IconoImprimir />
        Imprimir
      </Button>
    </div>
  );
}

function IconoDescargar() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] shrink-0"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
      <path d="M4 19h16" />
    </svg>
  );
}

function IconoImprimir() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] shrink-0"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9V3h12v6" />
      <rect x="3" y="9" width="18" height="7" rx="1" />
      <path d="M6 14h12v7H6z" />
    </svg>
  );
}
