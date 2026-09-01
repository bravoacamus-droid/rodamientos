"use client";

// Cliente: la jerarquía es en cascada y el precio de venta se calcula solo
// mientras se teclea el costo. Eso es estado local, no navegación.

import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Campo, Combobox, Input } from "@rodatech/ui";

import { ProveedorRapido } from "@/modules/proveedores/ui/rapido";

import {
  crearFamilia,
  crearMarca,
  crearSubfamilia,
  type NodoCreado,
} from "../acciones/catalogos";
import { guardarProducto, type ResultadoProducto } from "../acciones/guardar";
import { NuevoNodo } from "./nuevo-nodo";

/**
 * Alta y edición de un producto.
 *
 * Habla el vocabulario del cliente —FAMILIA, SUB-FAMILIA, DESCRIPCIÓN— y
 * aplica sus mismas reglas que la plantilla de Excel, para que dar de alta uno
 * a mano y cargarlos por lote no den resultados distintos:
 *
 *   · Familia y sub-familia son en cascada.
 *   · El P.V. se calcula como costo x 1.20 mientras no se escriba encima.
 *   · El P.M. no puede superar al P.V.
 *
 * ---------------------------------------------------------------------------
 * Repaso del 01/09
 * ---------------------------------------------------------------------------
 * Todo lo que elige de una lista es un BUSCADOR, no un `<select>`. Willy:
 * *«en todos los select que hay tenemos que tener un buscador, porque es una
 * lista larga (...) cuando tenga 40, 50 marcas o familias»*. Y tenía razón
 * antes de tenerla: ya hay 24 marcas y 42 unidades de medida, y un `<select>`
 * nativo con 42 opciones se despliega hasta tapar media pantalla. El
 * `Combobox` filtra al teclear y su lista tiene tope de alto con barra.
 *
 * Y la «descripción» dejó de ser dos campos. Antes había un desplegable
 * «Descripción (tipo)» Y una caja «Descripción impresa», que es preguntar dos
 * veces lo mismo — en el archivo del cliente la DESCRIPCIÓN del producto ES su
 * tipo. Willy: *«la descripción, tipo, es la descripción impresa; así que solo
 * deja el input»*. Ahora es una caja con sugerencias, y el `tipo_id` que
 * necesita el buscador de equivalentes lo resuelve el servidor a partir de lo
 * escrito.
 */

export interface CatalogosProducto {
  marcas: { id: string; nombre: string }[];
  familias: { id: string; nombre: string }[];
  subfamilias: { id: string; nombre: string; familia_id: string }[];
  tipos: { id: string; nombre: string; subfamilia_id: string }[];
  unidades: { codigo: string; nombre: string; abreviatura: string }[];
  proveedores: { id: string; razon_social: string }[];
}

export interface ProductoEditable {
  id: string;
  codigo: string;
  codigo_fabricante: string | null;
  descripcion: string;
  marca_id: string;
  familia_id: string;
  subfamilia_id: string;
  tipo_id: string | null;
  unidad_codigo: string;
  ultimo_costo: number;
  precio_venta: number;
  precio_minimo: number;
  stock_minimo: number;
  stock_maximo: number;
  peso_kg: number;
  ubicacion: string | null;
  /** A cuánto se ve que está el mercado. Referencia, no piso ni lista. */
  precio_mercado: number;
  /** El proveedor habitual. El historial real lo da la trazabilidad. */
  proveedor_id: string | null;
}

const MARKUP = 1.2;
const redondear2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** 44 px en móvil, la altura de control del ERP a partir de `md`. */
const ALTO = "h-11 md:h-control-md";

export function FormularioProducto({
  catalogos,
  producto,
}: {
  catalogos: CatalogosProducto;
  producto?: ProductoEditable;
}) {
  const router = useRouter();
  const [resultado, guardar, guardando] = useActionState<ResultadoProducto | null, FormData>(
    async (previo, formData) => {
      const r = await guardarProducto(previo, formData);
      // A la ficha del producto: después de crearlo o editarlo lo que se
      // quiere es verlo, no volver a buscarlo en el listado.
      if (r.ok) router.push(`/productos/${r.id}`);
      return r;
    },
    null,
  );

  const [f, setF] = useState({
    codigo: producto?.codigo ?? "",
    codigo_fabricante: producto?.codigo_fabricante ?? "",
    descripcion: producto?.descripcion ?? "",
    marca_id: producto?.marca_id ?? "",
    familia_id: producto?.familia_id ?? "",
    subfamilia_id: producto?.subfamilia_id ?? "",
    unidad_codigo: producto?.unidad_codigo ?? "NIU",
    ultimo_costo: String(producto?.ultimo_costo ?? ""),
    precio_venta: String(producto?.precio_venta ?? ""),
    precio_minimo: String(producto?.precio_minimo ?? ""),
    stock_minimo: String(producto?.stock_minimo ?? "0"),
    stock_maximo: String(producto?.stock_maximo ?? "0"),
    peso_kg: String(producto?.peso_kg ?? "0"),
    precio_mercado: String(producto?.precio_mercado ?? ""),
    proveedor_id: producto?.proveedor_id ?? "",
    ubicacion: producto?.ubicacion ?? "",
  });
  // Se recuerda si el P.V. lo escribió una persona: a partir de ahí el costo
  // deja de recalcularlo, porque hay productos que son la excepción.
  const [pvManual, setPvManual] = useState(Boolean(producto?.precio_venta));

  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  /**
   * Lo que se crea sin salir de esta pantalla.
   *
   * Se guarda aparte y se mezcla con lo que vino del servidor, en vez de pedir
   * los catálogos otra vez: recargarlos obligaría a esperar a mitad del alta, y
   * el nivel recién creado tardaría en aparecer en su propio desplegable. La
   * lista del servidor se pone al día en la siguiente navegación.
   */
  const [nuevas, setNuevas] = useState<{
    marcas: { id: string; nombre: string }[];
    familias: { id: string; nombre: string }[];
    subfamilias: { id: string; nombre: string; familia_id: string }[];
    proveedores: { id: string; razon_social: string }[];
  }>({ marcas: [], familias: [], subfamilias: [], proveedores: [] });

  const marcas = useMemo(
    () => [...catalogos.marcas, ...nuevas.marcas],
    [catalogos.marcas, nuevas.marcas],
  );
  const familias = useMemo(
    () => [...catalogos.familias, ...nuevas.familias],
    [catalogos.familias, nuevas.familias],
  );
  const subfamilias = useMemo(
    () =>
      [...catalogos.subfamilias, ...nuevas.subfamilias].filter(
        (s) => s.familia_id === f.familia_id,
      ),
    [catalogos.subfamilias, nuevas.subfamilias, f.familia_id],
  );
  const proveedores = useMemo(
    () => [...catalogos.proveedores, ...nuevas.proveedores],
    [catalogos.proveedores, nuevas.proveedores],
  );

  /**
   * Las descripciones que ya se usan en esta sub-familia.
   *
   * Son las que propone el `<datalist>` del campo de descripción. No es una
   * lista cerrada —se puede escribir cualquier cosa— pero sí es lo que evita
   * que la misma familia acabe con seis maneras de decir lo mismo, que es
   * exactamente el problema que Willy describió de su archivo viejo:
   * *«para una misma familia le he puesto más de una descripción (...) según
   * lo que se me ha ocurrido en su momento»*.
   *
   * En el maestro que mandó el 01/09 esto ya está resuelto: 2.230 productos
   * con 32 descripciones, de 1 a 6 por sub-familia.
   */
  const sugerencias = useMemo(
    () => catalogos.tipos.filter((t) => t.subfamilia_id === f.subfamilia_id),
    [catalogos.tipos, f.subfamilia_id],
  );

  const num = (s: string) => {
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };

  const costo = num(f.ultimo_costo);
  const pv = num(f.precio_venta);
  const pm = num(f.precio_minimo);
  // Sobre el COSTO, como todo el sistema desde la 023. Este formulario era el
  // único sitio que lo decía en voz alta —«margen sobre la venta»— y ahora
  // habla el mismo idioma que el listado, la cotización y el tablero.
  const margen = pv > 0 && costo > 0 ? ((pv - costo) / costo) * 100 : null;
  const pisoAlto = pm > 0 && pv > 0 && pm > pv;

  const cambiarCosto = (v: string) => {
    setF((x) => ({
      ...x,
      ultimo_costo: v,
      precio_venta: pvManual ? x.precio_venta : String(redondear2(num(v) * MARKUP) || ""),
    }));
  };

  const payload = {
    ...(producto ? { id: producto.id } : {}),
    codigo: f.codigo.trim(),
    codigo_fabricante: f.codigo_fabricante.trim() || null,
    descripcion: f.descripcion.trim(),
    marca_id: f.marca_id,
    familia_id: f.familia_id,
    subfamilia_id: f.subfamilia_id,
    // El `tipo_id` ya no se elige en pantalla: lo resuelve el servidor a
    // partir de la descripción escrita y la sub-familia (ver `guardar.ts`).
    // Sigue existiendo porque es lo que empareja un rodamiento con el mismo
    // de otra marca en el buscador de equivalentes.
    unidad_codigo: f.unidad_codigo,
    ultimo_costo: costo,
    precio_venta: pv,
    precio_minimo: pm,
    stock_minimo: num(f.stock_minimo),
    stock_maximo: num(f.stock_maximo),
    peso_kg: num(f.peso_kg),
    precio_mercado: num(f.precio_mercado),
    proveedor_id: f.proveedor_id || null,
    ubicacion: f.ubicacion.trim() || null,
  };

  const listo =
    f.codigo.trim() !== "" &&
    f.descripcion.trim() !== "" &&
    f.marca_id !== "" &&
    f.familia_id !== "" &&
    f.subfamilia_id !== "" &&
    !pisoAlto;

  const errorDe = (campo: string) =>
    resultado && !resultado.ok && resultado.campo === campo ? resultado.error : undefined;

  return (
    <form action={guardar} className="flex flex-col gap-4">
      <input type="hidden" name="producto" value={JSON.stringify(payload)} />

      {resultado && !resultado.ok && !resultado.campo ? (
        <p
          role="alert"
          className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger)]"
        >
          {resultado.error}
        </p>
      ) : null}

      {/* ══════════════════════════════════════════ Identificación ══════ */}
      <section className="card flex flex-col gap-3 p-4">
        <h2 className="text-base font-semibold">Identificación</h2>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Campo
            id="codigo"
            label="Código"
            requerido
            error={errorDe("codigo")}
            ayuda="El del fabricante, tal cual viene en la caja."
          >
            <Input
              id="codigo"
              className={ALTO}
              value={f.codigo}
              onChange={(e) => set("codigo", e.target.value)}
              placeholder="6209-2RS1/C3"
              autoComplete="off"
              autoFocus={!producto}
            />
          </Campo>

          <Campo
            id="codigo_fabricante"
            label="Código alterno"
            ayuda="El de otro proveedor, o el interno."
          >
            <Input
              id="codigo_fabricante"
              className={ALTO}
              value={f.codigo_fabricante}
              onChange={(e) => set("codigo_fabricante", e.target.value)}
              autoComplete="off"
            />
          </Campo>

          <Campo id="marca_id" label="Marca" requerido error={errorDe("marca_id")}>
            <Combobox
              id="marca_id"
              className={ALTO}
              opciones={marcas.map((m) => ({ valor: m.id, etiqueta: m.nombre }))}
              valor={f.marca_id || null}
              onCambio={(v) => set("marca_id", v ?? "")}
              placeholder="Elige la marca"
              placeholderBusqueda="SKF, FAG, NTN…"
              textoVacio="Ninguna marca coincide. Créala aquí abajo."
              invalido={Boolean(errorDe("marca_id"))}
            />
            {/* Willy, 01/09: «de pronto se presenta alguna marca que no está
                registrada y tengo que crearla para crear el producto en sí».
                Faltaba: la 028 dejaba crear familia y sub-familia, no marca. */}
            <NuevoNodo
              etiqueta="marca"
              crear={crearMarca}
              onCreado={(n: NodoCreado) => {
                setNuevas((x) => ({
                  ...x,
                  marcas: x.marcas.some((y) => y.id === n.id)
                    ? x.marcas
                    : [...x.marcas, { id: n.id, nombre: n.nombre }],
                }));
                setF((x) => ({ ...x, marca_id: n.id }));
              }}
            />
          </Campo>

          {/*
            La unidad NO se crea, se elige — y eso no es una limitación
            nuestra. `unidades_medida` es el catálogo 03 de SUNAT y su código
            es el que viaja dentro del XML de la factura. Uno inventado no lo
            rechaza esta pantalla: lo rechaza SUNAT, con la factura ya emitida.

            Lo que sí se hizo (migración 039) es cargar el catálogo entero:
            había 6 unidades de las 42 que un almacén industrial puede
            necesitar. Con el buscador, tener 42 no estorba.
          */}
          <Campo
            id="unidad_codigo"
            label="Unidad de medida"
            ayuda="Es la que viaja en la factura electrónica."
          >
            <Combobox
              id="unidad_codigo"
              className={ALTO}
              opciones={catalogos.unidades.map((u) => ({
                valor: u.codigo,
                etiqueta: u.nombre,
                detalle: `${u.abreviatura} · ${u.codigo}`,
              }))}
              valor={f.unidad_codigo || null}
              onCambio={(v) => set("unidad_codigo", v ?? "NIU")}
              limpiable={false}
              placeholder="Unidad"
              placeholderBusqueda="Unidad, caja, metro, kilo…"
              textoVacio="Ninguna del catálogo de SUNAT coincide."
            />
          </Campo>
        </div>
      </section>

      {/* ═══════════════════════════════════════════ Clasificación ══════ */}
      <section className="card flex flex-col gap-3 p-4">
        <div>
          <h2 className="text-base font-semibold">Clasificación</h2>
          <p className="mt-0.5 text-sm text-[var(--fg-muted)]">
            Familia y sub-familia son para buscar y agrupar. La descripción es
            lo que el cliente lee en la cotización.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo id="familia_id" label="Familia" requerido error={errorDe("familia_id")}>
            <Combobox
              id="familia_id"
              className={ALTO}
              opciones={familias.map((c) => ({ valor: c.id, etiqueta: c.nombre }))}
              valor={f.familia_id || null}
              onCambio={(v) =>
                // Cambiar de familia invalida la sub-familia: la que hubiera
                // no cuelga de esta.
                setF((x) => ({ ...x, familia_id: v ?? "", subfamilia_id: "" }))
              }
              placeholder="Elige la familia"
              placeholderBusqueda="Rodamiento, retén…"
              textoVacio="Ninguna familia coincide. Créala aquí abajo."
              invalido={Boolean(errorDe("familia_id"))}
            />
            <NuevoNodo
              etiqueta="familia"
              crear={crearFamilia}
              onCreado={(n: NodoCreado) => {
                setNuevas((x) => ({
                  ...x,
                  familias: x.familias.some((y) => y.id === n.id)
                    ? x.familias
                    : [...x.familias, { id: n.id, nombre: n.nombre }],
                }));
                setF((x) => ({ ...x, familia_id: n.id, subfamilia_id: "" }));
              }}
            />
          </Campo>

          <Campo
            id="subfamilia_id"
            label="Sub-familia"
            requerido
            error={errorDe("subfamilia_id")}
          >
            <Combobox
              id="subfamilia_id"
              className={ALTO}
              opciones={subfamilias.map((s) => ({ valor: s.id, etiqueta: s.nombre }))}
              valor={f.subfamilia_id || null}
              onCambio={(v) => setF((x) => ({ ...x, subfamilia_id: v ?? "" }))}
              deshabilitado={!f.familia_id}
              placeholder={f.familia_id ? "Elige la sub-familia" : "Primero la familia"}
              placeholderBusqueda="Rígido de bolas, cónicos…"
              textoVacio="Ninguna sub-familia coincide. Créala aquí abajo."
              invalido={Boolean(errorDe("subfamilia_id"))}
            />
            <NuevoNodo
              etiqueta="sub-familia"
              deshabilitado={!f.familia_id}
              ayudaDeshabilitado="Elige antes la familia: una sub-familia cuelga de una."
              crear={(nombre) => crearSubfamilia(f.familia_id, nombre)}
              onCreado={(n: NodoCreado) => {
                setNuevas((x) => ({
                  ...x,
                  subfamilias: x.subfamilias.some((y) => y.id === n.id)
                    ? x.subfamilias
                    : [...x.subfamilias, { id: n.id, nombre: n.nombre, familia_id: f.familia_id }],
                }));
                setF((x) => ({ ...x, subfamilia_id: n.id }));
              }}
            />
          </Campo>
        </div>

        {/*
          UN campo, no dos.

          Antes eran un desplegable «Descripción (tipo)» y una caja
          «Descripción impresa» que se copiaban entre sí. Willy, 01/09: *«la
          descripción, tipo, es la descripción impresa; así que solo deja el
          input»*.

          El `<datalist>` propone las que ya se usan en esta sub-familia. No
          cierra la lista —se escribe lo que sea— pero es lo que evita que la
          misma sub-familia acabe con seis formas de decir lo mismo, que es el
          problema que él mismo describió de su archivo viejo.
        */}
        <Campo
          id="descripcion"
          label="Descripción"
          requerido
          error={errorDe("descripcion")}
          ayuda={
            sugerencias.length > 0
              ? `Es lo que sale impreso en la cotización. Hay ${sugerencias.length} ya en uso en esta sub-familia: escribe y se proponen.`
              : "Es lo que sale impreso en la cotización. NO repitas aquí el código ni la marca: van en su propia columna."
          }
        >
          <Input
            id="descripcion"
            className={ALTO}
            value={f.descripcion}
            onChange={(e) => set("descripcion", e.target.value)}
            list="descripciones-subfamilia"
            placeholder="RODAMIENTO RIGIDO DE BOLAS 1 HIL."
            autoComplete="off"
          />
          <datalist id="descripciones-subfamilia">
            {sugerencias.map((t) => (
              <option key={t.id} value={t.nombre} />
            ))}
          </datalist>
        </Campo>
      </section>

      {/* ═════════════════════════════════════════════════ Precios ══════
          Los cuatro en una fila. Willy, 01/09, señalando la pantalla: *«acá,
          si los inputs los hacemos más pequeños, entran los 4 en una sola
          línea»*. Estaban en `md:grid-cols-3`, así que el de mercado caía
          solo a la segunda fila con tres huecos vacíos al lado. */}
      <section className="card flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">Precios</h2>
          <span className="text-sm text-[var(--fg-muted)]">
            En dólares y sin IGV — como los trabaja Willy.
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Campo id="ultimo_costo" label="P.C. — costo" ayuda="Lo que te cuesta comprarlo.">
            <Input
              id="ultimo_costo"
              type="number"
              step="0.0001"
              min={0}
              numerico
              className={ALTO}
              value={f.ultimo_costo}
              onChange={(e) => cambiarCosto(e.target.value)}
            />
          </Campo>

          <Campo
            id="precio_venta"
            label="P.V. — venta"
            ayuda={pvManual ? "Escrito a mano." : "Calculado: costo × 1.20."}
          >
            <Input
              id="precio_venta"
              type="number"
              step="0.01"
              min={0}
              numerico
              className={`${ALTO} ${pvManual ? "" : "bg-[var(--surface-2)]"}`}
              value={f.precio_venta}
              onChange={(e) => {
                setPvManual(true);
                set("precio_venta", e.target.value);
              }}
            />
          </Campo>

          <Campo
            id="precio_minimo"
            label="P.M. — mínimo"
            error={pisoAlto ? "El mínimo no puede superar al de venta." : errorDe("precio_minimo")}
            ayuda="El piso: por debajo el cotizador no deja vender."
          >
            <Input
              id="precio_minimo"
              type="number"
              step="0.01"
              min={0}
              numerico
              aria-invalid={pisoAlto || undefined}
              className={`${ALTO} ${pisoAlto ? "border-[var(--danger)]" : ""}`}
              value={f.precio_minimo}
              onChange={(e) => set("precio_minimo", e.target.value)}
            />
          </Campo>

          {/* No participa en la comprobación del piso a propósito: es a cuánto
              se ve que está el MERCADO, no un precio nuestro, así que puede
              estar por encima o por debajo de los otros dos y seguir siendo
              cierto. */}
          <Campo
            id="precio_mercado"
            label="Precio de mercado"
            ayuda="A cuánto se ve fuera. Solo referencia: no bloquea nada."
          >
            <Input
              id="precio_mercado"
              type="number"
              step="0.01"
              min={0}
              numerico
              className={ALTO}
              value={f.precio_mercado}
              onChange={(e) => set("precio_mercado", e.target.value)}
            />
          </Campo>
        </div>

        {margen !== null ? (
          <p className="text-sm text-[var(--fg-muted)]">
            Margen sobre el costo:{" "}
            <span
              // Los cortes suben con el denominador: sobre la venta, 10 y 15 %
              // eran «flojo» y «aceptable»; sobre el costo equivalen a 11 y 18.
              // Se redondean a 12 y 20, que además es el objetivo que trae la
              // plantilla de Willy.
              className={`font-semibold tabular ${
                margen < 12
                  ? "text-[var(--danger)]"
                  : margen < 20
                    ? "text-[var(--warn)]"
                    : "text-[var(--ok)]"
              }`}
            >
              {margen.toFixed(1)}%
            </span>
            {pm > 0 && costo > 0 ? (
              <>
                {" "}· en el piso baja a{" "}
                <span className="tabular">{(((pm - costo) / costo) * 100).toFixed(1)}%</span>
              </>
            ) : null}
          </p>
        ) : null}
      </section>

      {/* ═════════════════════════════════════════════════ Almacén ══════ */}
      <section className="card flex flex-col gap-3 p-4">
        <h2 className="text-base font-semibold">Almacén</h2>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Campo id="stock_minimo" label="Stock mínimo" ayuda="Desde aquí avisa que hay que reponer.">
            <Input
              id="stock_minimo"
              type="number"
              step="1"
              min={0}
              numerico
              className={ALTO}
              value={f.stock_minimo}
              onChange={(e) => set("stock_minimo", e.target.value)}
            />
          </Campo>

          <Campo
            id="stock_maximo"
            label="Stock máximo"
            error={errorDe("stock_maximo")}
            ayuda="0 = sin tope."
          >
            <Input
              id="stock_maximo"
              type="number"
              step="1"
              min={0}
              numerico
              className={ALTO}
              value={f.stock_maximo}
              onChange={(e) => set("stock_maximo", e.target.value)}
            />
          </Campo>

          <Campo id="peso_kg" label="Peso (kg)" ayuda="Alimenta el peso de la guía de remisión.">
            <Input
              id="peso_kg"
              type="number"
              step="0.001"
              min={0}
              numerico
              className={ALTO}
              value={f.peso_kg}
              onChange={(e) => set("peso_kg", e.target.value)}
            />
          </Campo>

          <Campo id="ubicacion" label="Ubicación" ayuda="Anaquel, nivel…">
            <Input
              id="ubicacion"
              className={ALTO}
              value={f.ubicacion}
              onChange={(e) => set("ubicacion", e.target.value)}
              placeholder="A-3-2"
              autoComplete="off"
            />
          </Campo>
        </div>

        <Campo
          id="proveedor_id"
          label="Proveedor habitual"
          ayuda="A quién se le pide normalmente. A quién se le compró de verdad lo dice la trazabilidad."
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Combobox
              id="proveedor_id"
              className={`${ALTO} w-full sm:w-96`}
              opciones={proveedores.map((p) => ({ valor: p.id, etiqueta: p.razon_social }))}
              valor={f.proveedor_id || null}
              onCambio={(v) => set("proveedor_id", v ?? "")}
              placeholder="Sin proveedor fijo"
              placeholderBusqueda="Nombre o RUC"
              textoVacio="Ningún proveedor coincide. Créalo con el botón."
            />
            {/*
              Willy, 01/09: *«el proveedor y aparte un botón para añadir un
              proveedor nuevo»*. Es el mismo diálogo del maestro y de la
              recepción, no una tercera alta paralela: un alta por pantalla
              sería un tercer sitio donde validar el RUC y generar el código,
              y los tres se separarían al primer cambio.

              Y hoy hace falta de verdad: hay CERO proveedores en la base, así
              que sin esto el campo es un desplegable vacío.
            */}
            <ProveedorRapido
              onCreado={(p) => {
                setNuevas((x) => ({
                  ...x,
                  proveedores: x.proveedores.some((y) => y.id === p.id)
                    ? x.proveedores
                    : [...x.proveedores, { id: p.id, razon_social: p.razon_social }],
                }));
                setF((x) => ({ ...x, proveedor_id: p.id }));
              }}
            />
          </div>
        </Campo>

        {!producto ? (
          <p className="rounded-md bg-[var(--surface-2)] p-3 text-sm text-[var(--fg-muted)]">
            El <strong>stock inicial</strong> no se pone aquí. Un saldo escrito a mano
            rompería el kardex: entra por Recepción cuando llegue la mercadería, o
            por Ajuste de inventario si es un cuadre.
          </p>
        ) : null}
      </section>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full sm:w-auto md:h-control-md"
          onClick={() => router.push(producto ? `/productos/${producto.id}` : "/productos")}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          className="h-11 w-full sm:w-auto md:h-control-md"
          disabled={!listo || guardando}
          loading={guardando}
        >
          {guardando ? "Guardando…" : producto ? "Guardar cambios" : "Crear producto"}
        </Button>
      </div>
    </form>
  );
}
