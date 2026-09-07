"use client";

import * as React from "react";
import {
  Button,
  Campo,
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
import { olvidarQueVende } from "@/modules/proveedores/acciones/catalogo";
import {
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
  porcentajeQueDiceAlgo,
  referenciaVacia,
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

  const [moneda, setMoneda] = React.useState<Moneda>(proveedor.moneda);
  const [tc, setTc] = React.useState<string>(
    proveedor.tipo_cambio === null ? "" : String(proveedor.tipo_cambio),
  );
  const [incluyeIgv, setIncluyeIgv] = React.useState(proveedor.incluye_igv);
  const [validez, setValidez] = React.useState(proveedor.validez_hasta ?? "");
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
        // Solo vive en esta pantalla: la base guarda «no disponible» y la
        // relación proveedor-producto se borra aparte, al guardar.
        yaNoVende: false,
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

  /** «Lo tiene» · «No ahora» · «Ya no lo vende». */
  function ponerTenencia(itemId: string, valor: string) {
    setLineas((prev) =>
      prev.map((l) =>
        l.item_id === itemId
          ? { ...l, disponible: valor === "si", yaNoVende: valor === "nunca" }
          : l,
      ),
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
      /*
        El estado sale de lo escrito, no de un desplegable.

        Hay algún precio → contestó. Todo marcado como que no lo tiene → no lo
        tiene. Es la misma información leída del formulario en vez de pedida
        dos veces, y quita la casilla que Luis señaló como la que más estorba.
      */
      const deducido: EstadoRespuesta =
        utiles.some((l) => l.costo_unitario !== null)
          ? "respondio"
          : utiles.length > 0
            ? "no_tiene"
            : "esperando";

      const cabecera = {
        estado: deducido,
        moneda,
        tipo_cambio: moneda === "USD" ? null : tcNum,
        incluye_igv: incluyeIgv,
        validez_hasta: validez.trim() === "" ? null : validez,
        // Ya no hay plazo de cabecera: el de cada línea es el que manda, y el
        // servidor cae a este solo si una línea no trae el suyo.
        dias_entrega: null,
        nota: nota.trim() === "" ? null : nota.trim(),
      };

      /*
        «Ya no lo vende» se registra donde sirve: en lo que el sistema cree
        que vende cada proveedor (046). Si solo se guardara como «hoy no lo
        tiene», la próxima ronda volvería a proponérselo.

        Va sin esperar ni avisar si falla: es una limpieza del
        catálogo, y perderla no invalida el precio que se acaba de apuntar.
      */
      for (const l of lineas.filter((x) => x.yaNoVende)) {
        const item = items.find((i) => i.item_id === l.item_id);
        if (item) void olvidarQueVende(proveedor.proveedor_id, item.producto_id);
      }
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
          {/*
            Ni «Contestó» ni «Plazo para todo».

            El estado se DEDUCE de lo que se escribe: hay precios, luego
            contestó; está todo marcado como que no lo tiene, luego no lo tiene.
            Preguntarlo aparte era pedir que se rellenara a mano algo que el
            formulario ya sabe — y con un desplegable de cuatro opciones en la
            primera casilla, además, que es donde cae la vista.

            Y el plazo va POR LÍNEA, que es donde tiene sentido: el retén puede
            estar en almacén y el rodamiento venir de fuera.
          */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

          {/*
            Una tarjeta por producto, no una fila de tabla.

            Era una tabla de seis columnas con la referencia en 11 píxeles y
            gris claro. Luis: *«los datos del producto, ¿no puedes poner una
            card pequeña bien detallada? te dije que lo usan personas mayores,
            tiene que verse bien; le sumamos el tamaño al texto porque Willy no
            veía»*.

            Y era verdad: ese «vendes a $3.48» que el sistema calcula para que
            se decida bien estaba escrito al tamaño de un pie de página. Nada
            aquí baja de 14 px, y lo que hay que leer para negociar va en su
            propia línea, no apretado en una celda.
          */}
          <div className="flex flex-col gap-3">
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
                <section
                  key={item.item_id}
                  className="rounded-md border border-[var(--border)] p-3"
                >
                  {/* Qué es. El código grande: es lo que se lee en voz alta
                      por teléfono, y lo que se busca con la vista. */}
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="font-mono text-base font-semibold">
                      {item.codigo}
                    </span>
                    <span className="text-sm text-[var(--fg-muted)]">
                      {item.cantidad} {item.unidad}
                      {item.marca ? ` · ${item.marca}` : ""}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-[var(--fg-muted)]">
                    {item.descripcion}
                  </p>

                  <LoQueYaSabes referencia={ref} />

                  {/* Lo que se rellena. Tres campos anchos y etiquetados, en
                      vez de seis columnas de tabla en las que hay que contar
                      cuál es cuál. */}
                  <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1.2fr)]">
                    <Campo
                      id={`precio-${item.item_id}`}
                      label={`Precio ${moneda === "PEN" ? "(S/)" : "($)"}`}
                    >
                      <Input
                        id={`precio-${item.item_id}`}
                        inputMode="decimal"
                        className="text-right tabular-nums"
                        value={linea.costo}
                        disabled={!linea.disponible}
                        onChange={(e) => cambiar(item.item_id, "costo", e.target.value)}
                      />
                    </Campo>

                    <Campo id={`dias-${item.item_id}`} label="Días">
                      <Input
                        id={`dias-${item.item_id}`}
                        inputMode="numeric"
                        className="text-right tabular-nums"
                        value={linea.dias}
                        disabled={!linea.disponible}
                        placeholder="—"
                        onChange={(e) => cambiar(item.item_id, "dias", e.target.value)}
                      />
                    </Campo>

                    {/*
                      Tres respuestas, no dos.

                      La casilla solo distinguía «lo tiene» de «no lo tiene», y
                      ahí caben dos cosas muy distintas: «hoy no me queda» y
                      «eso ya no lo trabajo». La primera es de esta semana; la
                      segunda hay que recordarla, o se le vuelve a preguntar en
                      cada ronda.
                    */}
                    <Campo id={`tiene-${item.item_id}`} label="¿Lo tiene?">
                      <SelectNativo
                        id={`tiene-${item.item_id}`}
                        value={linea.disponible ? "si" : linea.yaNoVende ? "nunca" : "no"}
                        onChange={(e) => ponerTenencia(item.item_id, e.target.value)}
                      >
                        <option value="si">Lo tiene</option>
                        <option value="no">No ahora</option>
                        <option value="nunca">Ya no lo vende</option>
                      </SelectNativo>
                    </Campo>
                  </div>

                  {/* Lo que sale de lo tecleado. En grande, porque es la cifra
                      que se compara contra los otros proveedores. */}
                  {usd !== null || linea.costo.trim() !== "" ? (
                    <p className="mt-2 flex flex-wrap items-baseline gap-x-3 border-t border-[var(--border-soft)] pt-2 text-sm">
                      <span className="text-[var(--fg-muted)]">Sale a</span>
                      <strong className="tabular-nums text-base">
                        {usd === null ? "—" : formatearMoneda(usd, "USD")}
                      </strong>
                      <span className="text-[var(--fg-subtle)]">
                        por unidad, sin IGV
                      </span>
                      <Veredicto usd={usd} referencia={ref} />
                    </p>
                  ) : null}
                </section>
              );
            })}
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
 * Lo que ya sabes de este producto, con etiquetas y siempre a la vista.
 *
 * ---------------------------------------------------------------------------
 * Las dos cifras con las que se decide cuánto cotizar
 * ---------------------------------------------------------------------------
 * Luis: *«quería información a cuánto fue comprado último, por eso de eso
 * tengo que cotizar; y el precio que se vende, si no cómo sé a cuánto se vende,
 * para referencia nomás»*.
 *
 * Antes salían en un texto corrido —«compras a $8.20 · vendes a $12.40»— y
 * **solo si existían**. Con un producto sin costo cargado, que en este catálogo
 * son casi todos, simplemente no aparecía nada: ni el dato ni la explicación de
 * por qué falta. Quien mira no sabe si es que no se ha comprado nunca o si la
 * pantalla se lo comió.
 *
 * Ahora las tres van SIEMPRE, con su etiqueta encima y un «—» cuando no hay.
 * Un hueco que se ve es un dato que se puede ir a buscar; uno que no se ve, no.
 */
function LoQueYaSabes({ referencia: ref }: { referencia: Referencia }) {
  /*
    Los OTROS proveedores, con lo que cobraron.

    Con el WhatsApp abierto no se negocia «bátele al mejor», se negocia «CORPUS
    me lo dejó a 0.20 y GALLEGOS a 0.24, tú dime». Para eso hace falta la
    lista, no el ganador.

    Tres como mucho: es una referencia mientras se teclea, no un informe. Lo
    comprado va antes que lo cotizado —una factura pesa más que una promesa— y
    dentro, del más barato al más caro.
  */
  const conPrecio = ref.proveedores
    .filter((p) => p.ultimoCostoUsd !== null)
    .map((p) => ({
      quien: p.proveedor,
      costo: p.ultimoCostoUsd!,
      cuando: p.ultimaCompra,
      /*
        «Comprado» solo si hay una compra de verdad detrás.

        Cotizar deja constancia de que el proveedor vende ese producto —lo hace
        `anotar_respuesta_precio` a propósito, y el centinela de la 055 lo
        comprueba— así que aparece en esta lista sin que se le haya comprado
        nunca. Etiquetarlo «comprado» decía que hubo una factura donde solo
        hubo un WhatsApp, y esa diferencia es justo la que hace que un precio
        pese más que otro al negociar.
      */
      comprado: p.ultimaCompra !== null,
    }));

  const cotizados = ref.historial.map((h) => ({
    quien: h.proveedor,
    costo: h.costoUsd,
    cuando: h.fecha,
    comprado: false,
  }));

  const antes = [...conPrecio, ...cotizados]
    .sort((a, b) => Number(b.comprado) - Number(a.comprado) || a.costo - b.costo)
    .slice(0, 3);

  // El último que se pagó de verdad, con quién y cuándo. `productos.ultimo_costo`
  // sabe cuánto pero no a quién, así que el nombre sale de la compra más
  // reciente que consta.
  const ultimaCompra = conPrecio
    .filter((c) => c.cuando !== null)
    .sort((a, b) => (b.cuando! < a.cuando! ? -1 : 1))[0];

  const margen = margenSi(ref.ultimoCosto, ref.precioVenta);

  return (
    <div className="mt-2 rounded-md bg-[var(--surface-2)] p-3 text-sm">
      <div className="grid grid-cols-3 gap-3">
        <Dato
          etiqueta="Te costó"
          valor={ref.ultimoCosto === null ? null : moneda2(ref.ultimoCosto)}
          pie={
            ultimaCompra
              ? `${ultimaCompra.quien}${
                  ultimaCompra.cuando ? ` · ${formatearFecha(ultimaCompra.cuando)}` : ""
                }`
              : "nunca se ha comprado"
          }
        />
        <Dato
          etiqueta="Lo vendes a"
          valor={ref.precioVenta === null ? null : moneda2(ref.precioVenta)}
          /*
            El margen aquí y no en su propia casilla: es lo que sale de las dos
            de al lado, y con las tres separadas habría que hacer la resta.

            El pie tiene que decir por qué NO hay margen, y son dos motivos
            distintos. La primera versión ponía «sin precio cargado» debajo de
            un precio de venta perfectamente cargado — el margen faltaba por el
            costo, no por la venta.
          */
          pie={
            margen !== null
              ? `${margen}% de margen`
              : ref.precioVenta === null
                ? "sin precio cargado"
                : "el margen sale al saber el costo"
          }
        />
        <Dato
          etiqueta="Tu piso"
          valor={ref.precioMinimo === null ? null : moneda2(ref.precioMinimo)}
          pie={ref.precioMinimo === null ? "sin piso definido" : "no bajar de aquí"}
        />
      </div>

      {antes.length > 0 ? (
        <div className="mt-3 flex flex-col gap-1 border-t border-[var(--border-soft)] pt-2">
          <span className="text-[var(--fg-subtle)]">También lo venden</span>
          {antes.map((a, i) => (
            <p key={`${a.quien}-${i}`} className="flex flex-wrap items-baseline gap-x-2">
              <strong className="tabular-nums">{moneda2(a.costo)}</strong>
              <span className="min-w-0 flex-1 truncate text-[var(--fg-muted)]">
                {a.quien}
              </span>
              <span className="text-[var(--fg-subtle)]">
                {a.comprado ? "comprado" : a.cuando ? "cotizado" : "lo vende"}
                {a.cuando ? ` ${formatearFecha(a.cuando)}` : ""}
              </span>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Una cifra con su etiqueta y su pie.
 *
 * El «—» no es un adorno: un hueco que se VE es un dato que se puede ir a
 * buscar, y el pie dice por qué falta. Callarse el campo entero deja a quien
 * mira sin saber si nunca se compró o si la pantalla se lo comió.
 */
function Dato({
  etiqueta,
  valor,
  pie,
}: {
  etiqueta: string;
  valor: string | null;
  pie: string;
}) {
  return (
    <div className="min-w-0">
      <span className="block text-sm text-[var(--fg-subtle)]">{etiqueta}</span>
      <strong
        className={`block text-lg tabular-nums ${
          valor === null ? "text-[var(--fg-subtle)]" : ""
        }`}
      >
        {valor ?? "—"}
      </strong>
      <span className="block truncate text-sm text-[var(--fg-muted)]" title={pie}>
        {pie}
      </span>
    </div>
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
    <span className="flex flex-wrap items-baseline gap-x-2 whitespace-nowrap text-sm">
      {contra ? (
        <span
          className={`${
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
        <span className="font-medium text-[var(--danger)]">
          más caro que tu venta
        </span>
      ) : alerta === "sobre_piso" ? (
        <span className="text-[var(--warn)]">por encima de tu piso</span>
      ) : margen !== null ? (
        <span className="text-[var(--fg-subtle)]">
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
