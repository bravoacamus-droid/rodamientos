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
  SelectNativo,
  toast,
} from "@rodatech/ui";

import {
  catalogosParaAlta,
  crearProductoRapido,
} from "@/modules/productos/acciones/alta-rapida";

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
      <DialogContent>
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

              <Campo id="alta-marca" label="Marca" requerido>
                <SelectNativo
                  id="alta-marca"
                  value={datos.marca_id}
                  onChange={(e) =>
                    setDatos((d) => ({ ...d, marca_id: e.target.value }))
                  }
                  required
                >
                  <option value="">Elige una marca</option>
                  {(catalogos?.marcas ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </SelectNativo>
              </Campo>
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
              <Campo id="alta-familia" label="Familia" requerido>
                <SelectNativo
                  id="alta-familia"
                  value={datos.familia_id}
                  onChange={(e) =>
                    // Al cambiar de familia, la sub-familia elegida deja de
                    // tener sentido: se limpia en vez de quedarse colgando de
                    // otra familia.
                    setDatos((d) => ({
                      ...d,
                      familia_id: e.target.value,
                      subfamilia_id: "",
                    }))
                  }
                  required
                >
                  <option value="">Elige una familia</option>
                  {(catalogos?.familias ?? []).map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nombre}
                    </option>
                  ))}
                </SelectNativo>
              </Campo>

              <Campo id="alta-subfamilia" label="Sub-familia" requerido>
                <SelectNativo
                  id="alta-subfamilia"
                  value={datos.subfamilia_id}
                  onChange={(e) =>
                    setDatos((d) => ({ ...d, subfamilia_id: e.target.value }))
                  }
                  disabled={datos.familia_id === ""}
                  required
                >
                  <option value="">
                    {datos.familia_id === ""
                      ? "Elige antes la familia"
                      : "Elige una sub-familia"}
                  </option>
                  {subfamilias.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </SelectNativo>
              </Campo>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Campo id="alta-unidad" label="Unidad">
                <SelectNativo
                  id="alta-unidad"
                  value={datos.unidad_codigo}
                  onChange={(e) =>
                    setDatos((d) => ({ ...d, unidad_codigo: e.target.value }))
                  }
                >
                  {(catalogos?.unidades ?? []).map((u) => (
                    <option key={u.codigo} value={u.codigo}>
                      {u.nombre} ({u.abreviatura})
                    </option>
                  ))}
                </SelectNativo>
              </Campo>

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
