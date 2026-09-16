"use client";

/*
 * "use client" OBLIGATORIO: diálogo con estado, y las listas se piden al
 * abrirlo.
 */

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
  catalogosParaAlta,
  crearProductoRapido,
} from "@/modules/productos/acciones/alta-rapida";

import { SelectorCatalogo, type OpcionCatalogo } from "./selector-catalogo";

import type { ProductoParaCotizar } from "../../dominio/constructor";

interface Catalogos {
  marcas: { id: string; nombre: string }[];
  familias: { id: string; nombre: string }[];
  subfamilias: { id: string; nombre: string; familia_id: string }[];
  unidades: { codigo: string; nombre: string; abreviatura: string }[];
}

/**
 * Alta de producto sin salir de la cotización.
 *
 * Willy, 16/09: *«digito un código que no está creado y no me sale la opción
 * para crearlo en el sistema»*.
 *
 * Se piden SEIS cosas y ni una más: código, descripción, marca, familia,
 * sub-familia, unidad y precio. Todo lo demás —costo, peso, mínimos, ubicación—
 * nace en cero, que es exactamente como están los 790 productos que entraron
 * del Excel. Pedirlo aquí sería frenar una cotización para rellenar una ficha
 * de almacén.
 *
 * Las listas se piden al ABRIR el diálogo, no al cargar la pantalla: el
 * cotizador se abre veinte veces al día y esto se usa una.
 */
export function AltaProducto({
  codigoInicial,
  onCerrar,
  onCreado,
}: {
  codigoInicial: string;
  onCerrar: () => void;
  onCreado: (p: ProductoParaCotizar) => void;
}) {
  const [catalogos, setCatalogos] = React.useState<Catalogos | null>(null);
  const [errorCarga, setErrorCarga] = React.useState<string | null>(null);
  const [guardando, empezar] = React.useTransition();

  const [datos, setDatos] = React.useState({
    codigo: codigoInicial,
    descripcion: "",
    marca_id: "",
    familia_id: "",
    subfamilia_id: "",
    unidad_codigo: "NIU",
    precio_venta: "",
  });

  React.useEffect(() => {
    let vivo = true;
    catalogosParaAlta().then((r) => {
      if (!vivo) return;
      if (r.ok) setCatalogos(r.datos);
      else setErrorCarga(r.error);
    });
    return () => {
      vivo = false;
    };
  }, []);

  // Las sub-familias cuelgan de la familia. Enseñar las 35 a la vez obliga a
  // buscar la que toca entre las de otras familias.
  const subfamilias = React.useMemo(
    () =>
      (catalogos?.subfamilias ?? []).filter(
        (s) => s.familia_id === datos.familia_id,
      ),
    [catalogos, datos.familia_id],
  );

  /**
   * Dar de alta una marca, una familia o una sub-familia sin cerrar nada.
   *
   * Lo creado se mete en la lista que ya está en memoria en vez de volver a
   * pedir el catálogo entero: la RPC devuelve la fila, así que un segundo
   * viaje sería pedir 68 filas para enterarse de una.
   *
   * Y devuelve `null` si falla, que es lo que el selector entiende como «no
   * elijas nada»: el mensaje se enseña aquí, que es donde se sabe por qué.
   */
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
          subfamilias: [
            ...c.subfamilias,
            { ...nueva, familia_id: familiaId ?? "" },
          ],
        };
      }
      return { ...c, [lista]: [...c[lista], nueva] };
    });

    /*
      «Creada» y no «ya existía».

      La RPC es idempotente: si el nombre ya estaba, devuelve la fila de
      siempre con `creada: false` en vez de reventar. Decirlo evita la duda
      de «¿la he duplicado?» — que es justo lo que lleva a mirar el catálogo
      para comprobarlo.
    */
    toast.success(
      r.datos.creada ? `«${nueva.nombre}» creada.` : `«${nueva.nombre}» ya existía.`,
    );
    return nueva;
  }

  // El selector habla de `{id, nombre}`; las unidades vienen con `codigo` y
  // su abreviatura. Se traducen aquí en vez de darle al selector un caso
  // especial que solo usa una de las cuatro listas.
  const unidades = React.useMemo(
    () =>
      (catalogos?.unidades ?? []).map((u) => ({
        id: u.codigo,
        nombre: `${u.nombre} (${u.abreviatura})`,
      })),
    [catalogos],
  );

  const listo =
    datos.codigo.trim().length > 0 &&
    datos.descripcion.trim().length >= 3 &&
    datos.marca_id !== "" &&
    datos.familia_id !== "" &&
    datos.subfamilia_id !== "";

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!listo || !catalogos) return;

    empezar(async () => {
      const r = await crearProductoRapido({
        codigo: datos.codigo,
        descripcion: datos.descripcion,
        marca_id: datos.marca_id,
        familia_id: datos.familia_id,
        subfamilia_id: datos.subfamilia_id,
        unidad_codigo: datos.unidad_codigo,
        precio_venta: Number(datos.precio_venta) || 0,
        marcaNombre:
          catalogos.marcas.find((m) => m.id === datos.marca_id)?.nombre ?? null,
      });

      if (!r.ok) {
        toast.error(r.error);
        return;
      }

      toast.success(`${r.producto.codigo} dado de alta y añadido.`);
      onCreado({
        id: r.producto.id,
        codigo: r.producto.codigo,
        descripcion: r.producto.descripcion,
        marca: r.producto.marca,
        unidad: r.producto.unidad,
        stock: r.producto.stock,
        precio_venta: r.producto.precio_venta,
      });
      onCerrar();
    });
  }

  return (
    <Dialog open onOpenChange={(v) => (v ? null : onCerrar())}>
      {/*
        Más ancho que el de por defecto.

        Luis, 16/09: *«este modal debe ser más grande»*. Con tres selectores que
        se despliegan y una descripción larga, `max-w-lg` dejaba los
        desplegables en una rendija y la descripción —que es lo que lee el
        cliente— en media línea.
      */}
      <DialogContent ancho="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Crear producto</DialogTitle>
          <DialogDescription>
            Lo mínimo para poder cotizarlo. El costo, el peso y los mínimos se
            completan después, en su ficha.
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
              <Campo id="alta-codigo" label="Código" requerido>
                <Input
                  id="alta-codigo"
                  value={datos.codigo}
                  onChange={(e) =>
                    setDatos((d) => ({ ...d, codigo: e.target.value }))
                  }
                  className="font-mono"
                  required
                />
              </Campo>

              <SelectorCatalogo
                id="alta-marca"
                label="Marca"
                requerido
                opciones={catalogos?.marcas ?? []}
                valor={datos.marca_id}
                onElegir={(o) =>
                  setDatos((d) => ({ ...d, marca_id: o?.id ?? "" }))
                }
                onCrear={(nombre) => alta(() => crearMarca(nombre), "marcas")}
              />
            </div>

            <Campo
              id="alta-descripcion"
              label="Descripción"
              requerido
              ayuda="Es lo que va a leer el cliente en la cotización."
            >
              <Input
                id="alta-descripcion"
                value={datos.descripcion}
                onChange={(e) =>
                  setDatos((d) => ({ ...d, descripcion: e.target.value }))
                }
                required
              />
            </Campo>

            <div className="grid gap-3 sm:grid-cols-2">
              <SelectorCatalogo
                id="alta-familia"
                label="Familia"
                requerido
                opciones={catalogos?.familias ?? []}
                valor={datos.familia_id}
                onElegir={(o) =>
                  // Al cambiar de familia, la sub-familia elegida deja de
                  // tener sentido: se limpia en vez de quedarse colgando de
                  // otra familia.
                  setDatos((d) => ({
                    ...d,
                    familia_id: o?.id ?? "",
                    subfamilia_id: "",
                  }))
                }
                onCrear={(nombre) => alta(() => crearFamilia(nombre), "familias")}
              />

              <SelectorCatalogo
                id="alta-subfamilia"
                label="Sub-familia"
                requerido
                opciones={subfamilias}
                valor={datos.subfamilia_id}
                onElegir={(o) =>
                  setDatos((d) => ({ ...d, subfamilia_id: o?.id ?? "" }))
                }
                deshabilitado={datos.familia_id === ""}
                textoVacio="Elige antes la familia"
                /*
                  La sub-familia nueva cuelga de la familia elegida, no de una
                  cualquiera: es lo que pidió Luis —*«una nueva familia, de la
                  cual de esa familia se puede crear una sub-familia»*— y
                  además lo exige la base, cuya clave ajena es compuesta
                  (subfamilia_id, familia_id) para que no se pueda colgar de
                  otra.
                */
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
              {/*
                La unidad también se busca —son 42— pero NO se crea.

                Luis, 16/09: *«todos los select»*. Se busca, sí; darlas de alta
                no: el catálogo de unidades es el de SUNAT (`unidades_medida`,
                con sus códigos oficiales), y una unidad inventada es un
                comprobante rechazado. Por eso este selector va sin `onCrear`,
                que es justo para lo que existe ese prop opcional.
              */}
              <SelectorCatalogo
                id="alta-unidad"
                label="Unidad"
                opciones={unidades}
                valor={datos.unidad_codigo}
                onElegir={(o) =>
                  setDatos((d) => ({ ...d, unidad_codigo: o?.id ?? "NIU" }))
                }
              />

              <Campo
                id="alta-precio"
                label="Precio de venta"
                ayuda="Se puede dejar en cero y ponerlo en la línea."
              >
                <Input
                  id="alta-precio"
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
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!listo || guardando || !catalogos}>
              {guardando ? "Creando…" : "Crear y añadir"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
