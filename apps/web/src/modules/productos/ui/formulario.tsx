"use client";

// Cliente: la jerarquía es en cascada y el precio de venta se calcula solo
// mientras se teclea el costo. Eso es estado local, no navegación.

import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, SelectNativo } from "@rodatech/ui";

import { guardarProducto, type ResultadoProducto } from "../acciones/guardar";

/**
 * Alta y edición de un producto.
 *
 * Habla el vocabulario del cliente —FAMILIA, SUB-FAMILIA, DESCRIPCIÓN— y
 * aplica sus mismas reglas que la plantilla de Excel, para que dar de alta uno
 * a mano y cargarlos por lote no den resultados distintos:
 *
 *   · Los tres niveles son desplegables en cascada.
 *   · El P.V. se calcula como costo x 1.20 mientras no se escriba encima.
 *   · El P.M. no puede superar al P.V.
 */

export interface CatalogosProducto {
  marcas: { id: string; nombre: string }[];
  familias: { id: string; nombre: string }[];
  subfamilias: { id: string; nombre: string; familia_id: string }[];
  tipos: { id: string; nombre: string; subfamilia_id: string }[];
  unidades: { codigo: string; nombre: string }[];
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
}

const MARKUP = 1.2;
const redondear2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

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
    tipo_id: producto?.tipo_id ?? "",
    unidad_codigo: producto?.unidad_codigo ?? "NIU",
    ultimo_costo: String(producto?.ultimo_costo ?? ""),
    precio_venta: String(producto?.precio_venta ?? ""),
    precio_minimo: String(producto?.precio_minimo ?? ""),
    stock_minimo: String(producto?.stock_minimo ?? "0"),
    stock_maximo: String(producto?.stock_maximo ?? "0"),
    peso_kg: String(producto?.peso_kg ?? "0"),
    ubicacion: producto?.ubicacion ?? "",
  });
  // Se recuerda si el P.V. lo escribió una persona: a partir de ahí el costo
  // deja de recalcularlo, porque hay productos que son la excepción.
  const [pvManual, setPvManual] = useState(Boolean(producto?.precio_venta));

  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  const subfamilias = useMemo(
    () => catalogos.subfamilias.filter((s) => s.familia_id === f.familia_id),
    [catalogos.subfamilias, f.familia_id],
  );
  const tipos = useMemo(
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
  const margen = pv > 0 && costo > 0 ? ((pv - costo) / pv) * 100 : null;
  const pisoAlto = pm > 0 && pv > 0 && pm > pv;

  const cambiarCosto = (v: string) => {
    setF((x) => ({
      ...x,
      ultimo_costo: v,
      precio_venta: pvManual ? x.precio_venta : String(redondear2(num(v) * MARKUP) || ""),
    }));
  };

  // Al elegir la descripción, si no hay una escrita se copia el nombre del
  // tipo: en el archivo del cliente la DESCRIPCIÓN del producto ES su tipo.
  const cambiarTipo = (id: string) => {
    const t = catalogos.tipos.find((x) => x.id === id);
    setF((x) => ({
      ...x,
      tipo_id: id,
      descripcion: x.descripcion.trim() === "" && t ? t.nombre : x.descripcion,
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
    tipo_id: f.tipo_id || null,
    unidad_codigo: f.unidad_codigo,
    ultimo_costo: costo,
    precio_venta: pv,
    precio_minimo: pm,
    stock_minimo: num(f.stock_minimo),
    stock_maximo: num(f.stock_maximo),
    peso_kg: num(f.peso_kg),
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
    resultado && !resultado.ok && resultado.campo === campo ? resultado.error : null;

  return (
    <form action={guardar} className="flex flex-col gap-5">
      <input type="hidden" name="producto" value={JSON.stringify(payload)} />

      {resultado && !resultado.ok && !resultado.campo ? (
        <p className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger)]">
          {resultado.error}
        </p>
      ) : null}

      {/* ------------------------------------------------ Identificación */}
      <section className="card flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold">Identificación</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Campo
            etiqueta="Código"
            requerido
            error={errorDe("codigo")}
            ayuda="El del fabricante, tal cual viene en la caja. Puede llevar espacios: 7210 BEP."
          >
            <Input
              value={f.codigo}
              onChange={(e) => set("codigo", e.target.value)}
              placeholder="6209-2RS1/C3"
              autoFocus
            />
          </Campo>

          <Campo etiqueta="Código alterno" ayuda="Opcional: el de otro proveedor o el interno.">
            <Input
              value={f.codigo_fabricante}
              onChange={(e) => set("codigo_fabricante", e.target.value)}
            />
          </Campo>

          <Campo etiqueta="Marca" requerido error={errorDe("marca_id")}>
            <SelectNativo
              value={f.marca_id}
              onChange={(e) => set("marca_id", e.target.value)}
            >
              <option value="">Elige una marca…</option>
              {catalogos.marcas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </SelectNativo>
          </Campo>

          <Campo etiqueta="Unidad de medida">
            <SelectNativo
              value={f.unidad_codigo}
              onChange={(e) => set("unidad_codigo", e.target.value)}
            >
              {catalogos.unidades.map((u) => (
                <option key={u.codigo} value={u.codigo}>
                  {u.nombre}
                </option>
              ))}
            </SelectNativo>
          </Campo>
        </div>
      </section>

      {/* ----------------------------------------------------- Jerarquía */}
      <section className="card flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold">Clasificación</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Campo etiqueta="Familia" requerido error={errorDe("familia_id")}>
            <SelectNativo
              value={f.familia_id}
              onChange={(e) =>
                // Cambiar de familia invalida los dos niveles de abajo.
                setF((x) => ({ ...x, familia_id: e.target.value, subfamilia_id: "", tipo_id: "" }))
              }
            >
              <option value="">Elige una familia…</option>
              {catalogos.familias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </SelectNativo>
          </Campo>

          <Campo etiqueta="Sub-familia" requerido error={errorDe("subfamilia_id")}>
            <SelectNativo
              value={f.subfamilia_id}
              disabled={!f.familia_id}
              onChange={(e) =>
                setF((x) => ({ ...x, subfamilia_id: e.target.value, tipo_id: "" }))
              }
            >
              <option value="">
                {f.familia_id ? "Elige una sub-familia…" : "Primero la familia"}
              </option>
              {subfamilias.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </SelectNativo>
          </Campo>

          <Campo etiqueta="Descripción (tipo)" error={errorDe("tipo_id")}>
            <SelectNativo
              value={f.tipo_id}
              disabled={!f.subfamilia_id}
              onChange={(e) => cambiarTipo(e.target.value)}
            >
              <option value="">
                {f.subfamilia_id ? "Elige una descripción…" : "Primero la sub-familia"}
              </option>
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </SelectNativo>
          </Campo>
        </div>

        <Campo
          etiqueta="Descripción impresa"
          requerido
          error={errorDe("descripcion")}
          ayuda="Es lo que el cliente lee en la cotización. NO repitas aquí el código ni la marca: van en su propia columna."
        >
          <Input
            value={f.descripcion}
            onChange={(e) => set("descripcion", e.target.value)}
            placeholder="RODAMIENTO RIGIDO DE BOLAS 1 HIL."
          />
        </Campo>
      </section>

      {/* -------------------------------------------------------- Precios */}
      <section className="card flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold">Precios · en dólares</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Campo etiqueta="P.C. — costo">
            <Input
              type="number"
              step="0.0001"
              min={0}
              value={f.ultimo_costo}
              onChange={(e) => cambiarCosto(e.target.value)}
              className="text-right tabular"
            />
          </Campo>

          <Campo
            etiqueta="P.V. — venta"
            ayuda={pvManual ? "Escrito a mano." : "Calculado: costo × 1.20."}
          >
            <Input
              type="number"
              step="0.01"
              min={0}
              value={f.precio_venta}
              onChange={(e) => {
                setPvManual(true);
                set("precio_venta", e.target.value);
              }}
              className={`text-right tabular ${pvManual ? "" : "bg-[var(--surface-2)]"}`}
            />
          </Campo>

          <Campo
            etiqueta="P.M. — mínimo"
            error={pisoAlto ? "El mínimo no puede superar al de venta." : errorDe("precio_minimo")}
            ayuda="El piso: por debajo de esto el cotizador no deja vender."
          >
            <Input
              type="number"
              step="0.01"
              min={0}
              value={f.precio_minimo}
              onChange={(e) => set("precio_minimo", e.target.value)}
              className={`text-right tabular ${pisoAlto ? "border-[var(--danger)]" : ""}`}
            />
          </Campo>
        </div>

        {margen !== null ? (
          <p className="text-sm text-[var(--fg-muted)]">
            Margen sobre la venta:{" "}
            <span
              className={`font-semibold tabular ${
                margen < 10
                  ? "text-[var(--danger)]"
                  : margen < 15
                    ? "text-[var(--warn)]"
                    : "text-[var(--ok)]"
              }`}
            >
              {margen.toFixed(1)}%
            </span>
            {pm > 0 && costo > 0 ? (
              <>
                {" "}· en el piso baja a{" "}
                <span className="tabular">{(((pm - costo) / pm) * 100).toFixed(1)}%</span>
              </>
            ) : null}
          </p>
        ) : null}
      </section>

      {/* -------------------------------------------------------- Almacén */}
      <section className="card flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold">Almacén</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <Campo etiqueta="Stock mínimo" ayuda="Desde aquí avisa que hay que reponer.">
            <Input
              type="number"
              step="1"
              min={0}
              value={f.stock_minimo}
              onChange={(e) => set("stock_minimo", e.target.value)}
              className="text-right tabular"
            />
          </Campo>
          <Campo
            etiqueta="Stock máximo"
            error={errorDe("stock_maximo")}
            ayuda="0 = sin tope."
          >
            <Input
              type="number"
              step="1"
              min={0}
              value={f.stock_maximo}
              onChange={(e) => set("stock_maximo", e.target.value)}
              className="text-right tabular"
            />
          </Campo>
          <Campo etiqueta="Peso (kg)" ayuda="Alimenta el peso de la guía de remisión.">
            <Input
              type="number"
              step="0.001"
              min={0}
              value={f.peso_kg}
              onChange={(e) => set("peso_kg", e.target.value)}
              className="text-right tabular"
            />
          </Campo>
          <Campo etiqueta="Ubicación" ayuda="Anaquel, nivel…">
            <Input
              value={f.ubicacion}
              onChange={(e) => set("ubicacion", e.target.value)}
              placeholder="A-3-2"
            />
          </Campo>
        </div>

        {!producto ? (
          <p className="rounded-sm bg-[var(--surface-2)] p-2.5 text-xs text-[var(--fg-muted)]">
            El <strong>stock inicial</strong> no se pone aquí. Un saldo escrito a mano
            rompería el kardex: entra por Recepción cuando llegue la mercadería, o
            por Ajuste de inventario si es un cuadre.
          </p>
        ) : null}
      </section>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(producto ? `/productos/${producto.id}` : "/productos")}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={!listo || guardando}>
          {guardando ? "Guardando…" : producto ? "Guardar cambios" : "Crear producto"}
        </Button>
      </div>
    </form>
  );
}

function Campo({
  etiqueta,
  requerido = false,
  ayuda,
  error,
  children,
}: {
  etiqueta: string;
  requerido?: boolean;
  ayuda?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">
        {etiqueta}
        {requerido ? <span className="text-[var(--danger)]"> *</span> : null}
      </span>
      {children}
      {error ? (
        <span className="text-xs text-[var(--danger)]">{error}</span>
      ) : ayuda ? (
        <span className="text-xs text-[var(--fg-muted)]">{ayuda}</span>
      ) : null}
    </label>
  );
}
