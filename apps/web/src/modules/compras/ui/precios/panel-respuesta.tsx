"use client";

import * as React from "react";
import {
  Button,
  Campo,
  Checkbox,
  CheckboxCampo,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  SelectNativo,
  formatearFecha,
  formatearMoneda,
} from "@rodatech/ui";

import { tipoCambioDelDia } from "../../acciones/tipo-cambio";
import { anotarRespuesta } from "../../acciones/comparar";
import {
  ETIQUETA_RESPUESTA,
  aUsdSinIgv,
  type EstadoRespuesta,
  type ItemConsultado,
  type Moneda,
  type ProveedorConsultado,
  type Respuesta,
} from "../../dominio/comparador";
import {
  alertaDePrecio,
  contraReferencia,
  margenSi,
  mejorConocido,
  porcentajeQueDiceAlgo,
  referenciaVacia,
  tieneAlgoQueDecir,
  type Referencia,
} from "../../dominio/referencia";

/**
 * Apuntar lo que contestó UN proveedor.
 *
 * Está pensado para usarse con el WhatsApp abierto al lado: se lee la
 * respuesta y se van tecleando los precios en el mismo orden en que se
 * preguntaron. Por eso las líneas salen en el orden de la consulta y no
 * ordenadas por nada más.
 *
 * ---------------------------------------------------------------------------
 * Las dos preguntas de arriba no son burocracia
 * ---------------------------------------------------------------------------
 * La moneda y el «¿traía el IGV?» cambian el número que se compara. Un
 * proveedor de Lima que dice «15.20» puede estar diciendo $ 15.20, S/ 15.20
 * más IGV o S/ 15.20 puesto, y entre el primero y el último hay un 4,4×.
 *
 * Se pregunta una vez por proveedor y vale para todas sus líneas, que es como
 * contestan de verdad.
 *
 * ---------------------------------------------------------------------------
 * Y por qué cada línea lleva su referencia al lado
 * ---------------------------------------------------------------------------
 * Porque antes no la llevaba, y escribir «15.20» sin nada enfrente no es
 * decidir: es transcribir. La comparativa contesta «¿quién de estos tres es el
 * más barato?», pero el más barato de tres puede ser el más caro de tu
 * historia y la rejilla lo coronaría igual.
 *
 * Así que debajo de cada producto va lo que ya se pagó, a cuánto se vende y
 * cuál es el piso; y en cuanto se teclea un número, al lado sale si es mejor o
 * peor que lo mejor que se ha conseguido y qué margen deja. La regla está en
 * `dominio/referencia.ts` con sus pruebas.
 */
export function PanelRespuesta({
  proveedor,
  items,
  respuestas,
  referencias,
  onCerrar,
  onGuardado,
}: {
  proveedor: ProveedorConsultado;
  items: ItemConsultado[];
  respuestas: Respuesta[];
  /** Por `producto_id`. Puede venir incompleto: la pantalla funciona sin él. */
  referencias: Record<string, Referencia>;
  onCerrar: () => void;
  onGuardado: (
    cpId: string,
    cabecera: Partial<ProveedorConsultado>,
    lineas: Respuesta[],
  ) => void;
}) {
  const previas = React.useMemo(
    () => new Map(respuestas.map((r) => [r.item_id, r])),
    [respuestas],
  );

  const [estado, setEstado] = React.useState<EstadoRespuesta>(
    proveedor.estado === "esperando" ? "respondio" : proveedor.estado,
  );
  const [moneda, setMoneda] = React.useState<Moneda>(proveedor.moneda);
  const [tc, setTc] = React.useState<string>(
    proveedor.tipo_cambio === null ? "" : String(proveedor.tipo_cambio),
  );
  const [incluyeIgv, setIncluyeIgv] = React.useState(proveedor.incluye_igv);
  const [validez, setValidez] = React.useState(proveedor.validez_hasta ?? "");
  const [dias, setDias] = React.useState(
    proveedor.dias_entrega === null ? "" : String(proveedor.dias_entrega),
  );
  const [nota, setNota] = React.useState(proveedor.nota ?? "");

  const [lineas, setLineas] = React.useState(() =>
    items.map((i) => {
      const r = previas.get(i.item_id);
      return {
        item_id: i.item_id,
        costo: r?.costo_unitario === null || r === undefined ? "" : String(r.costo_unitario),
        dias: r?.dias_entrega === null || r === undefined ? "" : String(r.dias_entrega),
        // Lo normal es que sí lo tenga: se destilda el que no.
        disponible: r?.disponible ?? true,
        nota: r?.nota ?? "",
      };
    }),
  );

  const [enCurso, empezar] = React.useTransition();
  const [buscandoTc, setBuscandoTc] = React.useState(false);
  const [aviso, setAviso] = React.useState<string | null>(null);

  const tcNum = tc.trim() === "" ? null : Number(tc);
  const faltaTc = moneda === "PEN" && (tcNum === null || !Number.isFinite(tcNum) || tcNum <= 0);

  function cambiar(itemId: string, campo: "costo" | "dias" | "nota", valor: string) {
    setLineas((prev) =>
      prev.map((l) => (l.item_id === itemId ? { ...l, [campo]: valor } : l)),
    );
  }

  function alternarDisponible(itemId: string) {
    setLineas((prev) =>
      prev.map((l) => (l.item_id === itemId ? { ...l, disponible: !l.disponible } : l)),
    );
  }

  async function traerTc() {
    setBuscandoTc(true);
    setAviso(null);
    const r = await tipoCambioDelDia();
    setBuscandoTc(false);
    // Se usa el de VENTA: es al que se compran los dólares para pagarle a un
    // proveedor que factura en soles.
    if (r.ok) setTc(String(r.venta));
    else setAviso(r.error);
  }

  function guardar() {
    setAviso(null);

    // Una línea con precio pero destildada es una contradicción que la base
    // aceptaría —«no lo tengo» gana— y que probablemente sea un descuido.
    const contradictorias = lineas.filter((l) => !l.disponible && l.costo.trim() !== "");
    if (contradictorias.length > 0) {
      setAviso(
        "Hay líneas con precio marcadas como «no lo tiene». Quita el precio o vuelve a marcarlas.",
      );
      return;
    }

    const utiles = lineas
      .filter((l) => !l.disponible || l.costo.trim() !== "")
      .map((l) => ({
        item_id: l.item_id,
        costo_unitario: l.costo.trim() === "" ? null : Number(l.costo),
        dias_entrega: l.dias.trim() === "" ? null : Number(l.dias),
        disponible: l.disponible,
        nota: l.nota.trim() === "" ? null : l.nota.trim(),
      }));

    if (utiles.some((l) => l.costo_unitario !== null && !Number.isFinite(l.costo_unitario))) {
      setAviso("Hay un precio que no es un número.");
      return;
    }

    empezar(async () => {
      const cabecera = {
        estado,
        moneda,
        tipo_cambio: moneda === "USD" ? null : tcNum,
        incluye_igv: incluyeIgv,
        validez_hasta: validez.trim() === "" ? null : validez,
        dias_entrega: dias.trim() === "" ? null : Number(dias),
        nota: nota.trim() === "" ? null : nota.trim(),
      };

      const r = await anotarRespuesta({
        consulta_proveedor_id: proveedor.consulta_proveedor_id,
        ...cabecera,
        lineas: utiles,
      });

      if (!r.ok) {
        setAviso(r.error);
        return;
      }

      onGuardado(
        proveedor.consulta_proveedor_id,
        cabecera,
        utiles.map((l) => ({
          ...l,
          consulta_proveedor_id: proveedor.consulta_proveedor_id,
        })),
      );
    });
  }

  return (
    <Dialog open onOpenChange={(v) => (!v ? onCerrar() : null)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{proveedor.proveedor}</DialogTitle>
          <DialogDescription>
            Apunta lo que te contestó. Los precios se comparan en dólares sin IGV,
            así que hace falta saber en qué te lo dijo.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Campo id="estado-respuesta" label="Contestó">
              <SelectNativo
                id="estado-respuesta"
                value={estado}
                onChange={(e) => setEstado(e.target.value as EstadoRespuesta)}
              >
                {(Object.keys(ETIQUETA_RESPUESTA) as EstadoRespuesta[]).map((k) => (
                  <option key={k} value={k}>
                    {ETIQUETA_RESPUESTA[k]}
                  </option>
                ))}
              </SelectNativo>
            </Campo>

            <Campo id="moneda-respuesta" label="Moneda">
              <SelectNativo
                id="moneda-respuesta"
                value={moneda}
                onChange={(e) => setMoneda(e.target.value as Moneda)}
              >
                <option value="USD">Dólares</option>
                <option value="PEN">Soles</option>
              </SelectNativo>
            </Campo>

            {moneda === "PEN" ? (
              <Campo
                id="tc-respuesta"
                label="Tipo de cambio"
                ayuda={faltaTc ? "Sin esto no se puede comparar" : undefined}
              >
                <div className="flex gap-1">
                  <Input
                    id="tc-respuesta"
                    inputMode="decimal"
                    value={tc}
                    onChange={(e) => setTc(e.target.value)}
                    placeholder="3.75"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={traerTc}
                    disabled={buscandoTc}
                    className="shrink-0"
                  >
                    {buscandoTc ? "…" : "SUNAT"}
                  </Button>
                </div>
              </Campo>
            ) : null}

            <Campo id="dias-respuesta" label="Plazo para todo (días)">
              <Input
                id="dias-respuesta"
                inputMode="numeric"
                value={dias}
                onChange={(e) => setDias(e.target.value)}
                placeholder="15"
              />
            </Campo>

            <Campo id="validez-respuesta" label="Precio válido hasta">
              <Input
                id="validez-respuesta"
                type="date"
                value={validez}
                onChange={(e) => setValidez(e.target.value)}
              />
            </Campo>
          </div>

          <CheckboxCampo
            id="incluye-igv"
            checked={incluyeIgv}
            onCheckedChange={(v) => setIncluyeIgv(Boolean(v))}
            label="Los precios ya traen el IGV"
            ayuda="Si te lo dijo «más IGV», déjalo sin marcar."
          />

          <div className="overflow-x-auto rounded-md border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 text-right font-medium">Cant.</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Precio {moneda === "PEN" ? "(S/)" : "($)"}
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Días</th>
                  <th className="px-3 py-2 text-right font-medium">En USD</th>
                  <th className="px-3 py-2 font-medium">Lo tiene</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const linea = lineas.find((l) => l.item_id === item.item_id);
                  if (!linea) return null;
                  const usd = aUsdSinIgv(
                    linea.costo.trim() === "" ? null : Number(linea.costo),
                    moneda,
                    tcNum,
                    incluyeIgv,
                  );
                  const ref =
                    referencias[item.producto_id] ?? referenciaVacia(item.producto_id);
                  return (
                    <tr
                      key={item.item_id}
                      className="border-b border-[var(--border)] last:border-0"
                    >
                      <td className="px-3 py-1.5">
                        <span className="font-medium tabular-nums">{item.codigo}</span>
                        <span className="block max-w-[16rem] truncate text-xs text-[var(--fg-muted)]">
                          {item.descripcion}
                        </span>
                        <LoQueYaSabes referencia={ref} />
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {item.cantidad}
                      </td>
                      <td className="px-3 py-1.5">
                        <Input
                          inputMode="decimal"
                          className="h-8 text-right tabular-nums"
                          value={linea.costo}
                          disabled={!linea.disponible}
                          onChange={(e) => cambiar(item.item_id, "costo", e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <Input
                          inputMode="numeric"
                          className="h-8 w-16 text-right tabular-nums"
                          value={linea.dias}
                          disabled={!linea.disponible}
                          placeholder={dias || "—"}
                          onChange={(e) => cambiar(item.item_id, "dias", e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {/* La conversión, delante. Es lo que hace que se note
                            en el momento que el tipo de cambio falta o que el
                            IGV estaba mal marcado. */}
                        <span className="text-[var(--fg-muted)]">
                          {usd === null ? "—" : formatearMoneda(usd, "USD")}
                        </span>
                        <Veredicto usd={usd} referencia={ref} />
                      </td>
                      <td className="px-3 py-1.5">
                        <Checkbox
                          checked={linea.disponible}
                          onCheckedChange={() => alternarDisponible(item.item_id)}
                          aria-label={`${item.codigo}: lo tiene`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Campo id="nota-respuesta" label="Nota">
            <Input
              id="nota-respuesta"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="«el precio sube el lunes», «pide adelanto»…"
            />
          </Campo>

          {aviso ? (
            <p
              role="alert"
              className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm"
            >
              {aviso}
            </p>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="button" onClick={guardar} disabled={enCurso || faltaTc}>
            {enCurso ? "Guardando…" : "Guardar lo que dijo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Lo que ya se sabe de este producto, debajo de su nombre.
 *
 * Son los tres números que Willy tiene en la cabeza cuando pregunta un precio
 * —a cuánto lo compraba, a cuánto lo vende y cuál es su piso— más el mejor
 * que consta. Escritos delante para no tener que acordarse de ellos.
 *
 * Si no hay nada, lo dice. «Primera vez» es información: explica por qué la
 * columna de al lado no va a opinar, y evita leer el silencio como un visto
 * bueno.
 */
function LoQueYaSabes({ referencia: ref }: { referencia: Referencia }) {
  if (!tieneAlgoQueDecir(ref)) {
    return (
      <span className="mt-0.5 block text-[11px] text-[var(--fg-subtle)]">
        Primera vez: no hay con qué compararlo.
      </span>
    );
  }

  const mejor = mejorConocido(ref);
  const partes: string[] = [];
  if (ref.ultimoCosto !== null) partes.push(`compras a ${moneda2(ref.ultimoCosto)}`);
  if (ref.precioVenta !== null) partes.push(`vendes a ${moneda2(ref.precioVenta)}`);
  if (ref.precioMinimo !== null) partes.push(`piso ${moneda2(ref.precioMinimo)}`);

  return (
    <span className="mt-0.5 block text-[11px] leading-tight text-[var(--fg-subtle)]">
      {partes.length > 0 ? <span className="block">{partes.join(" · ")}</span> : null}
      {mejor ? (
        <span className="block">
          mejor: {moneda2(mejor.costoUsd)} · {mejor.proveedor} ·{" "}
          {mejor.origen === "comprado" ? "comprado" : "cotizado"}
          {mejor.fecha ? ` ${formatearFecha(mejor.fecha)}` : ""}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Qué dice el precio que se acaba de teclear.
 *
 * Dos líneas como mucho: cuánto mejor o peor es que lo mejor que se ha tenido,
 * y —lo que decide si conviene— el margen que deja o el aviso de que no deja
 * ninguno.
 *
 * El aviso SUSTITUYE al margen y no se suma: si te lo dejan a más de lo que lo
 * vendes, «margen −8 %» es la misma frase dicha peor.
 */
function Veredicto({ usd, referencia: ref }: { usd: number | null; referencia: Referencia }) {
  const contra = contraReferencia(usd, ref);
  const alerta = alertaDePrecio(usd, ref);
  const margen = margenSi(usd, ref.precioVenta);

  if (contra === null && alerta === null && margen === null) return null;

  // Con la alerta puesta, «más caro» sobra: la línea de abajo ya dice que es
  // más caro que la venta, y repetir la palabra hace que ninguna de las dos
  // se lea. Se queda la cifra a secas.
  const pct = porcentajeQueDiceAlgo(contra?.porcentaje ?? 0);

  return (
    <span className="mt-0.5 block whitespace-nowrap text-[11px] leading-snug">
      {contra ? (
        <span
          className={`block ${
            contra.veredicto === "mejor"
              ? "text-[var(--ok)]"
              : contra.veredicto === "peor"
                ? "text-[var(--warn)]"
                : "text-[var(--fg-subtle)]"
          }`}
        >
          {contra.veredicto === "igual"
            ? "igual que antes"
            : `${contra.diferencia > 0 ? "+" : "−"}${moneda2(
                Math.abs(contra.diferencia),
              )}${pct === null ? "" : ` · ${Math.abs(pct)}%`}${
                alerta === null
                  ? contra.veredicto === "peor"
                    ? " más caro"
                    : " más barato"
                  : ""
              }`}
        </span>
      ) : null}

      {alerta === "sobre_venta" ? (
        <span className="block font-medium text-[var(--danger)]">
          más caro que tu venta
        </span>
      ) : alerta === "sobre_piso" ? (
        <span className="block text-[var(--warn)]">por encima de tu piso</span>
      ) : margen !== null ? (
        <span className="block text-[var(--fg-subtle)]">
          {/* Un «margen 20466.7%» es el mismo ruido que el porcentaje de
              arriba, y sale por lo mismo: un precio de lista cargado contra
              un costo que es casi cero. Se dice que es alto y se deja ahí. */}
          {porcentajeQueDiceAlgo(margen) === null
            ? "margen alto"
            : `margen ${margen}%`}
        </span>
      ) : null}
    </span>
  );
}

/** Compacto a propósito: son cuatro cifras seguidas en once píxeles. */
function moneda2(n: number): string {
  return `$${n.toFixed(2)}`;
}
