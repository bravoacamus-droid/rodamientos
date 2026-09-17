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
  type FichaParaEditar,
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
    /** Solo cuando se guardó en el CATÁLOGO: la línea copia lo nuevo. */
    ficha?: { costoUnitario: number; precioMinimo: number; precioLista: number };
  }) => void;
}) {
  /** ¿Tiene ficha que editar, o es una línea escrita a mano? */
  const hayFicha = linea.productoId !== null;

  /*
    Hasta dónde llega lo que se cambia. Es la primera pregunta del diálogo.

    Sin esto había dos sitios para cambiar una marca —la caja de la fila y este
    diálogo— y nada decía en qué se diferencian. Luis, 16/09: *«¿por qué se
    puede cambiar eso?, no quedamos… y ocupa mucho»*. La caja se fue; la
    decisión se queda, porque el caso que la hacía falta sigue existiendo.

    Por defecto, el catálogo: es lo que se quiere el 90 % de las veces —un
    producto mal descrito, una familia equivocada— y es lo que pidió Luis que
    trajera el editar.
  */
  const [alcance, setAlcance] = React.useState<"catalogo" | "linea">(
    hayFicha ? "catalogo" : "linea",
  );
  const enCatalogo = hayFicha && alcance === "catalogo";

  const [catalogos, setCatalogos] = React.useState<Catalogos | null>(null);
  const [ficha, setFicha] = React.useState<FichaParaEditar | null>(null);
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
    ultimo_costo: String(linea.costoUnitario),
    precio_minimo: String(linea.precioMinimo),
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
      setFicha(r.datos.producto);
      setDatos((d) => ({
        ...d,
        codigo: r.datos.producto.codigo,
        descripcion: r.datos.producto.descripcion,
        marca_id: r.datos.producto.marca_id,
        familia_id: r.datos.producto.familia_id,
        subfamilia_id: r.datos.producto.subfamilia_id,
        unidad_codigo: r.datos.producto.unidad_codigo,
        precio_venta: String(r.datos.producto.precio_venta),
        ultimo_costo: String(r.datos.producto.ultimo_costo),
        precio_minimo: String(r.datos.producto.precio_minimo),
      }));
    });
    return () => {
      vivo = false;
    };
  }, [linea.productoId]);

  /**
   * Cambiar de alcance recarga el código y la descripción del sitio que toca.
   *
   * No son el mismo dato: el catálogo tiene el suyo y la línea lleva una copia
   * que pudo editarse. Si al pasar de «en el catálogo» a «solo aquí» se
   * quedara en pantalla la descripción del maestro, se escribiría encima de la
   * que ya tenía esta cotización sin haberla tocado nadie.
   */
  function cambiarAlcance(nuevo: "catalogo" | "linea") {
    setAlcance(nuevo);
    const origen =
      nuevo === "catalogo" && ficha
        ? { codigo: ficha.codigo, descripcion: ficha.descripcion }
        : { codigo: linea.codigo, descripcion: linea.descripcion };
    setDatos((d) => ({ ...d, ...origen }));
  }

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

  /** El mínimo por encima del de lista: la base lo rechaza, así que se dice antes. */
  const minimoSobrePasa =
    Number(datos.precio_minimo) > 0 &&
    Number(datos.precio_venta) > 0 &&
    Number(datos.precio_minimo) > Number(datos.precio_venta);

  const listo = enCatalogo
    ? datos.codigo.trim().length > 0 &&
      datos.descripcion.trim().length >= 3 &&
      datos.marca_id !== "" &&
      datos.familia_id !== "" &&
      datos.subfamilia_id !== "" &&
      !minimoSobrePasa
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
        ultimo_costo: Number(datos.ultimo_costo) || 0,
        precio_minimo: Number(datos.precio_minimo) || 0,
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
        // Sin esto, el costo y el mínimo recién escritos no llegarían a la
        // línea: el modal de precios seguiría diciendo «sin cargar» y el
        // margen seguiría sin poder calcularse, justo después de haberlos
        // rellenado para verlos.
        ficha: {
          costoUnitario: Number(datos.ultimo_costo) || 0,
          precioMinimo: Number(datos.precio_minimo) || 0,
          precioLista: Number(datos.precio_venta) || 0,
        },
      });
      onCerrar();
    });
  }

  return (
    <Dialog open onOpenChange={(v) => (v ? null : onCerrar())}>
      {/* Tan ancho como el de crear: son los mismos campos. */}
      <DialogContent ancho="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar {linea.codigo}</DialogTitle>
          <DialogDescription>
            {!hayFicha
              ? "Este artículo se escribió a mano y no está en el catálogo, así que solo se cambia lo que sale impreso."
              : enCatalogo
                ? "Lo que cambies queda en el catálogo y sale en esta cotización."
                : "Lo que cambies sale solo en esta cotización. El catálogo se queda como está."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar}>
          <DialogBody className="flex flex-col gap-3">
            {errorCarga ? (
              <p className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger)]">
                {errorCarga}
              </p>
            ) : null}

            {/*
              Hasta dónde llega el cambio: la primera pregunta, y en botones
              grandes con su explicación.

              Podría ser una casilla de «guardar también en el catálogo», pero
              una casilla se lee después de haber rellenado todo, y aquí la
              respuesta cambia qué campos tiene sentido enseñar. Puesta arriba,
              lo que sigue ya es coherente con lo que se eligió.

              Cada opción dice lo que hace con palabras, no con jerga: «para
              todas las cotizaciones» y «solo en esta». Willy no tiene por qué
              saber qué es un maestro.
            */}
            {hayFicha ? (
              <div
                role="radiogroup"
                aria-label="Hasta dónde llega el cambio"
                className="grid gap-2 sm:grid-cols-2"
              >
                <OpcionAlcance
                  activa={alcance === "catalogo"}
                  onClick={() => cambiarAlcance("catalogo")}
                  titulo="En el catálogo"
                  ayuda="Para todas las cotizaciones, también las próximas."
                />
                <OpcionAlcance
                  activa={alcance === "linea"}
                  onClick={() => cambiarAlcance("linea")}
                  titulo="Solo en esta cotización"
                  ayuda="Para un retén 45X60X8TC que esta vez es NQK."
                />
              </div>
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
                    ayuda="Con el que el producto entra a una cotización."
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
                  Costo y precio mínimo, que antes no se podían tocar aquí.

                  Luis, 17/09: *«en editar no puedo poner el precio de costo,
                  precio mínimo y el precio normal o de lista pues»*. Y es el
                  sitio donde hacen falta: de los 790 productos del Excel,
                  casi ninguno tiene los dos, y uno se entera de que faltan
                  cotizando —no paseando por el catálogo—.
                */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo
                    id="ed-costo"
                    label="Costo"
                    ayuda="A cuánto lo compras. Es lo que da el margen."
                  >
                    <Input
                      id="ed-costo"
                      type="number"
                      min={0}
                      step="0.01"
                      value={datos.ultimo_costo}
                      onChange={(e) =>
                        setDatos((d) => ({ ...d, ultimo_costo: e.target.value }))
                      }
                      className="tabular"
                    />
                  </Campo>

                  <Campo
                    id="ed-minimo"
                    label="Precio mínimo de venta"
                    ayuda="Por debajo de esto la cotización avisa. No impide."
                  >
                    <Input
                      id="ed-minimo"
                      type="number"
                      min={0}
                      step="0.01"
                      value={datos.precio_minimo}
                      onChange={(e) =>
                        setDatos((d) => ({ ...d, precio_minimo: e.target.value }))
                      }
                      className="tabular"
                      aria-invalid={minimoSobrePasa}
                    />
                  </Campo>
                </div>

                {/*
                  El único choque entre estos tres, dicho antes de guardar.

                  La base lo rechaza con un `check`, pero su mensaje no se
                  entiende. Aquí se dice con los dos números delante, que es
                  cuando se puede corregir.
                */}
                {minimoSobrePasa ? (
                  <p className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger)]">
                    El precio mínimo no puede ser mayor que el de lista. Sube el
                    de lista o baja el mínimo.
                  </p>
                ) : null}

                <p className="text-sm text-[var(--fg-subtle)]">
                  El peso, los stocks, la ubicación y el precio de mercado no se
                  tocan desde aquí: siguen como están, y se editan en la ficha
                  del producto.
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

/**
 * Una de las dos opciones de alcance.
 *
 * Es un botón con borde, título y explicación, no un radio de 16 px con una
 * etiqueta al lado: la regla de la casa —*«un botón tiene que parecer un
 * botón»*— y, sobre todo, un blanco grande. Esta es la decisión que separa
 * «corrijo la ficha» de «este retén va como NQK», y fallar el clic cambia lo
 * que se escribe en el catálogo de 790 productos.
 *
 * `role="radio"` y `aria-checked` van puestos porque visualmente es un botón
 * pero funcionalmente es una elección entre dos.
 */
function OpcionAlcance({
  activa,
  onClick,
  titulo,
  ayuda,
}: {
  activa: boolean;
  onClick: () => void;
  titulo: string;
  ayuda: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={activa}
      onClick={onClick}
      className={`rounded-md border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] ${
        activa
          ? "border-brand-600 bg-[var(--info-bg)]"
          : "border-[var(--border)] hover:bg-[var(--surface-2)]"
      }`}
    >
      <span className="flex items-center gap-2">
        {/* El punto del radio, dibujado con dos divs: un `<input type=radio>`
            dentro de un botón no se puede pulsar dos veces seguidas sin pelea
            de foco. */}
        <span
          className={`grid size-4 shrink-0 place-items-center rounded-full border-2 ${
            activa ? "border-brand-600" : "border-[var(--border-strong)]"
          }`}
        >
          {activa ? (
            <span className="size-2 rounded-full bg-brand-600" />
          ) : null}
        </span>
        <span className="text-sm font-medium">{titulo}</span>
      </span>
      <span className="mt-1 block pl-6 text-sm text-[var(--fg-muted)]">
        {ayuda}
      </span>
    </button>
  );
}
