"use client";

/*
 * "use client" OBLIGATORIO: es un campo que aparece y desaparece junto al
 * desplegable, y llama a una Server Action al confirmar.
 */

import * as React from "react";
import { Button, Input, toast } from "@rodatech/ui";
import { Ban, Pencil, Plus, X } from "lucide-react";

import type { NodoCreado, ResultadoBaja, ResultadoCatalogo } from "../acciones/catalogos";

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
 *
 * Desde la 160 (FS-04, 27/10) también **corrige** lo elegido —«Editar»— y, en
 * la marca, la **da de baja**. Hasta entonces una marca mal escrita solo se
 * arreglaba por SQL. Mismos botones con palabra que «Nueva …», en la misma
 * fila: lo que se elige aquí se crea y se corrige aquí.
 */
export function NuevoNodo({
  etiqueta,
  deshabilitado,
  ayudaDeshabilitado,
  crear,
  onCreado,
  elegido,
  renombrar,
  onRenombrado,
  darDeBaja,
  onDadoDeBaja,
}: {
  /** «familia», «sub-familia», «descripción». Va en el botón y en el aviso. */
  etiqueta: string;
  deshabilitado?: boolean;
  /** Por qué no se puede: «elige antes la familia». */
  ayudaDeshabilitado?: string;
  crear: (nombre: string) => Promise<ResultadoCatalogo>;
  onCreado: (nodo: NodoCreado) => void;
  /** Lo que está elegido en el desplegable de al lado: es lo que se corrige. */
  elegido?: { id: string; nombre: string } | null;
  renombrar?: (id: string, nombre: string) => Promise<ResultadoCatalogo>;
  onRenombrado?: (nodo: NodoCreado) => void;
  /** Solo la marca: familias y sub-familias se renombran, no se retiran. */
  darDeBaja?: (id: string) => Promise<ResultadoBaja>;
  onDadoDeBaja?: (id: string) => void;
}) {
  /** Qué se está haciendo en la fila: nada, crear, corregir el nombre o confirmar la baja. */
  const [modo, setModo] = React.useState<"nada" | "crear" | "editar" | "baja">("nada");
  const [texto, setTexto] = React.useState("");
  const [ocupado, setOcupado] = React.useState(false);

  // Si cambia lo elegido mientras se corrige, lo que se estaba escribiendo
  // era para otro: se cierra.
  const idElegido = elegido?.id ?? null;
  const [idAnterior, setIdAnterior] = React.useState(idElegido);
  if (idAnterior !== idElegido) {
    setIdAnterior(idElegido);
    if (modo === "editar" || modo === "baja") setModo("nada");
  }

  const cerrar = () => {
    setModo("nada");
    setTexto("");
  };

  const confirmar = async () => {
    const nombre = texto.trim();
    if (nombre.length < 2) return;

    setOcupado(true);
    try {
      if (modo === "editar") {
        if (!renombrar || !elegido) return;
        const r = await renombrar(elegido.id, nombre);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        toast.success(`Ahora se llama «${r.datos.nombre}».`);
        onRenombrado?.(r.datos);
        cerrar();
        return;
      }
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
      cerrar();
    } finally {
      setOcupado(false);
    }
  };

  const confirmarBaja = async () => {
    if (!darDeBaja || !elegido) return;
    setOcupado(true);
    try {
      const r = await darDeBaja(elegido.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        r.datos.productos > 0
          ? `«${r.datos.nombre}» ya no sale al elegir. Sus ${r.datos.productos} productos la conservan.`
          : `«${r.datos.nombre}» ya no sale al elegir.`,
      );
      onDadoDeBaja?.(elegido.id);
      cerrar();
    } finally {
      setOcupado(false);
    }
  };

  /*
    Revisión por módulos del 02/10: era un enlace azul de 12 px de icono, sin
    borde, y apagado se quedaba en un texto gris que parecía roto. Ahora es un
    botón con su borde, y cuando todavía no se puede usar se dice por qué en
    vez de enseñar un botón muerto.
  */
  if (modo === "nada") {
    if (deshabilitado) {
      return ayudaDeshabilitado ? (
        <p className="mt-1.5 text-sm text-[var(--fg-subtle)]">{ayudaDeshabilitado}</p>
      ) : null;
    }
    const boton =
      "inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--fg)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]";
    return (
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setModo("crear")} className={boton}>
          <Plus className="size-4" aria-hidden />
          Nueva {etiqueta}
        </button>
        {renombrar && elegido ? (
          <button
            type="button"
            onClick={() => {
              setTexto(elegido.nombre);
              setModo("editar");
            }}
            className={boton}
            aria-label={`Editar el nombre de ${elegido.nombre}`}
          >
            <Pencil className="size-4" aria-hidden />
            Editar
          </button>
        ) : null}
        {darDeBaja && elegido ? (
          <button
            type="button"
            onClick={() => setModo("baja")}
            className={boton}
            aria-label={`Dar de baja ${elegido.nombre}`}
          >
            <Ban className="size-4" aria-hidden />
            Dar de baja
          </button>
        ) : null}
      </div>
    );
  }

  // Confirmar dentro de la fila, como zonas y rubros: un `confirm()` del
  // navegador sale en otra letra, pequeño, y se acepta sin leer.
  if (modo === "baja" && elegido) {
    return (
      <div className="mt-1.5 flex flex-col gap-1.5 rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-2.5 text-sm">
        <p>
          ¿Dar de baja <strong>{elegido.nombre}</strong>? Deja de salir al elegir la {etiqueta}. Sus productos la
          conservan y no se borra nada; para volver a usarla, escríbela en «Nueva {etiqueta}».
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" size="sm" disabled={ocupado} onClick={() => void confirmarBaja()}>
            {ocupado ? "Dando de baja…" : "Sí, dar de baja"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={cerrar}>
            No
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <Input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={modo === "editar" ? `Nombre correcto de la ${etiqueta}` : `Nombre de la ${etiqueta}`}
        aria-label={modo === "editar" ? `Nombre correcto de la ${etiqueta}` : `Nombre de la ${etiqueta} nueva`}
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
            cerrar();
          }
        }}
        className="h-control-sm min-w-0 flex-1 basis-40"
      />
      <Button
        type="button"
        size="sm"
        disabled={ocupado || texto.trim().length < 2}
        onClick={() => void confirmar()}
      >
        {ocupado ? "…" : modo === "editar" ? "Guardar" : "Crear"}
      </Button>
      {/* Con su palabra: una «X» suelta no parece un botón (02/10). */}
      <Button type="button" variant="outline" size="sm" onClick={cerrar}>
        <X aria-hidden />
        Cancelar
      </Button>
    </div>
  );
}
