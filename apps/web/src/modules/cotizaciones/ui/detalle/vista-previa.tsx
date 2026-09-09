"use client";

import * as React from "react";
import { Button, Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@rodatech/ui";

/**
 * El documento, cuando se quiere mirar el papel.
 *
 * ---------------------------------------------------------------------------
 * Por qué la ficha deja de SER el papel
 * ---------------------------------------------------------------------------
 * Hasta el 09/09 esta pantalla era la hoja impresa con unos botones encima:
 * todo lo de fuera llevaba `print:hidden` y el documento se pintaba a tamaño
 * completo en medio de la ficha. Tenía una ventaja real —lo que se ve es
 * exactamente lo que sale— y un coste que se notaba cada día: para saber la
 * condición de pago, la validez o el margen había que leerlos dentro de una
 * hoja A4, en el cuerpo pequeño de un documento pensado para el cliente.
 *
 * Luis, 09/09, con su prototipo delante: la ficha pasa a ser una ficha de
 * TRABAJO —datos en tarjetas, tabla de productos legible, acciones a mano— y
 * el papel se mira aparte, con un botón.
 *
 * ---------------------------------------------------------------------------
 * Y sigue imprimiéndose lo mismo
 * ---------------------------------------------------------------------------
 * Esa ventaja no se pierde. El documento sigue montado en la página, oculto en
 * pantalla y visible solo al imprimir, y esta previa enseña **el mismo
 * componente con los mismos datos**. No hay una versión «de pantalla» y otra
 * «de papel» que se puedan separar con el tiempo.
 *
 * Por eso el diálogo lleva `print:hidden`: si se imprime con la previa
 * abierta, lo que sale es la hoja de verdad y no una hoja dentro de un cuadro
 * gris.
 */
export function VistaPreviaDocumento({
  numero,
  children,
}: {
  numero: string;
  /** El `<Documento>` ya montado en el servidor. */
  children: React.ReactNode;
}) {
  const [abierta, setAbierta] = React.useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setAbierta(true)}>
        <IconoOjo />
        Vista previa
      </Button>

      <Dialog open={abierta} onOpenChange={setAbierta}>
        <DialogContent className="max-w-4xl print:hidden">
          <DialogHeader>
            <DialogTitle>Así se ve {numero}</DialogTitle>
          </DialogHeader>
          <DialogBody className="max-h-[75vh] overflow-y-auto bg-[var(--surface-2)] p-4">
            <div className="overflow-hidden rounded-md bg-white elev-2">{children}</div>

            <div className="mt-3 flex justify-center">
              {/*
                Se cierra antes de imprimir.

                `window.print()` saca la PÁGINA, y con el diálogo abierto el
                navegador la captura con el velo gris por encima. El latido
                es para que React termine de desmontarlo.
              */}
              <Button
                variant="outline"
                onClick={() => {
                  setAbierta(false);
                  setTimeout(() => window.print(), 150);
                }}
              >
                <IconoImprimir />
                Imprimir
              </Button>
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}

function IconoOjo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] shrink-0"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
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
