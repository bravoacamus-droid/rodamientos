"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Campo, Input, SelectNativo, Textarea } from "@rodatech/ui";

import type { ConductorMaestro, VehiculoMaestro } from "@/modules/transporte";

import { actualizarGuia } from "../acciones/actualizar";
import { TransportePropio } from "./transporte-propio";
import type { GuiaDetalle, MotivoTraslado } from "../dominio/tipos";
import type { LineaCorregible } from "../api/consultas";
import { ETIQUETA_MODALIDAD, type ModalidadTraslado } from "../dominio/tipos";
import { Volver } from "@/componentes/volver";
import { useBorrador } from "@/componentes/borrador";

/**
 * Corregir un borrador de guía.
 *
 * Willy, 40:43: *«tengo que poner aquí un botón también de editar la guía,
 * para que pueda actualizar los datos… la fecha, que puede ser hoy o mañana»*.
 *
 * ---------------------------------------------------------------------------
 * Qué se toca y qué no
 * ---------------------------------------------------------------------------
 * Todo lo que no es el número ni el cliente (14/10). Luis: *«¿por qué en
 * guía no puedo editar todos los datos, y por qué no puedo poner las órdenes
 * de compra?»*.
 *
 * Hasta ese día las LÍNEAS no se tocaban: un borrador con las cantidades mal
 * se anulaba y se rehacía, y la anulada se quedaba con su número. No había
 * motivo de fondo —el stock no se mueve hasta EMITIR—, solo faltaba revalidar
 * contra lo que llevan las otras guías de la misma cotización. Eso lo hace
 * ahora la base (`corregir_lineas_guia`, 115), y la pantalla enseña el tope
 * de cada línea para que no haya que descubrirlo al guardar.
 */
export function EditorGuia({
  guia,
  vehiculos = [],
  conductores = [],
  lineas = [],
  motivos = [],
}: {
  guia: GuiaDetalle;
  /** Las líneas de la cotización con su tope (115). Vacía si no viene de una. */
  lineas?: LineaCorregible[];
  motivos?: MotivoTraslado[];
  vehiculos?: VehiculoMaestro[];
  conductores?: ConductorMaestro[];
}) {
  const router = useRouter();

  const [fechaTraslado, setFechaTraslado] = React.useState(guia.fecha_traslado);
  const [direccion, setDireccion] = React.useState(guia.direccion_llegada ?? "");
  const [ubigeo, setUbigeo] = React.useState(guia.ubigeo_llegada ?? "");
  const [peso, setPeso] = React.useState(String(guia.peso_bruto_kg));
  const [bultos, setBultos] = React.useState(String(guia.numero_bultos));
  const [modalidad, setModalidad] = React.useState<ModalidadTraslado>(
    guia.modalidad_traslado,
  );
  const [aPie, setAPie] = React.useState(guia.a_pie);
  const [ruc, setRuc] = React.useState(guia.transportista_documento ?? "");
  const [razon, setRazon] = React.useState(guia.transportista_razon_social ?? "");
  const [placa, setPlaca] = React.useState(guia.transportista_placa ?? "");
  const [conductor, setConductor] = React.useState(guia.conductor_nombre ?? "");
  const [dni, setDni] = React.useState(guia.conductor_documento ?? "");
  const [licencia, setLicencia] = React.useState(guia.conductor_licencia ?? "");
  const [celular, setCelular] = React.useState(guia.conductor_telefono ?? "");
  const [observaciones, setObservaciones] = React.useState(guia.observaciones ?? "");
  const [ordenCompra, setOrdenCompra] = React.useState(guia.orden_compra_cliente ?? "");
  const [motivo, setMotivo] = React.useState(guia.motivo_codigo);
  // Lo que sale en esta guía de cada línea, como texto mientras se escribe.
  const [cantidades, setCantidades] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(lineas.map((l) => [l.cotizacion_item_id, l.enEsta > 0 ? String(l.enEsta) : ""])),
  );
  const conLineas = lineas.length > 0;
  const cantidadDe = (id: string) => {
    const n = Number((cantidades[id] ?? "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const [error, setError] = React.useState<string | null>(null);
  const [guardando, empezar] = React.useTransition();

  const esPublico = modalidad === "01";

  /*
    Lo que se está corrigiendo, guardado solo en el navegador (13/10). Luis:
    *«cuando esté creando un usuario o rellenando algo, que me salga seguir o
    comenzar desde cero»*.

    `valeLaPena` siempre: el hook ya compara con lo que trajo la guía, así que
    solo se guarda si de verdad se cambió algo.
  */
  const { aviso: avisoBorrador, olvidar: olvidarBorrador } = useBorrador({
    formulario: "guia-editar",
    id: guia.id,
    datos: {
      fechaTraslado, direccion, ubigeo, peso, bultos, modalidad, aPie,
      ruc, razon, placa, conductor, dni, licencia, celular, observaciones,
      ordenCompra, motivo, cantidades,
    },
    valeLaPena: () => true,
    recuperar: (d) => {
      setFechaTraslado(d.fechaTraslado);
      setDireccion(d.direccion);
      setUbigeo(d.ubigeo);
      setPeso(d.peso);
      setBultos(d.bultos);
      setModalidad(d.modalidad);
      setAPie(d.aPie);
      setRuc(d.ruc);
      setRazon(d.razon);
      setPlaca(d.placa);
      setConductor(d.conductor);
      setDni(d.dni);
      setLicencia(d.licencia);
      setCelular(d.celular);
      setObservaciones(d.observaciones);
      setOrdenCompra(d.ordenCompra ?? "");
      if (d.motivo) setMotivo(d.motivo);
      if (d.cantidades) setCantidades(d.cantidades);
    },
  });

  function guardar() {
    setError(null);
    const pesoNum = Number(peso);
    const bultosNum = Number(bultos);
    if (!Number.isFinite(pesoNum) || pesoNum <= 0) {
      setError("El peso bruto tiene que ser mayor que cero.");
      return;
    }
    if (!Number.isFinite(bultosNum) || bultosNum < 1) {
      setError("Los bultos son al menos uno.");
      return;
    }
    const items = lineas
      .map((l) => ({ l, cantidad: cantidadDe(l.cotizacion_item_id) }))
      .filter((x) => x.cantidad > 0);
    if (conLineas) {
      if (items.length === 0) {
        setError("La guía tiene que llevar al menos un producto.");
        return;
      }
      const pasada = items.find((x) => x.cantidad > x.l.confirmado - x.l.otras);
      if (pasada) {
        setError(
          `${pasada.l.codigo}: salen ${pasada.cantidad} y solo quedan ${pasada.l.confirmado - pasada.l.otras} por despachar.`,
        );
        return;
      }
    }

    empezar(async () => {
      const r = await actualizarGuia({
        id: guia.id,
        fecha_traslado: fechaTraslado,
        direccion_llegada: direccion,
        ubigeo_llegada: ubigeo.trim(),
        peso_bruto_kg: pesoNum,
        numero_bultos: Math.floor(bultosNum),
        modalidad_traslado: modalidad,
        a_pie: aPie,
        transportista_documento: ruc,
        transportista_razon_social: razon,
        transportista_placa: placa,
        conductor_documento: dni,
        conductor_nombre: conductor,
        conductor_licencia: licencia,
        conductor_telefono: celular,
        observaciones,
        orden_compra_cliente: ordenCompra,
        motivo_codigo: motivo,
        ...(conLineas
          ? { items: items.map((x) => ({ cotizacion_item_id: x.l.cotizacion_item_id, cantidad: x.cantidad })) }
          : {}),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // Ya está en la base: el borrador sobra.
      olvidarBorrador();
      router.push(`/guias/${guia.id}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Volver href={`/guias/${guia.id}`}>Volver a la guía {guia.numero}</Volver>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Corregir la guía</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Sigue siendo un borrador: la mercadería no ha salido del almacén.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              // Cancelar es decidir no seguir: no se ofrece otra vez.
              olvidarBorrador();
              router.push(`/guias/${guia.id}`);
            }}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </header>

      {avisoBorrador}

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm"
        >
          {error}
        </p>
      ) : null}

      {conLineas ? (
        <section className="card p-4">
          <h2 className="text-base font-semibold">Productos</h2>
          <p className="mb-3 text-sm text-[var(--fg-muted)]">
            Lo que sale en esta guía. Déjalo vacío para que no vaya. Cada uno tiene su tope: lo que el cliente
            confirmó menos lo que ya llevan otras guías.
          </p>
          <div className="scroll-x">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[var(--fg-muted)]">
                  <th className="py-2 pr-3 font-medium">Código</th>
                  <th className="py-2 pr-3 font-medium">Descripción</th>
                  <th className="py-2 pr-3 text-right font-medium">Confirmó</th>
                  <th className="py-2 pr-3 text-right font-medium">En otras guías</th>
                  <th className="py-2 text-right font-medium">Sale en esta</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => {
                  const tope = Math.max(l.confirmado - l.otras, 0);
                  const pasada = cantidadDe(l.cotizacion_item_id) > tope;
                  return (
                    <tr key={l.cotizacion_item_id} className="border-b border-[var(--border-soft)]">
                      <td className="py-2 pr-3 font-mono font-medium">{l.codigo}</td>
                      <td className="py-2 pr-3">{l.descripcion}</td>
                      <td className="py-2 pr-3 text-right tabular">{l.confirmado}</td>
                      <td className="py-2 pr-3 text-right tabular">{l.otras > 0 ? l.otras : "—"}</td>
                      <td className="py-2 text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <Input
                            aria-label={`Cuántos ${l.codigo} salen en esta guía`}
                            numerico
                            inputMode="decimal"
                            value={cantidades[l.cotizacion_item_id] ?? ""}
                            onChange={(e) =>
                              setCantidades((p) => ({ ...p, [l.cotizacion_item_id]: e.target.value }))
                            }
                            placeholder="0"
                            className="w-24"
                            aria-invalid={pasada || undefined}
                          />
                          <span className={`text-sm ${pasada ? "text-[var(--danger)]" : "text-[var(--fg-subtle)]"}`}>
                            máx. {tope}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="card grid gap-3 p-4 sm:grid-cols-2">
        <h2 className="text-base font-semibold sm:col-span-2">El traslado</h2>

        {motivos.length > 0 ? (
          <Campo id="g-motivo" label="Motivo">
            <SelectNativo id="g-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              {motivos.map((m) => (
                <option key={m.codigo} value={m.codigo}>
                  {m.descripcion}
                </option>
              ))}
            </SelectNativo>
          </Campo>
        ) : null}

        {/* La orden de compra del cliente (14/10): llega muchas veces
            después de preparar la guía, y es el papel con el que sale. */}
        <Campo id="g-oc" label="Orden de compra del cliente">
          <Input
            id="g-oc"
            value={ordenCompra}
            onChange={(e) => setOrdenCompra(e.target.value)}
            placeholder="OC-4471 (si la mandó)"
            maxLength={100}
          />
        </Campo>

        <Campo
          id="g-fecha"
          label="Inicio de traslado"
          requerido
          /*
            Willy, 40:34: *«inicio de traslado, porque puede que lo prepare
            ahora, pero lo llegue mañana»*. Es el día que sale la mercadería, no
            el día que se escribió el papel.
          */
          ayuda="El día que sale la mercadería. No tiene por qué ser hoy."
        >
          <Input
            id="g-fecha"
            type="date"
            value={fechaTraslado}
            onChange={(e) => setFechaTraslado(e.target.value)}
          />
        </Campo>

        <Campo id="g-bultos" label="Bultos" requerido>
          <Input
            id="g-bultos"
            type="number"
            min={1}
            step="1"
            value={bultos}
            onChange={(e) => setBultos(e.target.value)}
            className="text-right tabular"
          />
        </Campo>

        <Campo
          id="g-direccion"
          label="Dirección de entrega"
          requerido
          className="sm:col-span-2"
        >
          <Input
            id="g-direccion"
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
          />
        </Campo>

        <Campo id="g-ubigeo" label="Ubigeo de llegada" requerido ayuda="Seis dígitos. La guía no se guarda sin él.">
          <Input
            id="g-ubigeo"
            value={ubigeo}
            onChange={(e) => setUbigeo(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="tabular"
            inputMode="numeric"
          />
        </Campo>

        <Campo
          id="g-peso"
          label="Peso bruto (kg)"
          requerido
          ayuda="El total de la guía. SUNAT lo rechaza en cero."
        >
          <Input
            id="g-peso"
            type="number"
            min={0}
            step="0.001"
            value={peso}
            onChange={(e) => setPeso(e.target.value)}
            className="text-right tabular"
          />
        </Campo>
      </section>

      <section className="card grid gap-3 p-4 sm:grid-cols-2">
        <h2 className="text-base font-semibold sm:col-span-2">El transporte</h2>

        <Campo id="g-modalidad" label="Modalidad">
          <SelectNativo
            id="g-modalidad"
            value={modalidad}
            onChange={(e) => {
              const v = e.target.value as ModalidadTraslado;
              setModalidad(v);
              // Al cambiar de modalidad se sueltan los datos de la otra, igual
              // que en el constructor: guardar la placa de su camioneta en una
              // guía pública ensucia el documento.
              if (v === "01") {
                setPlaca("");
                setConductor("");
                setDni("");
                setLicencia("");
                setCelular("");
                setAPie(false);
              } else {
                setRuc("");
                setRazon("");
              }
            }}
          >
            {(["02", "01"] as ModalidadTraslado[]).map((m) => (
              <option key={m} value={m}>
                {ETIQUETA_MODALIDAD[m]}
              </option>
            ))}
          </SelectNativo>
        </Campo>

        {esPublico ? (
          <>
            <Campo id="g-ruc" label="RUC del transportista" requerido>
              <Input
                id="g-ruc"
                value={ruc}
                onChange={(e) => setRuc(e.target.value.replace(/\D/g, "").slice(0, 11))}
                className="tabular"
                inputMode="numeric"
              />
            </Campo>
            <Campo id="g-razon" label="Razón social" className="sm:col-span-2">
              <Input id="g-razon" value={razon} onChange={(e) => setRazon(e.target.value)} />
            </Campo>
          </>
        ) : (
          <>
            <label className="flex items-center gap-2 self-end pb-2">
              <input
                type="checkbox"
                checked={aPie}
                onChange={(e) => {
                  setAPie(e.target.checked);
                  if (e.target.checked) {
                    setPlaca("");
                    setLicencia("");
                  }
                }}
                className="size-4"
              />
              <span className="text-sm font-medium">Va a pie, sin vehículo</span>
            </label>

            {/* Elegidos del maestro, con «Nuevo» y «Editar» al lado (14/10):
                lo mismo que al crear la guía. */}
            <div className="sm:col-span-2">
              <TransportePropio
                aPie={aPie}
                vehiculos={vehiculos}
                conductores={conductores}
                valor={{
                  placa,
                  conductorNombre: conductor,
                  conductorDocumento: dni,
                  conductorLicencia: licencia,
                  conductorTelefono: celular,
                }}
                onCambio={(p) => {
                  if (p.placa !== undefined) setPlaca(p.placa);
                  if (p.conductorNombre !== undefined) setConductor(p.conductorNombre);
                  if (p.conductorDocumento !== undefined) setDni(p.conductorDocumento);
                  if (p.conductorLicencia !== undefined) setLicencia(p.conductorLicencia);
                  if (p.conductorTelefono !== undefined) setCelular(p.conductorTelefono);
                }}
              />
            </div>
          </>
        )}

        <Campo id="g-obs" label="Observaciones" className="sm:col-span-2">
          <Textarea
            id="g-obs"
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            rows={2}
            placeholder="Lo que salga impreso al pie de la guía."
          />
        </Campo>
      </section>

    </div>
  );
}
