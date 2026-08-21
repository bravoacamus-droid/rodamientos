"use client";

import { useActionState, useMemo, useReducer } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, SelectNativo, Table, TableContenedor, TBody, Textarea, THead } from "@rodatech/ui";

import { crearCotizacion, type ResultadoCreacion } from "../../acciones/crear";
import {
  aPayload,
  bloqueos as calcularBloqueos,
  ENTREGAS,
  estadoInicial,
  reducir,
  totalesDe,
} from "../../dominio/constructor";
import { BuscadorLineas } from "./buscador";
import { FilaLinea } from "./linea";
import { ResumenConstructor } from "./resumen";

/**
 * Constructor de cotizaciones.
 *
 * Todo el estado vive en `dominio/constructor.ts` como reducer puro, así que
 * este componente solo conecta cables: despacha acciones y pinta lo que sale.
 * Es la diferencia con la demo, donde las mismas 974 líneas mezclaban tipos,
 * estado, cálculo de precios, negociación y persistencia en un solo archivo
 * que no se podía probar sin montar React.
 */

export interface ClienteOpcion {
  id: string;
  codigo: string;
  razon_social: string;
  numero_documento: string | null;
  contacto: string | null;
  condicion_pago: string;
  bloqueado: boolean;
}

export function Constructor({
  clientes,
  clienteInicial = null,
}: {
  clientes: ClienteOpcion[];
  clienteInicial?: string | null;
}) {
  const router = useRouter();
  const [estado, despachar] = useReducer(reducir, estadoInicial(clienteInicial));
  const [resultado, guardar, guardando] = useActionState<ResultadoCreacion | null, FormData>(
    async (previo, formData) => {
      const r = await crearCotizacion(previo, formData);
      if (r.ok) router.push(`/cotizaciones/${r.id}`);
      return r;
    },
    null,
  );

  const totales = useMemo(() => totalesDe(estado), [estado]);
  const bloqueos = useMemo(() => calcularBloqueos(estado), [estado]);
  const cliente = clientes.find((c) => c.id === estado.clienteId);

  return (
    <form action={guardar} className="flex flex-col gap-5 p-6">
      <input
        type="hidden"
        name="cotizacion"
        value={JSON.stringify(aPayload(estado))}
      />

      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Nueva cotización</h1>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/cotizaciones")}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={bloqueos.length > 0 || guardando}>
            {guardando ? "Guardando…" : "Guardar cotización"}
          </Button>
        </div>
      </header>

      {resultado && !resultado.ok ? (
        <p className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger)]">
          {resultado.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-5 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {/* ------------------------------------------------- Cabecera */}
          <section className="rounded-md border border-[var(--borde)] bg-[var(--surface)] p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Cliente</span>
                <SelectNativo
                  value={estado.clienteId ?? ""}
                  onChange={(e) =>
                    despachar({
                      tipo: "cabecera",
                      campo: "clienteId",
                      valor: e.target.value || null,
                    })
                  }
                >
                  <option value="">Elige un cliente…</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id} disabled={c.bloqueado}>
                      {c.razon_social}
                      {c.numero_documento ? ` · ${c.numero_documento}` : ""}
                      {c.bloqueado ? " (bloqueado)" : ""}
                    </option>
                  ))}
                </SelectNativo>
                {cliente ? (
                  <span className="text-xs text-[var(--fg-muted)]">
                    {cliente.condicion_pago === "credito" ? "A crédito" : "Al contado"}
                    {cliente.contacto ? ` · ${cliente.contacto}` : ""}
                  </span>
                ) : null}
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Contacto</span>
                <Input
                  value={estado.contacto}
                  onChange={(e) =>
                    despachar({ tipo: "cabecera", campo: "contacto", valor: e.target.value })
                  }
                  placeholder={cliente?.contacto ?? "A quién va dirigida"}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Validez</span>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={estado.validezDias}
                    onChange={(e) =>
                      despachar({
                        tipo: "cabecera",
                        campo: "validezDias",
                        valor: Number(e.target.value),
                      })
                    }
                    className="w-24 tabular"
                  />
                  <span className="text-sm text-[var(--fg-muted)]">días</span>
                </div>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Tiempo de entrega</span>
                <SelectNativo
                  value={estado.tiempoEntrega}
                  onChange={(e) =>
                    despachar({
                      tipo: "cabecera",
                      campo: "tiempoEntrega",
                      valor: e.target.value,
                    })
                  }
                >
                  {ENTREGAS.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </SelectNativo>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Orden de compra del cliente</span>
                <Input
                  value={estado.ordenCompraCliente}
                  onChange={(e) =>
                    despachar({
                      tipo: "cabecera",
                      campo: "ordenCompraCliente",
                      valor: e.target.value,
                    })
                  }
                  placeholder="Opcional"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Condiciones</span>
                <Input
                  value={estado.condiciones}
                  onChange={(e) =>
                    despachar({
                      tipo: "cabecera",
                      campo: "condiciones",
                      valor: e.target.value,
                    })
                  }
                  placeholder="Forma de pago, garantía…"
                />
              </label>
            </div>
          </section>

          {/* --------------------------------------------------- Líneas */}
          <section className="rounded-md border border-[var(--borde)] bg-[var(--surface)] p-4">
            <div className="mb-3">
              <BuscadorLineas
                onElegir={(p) => despachar({ tipo: "agregar", producto: p })}
              />
            </div>

            {estado.lineas.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--fg-muted)]">
                Busca un producto arriba para empezar. Puedes teclear el código,
                el del fabricante o parte de la descripción.
              </p>
            ) : (
              <TableContenedor>
                <Table>
                  <THead>
                    <tr>
                      <th className="w-8 text-left">#</th>
                      <th className="text-left">Código</th>
                      <th className="text-left">Marca</th>
                      <th className="text-left">Descripción</th>
                      <th className="text-right">Cant.</th>
                      <th className="text-left">U.M.</th>
                      <th className="text-right">Valor unit.</th>
                      {estado.mostrarDescuento ? (
                        <th className="text-right">Dscto. %</th>
                      ) : null}
                      <th className="text-right">Importe</th>
                      <th />
                    </tr>
                  </THead>
                  <TBody>
                    {estado.lineas.map((l, i) => (
                      <FilaLinea
                        key={l.key}
                        linea={l}
                        indice={i}
                        total={estado.lineas.length}
                        clienteId={estado.clienteId}
                        mostrarDescuento={estado.mostrarDescuento}
                        despachar={despachar}
                      />
                    ))}
                  </TBody>
                </Table>
              </TableContenedor>
            )}
          </section>

          <section className="rounded-md border border-[var(--borde)] bg-[var(--surface)] p-4">
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
                placeholder="Lo que salga impreso al pie de la cotización."
              />
            </label>
          </section>
        </div>

        <ResumenConstructor
          totales={totales}
          bloqueos={bloqueos}
          mostrarDescuento={estado.mostrarDescuento}
          onMostrarDescuento={(v) =>
            despachar({ tipo: "cabecera", campo: "mostrarDescuento", valor: v })
          }
          guardando={guardando}
        />
      </div>
    </form>
  );
}
