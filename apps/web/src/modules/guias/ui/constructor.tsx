"use client";

import { useActionState, useEffect, useMemo, useReducer, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, SelectNativo, Textarea } from "@rodatech/ui";

import { cargarCotizacion } from "../acciones/cargar";
import { generarGuia, type ResultadoGuia } from "../acciones/generar";
import {
  aPayload,
  avisos as calcularAvisos,
  bloqueosBorrador,
  bloqueosEmision,
  estadoInicial,
  faltaPeso,
  pesoCalculado,
  pesoEfectivo,
  reducir,
} from "../dominio/constructor";
import { ETIQUETA_MODALIDAD, type ModalidadTraslado, type MotivoTraslado } from "../dominio/tipos";

/**
 * Preparación de una guía de remisión.
 *
 * La guía se guarda en BORRADOR. Emitirla —que es lo que saca el stock del
 * almacén— es un botón aparte, en la ficha. Willy lo pidió así (§2.2): la guía
 * se prepara cuando se cierra la venta y se completa cuando el camión ya tiene
 * placa y conductor.
 *
 * Por eso esta pantalla enseña DOS listas de pendientes: lo que falta para
 * guardar, y lo que además faltará para emitir. Enseñar solo la segunda haría
 * que pareciera que no se puede guardar todavía, que es justo lo contrario.
 */
export function ConstructorGuia({
  cotizaciones,
  motivos,
  hoy,
  cotizacionInicial,
}: {
  cotizaciones: { id: string; numero: string; fecha: string; cliente: string }[];
  motivos: MotivoTraslado[];
  /** La fecha la fija el servidor: el dominio no lee reloj. */
  hoy: string;
  cotizacionInicial?: string | null;
}) {
  const router = useRouter();
  const [estado, despachar] = useReducer(reducir, estadoInicial(hoy));

  const [cotizacionId, setCotizacionId] = useState(cotizacionInicial ?? "");
  const [cargando, cargar] = useTransition();
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [resultado, guardar, guardando] = useActionState<ResultadoGuia | null, FormData>(
    async (previo, formData) => {
      const r = await generarGuia(previo, formData);
      if (r.ok) router.push(`/guias/${r.id}`);
      return r;
    },
    null,
  );

  useEffect(() => {
    if (!cotizacionId) return;
    setErrorCarga(null);
    cargar(async () => {
      const r = await cargarCotizacion(cotizacionId);
      if (!r.ok) {
        setErrorCarga(r.error);
        return;
      }
      if (!r.datos) {
        setErrorCarga("La cotización ya no está disponible.");
        return;
      }
      despachar({ tipo: "cargarCotizacion", cotizacion: r.datos });
    });
  }, [cotizacionId]);

  const bloqueos = useMemo(() => bloqueosBorrador(estado), [estado]);
  const paraEmitir = useMemo(() => bloqueosEmision(estado), [estado]);
  const avisos = useMemo(() => calcularAvisos(estado), [estado]);
  const sinPeso = faltaPeso(estado);
  const calculado = pesoCalculado(estado);
  const efectivo = pesoEfectivo(estado);

  // Lo que faltará al emitir, quitando lo que ya bloquea guardar: no tiene
  // sentido repetir «falta el peso» en las dos listas.
  const soloEmision = paraEmitir.filter(
    (b) => !bloqueos.some((x) => x.campo === b.campo && x.mensaje === b.mensaje),
  );

  const esPublico = estado.modalidad === "01";

  return (
    <form action={guardar} className="flex flex-col gap-5">
      <input type="hidden" name="guia" value={JSON.stringify(aPayload(estado))} />

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Preparar guía de remisión</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Se guarda como borrador. El stock sale al emitirla, no ahora.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => router.push("/guias")}>
            Cancelar
          </Button>
          <Button type="submit" disabled={bloqueos.length > 0 || guardando}>
            {guardando ? "Guardando…" : "Guardar borrador"}
          </Button>
        </div>
      </header>

      {resultado && !resultado.ok ? (
        <p className="anim-entrada rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger)]">
          {resultado.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-5 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {/* --------------------------------------------- Qué se despacha */}
          <section className="card p-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                Cotización aprobada <span className="text-[var(--danger)]">*</span>
              </span>
              <SelectNativo
                value={cotizacionId}
                onChange={(e) => setCotizacionId(e.target.value)}
              >
                <option value="">Elige una cotización…</option>
                {cotizaciones.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.numero} · {c.cliente}
                  </option>
                ))}
              </SelectNativo>
              {cotizaciones.length === 0 ? (
                <span className="text-xs text-[var(--fg-muted)]">
                  No hay cotizaciones aprobadas con mercadería pendiente de salir.
                </span>
              ) : null}
            </label>

            {cargando ? (
              <p className="anim-latido mt-3 text-sm text-[var(--fg-muted)]">
                Trayendo lo que falta por despachar…
              </p>
            ) : null}

            {errorCarga ? (
              <p className="mt-3 rounded-sm border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm text-[var(--danger)]">
                {errorCarga}
              </p>
            ) : null}

            {estado.lineas.length > 0 ? (
              <div className="scroll-x anim-entrada mt-4 border-t border-[var(--border-soft)] pt-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
                      <th className="py-2 pr-3 font-medium">Código</th>
                      <th className="py-2 pr-3 font-medium">Descripción</th>
                      <th className="py-2 pr-3 text-right font-medium">Pedido</th>
                      <th className="py-2 pr-3 text-right font-medium">Ya salió</th>
                      <th className="py-2 pr-3 text-right font-medium">Sale ahora</th>
                      <th className="py-2 text-right font-medium">Peso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estado.lineas.map((l, i) => (
                      <tr
                        key={l.key}
                        className="anim-entrada border-b border-[var(--border-soft)] last:border-0"
                        style={{ animationDelay: `${Math.min(i, 6) * 24}ms` }}
                      >
                        <td className="py-2 pr-3 font-mono text-[0.8rem]">{l.codigo}</td>
                        <td className="max-w-xs py-2 pr-3">
                          <span className="block truncate" title={l.descripcion}>
                            {l.descripcion}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-right tabular">{l.pedido}</td>
                        <td className="py-2 pr-3 text-right tabular text-[var(--fg-muted)]">
                          {l.despachado || "—"}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <Input
                            type="number"
                            min={0}
                            max={l.pedido - l.despachado}
                            step="0.01"
                            value={l.cantidad}
                            onChange={(e) =>
                              despachar({
                                tipo: "cantidad",
                                key: l.key,
                                valor: Number(e.target.value),
                              })
                            }
                            className="w-24 text-right tabular"
                            aria-label={`Cantidad a despachar de ${l.codigo}`}
                          />
                        </td>
                        <td className="py-2 text-right tabular text-xs text-[var(--fg-muted)]">
                          {l.pesoUnitario > 0
                            ? `${(l.pesoUnitario * l.cantidad).toFixed(3)} kg`
                            : "sin peso"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          {/* --------------------------------------------------- Traslado */}
          {estado.lineas.length > 0 ? (
            <section className="anim-entrada card p-4">
              <h2 className="mb-3 text-sm font-semibold">Traslado</h2>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Motivo</span>
                  <SelectNativo
                    value={estado.motivoCodigo}
                    onChange={(e) =>
                      despachar({ tipo: "campo", campo: "motivoCodigo", valor: e.target.value })
                    }
                  >
                    {motivos.map((m) => (
                      <option key={m.codigo} value={m.codigo}>
                        {m.descripcion}
                      </option>
                    ))}
                  </SelectNativo>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Fecha de traslado</span>
                  <Input
                    type="date"
                    value={estado.fechaTraslado}
                    onChange={(e) =>
                      despachar({ tipo: "campo", campo: "fechaTraslado", valor: e.target.value })
                    }
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Bultos</span>
                  <Input
                    type="number"
                    min={1}
                    value={estado.numeroBultos}
                    onChange={(e) => despachar({ tipo: "bultos", valor: Number(e.target.value) })}
                    className="tabular"
                  />
                </label>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">
                    Dirección de entrega <span className="text-[var(--danger)]">*</span>
                  </span>
                  <Input
                    value={estado.direccionLlegada}
                    onChange={(e) =>
                      despachar({
                        tipo: "campo",
                        campo: "direccionLlegada",
                        valor: e.target.value,
                      })
                    }
                    placeholder="Dónde se descarga la mercadería"
                  />
                  <span className="text-xs text-[var(--fg-subtle)]">
                    Sale la del cliente, pero se entrega en obra más veces de las que se
                    entrega en la oficina fiscal.
                  </span>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Ubigeo de llegada</span>
                  <Input
                    value={estado.ubigeoLlegada}
                    onChange={(e) =>
                      despachar({
                        tipo: "campo",
                        campo: "ubigeoLlegada",
                        valor: e.target.value.replace(/\D/g, "").slice(0, 6),
                      })
                    }
                    placeholder="150101"
                    className="tabular"
                    inputMode="numeric"
                  />
                </label>
              </div>

              {/* --------------------------------------------------- Peso */}
              <div className="mt-3 border-t border-[var(--border-soft)] pt-3">
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">
                    Peso bruto (kg) <span className="text-[var(--danger)]">*</span>
                  </span>
                  <Input
                    type="number"
                    min={0}
                    step="0.001"
                    value={estado.pesoDeclarado ?? (calculado > 0 ? calculado : "")}
                    onChange={(e) =>
                      despachar({
                        tipo: "peso",
                        valor: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    className="w-40 tabular"
                  />
                </label>

                {/* El peso es «lo más importante» según Willy (02:46) y hoy
                    ningún producto lo tiene en el maestro. En vez de dejar que
                    falle el guardado con un error de restricción, se explica y
                    se pide. */}
                {sinPeso ? (
                  <p className="anim-entrada mt-2 rounded-sm border border-[var(--warn)] bg-[var(--warn-bg)] p-2.5 text-xs">
                    Ninguno de estos productos tiene el peso registrado en el catálogo,
                    así que hay que declararlo aquí. Si lo registras en la ficha de cada
                    producto, la próxima vez sale solo.
                  </p>
                ) : calculado > 0 ? (
                  <p className="mt-1 text-xs text-[var(--fg-subtle)]">
                    Calculado del catálogo: {calculado.toFixed(3)} kg. Puedes cambiarlo si
                    la balanza dice otra cosa.
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}

          {/* -------------------------------------------------- Transporte */}
          {estado.lineas.length > 0 ? (
            <section className="anim-entrada card p-4">
              <div className="mb-3">
                <h2 className="text-sm font-semibold">Transporte</h2>
                <p className="mt-0.5 text-xs text-[var(--fg-muted)]">
                  Se puede dejar a medias: hace falta para <strong>emitir</strong>, no
                  para guardar el borrador.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Modalidad</span>
                  <SelectNativo
                    value={estado.modalidad}
                    onChange={(e) =>
                      despachar({
                        tipo: "modalidad",
                        valor: e.target.value as ModalidadTraslado,
                      })
                    }
                  >
                    {(["02", "01"] as ModalidadTraslado[]).map((m) => (
                      <option key={m} value={m}>
                        {ETIQUETA_MODALIDAD[m]}
                      </option>
                    ))}
                  </SelectNativo>
                </label>

                {esPublico ? (
                  <>
                    <label className="flex flex-col gap-1">
                      <span className="text-sm font-medium">RUC del transportista</span>
                      <Input
                        value={estado.transportistaDocumento}
                        onChange={(e) =>
                          despachar({
                            tipo: "campo",
                            campo: "transportistaDocumento",
                            valor: e.target.value.replace(/\D/g, "").slice(0, 11),
                          })
                        }
                        className="tabular"
                        inputMode="numeric"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-sm font-medium">Razón social</span>
                      <Input
                        value={estado.transportistaRazonSocial}
                        onChange={(e) =>
                          despachar({
                            tipo: "campo",
                            campo: "transportistaRazonSocial",
                            valor: e.target.value,
                          })
                        }
                      />
                    </label>
                  </>
                ) : (
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium">Placa del vehículo</span>
                    <Input
                      value={estado.transportistaPlaca}
                      onChange={(e) =>
                        despachar({
                          tipo: "campo",
                          campo: "transportistaPlaca",
                          valor: e.target.value.toUpperCase(),
                        })
                      }
                      placeholder="ABC-123"
                      className="font-mono"
                    />
                  </label>
                )}
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Conductor</span>
                  <Input
                    value={estado.conductorNombre}
                    onChange={(e) =>
                      despachar({
                        tipo: "campo",
                        campo: "conductorNombre",
                        valor: e.target.value,
                      })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">DNI del conductor</span>
                  <Input
                    value={estado.conductorDocumento}
                    onChange={(e) =>
                      despachar({
                        tipo: "campo",
                        campo: "conductorDocumento",
                        valor: e.target.value.replace(/\D/g, "").slice(0, 8),
                      })
                    }
                    className="tabular"
                    inputMode="numeric"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Licencia</span>
                  <Input
                    value={estado.conductorLicencia}
                    onChange={(e) =>
                      despachar({
                        tipo: "campo",
                        campo: "conductorLicencia",
                        valor: e.target.value.toUpperCase(),
                      })
                    }
                    className="font-mono"
                  />
                </label>
              </div>

              <label className="mt-3 flex flex-col gap-1">
                <span className="text-sm font-medium">Observaciones</span>
                <Textarea
                  value={estado.observaciones}
                  onChange={(e) =>
                    despachar({
                      tipo: "campo",
                      campo: "observaciones",
                      valor: e.target.value,
                    })
                  }
                  rows={2}
                  placeholder="Lo que salga impreso al pie de la guía."
                />
              </label>
            </section>
          ) : null}
        </div>

        {/* -------------------------------------------------- Resumen */}
        <aside className="w-full shrink-0 lg:w-80">
          <div className="card sticky top-4 flex flex-col gap-3 p-4">
            <h2 className="text-sm font-semibold">Resumen</h2>

            <dl className="flex flex-col gap-1.5 text-sm">
              <Fila
                etiqueta="Líneas"
                valor={String(estado.lineas.filter((l) => l.cantidad > 0).length)}
              />
              <Fila etiqueta="Bultos" valor={String(estado.numeroBultos)} />
              <Fila
                etiqueta="Peso bruto"
                valor={efectivo > 0 ? `${efectivo.toFixed(3)} kg` : "—"}
                fuerte
              />
            </dl>

            {bloqueos.length > 0 ? (
              <div className="rounded-sm border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
                <p className="mb-1 text-xs font-medium">Falta para guardar:</p>
                <ul className="flex flex-col gap-0.5 text-xs text-[var(--fg-muted)]">
                  {bloqueos.map((b) => (
                    <li key={b.campo}>· {b.mensaje}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Lo que faltará DESPUÉS. Enseñarlo aparte evita que parezca que
                no se puede guardar todavía, que es justo lo contrario. */}
            {soloEmision.length > 0 ? (
              <div className="rounded-sm border border-[var(--border-soft)] bg-[var(--surface-2)] p-2.5">
                <p className="mb-1 text-xs font-medium">
                  Y para emitirla después hará falta:
                </p>
                <ul className="flex flex-col gap-0.5 text-xs text-[var(--fg-muted)]">
                  {soloEmision.map((b, i) => (
                    <li key={`${b.campo}-${i}`}>· {b.mensaje}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {avisos.length > 0 ? (
              <div className="anim-entrada rounded-sm border border-[var(--warn)] bg-[var(--warn-bg)] p-2.5">
                <p className="mb-1 text-xs font-medium">Conviene mirar:</p>
                <ul className="flex flex-col gap-1 text-xs">
                  {avisos.map((a, i) => (
                    <li key={`${a.key}-${i}`}>· {a.mensaje}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {estado.lineas.length > 0 && bloqueos.length === 0 ? (
              <p className="text-xs text-[var(--fg-muted)]">
                Se guarda como <strong>borrador</strong>. El stock no se mueve hasta que
                la emitas desde su ficha.
              </p>
            ) : null}
          </div>
        </aside>
      </div>
    </form>
  );
}

function Fila({
  etiqueta,
  valor,
  fuerte,
}: {
  etiqueta: string;
  valor: string;
  fuerte?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[var(--fg-muted)]">{etiqueta}</dt>
      <dd className={`tabular ${fuerte ? "text-base font-semibold" : ""}`}>{valor}</dd>
    </div>
  );
}
