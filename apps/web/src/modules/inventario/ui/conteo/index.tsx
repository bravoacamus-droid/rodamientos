"use client";

import { useActionState, useMemo, useReducer, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Input,
  SelectNativo,
  Table,
  TableContenedor,
  TBody,
  THead,
} from "@rodatech/ui";

import { registrarCuadre, type ResultadoAjuste } from "../../acciones/ajustar";
import { cargarHoja } from "../../acciones/cargar-hoja";
import {
  aPayload,
  bloqueos as calcularBloqueos,
  estadoInicial,
  impactoDe,
  reducir,
} from "../../dominio/ajuste";
import { TIPOS_AJUSTE, type ProductoContable } from "../../dominio/tipos";
import { FilaConteo } from "./linea";

/**
 * Hoja de conteo del cuadre de inventario.
 *
 * *"Un botón que lo va a usar con cuidado"* (26:49). El diseño se lo toma en
 * serio de tres maneras:
 *
 *  · Se carga por FILTRO, no producto a producto: un cuadre se hace contra una
 *    estantería o una familia entera.
 *  · Se enseña el IMPACTO en dinero antes de confirmar. Quien firma un cuadre
 *    tiene derecho a ver cuánto mueve antes de firmarlo.
 *  · Solo se manda lo que se ha CONTADO. Una línea en blanco no es un cero: es
 *    un producto que nadie ha mirado.
 */
export function HojaDeConteo({
  familias,
  marcas,
  hoy,
}: {
  familias: { id: string; nombre: string }[];
  marcas: { id: string; nombre: string }[];
  /** La fecha la fija el servidor: el dominio es puro y no lee reloj. */
  hoy: string;
}) {
  const router = useRouter();
  const [estado, despachar] = useReducer(reducir, estadoInicial(hoy));

  const [familia, setFamilia] = useState("");
  const [marca, setMarca] = useState("");
  const [soloConStock, setSoloConStock] = useState(true);
  const [avisoCarga, setAvisoCarga] = useState<string | null>(null);
  const [cargando, cargar] = useTransition();

  const [resultado, guardar, guardando] = useActionState<
    ResultadoAjuste | null,
    FormData
  >(async (previo, formData) => {
    const r = await registrarCuadre(previo, formData);
    if (r.ok) router.push("/inventario/kardex?referencia=ajuste");
    return r;
  }, null);

  const impacto = useMemo(() => impactoDe(estado), [estado]);
  const bloqueos = useMemo(() => calcularBloqueos(estado), [estado]);

  const traerProductos = () => {
    setAvisoCarga(null);
    cargar(async () => {
      const r = await cargarHoja({
        familia: familia || undefined,
        marca: marca || undefined,
        soloConStock,
      });
      if (!r.ok) {
        setAvisoCarga(r.error);
        return;
      }
      const productos: ProductoContable[] = r.datos.filas;
      despachar({ tipo: "cargar", productos });
      if (productos.length === 0) {
        setAvisoCarga("Ningún producto coincide con ese filtro.");
      } else if (r.datos.truncado) {
        setAvisoCarga(
          `Se han cargado los primeros ${productos.length}. Afina el filtro: una hoja más larga no se cuenta de una sentada.`,
        );
      }
    });
  };

  const dinero = (n: number) =>
    n.toLocaleString("es-PE", { style: "currency", currency: "USD" });

  return (
    <form action={guardar} className="flex flex-col gap-5">
      <input type="hidden" name="ajuste" value={JSON.stringify(aPayload(estado))} />

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Cuadrar inventario</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Cuenta lo que hay de verdad. Al confirmar se registra un ajuste con
            tu nombre y el kardex recalcula el saldo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/inventario")}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={bloqueos.length > 0 || guardando}>
            {guardando ? "Registrando…" : "Confirmar cuadre"}
          </Button>
        </div>
      </header>

      {resultado && !resultado.ok ? (
        <p className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger)]">
          {resultado.error}
        </p>
      ) : null}

      {/* ----------------------------------------------------- Cabecera */}
      <section className="card p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Tipo de ajuste</span>
            <SelectNativo
              value={estado.tipo}
              onChange={(e) =>
                despachar({ tipo: "cabecera", campo: "tipo", valor: e.target.value })
              }
            >
              {TIPOS_AJUSTE.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </SelectNativo>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Fecha</span>
            <Input
              type="date"
              value={estado.fecha}
              onChange={(e) =>
                despachar({ tipo: "cabecera", campo: "fecha", valor: e.target.value })
              }
            />
          </label>

          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-sm font-medium">
              Motivo <span className="text-[var(--danger)]">*</span>
            </span>
            <Input
              value={estado.motivo}
              onChange={(e) =>
                despachar({ tipo: "cabecera", campo: "motivo", valor: e.target.value })
              }
              placeholder="Conteo físico de agosto, estantería B"
              maxLength={200}
            />
            {/* Obligatorio y no por formalismo: un ajuste sin explicación es un
                descuadre que nadie va a poder auditar en tres meses. */}
            <span className="text-xs text-[var(--fg-subtle)]">
              Quien lea esto dentro de tres meses tiene que entender qué pasó.
            </span>
          </label>
        </div>
      </section>

      {/* -------------------------------------------------- Qué se cuenta */}
      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">Qué vas a contar</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-44 flex-col gap-1">
            <span className="text-xs font-medium text-[var(--fg-muted)]">Familia</span>
            <SelectNativo value={familia} onChange={(e) => setFamilia(e.target.value)}>
              <option value="">Todas</option>
              {familias.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nombre}
                </option>
              ))}
            </SelectNativo>
          </label>

          <label className="flex min-w-44 flex-col gap-1">
            <span className="text-xs font-medium text-[var(--fg-muted)]">Marca</span>
            <SelectNativo value={marca} onChange={(e) => setMarca(e.target.value)}>
              <option value="">Todas</option>
              {marcas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </SelectNativo>
          </label>

          <label className="flex items-center gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={soloConStock}
              onChange={(e) => setSoloConStock(e.target.checked)}
              className="size-4"
            />
            Solo con stock
          </label>

          <Button type="button" variant="outline" onClick={traerProductos} disabled={cargando}>
            {cargando ? "Cargando…" : "Cargar hoja"}
          </Button>

          {estado.lineas.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => despachar({ tipo: "contarTodoConforme" })}
            >
              Marcar el resto como conforme
            </Button>
          ) : null}
        </div>

        {avisoCarga ? (
          <p className="mt-2 text-xs text-[var(--warn)]">{avisoCarga}</p>
        ) : null}

        {/* Sin `soloConStock` entra el catálogo entero, incluido lo que el
            sistema cree que está a cero. Es lo correcto para un cuadre inicial
            y una trampa para un conteo de rutina. */}
        {!soloConStock ? (
          <p className="mt-2 text-xs text-[var(--fg-subtle)]">
            Vas a cargar también lo que está a cero. Tiene sentido en un cuadre
            inicial; para un conteo de rutina suele sobrar.
          </p>
        ) : null}
      </section>

      {/* -------------------------------------------------------- Líneas */}
      {estado.lineas.length > 0 ? (
        <div className="flex flex-col gap-5 lg:flex-row">
          <section className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
            <TableContenedor>
              <Table>
                <THead>
                  <tr>
                    <th className="text-left">Código</th>
                    <th className="text-left">Descripción</th>
                    <th className="text-right">Sistema</th>
                    <th className="text-left">Contado</th>
                    <th className="text-right">Diferencia</th>
                    <th className="text-right">Impacto</th>
                  </tr>
                </THead>
                <TBody>
                  {estado.lineas.map((l) => (
                    <FilaConteo key={l.productoId} linea={l} despachar={despachar} />
                  ))}
                </TBody>
              </Table>
            </TableContenedor>
          </section>

          {/* ---------------------------------------------------- Impacto */}
          <aside className="w-full shrink-0 lg:w-80">
            <div className="card sticky top-4 flex flex-col gap-3 p-4">
              <h2 className="text-sm font-semibold">Impacto del cuadre</h2>

              <dl className="flex flex-col gap-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-[var(--fg-muted)]">Contadas</dt>
                  <dd className="tabular">
                    {impacto.contadas} de {estado.lineas.length}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--fg-muted)]">Con diferencia</dt>
                  <dd className="tabular">{impacto.conDiferencia}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--fg-muted)]">Sobran</dt>
                  <dd className="tabular text-[var(--ok)]">
                    {impacto.unidadesSobran} · {dinero(impacto.valorSobrante)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--fg-muted)]">Faltan</dt>
                  <dd className="tabular text-[var(--danger)]">
                    {impacto.unidadesFaltan} · {dinero(impacto.valorFaltante)}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-[var(--border-soft)] pt-1.5 font-medium">
                  <dt>Neto</dt>
                  <dd
                    className={`tabular ${
                      impacto.impactoNeto < 0 ? "text-[var(--danger)]" : ""
                    }`}
                  >
                    {dinero(impacto.impactoNeto)}
                  </dd>
                </div>
              </dl>

              <p className="text-[0.7rem] text-[var(--fg-subtle)]">
                Valorado al costo promedio vigente, que es a lo que la base va a
                registrar el movimiento.
              </p>

              {/* Motivos, no un booleano: un botón deshabilitado sin
                  explicación es de las cosas que más se odian de un ERP. */}
              {bloqueos.length > 0 ? (
                <ul className="flex flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2 text-xs text-[var(--fg-muted)]">
                  {bloqueos.map((b) => (
                    <li key={b.campo}>· {b.mensaje}</li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-2 text-xs text-[var(--warn)]">
                  Al confirmar se mueven {impacto.conDiferencia} productos. No hay
                  deshacer: corregirlo sería otro ajuste.
                </p>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </form>
  );
}
