"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Input,
  SelectNativo,
  Table,
  TableContenedor,
  TBody,
  Textarea,
  THead,
} from "@rodatech/ui";

import { referenciasDeProductos, type Referencia } from "../../acciones/referencias";
import { registrarRecepcion, type ResultadoRecepcion } from "../../acciones/registrar";
import { calcularImpacto, explicar } from "../../dominio/impacto";
import {
  aPayload,
  avisos as calcularAvisos,
  bloqueos as calcularBloqueos,
  costeoDe,
  estadoInicial,
  reducir,
} from "../../dominio/constructor";
import { BuscadorProveedores } from "@/modules/proveedores/ui/buscador";
import type { ProveedorOpcion } from "@/modules/proveedores/dominio/opcion";
import type { CompraPendiente } from "../../dominio/tipos";
import { BuscadorRecepcion } from "./buscador";
import { FilaRecepcion } from "./linea";

/**
 * Registro de recepción de mercadería.
 *
 * Aquí es donde entra el stock (25:21). Todo el estado vive en
 * `dominio/constructor.ts` como reducer puro, así que este componente solo
 * conecta cables: despacha acciones y pinta lo que sale.
 *
 * La decisión de diseño que manda: se enseña el ANTES y el DESPUÉS de cada
 * producto —stock y costo— porque después de grabar ya no hay botón de
 * deshacer. Corregir un ingreso mal metido es un ajuste de gerencia con su
 * documento y su motivo, no un «editar».
 */
export function ConstructorRecepcion({
  sugeridos,
  compras,
  hoy,
  compraInicial = null,
}: {
  /**
   * Los últimos a los que se compró. NO es el maestro: desde la 033 el
   * selector busca contra el servidor. La consulta anterior no tenía límite
   * ninguno y truncaba contra el tope por defecto de PostgREST sin decirlo.
   */
  sugeridos: ProveedorOpcion[];
  compras: CompraPendiente[];
  /** La fecha la fija el servidor: el dominio es puro y no lee reloj. */
  hoy: string;
  /**
   * Compra a precargar, si se llega desde su ficha con «Recibir mercadería».
   *
   * Llegar con la compra ya elegida es el caso normal: el operador viene de
   * mirar qué había pedido. Buscarla otra vez en el desplegable es hacerle
   * repetir lo que acaba de decir.
   */
  compraInicial?: string | null;
}) {
  const router = useRouter();
  const [estado, despachar] = useReducer(reducir, estadoInicial(hoy));

  // Se precarga UNA vez, al montar. Va en un efecto y no en `estadoInicial`
  // porque `cargarCompra` es una transición del reducer —con su lógica de qué
  // queda pendiente— y duplicarla en el estado inicial sería tener la misma
  // regla escrita en dos sitios.
  const yaCargada = useRef(false);
  useEffect(() => {
    if (yaCargada.current || !compraInicial) return;
    const compra = compras.find((c) => c.id === compraInicial);
    if (!compra) return;
    yaCargada.current = true;
    despachar({ tipo: "cargarCompra", compra });
  }, [compraInicial, compras]);
  // El proveedor elegido, entero, para pintar su ficha. `estado.proveedorId`
  // sigue siendo la única fuente del payload. Uno creado aquí mismo entra
  // directo: recargar la página significaría perder la recepción a medias.
  const [proveedor, setProveedor] = useState<ProveedorOpcion | null>(null);

  const [resultado, guardar, guardando] = useActionState<
    ResultadoRecepcion | null,
    FormData
  >(async (previo, formData) => {
    const r = await registrarRecepcion(previo, formData);
    if (r.ok) router.push(`/recepciones/${r.id}`);
    return r;
  }, null);

  // Contra qué se compara el costo que llega: lo que costó la vez anterior
  // y a cuánto se vende. Se pide al cambiar las líneas —el operador elige
  // la compra a mitad del registro— y si falla no pasa nada: el panel no
  // sale y la recepción se registra igual.
  const [referencias, setReferencias] = useState<Record<string, Referencia>>({});
  const [, cargarReferencias] = useTransition();
  const productosPedidos = useRef<string>("");

  useEffect(() => {
    const ids = [...new Set(estado.lineas.map((l) => l.productoId))].sort();
    const clave = ids.join(",");
    // Sin esto, cada tecla en una cantidad relanzaría la consulta.
    if (clave === productosPedidos.current) return;
    productosPedidos.current = clave;
    if (ids.length === 0) {
      setReferencias({});
      return;
    }
    cargarReferencias(async () => {
      const r = await referenciasDeProductos(ids);
      setReferencias(r.ok ? r.datos : {});
    });
  }, [estado.lineas]);

  const costeo = useMemo(() => costeoDe(estado), [estado]);
  const bloqueos = useMemo(() => calcularBloqueos(estado), [estado]);
  const avisos = useMemo(() => calcularAvisos(estado), [estado]);

  const conGastos = costeo.factor !== 1;
  const compraElegida = compras.find((c) => c.id === estado.compraId) ?? null;

  /**
   * Qué le hace al negocio el costo con el que llega esto.
   *
   * El costo se pasa a dólares ANTES de comparar: el histórico está en
   * dólares (042) y comparar una compra en soles contra él daría un «subió
   * un 275 %» que no es verdad.
   */
  const impactos = useMemo(() => {
    const tc = compraElegida?.tipo_cambio ?? null;
    const enSoles = (compraElegida?.moneda ?? "USD") !== "USD";
    // Sin tipo de cambio no se puede convertir, y comparar sin convertir
    // sería peor que callarse. La compra no se puede guardar en soles sin
    // él (042), así que esto solo pasa mientras se está registrando.
    if (enSoles && !tc) return [];

    return estado.lineas.flatMap((l) => {
      const ref = referencias[l.productoId];
      if (!ref) return [];
      const costoUsd = enSoles && tc ? l.costoUnitario / tc : l.costoUnitario;
      if (costoUsd <= 0) return [];
      const i = calcularImpacto({
        costoUsd,
        costoAnteriorUsd: ref.costoAnteriorUsd,
        precioVenta: ref.precioVenta,
        precioMinimo: ref.precioMinimo,
      });
      const texto = explicar(i);
      return texto ? [{ key: l.key, codigo: l.codigo, ref, impacto: i, texto }] : [];
    });
  }, [estado.lineas, referencias, compraElegida]);

  return (
    <form action={guardar} className="flex flex-col gap-5 p-6">
      <input type="hidden" name="recepcion" value={JSON.stringify(aPayload(estado))} />

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Recibir mercadería</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Al guardar, el stock se mueve y el kardex registra el ingreso.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/recepciones")}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={bloqueos.length > 0 || guardando}>
            {guardando ? "Registrando…" : "Registrar recepción"}
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
        {/* Cinco columnas y no cuatro: el selector de proveedor ocupa dos.
            Con cuatro iguales el placeholder se cortaba en «Busca por nombre,
            RUC o…» justo antes de la palabra que menos se espera —marca—, que
            es la que hay que anunciar porque nadie la busca sola. */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/* Con la compra enlazada el proveedor lo MANDA ELLA: cambiarlo a
              mano dejaría la recepción colgando de una compra de otro. Se
              enseña como campo de solo lectura y no como la ficha completa del
              buscador, porque de la compra solo viene el nombre: pintar la
              ficha obligaría a rellenar «al contado» y «entrega en 3 días» sin
              haberlos leído de ningún sitio. */}
          {compraElegida ? (
            <div className="flex flex-col gap-1 lg:col-span-2">
              <span className="text-sm font-medium">Proveedor</span>
              <div className="flex h-control-md items-center rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3">
                <span className="truncate text-sm">{compraElegida.proveedor}</span>
              </div>
              <span className="text-xs text-[var(--fg-subtle)]">
                Lo manda la compra {compraElegida.numero}.
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-1 lg:col-span-2">
              <BuscadorProveedores
                id="rec-proveedor"
                sugeridos={sugeridos}
                elegido={proveedor}
                onElegir={(p) => {
                  setProveedor(p);
                  despachar({ tipo: "cabecera", campo: "proveedorId", valor: p.id });
                }}
                onQuitar={() => {
                  setProveedor(null);
                  despachar({ tipo: "cabecera", campo: "proveedorId", valor: null });
                }}
                hoy={hoy}
              />
              {sugeridos.length === 0 && proveedor === null ? (
                <span className="text-xs text-[var(--fg-subtle)]">
                  Todavía no hay proveedores. Crea el primero con «Nuevo».
                </span>
              ) : null}
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Fecha de recepción</span>
            <Input
              type="date"
              value={estado.fecha}
              onChange={(e) =>
                despachar({ tipo: "cabecera", campo: "fecha", valor: e.target.value })
              }
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Guía del proveedor</span>
            <Input
              value={estado.guiaProveedor}
              onChange={(e) =>
                despachar({
                  tipo: "cabecera",
                  campo: "guiaProveedor",
                  valor: e.target.value,
                })
              }
              placeholder="001-000123"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Factura del proveedor</span>
            <Input
              value={estado.facturaProveedor}
              onChange={(e) =>
                despachar({
                  tipo: "cabecera",
                  campo: "facturaProveedor",
                  valor: e.target.value,
                })
              }
              placeholder="F001-004567"
            />
          </label>
        </div>

        {/* Enlazar con una compra solo tiene sentido si hay alguna pendiente.
            Un desplegable vacío es una pregunta sin respuesta posible. */}
        {compras.length > 0 ? (
          <div className="mt-3 border-t border-[var(--border-soft)] pt-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-64 flex-1 flex-col gap-1">
                <span className="text-sm font-medium">
                  ¿Viene de una compra registrada?
                </span>
                <SelectNativo
                  value={estado.compraId ?? ""}
                  onChange={(e) => {
                    const compra = compras.find((c) => c.id === e.target.value);
                    if (compra) despachar({ tipo: "cargarCompra", compra });
                    else despachar({ tipo: "soltarCompra" });
                  }}
                >
                  <option value="">No — recepción suelta</option>
                  {compras.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.numero} · {c.proveedor} · {c.fecha}
                    </option>
                  ))}
                </SelectNativo>
              </label>

              {compraElegida ? (
                <p className="text-xs text-[var(--fg-muted)]">
                  Se han precargado las líneas que faltaban por llegar.
                  {compraElegida.gastos_importacion > 0
                    ? ` La compra trae ${compraElegida.gastos_importacion.toFixed(2)} de gastos, que se reparten por valor.`
                    : ""}
                </p>
              ) : null}

              {/*
                En qué moneda están los costos que se acaban de precargar.

                La conversión la hace la base sola (042), así que esto no
                cambia ningún número. Existe porque sin decirlo, quien
                recibe lee «15.20» en la columna de costo y entiende
                dólares — y si la factura viene en soles, «corregiría» un
                número que estaba bien.
              */}
              {compraElegida && compraElegida.moneda !== "USD" ? (
                <p
                  role="status"
                  className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-sm"
                >
                  Los costos de esta compra están en{" "}
                  <strong>soles</strong>, como la factura del proveedor.
                  {compraElegida.tipo_cambio
                    ? ` Entran al inventario en dólares, a ${compraElegida.tipo_cambio}.`
                    : ""}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      {/* -------------------------------------------------------- Líneas */}
      <section className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="mb-3">
          <BuscadorRecepcion
            onElegir={(p) => despachar({ tipo: "agregar", producto: p })}
            yaEnDocumento={estado.lineas.map((l) => l.productoId)}
          />
        </div>

        {estado.lineas.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--fg-muted)]">
            Busca un producto arriba para empezar
            {compras.length > 0 ? ", o elige la compra de la que viene" : ""}.
          </p>
        ) : (
          <TableContenedor>
            <Table>
              <THead>
                <tr>
                  <th className="text-left">Código</th>
                  <th className="text-left">Descripción</th>
                  <th className="text-left">Cant.</th>
                  <th className="text-left">U.M.</th>
                  <th className="text-left">Costo unit.</th>
                  <th className="text-right">Importe</th>
                  {conGastos ? (
                    <th className="text-right">
                      Con gastos
                      <span className="block text-xs font-normal text-[var(--fg-subtle)]">
                        al kardex
                      </span>
                    </th>
                  ) : null}
                  <th className="text-right">Stock</th>
                  <th />
                </tr>
              </THead>
              <TBody>
                {estado.lineas.map((l, i) => (
                  <FilaRecepcion
                    key={l.key}
                    linea={l}
                    costeada={costeo.lineas[i]}
                    conGastos={conGastos}
                    despachar={despachar}
                  />
                ))}
              </TBody>
            </Table>
          </TableContenedor>
        )}
      </section>

      <div className="flex flex-col gap-5 lg:flex-row">
        <section className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Observaciones</span>
            <Textarea
              value={estado.observaciones}
              onChange={(e) =>
                despachar({
                  tipo: "cabecera",
                  campo: "observaciones",
                  valor: e.target.value,
                })
              }
              rows={3}
              placeholder="Estado del embalaje, faltantes, lo que convenga dejar por escrito."
            />
          </label>
        </section>

        {/* ------------------------------------------------------ Resumen */}
        <aside className="w-full shrink-0 lg:w-80">
          <div className="card sticky top-4 flex flex-col gap-3 p-4">
            <h2 className="text-sm font-semibold">Resumen</h2>

            <dl className="flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-[var(--fg-muted)]">Líneas</dt>
                <dd className="tabular">{estado.lineas.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--fg-muted)]">Unidades</dt>
                <dd className="tabular">{costeo.unidades}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--fg-muted)]">Valor al proveedor</dt>
                <dd className="tabular">${costeo.total.toFixed(2)}</dd>
              </div>

              {conGastos ? (
                <>
                  <div className="flex justify-between">
                    <dt className="text-[var(--fg-muted)]">Gastos a repartir</dt>
                    <dd className="tabular">${costeo.gastos.toFixed(2)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-[var(--border-soft)] pt-1.5 font-medium">
                    <dt>Valor al almacén</dt>
                    <dd className="tabular">${costeo.totalFinal.toFixed(2)}</dd>
                  </div>
                  <p className="text-xs text-[var(--fg-subtle)]">
                    Factor {costeo.factor} sobre cada costo. Es lo que va al
                    kardex, no lo que se le paga al proveedor.
                  </p>
                </>
              ) : null}
            </dl>

            {/* Motivos, no un booleano: un botón deshabilitado sin explicación
                es de las cosas que más se odian de un ERP. */}
            {bloqueos.length > 0 ? (
              <ul className="flex flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2 text-xs text-[var(--fg-muted)]">
                {bloqueos.map((b) => (
                  <li key={b.campo}>· {b.mensaje}</li>
                ))}
              </ul>
            ) : null}

            {avisos.length > 0 ? (
              <ul className="flex flex-col gap-1 rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-2 text-xs text-[var(--warn)]">
                {avisos.map((a, i) => (
                  <li key={`${a.key}-${i}`}>
                    <span className="font-mono font-medium">{a.codigo}</span>{" "}
                    {a.mensaje}
                  </li>
                ))}
              </ul>
            ) : null}

            {/* Qué le hace este costo al negocio (plan de compras, paso 7).

                Va aparte de los avisos de arriba porque contesta a otra
                pregunta: aquellos cazan un decimal mal puesto, este dice si
                el producto sigue siendo rentable. Y NO bloquea: el costo es
                el que es, la factura ya está firmada. Lo que se decide
                después es el precio de venta, no si se recibe. */}
            {impactos.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
                  Qué pasa con el precio
                </p>
                {impactos.map((x) => (
                  <div
                    key={x.key}
                    className={`rounded-md border p-2.5 text-xs ${
                      x.impacto.gravedad === "grave"
                        ? "border-[var(--danger)] bg-[var(--danger-bg)]"
                        : "border-[var(--border)] bg-[var(--surface-2)]"
                    }`}
                  >
                    <span className="font-mono text-sm font-medium">{x.codigo}</span>
                    <span className="mt-0.5 block">{x.texto}</span>
                    {x.ref.documento ? (
                      <span className="mt-0.5 block text-[var(--fg-subtle)]">
                        La vez anterior fue {x.ref.documento}, a ${x.ref.costoAnteriorUsd?.toFixed(4)}
                      </span>
                    ) : null}
                  </div>
                ))}
                <p className="text-xs text-[var(--fg-subtle)]">
                  Esto no impide recibir: la factura ya está firmada y el costo
                  es el que es. Lo que hay que decidir después es el{" "}
                  <strong>precio de venta</strong>.
                </p>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </form>
  );
}
