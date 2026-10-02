"use client";

import * as React from "react";
import {
  Button,
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
import { Check, PackagePlus } from "lucide-react";

import {
  crearFamilia,
  crearMarca,
  crearSubfamilia,
  type ResultadoCatalogo,
} from "@/modules/productos/acciones/catalogos";
import { catalogosParaAlta, crearProductoRapido } from "@/modules/productos/acciones/alta-rapida";
import {
  SelectorCatalogo,
  type OpcionCatalogo,
} from "@/modules/cotizaciones/ui/constructor/selector-catalogo";

import type { LineaAnalisis, ProductoParaAnalizar } from "../../dominio/analisis";

type Catalogos = {
  marcas: OpcionCatalogo[];
  familias: OpcionCatalogo[];
  subfamilias: (OpcionCatalogo & { familia_id: string })[];
  unidades: { codigo: string; nombre: string; abreviatura: string }[];
};

type Fila = {
  key: string;
  incluir: boolean;
  codigo: string;
  marca_id: string;
  descripcion: string;
  estado: "pendiente" | "creado" | "error";
  error?: string;
};

/**
 * Dar de alta, de una vez, los productos del análisis que no están en el
 * catálogo.
 *
 * Luis, 02/10: *«dar de alta los productos que no están registrados […] si
 * tiene 5 productos, ¿cómo se puede dar de alta 5 productos al mismo
 * tiempo?»*. De su proforma real, 17 de 29 no estaban. Antes había un enlace a
 * «Nuevo producto» que SACABA de la pantalla —y con el análisis sin guardar,
 * se perdía lo escrito—, y había que hacerlo de uno en uno.
 *
 * Lo que se repite se elige una vez —familia, sub-familia y unidad son las
 * mismas en una proforma de rodamientos— y lo propio de cada uno, en su fila.
 * Cada alta pasa por `crearProductoRapido`, la misma de cotizaciones: un solo
 * camino al maestro, con su candado de rol y su aviso de código repetido. El
 * peso y el precio de mercado del análisis los apunta `guardar_analisis` al
 * guardar (098), así que aquí no se piden.
 */
export function AltaEnBloque({
  lineas,
  onCreado,
}: {
  /** Las líneas sin producto del catálogo (y con código). */
  lineas: LineaAnalisis[];
  onCreado: (key: string, producto: ProductoParaAnalizar) => void;
}) {
  const [abierto, setAbierto] = React.useState(false);
  const [catalogos, setCatalogos] = React.useState<Catalogos | null>(null);
  const [errorCarga, setErrorCarga] = React.useState<string | null>(null);
  const [comun, setComun] = React.useState({ familia_id: "", subfamilia_id: "", unidad_codigo: "NIU" });
  const [filas, setFilas] = React.useState<Fila[]>([]);
  const [creando, setCreando] = React.useState(false);

  const abrir = () => {
    setAbierto(true);
    setFilas(
      lineas.map((l) => ({
        key: l.key,
        // Lo que se va a pedir, marcado; lo que no, se puede marcar.
        incluir: l.cantidadPedido > 0,
        codigo: l.codigo,
        marca_id: "",
        descripcion: "",
        estado: "pendiente",
      })),
    );
    if (catalogos) return;
    void catalogosParaAlta().then((r) => {
      if (!r.ok) {
        setErrorCarga(r.error);
        return;
      }
      setCatalogos(r.datos);
    });
  };

  // La marca escrita en la proforma (INA, SKF…), elegida sola si ya existe.
  React.useEffect(() => {
    if (!catalogos) return;
    const porNombre = new Map(catalogos.marcas.map((m) => [m.nombre.trim().toUpperCase(), m.id]));
    setFilas((fs) =>
      fs.map((f) => {
        if (f.marca_id) return f;
        const l = lineas.find((x) => x.key === f.key);
        return { ...f, marca_id: porNombre.get((l?.marca ?? "").trim().toUpperCase()) ?? "" };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al llegar el catálogo
  }, [catalogos]);

  const subfamilias = React.useMemo(
    () => (catalogos?.subfamilias ?? []).filter((s) => s.familia_id === comun.familia_id),
    [catalogos, comun.familia_id],
  );
  const unidades = React.useMemo(
    () =>
      (catalogos?.unidades ?? []).map((u) => ({
        id: u.codigo,
        nombre: `${u.nombre} (${u.abreviatura})`,
      })),
    [catalogos],
  );

  /** Dar de alta una marca, familia o sub-familia sin cerrar nada (como en cotizaciones). */
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
        return { ...c, subfamilias: [...c.subfamilias, { ...nueva, familia_id: familiaId ?? "" }] };
      }
      return { ...c, [lista]: [...c[lista], nueva] };
    });
    toast.success(r.datos.creada ? `«${nueva.nombre}» creada.` : `«${nueva.nombre}» ya existía.`);
    return nueva;
  }

  const elegirSubfamilia = (o: OpcionCatalogo | null) => {
    setComun((c) => ({ ...c, subfamilia_id: o?.id ?? "" }));
    /*
      La descripción se propone como las del catálogo: código, familia y
      sub-familia —«6311-2Z/C3 RODAMIENTO RIGIDO DE BOLAS»—. Solo en las
      vacías: lo escrito no se toca.
    */
    if (!o) return;
    const familia = catalogos?.familias.find((x) => x.id === comun.familia_id)?.nombre ?? "";
    setFilas((fs) =>
      fs.map((f) =>
        f.descripcion.trim()
          ? f
          : { ...f, descripcion: [f.codigo.trim(), familia, o.nombre].filter(Boolean).join(" ").slice(0, 300) },
      ),
    );
  };

  const elegidas = filas.filter((f) => f.incluir && f.estado !== "creado");
  const faltan = (f: Fila) =>
    !f.codigo.trim() ? "el código" : !f.marca_id ? "la marca" : f.descripcion.trim().length < 3 ? "la descripción" : null;
  const listoComun = comun.familia_id !== "" && comun.subfamilia_id !== "" && comun.unidad_codigo !== "";
  const incompletas = elegidas.filter((f) => faltan(f) !== null);
  const puede = listoComun && elegidas.length > 0 && incompletas.length === 0 && !creando;

  const darDeAlta = async () => {
    setCreando(true);
    let bien = 0;
    // De una en una: cada una es una alta completa, y un código repetido no
    // tiene que tumbar a las demás.
    for (const f of elegidas) {
      const marca = catalogos?.marcas.find((m) => m.id === f.marca_id)?.nombre ?? null;
      const r = await crearProductoRapido({
        codigo: f.codigo.trim().toUpperCase(),
        descripcion: f.descripcion.trim(),
        marca_id: f.marca_id,
        familia_id: comun.familia_id,
        subfamilia_id: comun.subfamilia_id,
        unidad_codigo: comun.unidad_codigo,
        precio_venta: 0,
        marcaNombre: marca,
      });
      setFilas((fs) =>
        fs.map((x) =>
          x.key !== f.key ? x : r.ok ? { ...x, estado: "creado", error: undefined } : { ...x, estado: "error", error: r.error },
        ),
      );
      if (r.ok) {
        bien++;
        onCreado(f.key, {
          id: r.producto.id,
          codigo: r.producto.codigo,
          descripcion: r.producto.descripcion,
          marca: r.producto.marca,
        });
      }
    }
    setCreando(false);
    const mal = elegidas.length - bien;
    if (bien > 0) toast.success(`${bien} ${bien === 1 ? "producto dado" : "productos dados"} de alta.`);
    if (mal > 0) toast.error(`${mal} no se ${mal === 1 ? "pudo" : "pudieron"} dar de alta: mira el motivo en su fila.`);
    else setAbierto(false);
  };

  if (lineas.length === 0) return null;

  return (
    <Dialog open={abierto} onOpenChange={(v) => (v ? abrir() : !creando && setAbierto(false))}>
      <Button type="button" onClick={abrir}>
        <PackagePlus className="size-4" aria-hidden />
        Darlos de alta aquí ({lineas.length})
      </Button>
      <DialogContent className="flex max-h-[92dvh] w-[min(100vw-1rem,56rem)] max-w-none flex-col">
        <DialogHeader>
          <DialogTitle>Dar de alta en el catálogo</DialogTitle>
          <DialogDescription className="text-sm">
            Los productos de la proforma que no están. Se crean sin precio ni costo, como los que
            entraron del Excel; el peso y el precio de mercado se apuntan al guardar el análisis.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          {errorCarga ? (
            <p className="text-sm text-[var(--danger)]">{errorCarga}</p>
          ) : !catalogos ? (
            <p className="text-sm text-[var(--fg-muted)]">Cargando marcas y familias…</p>
          ) : (
            <>
              <fieldset className="rounded-md border border-[var(--border)] p-3">
                <legend className="px-1 text-sm font-semibold">Para todos</legend>
                <div className="grid gap-3 md:grid-cols-3">
                  <SelectorCatalogo
                    id="bloque-familia"
                    label="Familia"
                    requerido
                    opciones={catalogos.familias}
                    valor={comun.familia_id}
                    onElegir={(o) => setComun((c) => ({ ...c, familia_id: o?.id ?? "", subfamilia_id: "" }))}
                    onCrear={(nombre) => alta(() => crearFamilia(nombre), "familias")}
                  />
                  <SelectorCatalogo
                    id="bloque-subfamilia"
                    label="Sub-familia"
                    requerido
                    opciones={subfamilias}
                    valor={comun.subfamilia_id}
                    onElegir={elegirSubfamilia}
                    deshabilitado={!comun.familia_id}
                    textoVacio={comun.familia_id ? undefined : "Elige antes la familia"}
                    onCrear={(nombre) =>
                      alta(() => crearSubfamilia(comun.familia_id, nombre), "subfamilias", comun.familia_id)
                    }
                  />
                  <SelectorCatalogo
                    id="bloque-unidad"
                    label="Unidad"
                    requerido
                    opciones={unidades}
                    valor={comun.unidad_codigo}
                    onElegir={(o) => setComun((c) => ({ ...c, unidad_codigo: o?.id ?? "" }))}
                  />
                </div>
              </fieldset>

              <ul className="flex flex-col gap-3">
                {filas.map((f) => {
                  const cambiar = (p: Partial<Fila>) =>
                    setFilas((fs) => fs.map((x) => (x.key === f.key ? { ...x, ...p } : x)));
                  const hecho = f.estado === "creado";
                  return (
                    <li
                      key={f.key}
                      className={`rounded-md border p-3 ${
                        hecho
                          ? "border-[var(--ok)] bg-[var(--ok-bg)]"
                          : f.estado === "error"
                            ? "border-[var(--danger)]"
                            : "border-[var(--border)]"
                      }`}
                    >
                      <label className="mb-2 flex items-center gap-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          className="size-5"
                          checked={f.incluir || hecho}
                          disabled={hecho || creando}
                          onChange={(e) => cambiar({ incluir: e.target.checked })}
                        />
                        <span className="font-mono">{f.codigo}</span>
                        {hecho ? (
                          <span className="flex items-center gap-1 text-[var(--ok)]">
                            <Check className="size-4" aria-hidden /> Dado de alta
                          </span>
                        ) : null}
                      </label>
                      {f.incluir && !hecho ? (
                        <div className="grid gap-3 md:grid-cols-[10rem_12rem_minmax(0,1fr)]">
                          <label className="flex flex-col gap-1">
                            <span className="text-sm font-medium">Código</span>
                            <Input
                              value={f.codigo}
                              onChange={(e) => cambiar({ codigo: e.target.value.toUpperCase().slice(0, 60) })}
                              className="font-mono"
                              disabled={creando}
                            />
                          </label>
                          <SelectorCatalogo
                            id={`bloque-marca-${f.key}`}
                            label="Marca"
                            requerido
                            opciones={catalogos.marcas}
                            valor={f.marca_id}
                            onElegir={(o) => cambiar({ marca_id: o?.id ?? "" })}
                            onCrear={async (nombre) => {
                              const o = await alta(() => crearMarca(nombre), "marcas");
                              if (o) cambiar({ marca_id: o.id });
                              return o;
                            }}
                            deshabilitado={creando}
                          />
                          <label className="flex flex-col gap-1">
                            <span className="text-sm font-medium">Descripción</span>
                            <Input
                              value={f.descripcion}
                              onChange={(e) => cambiar({ descripcion: e.target.value.slice(0, 300) })}
                              placeholder="RODAMIENTO RÍGIDO DE BOLAS"
                              disabled={creando}
                            />
                          </label>
                        </div>
                      ) : null}
                      {f.estado === "error" ? (
                        <p className="mt-2 text-sm text-[var(--danger)]">{f.error}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </DialogBody>

        <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[var(--fg-muted)]">
            {!listoComun
              ? "Elige la familia, la sub-familia y la unidad."
              : incompletas.length > 0
                ? `Falta ${faltan(incompletas[0]!)} de ${incompletas[0]!.codigo || "un producto"}.`
                : `${elegidas.length} ${elegidas.length === 1 ? "producto" : "productos"} para dar de alta.`}
          </p>
          <Button type="button" onClick={() => void darDeAlta()} disabled={!puede}>
            <PackagePlus className="size-4" aria-hidden />
            {creando ? "Dando de alta…" : `Dar de alta ${elegidas.length > 0 ? `los ${elegidas.length}` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
