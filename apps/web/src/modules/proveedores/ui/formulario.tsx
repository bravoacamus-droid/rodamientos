"use client";

// Cliente: mantiene el estado del formulario, consulta el RUC y guarda.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Input, SelectNativo, Textarea } from "@rodatech/ui";

import { buscarProveedorPorDocumento } from "../acciones/consultar";
import { guardarProveedor } from "../acciones/guardar";
import { esConsultable } from "../dominio/documento";
import {
  ETIQUETA_DOCUMENTO,
  PAIS_POR_DEFECTO,
  type ProveedorDetalle,
  type ProveedorEditable,
  type TipoDocumento,
} from "../dominio/tipos";

/**
 * Alta y edición de un proveedor.
 *
 * Lo imprescindible arriba y todo lo demás detrás de «más datos». Un proveedor
 * nuevo aparece cuando su mercadería está en el mostrador; pedir la ficha
 * entera en ese momento no hace que los datos aparezcan, solo que la pantalla
 * estorbe.
 *
 * El único campo que no está en la ficha de un cliente y sí merece estar
 * arriba es **lead time**: es lo que alimenta el punto de reposición, y
 * preguntarlo cuando el proveedor está al teléfono es más fácil que
 * reconstruirlo después.
 */

const TIPOS: TipoDocumento[] = ["RUC", "DNI", "CE", "PAS", "SIN_DOC"];

function vacio(): ProveedorEditable {
  return {
    tipo_documento: "RUC",
    numero_documento: "",
    razon_social: "",
    tipo: "local",
    pais: PAIS_POR_DEFECTO,
    direccion: null,
    ubigeo_codigo: null,
    contacto: null,
    email: null,
    telefono: null,
    whatsapp: null,
    dias_pago: 0,
    lead_time_dias: 3,
    notas: null,
    marca_ids: [],
  };
}

function desdeDetalle(p: ProveedorDetalle): ProveedorEditable {
  return {
    id: p.id,
    tipo_documento: p.tipo_documento,
    numero_documento: p.numero_documento,
    razon_social: p.razon_social,
    tipo: p.tipo,
    pais: p.pais,
    direccion: p.direccion,
    ubigeo_codigo: p.ubigeo_codigo,
    contacto: p.contacto,
    email: p.email,
    telefono: p.telefono,
    whatsapp: p.whatsapp,
    dias_pago: p.dias_pago,
    lead_time_dias: p.lead_time_dias,
    notas: p.notas,
    marca_ids: p.marca_ids,
  };
}

export function FormularioProveedor({
  inicial,
  marcas,
}: {
  inicial: ProveedorDetalle | null;
  marcas: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [datos, setDatos] = React.useState<ProveedorEditable>(
    inicial ? desdeDetalle(inicial) : vacio(),
  );
  const [aviso, setAviso] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [campoMalo, setCampoMalo] = React.useState<string | null>(null);
  const [consultando, consultar] = React.useTransition();
  const [guardando, guardar] = React.useTransition();

  const editando = Boolean(inicial);

  const set = <K extends keyof ProveedorEditable>(campo: K, valor: ProveedorEditable[K]) =>
    setDatos((d) => ({ ...d, [campo]: valor }));

  const alternarMarca = (id: string) =>
    setDatos((d) => ({
      ...d,
      marca_ids: d.marca_ids.includes(id)
        ? d.marca_ids.filter((m) => m !== id)
        : [...d.marca_ids, id],
    }));

  const puedeConsultar = esConsultable(datos.tipo_documento, datos.numero_documento);

  const traerDatos = () => {
    setError(null);
    setAviso(null);
    consultar(async () => {
      const r = await buscarProveedorPorDocumento(
        datos.tipo_documento,
        datos.numero_documento ?? "",
      );
      if (!r.ok) {
        // Cuota agotada NO bloquea: se escribe a mano y se sigue.
        setError(
          r.agotada ? `${r.error} Escribe la razón social a mano y guarda igual.` : r.error,
        );
        return;
      }
      setDatos((d) => ({
        ...d,
        razon_social: r.datos.razon_social,
        direccion: r.datos.direccion ?? d.direccion,
        ubigeo_codigo: r.datos.ubigeo_codigo ?? d.ubigeo_codigo,
      }));
      if (r.datos.condicion === "NO HABIDO") {
        setAviso("SUNAT lo marca como NO HABIDO. Su factura de compra es observable.");
      } else if (r.datos.estado && r.datos.estado !== "ACTIVO") {
        setAviso(`Estado en SUNAT: ${r.datos.estado}.`);
      }
    });
  };

  const enviar = () => {
    setError(null);
    setCampoMalo(null);
    guardar(async () => {
      const fd = new FormData();
      fd.set("proveedor", JSON.stringify(datos));
      const r = await guardarProveedor(null, fd);
      if (r.ok) {
        router.push(`/proveedores/${r.id}`);
        return;
      }
      setError(r.error);
      setCampoMalo(r.campo ?? null);
    });
  };

  const marcado = (campo: string) =>
    campoMalo === campo ? "border-[var(--danger)]" : "";

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            {editando ? "Editar proveedor" : "Nuevo proveedor"}
          </h1>
          <p className="text-sm text-[var(--fg-muted)]">
            {editando
              ? inicial?.codigo
              : "Con el documento y la razón social basta para empezar."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={enviar}
            disabled={guardando || datos.razon_social.trim().length < 2}
          >
            {guardando ? "Guardando…" : "Guardar proveedor"}
          </Button>
        </div>
      </header>

      {error ? (
        <p className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
      {aviso ? (
        <p className="rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm text-[var(--warn)]">
          {aviso}
        </p>
      ) : null}

      {/* ------------------------------------------------ Lo indispensable */}
      <section className="card p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Documento</span>
            <SelectNativo
              value={datos.tipo_documento}
              onChange={(e) => set("tipo_documento", e.target.value as TipoDocumento)}
            >
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_DOCUMENTO[t]}
                </option>
              ))}
            </SelectNativo>
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Número</span>
            <div className="flex gap-2">
              <Input
                value={datos.numero_documento ?? ""}
                onChange={(e) => set("numero_documento", e.target.value)}
                disabled={datos.tipo_documento === "SIN_DOC"}
                placeholder={datos.tipo_documento === "RUC" ? "20123456789" : ""}
                inputMode={
                  datos.tipo_documento === "RUC" || datos.tipo_documento === "DNI"
                    ? "numeric"
                    : "text"
                }
                autoComplete="off"
                className={marcado("numero_documento")}
              />
              {/* Solo se ofrece cuando el documento pasa la validación local:
                  un RUC mal tecleado que sale a la red es una de las 100
                  consultas del mes quemada para siempre. */}
              <Button
                type="button"
                variant="outline"
                onClick={traerDatos}
                disabled={!puedeConsultar || consultando}
              >
                {consultando ? "…" : "Traer"}
              </Button>
            </div>
          </div>

          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-sm font-medium">
              Razón social <span className="text-[var(--danger)]">*</span>
            </span>
            <Input
              value={datos.razon_social}
              onChange={(e) => set("razon_social", e.target.value)}
              placeholder="Tal como figura en la factura"
              className={marcado("razon_social")}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Tipo de compra</span>
            <SelectNativo
              value={datos.tipo}
              onChange={(e) => set("tipo", e.target.value as "local" | "importacion")}
            >
              <option value="local">Local</option>
              <option value="importacion">Importación</option>
            </SelectNativo>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Días de pago</span>
            <Input
              type="number"
              min={0}
              max={365}
              value={datos.dias_pago}
              onChange={(e) => set("dias_pago", Number(e.target.value))}
              className="tabular"
            />
            <span className="text-xs text-[var(--fg-subtle)]">
              0 = al contado.
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Lead time</span>
            <Input
              type="number"
              min={0}
              max={365}
              value={datos.lead_time_dias}
              onChange={(e) => set("lead_time_dias", Number(e.target.value))}
              className="tabular"
            />
            <span className="text-xs text-[var(--fg-subtle)]">
              Días desde que se le pide hasta que llega.
            </span>
          </label>
        </div>
      </section>

      {/* --------------------------------------------------------- Marcas */}
      <section className="card p-4">
        <h2 className="text-sm font-semibold">Marcas que representa</h2>
        <p className="mb-3 text-xs text-[var(--fg-muted)]">
          Es lo que permite responder «¿quién me vende SKF?» sin abrir las
          fichas una a una.
        </p>

        {marcas.length === 0 ? (
          <p className="text-sm text-[var(--fg-subtle)]">
            No hay marcas en el maestro todavía.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {marcas.map((m) => {
              const puesta = datos.marca_ids.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => alternarMarca(m.id)}
                  aria-pressed={puesta}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    puesta
                      ? "border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200"
                      : "border-[var(--border)] hover:bg-[var(--surface-2)]"
                  }`}
                >
                  {m.nombre}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------ Más datos */}
      <section className="card p-4">
        <details className="group">
          <summary className="cursor-pointer list-none text-sm font-medium text-[var(--fg-muted)] hover:text-[var(--fg)]">
            <span className="inline-block transition-transform group-open:rotate-90">›</span>{" "}
            Más datos del proveedor
          </summary>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Contacto</span>
              <Input
                value={datos.contacto ?? ""}
                onChange={(e) => set("contacto", e.target.value)}
                placeholder="Con quién se habla"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Teléfono</span>
              <Input
                value={datos.telefono ?? ""}
                onChange={(e) => set("telefono", e.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">WhatsApp</span>
              <Input
                value={datos.whatsapp ?? ""}
                onChange={(e) => set("whatsapp", e.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Correo</span>
              <Input
                type="email"
                value={datos.email ?? ""}
                onChange={(e) => set("email", e.target.value)}
                className={marcado("email")}
              />
            </label>

            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-sm font-medium">Dirección</span>
              <Input
                value={datos.direccion ?? ""}
                onChange={(e) => set("direccion", e.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">País</span>
              <Input
                value={datos.pais}
                onChange={(e) => set("pais", e.target.value)}
              />
              <span className="text-xs text-[var(--fg-subtle)]">
                Importa para las compras por courier.
              </span>
            </label>

            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-sm font-medium">Notas</span>
              <Textarea
                value={datos.notas ?? ""}
                onChange={(e) => set("notas", e.target.value)}
                rows={3}
                placeholder="Mínimo de compra, forma de envío, con quién más hablar…"
              />
            </label>
          </div>
        </details>
      </section>
    </div>
  );
}
