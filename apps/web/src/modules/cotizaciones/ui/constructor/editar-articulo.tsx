"use client";

import * as React from "react";
import {
  Button,
  Campo,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@rodatech/ui";

import type { LineaConstructor } from "../../dominio/constructor";

/**
 * Editar lo que se imprime de un artículo, en ESTA cotización.
 *
 * Luis, 16/09, con el menú de otro sistema delante: *«en la opción de editar
 * artículo deben aparecer todos los campos editables: código, marca,
 * descripción. Lo quiere así. La parte de cotización, cuando agregue un
 * producto y quiera editar algo del producto, pues que lo haga así»*.
 *
 * ---------------------------------------------------------------------------
 * Cambia la LÍNEA, no el catálogo. Y eso hay que decirlo en la pantalla
 * ---------------------------------------------------------------------------
 * Las tres columnas son una copia de lo que se imprimió —`cotizacion_items`
 * las guarda aparte desde la 002, «lo que salió en el PDF no puede cambiar
 * porque después se editó el maestro»— y el motivo se ve en el caso que trajo
 * Willy el mismo día: en retenes, el código son las medidas —45x60x8TC— y la
 * misma fila del maestro es LYO, NQK, PHK o NAK.
 *
 * Si esto escribiera en el producto, cotizar un retén como NQK se lo dejaría
 * puesto al siguiente cliente que pida el mismo código. Por eso toca la línea,
 * y por eso el diálogo lo dice en voz alta en vez de dejar que se suponga.
 */
export function EditarArticulo({
  linea,
  onCerrar,
  onGuardar,
}: {
  linea: LineaConstructor;
  onCerrar: () => void;
  onGuardar: (cambios: {
    codigo: string;
    marca: string;
    descripcion: string;
  }) => void;
}) {
  const [datos, setDatos] = React.useState({
    codigo: linea.codigo,
    marca: linea.marca ?? "",
    descripcion: linea.descripcion,
  });

  const listo =
    datos.codigo.trim().length > 0 && datos.descripcion.trim().length > 0;

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!listo) return;
    onGuardar(datos);
    onCerrar();
  }

  return (
    <Dialog open onOpenChange={(v) => (v ? null : onCerrar())}>
      <DialogContent ancho="max-w-xl">
        <DialogHeader>
          <DialogTitle>Editar artículo</DialogTitle>
          <DialogDescription>
            Cambia lo que sale impreso en <strong>esta cotización</strong>. El
            producto del catálogo se queda como está.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar}>
          <DialogBody className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo id="ed-codigo" label="Código" requerido>
                <Input
                  id="ed-codigo"
                  value={datos.codigo}
                  onChange={(e) =>
                    setDatos((d) => ({ ...d, codigo: e.target.value }))
                  }
                  className="font-mono"
                  required
                />
              </Campo>

              <Campo
                id="ed-marca"
                label="Marca"
                ayuda="Se puede escribir una que no esté en el catálogo."
              >
                <Input
                  id="ed-marca"
                  list="marcas-conocidas"
                  value={datos.marca}
                  onChange={(e) =>
                    setDatos((d) => ({ ...d, marca: e.target.value }))
                  }
                  placeholder="sin marca"
                />
              </Campo>
            </div>

            <Campo
              id="ed-descripcion"
              label="Descripción"
              requerido
              ayuda="Es lo que el cliente lee para saber qué está comprando."
            >
              <Input
                id="ed-descripcion"
                value={datos.descripcion}
                onChange={(e) =>
                  setDatos((d) => ({ ...d, descripcion: e.target.value }))
                }
                required
              />
            </Campo>

            {/* El caso de Willy, dicho donde se decide. Sin esto, «editar
                artículo» se lee como «editar el producto». */}
            <p className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-2)] p-3 text-sm text-[var(--fg-muted)]">
              Un mismo código puede ser de varias marcas —un retén{" "}
              <span className="font-mono">45X60X8TC</span> es LYO, NQK, PHK o
              NAK—, así que la marca se decide aquí, en la cotización, y no en
              el catálogo.
            </p>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!listo}>
              Guardar en esta línea
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
