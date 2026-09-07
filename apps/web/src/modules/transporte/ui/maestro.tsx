"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
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

import { cambiarEstado, type TipoTransporte } from "../acciones/guardar";

/**
 * Una lista de maestro con su alta, su edición y su baja.
 *
 * Las tres cosas del transporte —agencias, vehículos y conductores— son la
 * misma pantalla con distintos campos: una lista, un botón de nueva, un lápiz
 * por fila y un «dar de baja». Escribirla tres veces garantiza que el día que
 * haya que arreglar algo se arregle en una y se olviden las otras dos.
 *
 * Así que los campos vienen descritos en datos y el comportamiento es uno.
 */

export interface CampoMaestro {
  clave: string;
  etiqueta: string;
  ayuda?: string;
  requerido?: boolean;
  placeholder?: string;
  /** Cómo se teclea. `digitos` y `mayusculas` filtran mientras se escribe. */
  modo?: "texto" | "digitos" | "mayusculas";
  maximo?: number;
  /** Ocupa la fila entera en vez de media. */
  ancho?: "completo" | "medio";
  mono?: boolean;
}

/**
 * Una fila ya lista para pintar.
 *
 * `titulo` y `detalle` vienen **calculados desde el servidor**, no como
 * funciones que los saquen de la fila. Entre un Server Component y uno de
 * cliente solo cruzan datos y Server Actions: pasar un `(f) => f.placa` falla
 * en ejecución con «Functions cannot be passed directly to Client Components»,
 * y el typecheck no lo ve venir.
 */
export interface FilaMaestro {
  id: string;
  activo: boolean;
  /** Lo que se enseña grande: la placa, el nombre corto. */
  titulo: string;
  /** La línea de debajo. Cadena vacía si no hay nada que decir. */
  detalle: string;
  [clave: string]: string | boolean | null;
}

export function Maestro({
  tipo,
  titulo,
  descripcion,
  campos,
  filas,
  etiquetaNuevo,
  puedeEditar,
  guardar,
  vacio,
}: {
  tipo: TipoTransporte;
  titulo: string;
  descripcion: string;
  campos: readonly CampoMaestro[];
  filas: readonly FilaMaestro[];
  etiquetaNuevo: string;
  puedeEditar: boolean;
  /** La Server Action que corresponda. Devuelve el id al guardar. */
  guardar: (datos: unknown) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
  vacio: string;
}) {
  const router = useRouter();
  const [editando, setEditando] = React.useState<FilaMaestro | "nuevo" | null>(null);
  const [errorFila, setErrorFila] = React.useState<string | null>(null);
  const [enCurso, empezar] = React.useTransition();

  function alternar(f: FilaMaestro) {
    setErrorFila(null);
    empezar(async () => {
      const r = await cambiarEstado(tipo, f.id, !f.activo);
      if (!r.ok) {
        setErrorFila(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="card flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{titulo}</h2>
          <p className="text-sm text-[var(--fg-muted)]">{descripcion}</p>
        </div>
        {puedeEditar ? (
          <Button type="button" onClick={() => setEditando("nuevo")}>
            {etiquetaNuevo}
          </Button>
        ) : null}
      </div>

      {errorFila ? (
        <p
          role="alert"
          className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm"
        >
          {errorFila}
        </p>
      ) : null}

      {filas.length === 0 ? (
        <p className="rounded-md bg-[var(--surface-2)] p-3 text-sm text-[var(--fg-muted)]">
          {vacio}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
          {filas.map((f) => (
            <li
              key={f.id}
              className={`flex flex-wrap items-center justify-between gap-2 py-2.5 ${
                f.activo ? "" : "opacity-60"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-medium">{f.titulo}</span>
                  {f.activo ? null : <Badge tone="neutral" size="xs">De baja</Badge>}
                </div>
                {f.detalle ? (
                  <p className="text-sm text-[var(--fg-muted)]">{f.detalle}</p>
                ) : null}
              </div>

              {puedeEditar ? (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-sm"
                    onClick={() => setEditando(f)}
                  >
                    Editar
                  </Button>
                  {/*
                    «Dar de baja», no «Eliminar». No se borra nada: la 060 no
                    tiene política de DELETE porque una guía de hace ocho meses
                    tiene que poder seguir citando lo que llevaba.
                  */}
                  <Button
                    type="button"
                    variant={f.activo ? "outline" : "primary"}
                    size="sm"
                    className="text-sm"
                    disabled={enCurso}
                    onClick={() => alternar(f)}
                  >
                    {f.activo ? "Dar de baja" : "Volver a usar"}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <EditorMaestro
        abierto={editando !== null}
        titulo={editando === "nuevo" ? etiquetaNuevo : "Editar"}
        campos={campos}
        valores={editando === "nuevo" || editando === null ? null : editando}
        guardar={guardar}
        onCerrar={() => setEditando(null)}
        onGuardado={() => {
          setEditando(null);
          router.refresh();
        }}
      />
    </section>
  );
}

/** El formulario, el mismo para alta y para edición. */
function EditorMaestro({
  abierto,
  titulo,
  campos,
  valores,
  guardar,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean;
  titulo: string;
  campos: readonly CampoMaestro[];
  /** `null` = alta. Si viene una fila, se edita esa. */
  valores: FilaMaestro | null;
  guardar: (datos: unknown) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [texto, setTexto] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, empezar] = React.useTransition();

  /*
    Se rellena al ABRIR, no en el render.

    `useState(inicial)` no vuelve a leer sus argumentos cuando cambian las
    props: pulsar «Editar» en la segunda fila dejaría el formulario con los
    datos de la primera. Ya nos pasó con el comparador de precios, y lo peor de
    ese fallo es que no rompe nada: guarda, y guarda mal.
  */
  React.useEffect(() => {
    if (!abierto) return;
    const inicial: Record<string, string> = {};
    for (const c of campos) {
      const v = valores?.[c.clave];
      inicial[c.clave] = typeof v === "string" ? v : "";
    }
    setTexto(inicial);
    setError(null);
  }, [abierto, campos, valores]);

  function alEscribir(c: CampoMaestro, bruto: string) {
    let v = bruto;
    if (c.modo === "digitos") v = v.replace(/\D/g, "");
    if (c.modo === "mayusculas") v = v.toUpperCase();
    if (c.maximo) v = v.slice(0, c.maximo);
    setTexto((t) => ({ ...t, [c.clave]: v }));
  }

  function enviar() {
    setError(null);
    const falta = campos.find((c) => c.requerido && (texto[c.clave] ?? "").trim() === "");
    if (falta) {
      setError(`Falta ${falta.etiqueta.toLowerCase()}.`);
      return;
    }
    empezar(async () => {
      const r = await guardar({ id: valores?.id ?? null, ...texto });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onGuardado();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => (!v ? onCerrar() : null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            Queda en la lista para las próximas guías.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="grid gap-3 sm:grid-cols-2">
          {campos.map((c) => (
            <Campo
              key={c.clave}
              id={`m-${c.clave}`}
              label={c.etiqueta}
              ayuda={c.ayuda}
              requerido={c.requerido}
              className={c.ancho === "medio" ? "" : "sm:col-span-2"}
            >
              <Input
                id={`m-${c.clave}`}
                value={texto[c.clave] ?? ""}
                onChange={(e) => alEscribir(c, e.target.value)}
                placeholder={c.placeholder}
                inputMode={c.modo === "digitos" ? "numeric" : undefined}
                className={c.mono ? "font-mono" : undefined}
              />
            </Campo>
          ))}

          {error ? (
            <p
              role="alert"
              className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm sm:col-span-2"
            >
              {error}
            </p>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="button" onClick={enviar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
