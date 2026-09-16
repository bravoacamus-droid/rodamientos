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
  toast,
} from "@rodatech/ui";

import {
  crearFamilia,
  crearMarca,
  crearSubfamilia,
  type ResultadoCatalogo,
} from "@/modules/productos/acciones/catalogos";
import {
  editarProductoRapido,
  fichaParaEditar,
} from "@/modules/productos/acciones/alta-rapida";

import { SelectorCatalogo, type OpcionCatalogo } from "./selector-catalogo";

import type { LineaConstructor } from "../../dominio/constructor";

interface Catalogos {
  marcas: { id: string; nombre: string }[];
  familias: { id: string; nombre: string }[];
  subfamilias: { id: string; nombre: string; familia_id: string }[];
  unidades: { codigo: string; nombre: string; abreviatura: string }[];
}

/**
 * Editar la ficha del artículo sin salir de la cotización.
 *
 * Luis, 16/09, viendo la primera versión —que solo tocaba lo impreso—: *«el
 * editar nada que ver, no trae las marcas ni las familias ni las subfamilias,
 * qué pasó rey; todo eso tiene que traer, todo lo que se puede editar»*.
 *
 * Así que son los mismos siete campos del alta, con los mismos selectores que
 * se buscan y que dejan crear lo que falte, y **escriben en el catálogo**.
 *
 * ---------------------------------------------------------------------------
 * Y el retén, que parecía contradecir esto, no lo hace
 * ---------------------------------------------------------------------------
 * Willy, el mismo día: en retenes el código son las medidas —45x60x8TC— y una
 * sola fila del maestro se vende como LYO, NQK, PHK o NAK. Eso no se arregla
 * aquí: se arregla en la **columna «Marca» de la tabla**, que cambia solo esa
 * línea y ya está puesta.
 *
 * Son dos caminos con dos alcances, y por eso este diálogo dice en voz alta
 * cuál es el suyo: lo que se cambia aquí vale para todas las cotizaciones.
 *
 * Una línea escrita a mano —sin producto en el catálogo— no tiene ficha que
 * editar, así que enseña solo lo que se imprime. Que se pueda abrir igual es
 * deliberado: un menú donde una opción a veces no está obliga a recordar por
 * qué.
 */
export function EditarArticulo({
  linea,
  onCerrar,
  onGuardar,
}: {
  linea: LineaConstructor;
  onCerrar: () => void;
  /** Lo que hay que reflejar en la línea de la cotización. */
  onGuardar: (cambios: {
    codigo: string;
    marca: string;
    descripcion: string;
  }) => void;
}) {
  const enCatalogo = linea.productoId !== null;

  const [catalogos, setCatalogos] = React.useState<Catalogos | null>(null);
  const [errorCarga, setErrorCarga] = React.useState<string | null>(null);
  const [guardando, empezar] = React.useTransition();

  const [datos, setDatos] = React.useState({
    codigo: linea.codigo,
    descripcion: linea.descripcion,
    marca_id: "",
    familia_id: "",
    subfamilia_id: "",
    unidad_codigo: linea.unidad,
    precio_venta: String(linea.precioLista),
    /** Solo para las líneas sin ficha: la marca es texto suelto. */
    marcaTexto: linea.marca ?? "",
  });

  /*
    La ficha se pide al ABRIR, y con ella las listas.

    No se arrastran desde la fila: el constructor puede tener veinte líneas y
    esto se usa en una. Y se piden juntas en una sola llamada porque el
    diálogo no sirve de nada con la mitad.
  */
  React.useEffect(() => {
    if (!linea.productoId) return;
    let vivo = true;
    fichaParaEditar(linea.productoId).then((r) => {
      if (!vivo) return;
      if (!r.ok) {
        setErrorCarga(r.error);
        return;
      }
      setCatalogos({
        marcas: r.datos.marcas,
        familias: r.datos.familias,
        subfamilias: r.datos.subfamilias,
        unidades: r.datos.unidades,
      });
      /*
        Se parte de lo que dice la FICHA, no de lo que dice la línea.

        Son dos cosas distintas a propósito: la línea lleva una copia de lo que
        se imprimió, y puede haberse editado a mano —el retén cotizado como
        NQK—. Si el diálogo arrancara con eso y se pulsara «Guardar», esa marca
        de una cotización se escribiría en el catálogo sin que nadie lo pidiera.
      */
      setDatos((d) => ({
        ...d,
        codigo: r.datos.producto.codigo,
        descripcion: r.datos.producto.descripcion,
        marca_id: r.datos.producto.marca_id,
        familia_id: r.datos.producto.familia_id,
        subfamilia_id: r.datos.producto.subfamilia_id,
        unidad_codigo: r.datos.producto.unidad_codigo,
        precio_venta: String(r.datos.producto.precio_venta),
      }));
    });
    return () => {
      vivo = false;
    };
  }, [linea.productoId]);

  // Las sub-familias cuelgan de la familia elegida. Enseñar las 35 a la vez
  // obliga a buscar la que toca entre las de otras familias.
  const subfamilias = React.useMemo(
    () =>
      (catalogos?.subfamilias ?? []).filter((s) => s.familia_id === datos.familia_id),
    [catalogos, datos.familia_id],
  );

  const unidades = React.useMemo(
    () =>
      (catalogos?.unidades ?? []).map((u) => ({
        id: u.codigo,
        nombre: `${u.nombre} (${u.abreviatura})`,
      })),
    [catalogos],
  );

  /** Dar de alta lo que no está, sin cerrar el diálogo. */
  async function alta(
    accion: () => Promise<ResultadoCatalogo>,
    lista: "marcas" | "familias" | "subfamilias",
    familiaId?: string,
  ): Promise<OpcionCatalogo | null> {
    const r = await accion();
    if (!r.ok) {
      toast.error(r.error);
      return null;
    }

    const nueva = { id: r.datos.id, nombre: r.datos.nombre };

    setCatalogos((c) => {
      if (!c) return c;
      if (lista === "subfamilias") {
        return {
          ...c,
          subfamilias: [...c.subfamilias, { ...nueva, familia_id: familiaId ?? "" }],
        };
      }
      return { ...c, [lista]: [...c[lista], nueva] };
    });

    toast.success(
      r.datos.creada ? `«${nueva.nombre}» creada.` : `«${nueva.nombre}» ya existía.`,
    );
    return nueva;
  }

  const listo = enCatalogo
    ? datos.codigo.trim().length > 0 &&
      datos.descripcion.trim().length >= 3 &&
      datos.marca_id !== "" &&
      datos.familia_id !== "" &&
      datos.subfamilia_id !== ""
    : datos.codigo.trim().length > 0 && datos.descripcion.trim().length >= 3;

  const nombreDeMarca = () =>
    catalogos?.marcas.find((m) => m.id === datos.marca_id)?.nombre ?? null;

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!listo) return;

    // Sin ficha en el catálogo solo hay que cambiar lo que se imprime.
    if (!enCatalogo) {
      onGuardar({
        codigo: datos.codigo,
        marca: datos.marcaTexto,
        descripcion: datos.descripcion,
      });
      onCerrar();
      return;
    }

    empezar(async () => {
      const r = await editarProductoRapido({
        id: linea.productoId as string,
        codigo: datos.codigo,
        descripcion: datos.descripcion,
        marca_id: datos.marca_id,
        familia_id: datos.familia_id,
        subfamilia_id: datos.subfamilia_id,
        unidad_codigo: datos.unidad_codigo,
        precio_venta: Number(datos.precio_venta) || 0,
        marcaNombre: nombreDeMarca(),
      });

      if (!r.ok) {
        toast.error(r.error);
        return;
      }

      toast.success(`${r.producto.codigo} actualizado en el catálogo.`);
      onGuardar({
        codigo: r.producto.codigo,
        marca: r.producto.marca ?? "",
        descripcion: r.producto.descripcion,
      });
      onCerrar();
    });
  }

  return (
    <Dialog open onOpenChange={(v) => (v ? null : onCerrar())}>
      {/* Tan ancho como el de crear: son los mismos campos. */}
      <DialogContent ancho="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar artículo</DialogTitle>
          <DialogDescription>
            {enCatalogo
              ? "Cambia la ficha del producto en el catálogo, y de paso lo que sale en esta cotización."
              : "Este artículo se escribió a mano y no está en el catálogo, así que solo se cambia lo que sale impreso."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar}>
          <DialogBody className="flex flex-col gap-3">
            {errorCarga ? (
              <p className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger)]">
                {errorCarga}
              </p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <Campo id="ed-codigo" label="Código" requerido>
                <Input
                  id="ed-codigo"
                  value={datos.codigo}
                  onChange={(e) => setDatos((d) => ({ ...d, codigo: e.target.value }))}
                  className="font-mono"
                  required
                />
              </Campo>

              {enCatalogo ? (
                <SelectorCatalogo
                  id="ed-marca"
                  label="Marca"
                  requerido
                  opciones={catalogos?.marcas ?? []}
                  valor={datos.marca_id}
                  onElegir={(o) => setDatos((d) => ({ ...d, marca_id: o?.id ?? "" }))}
                  onCrear={(nombre) => alta(() => crearMarca(nombre), "marcas")}
                  deshabilitado={!catalogos}
                  textoVacio="Cargando…"
                />
              ) : (
                <Campo id="ed-marca-texto" label="Marca">
                  <Input
                    id="ed-marca-texto"
                    list="marcas-conocidas"
                    value={datos.marcaTexto}
                    onChange={(e) =>
                      setDatos((d) => ({ ...d, marcaTexto: e.target.value }))
                    }
                    placeholder="sin marca"
                  />
                </Campo>
              )}
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

            {enCatalogo ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectorCatalogo
                    id="ed-familia"
                    label="Familia"
                    requerido
                    opciones={catalogos?.familias ?? []}
                    valor={datos.familia_id}
                    onElegir={(o) =>
                      // Al cambiar de familia, la sub-familia elegida deja de
                      // tener sentido: se limpia en vez de quedarse colgando
                      // de otra.
                      setDatos((d) => ({
                        ...d,
                        familia_id: o?.id ?? "",
                        subfamilia_id: "",
                      }))
                    }
                    onCrear={(nombre) => alta(() => crearFamilia(nombre), "familias")}
                    deshabilitado={!catalogos}
                    textoVacio="Cargando…"
                  />

                  <SelectorCatalogo
                    id="ed-subfamilia"
                    label="Sub-familia"
                    requerido
                    opciones={subfamilias}
                    valor={datos.subfamilia_id}
                    onElegir={(o) =>
                      setDatos((d) => ({ ...d, subfamilia_id: o?.id ?? "" }))
                    }
                    deshabilitado={!catalogos || datos.familia_id === ""}
                    textoVacio={
                      catalogos ? "Elige antes la familia" : "Cargando…"
                    }
                    // La clave ajena es compuesta: la sub-familia nueva cuelga
                    // de la familia elegida, no de una cualquiera.
                    onCrear={(nombre) =>
                      alta(
                        () => crearSubfamilia(datos.familia_id, nombre),
                        "subfamilias",
                        datos.familia_id,
                      )
                    }
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {/* Se busca pero no se crea: el catálogo de unidades es el
                      de SUNAT, y una inventada es un comprobante rechazado. */}
                  <SelectorCatalogo
                    id="ed-unidad"
                    label="Unidad"
                    opciones={unidades}
                    valor={datos.unidad_codigo}
                    onElegir={(o) =>
                      setDatos((d) => ({ ...d, unidad_codigo: o?.id ?? "NIU" }))
                    }
                    deshabilitado={!catalogos}
                    textoVacio="Cargando…"
                  />

                  <Campo
                    id="ed-precio"
                    label="Precio de lista"
                    ayuda="El de la cotización se sigue cambiando en la fila."
                  >
                    <Input
                      id="ed-precio"
                      type="number"
                      min={0}
                      step="0.01"
                      value={datos.precio_venta}
                      onChange={(e) =>
                        setDatos((d) => ({ ...d, precio_venta: e.target.value }))
                      }
                      className="tabular"
                    />
                  </Campo>
                </div>

                {/*
                  El alcance, dicho donde se decide.

                  Sin esta frase, «editar artículo» dentro de una cotización se
                  lee como «editar esta línea», y la diferencia importa: aquí
                  se escribe el maestro, que es lo que verá la próxima
                  cotización de cualquiera.

                  Y con el caso del retén al lado, porque es el que hace que la
                  distinción no sea teórica.
                */}
                <p className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-2)] p-3 text-sm text-[var(--fg-muted)]">
                  Esto cambia el producto en el catálogo, para todas las
                  cotizaciones. Si este código lo vendes con varias marcas —un
                  retén <span className="font-mono">45X60X8TC</span> es LYO,
                  NQK, PHK o NAK—, cambia la marca solo en esta cotización
                  desde la columna <strong>Marca</strong> de la tabla.
                </p>

                <p className="text-sm text-[var(--fg-subtle)]">
                  El costo, el peso, los mínimos y la ubicación no se tocan
                  desde aquí: siguen como están, y se editan en la ficha del
                  producto.
                </p>
              </>
            ) : null}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!listo || guardando || (enCatalogo && !catalogos)}
            >
              {guardando
                ? "Guardando…"
                : enCatalogo
                  ? "Guardar en el catálogo"
                  : "Guardar en esta línea"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
