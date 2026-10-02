"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, toast } from "@rodatech/ui";
import {
  Check,
  Download,
  FileSpreadsheet,
  Pencil,
  Plus,
  Scale,
  ShoppingCart,
  Trash2,
} from "lucide-react";

import { BuscadorProveedores } from "@/modules/proveedores/ui/buscador";
import type { ProveedorOpcion } from "@/modules/proveedores/dominio/opcion";

import { guardarAnalisis, propuestasAnalisis } from "../../acciones/analisis";
import {
  exportarAnalisisExcel,
  leerExcelAnalisis,
  productoPorCodigo,
} from "../../acciones/analisis-hoja";
import { tipoCambioDelDia } from "../../acciones/tipo-cambio";
import {
  aPayload,
  bloqueos as calcularBloqueos,
  calcular,
  enBlanco,
  estadoInicial,
  reducir,
  type EstadoAnalisis,
  type LineaAnalisis,
  type LineaCalculada,
} from "../../dominio/analisis";
import { BuscadorCompra } from "../constructor/buscador";
import { AltaEnBloque } from "./alta-en-bloque";

const dolar = (n: number, dec = 2) =>
  `$ ${n.toLocaleString("es-PE", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
const kg = (n: number, dec = 2) =>
  `${n.toLocaleString("es-PE", { minimumFractionDigits: dec, maximumFractionDigits: dec })} kg`;
const pct = (n: number) => `${Math.round(n * 100)} %`;
const soles = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * El asterisco rojo de lo que se ESCRIBE a mano.
 *
 * Willy, 02/10: *«quiero que me marques con un asterisco rojo todos los que son
 * datos de ingreso […] para saber qué es lo que yo debo ingresar y qué es lo
 * que me va a dar el sistema»*, porque *«eso lo puede encargar a otra
 * persona»*. Lo que no lleva asterisco lo calcula el sistema.
 */
function Ingreso() {
  return (
    <span className="ml-0.5 font-bold text-[var(--danger)]" title="Lo escribes tú">
      *<span className="sr-only"> (lo escribes tú)</span>
    </span>
  );
}

/** La leyenda del asterisco, donde empieza cada bloque que se rellena. */
function LeyendaIngreso() {
  return (
    <p className="text-sm text-[var(--fg-muted)]">
      <span className="font-bold text-[var(--danger)]">*</span> Lo escribes tú. Lo demás lo calcula
      el sistema.
    </p>
  );
}

/** Color del margen: rojo si pierde, ámbar si es poco, verde si conviene. */
const tonoMargen = (m: number | null) =>
  m === null
    ? "text-[var(--fg-muted)]"
    : m < 0
      ? "text-[var(--danger)]"
      : m < 0.3
        ? "text-[var(--warn)]"
        : "text-[var(--ok)]";

/**
 * El análisis de importación: la hoja de Excel de Willy en el ERP (098, §AQ).
 *
 * Willy, 01/10: *«lo que yo digo que el sistema me haga es el análisis de
 * compra»*. Él rellena lo que le da el proveedor —cantidades, precios FOB, el
 * costo de DHL— y el peso de cada producto; el sistema saca el $/kg, el precio
 * puesto en Lima y el margen contra el mercado; y él decide cuánto pedir.
 *
 * Los cuatro bloques de columnas llevan el color de su hoja —verde el precio
 * de mercado, amarillo lo que pide— para que la reconozca de un vistazo.
 */
export function ConstructorAnalisis({
  hoy,
  sugeridos,
  inicial,
  modo = "editar",
}: {
  hoy: string;
  sugeridos: ProveedorOpcion[];
  /**
   * «ver» es la ficha de un análisis guardado, para LEERLO: números en vez de
   * casillas, y los botones de Editar, Excel y Registrar la compra. Luis,
   * 02/10: *«no podemos ver los detalles después de guardar»*. Al guardar se
   * vuelve aquí. «editar» es la hoja para escribir.
   */
  modo?: "ver" | "editar";
  inicial: {
    id: string;
    numero: string;
    estado: EstadoAnalisis;
    proveedor: ProveedorOpcion | null;
    comprado: { compraId: string; numero: string } | null;
  } | null;
}) {
  const router = useRouter();
  const [estado, despachar] = React.useReducer(
    reducir,
    null,
    // Uno nuevo empieza con una fila para escribir, como una hoja en blanco.
    () => inicial?.estado ?? reducir(estadoInicial(hoy), { tipo: "agregarFila" }),
  );

  /*
    «Añadir fila» lleva el cursor al código de la fila nueva. Se busca el
    campo VISIBLE: la tabla y las tarjetas existen las dos y una está oculta.
  */
  const [enfocar, setEnfocar] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!enfocar) return;
    const campo = [
      ...document.querySelectorAll<HTMLInputElement>(`[data-codigo-de="${enfocar}"]`),
    ].find((e) => e.offsetParent !== null);
    campo?.focus();
    setEnfocar(null);
  }, [enfocar]);
  const agregarFila = () => {
    setEnfocar(`a${estado.proximaKey}`);
    despachar({ tipo: "agregarFila" });
  };
  const [proveedor, setProveedor] = React.useState<ProveedorOpcion | null>(
    inicial?.proveedor ?? null,
  );
  const [guardando, guardar] = React.useTransition();
  const comprado = Boolean(inicial?.comprado);
  const soloLectura = comprado || (inicial !== null && modo === "ver");

  // Lo guardado, para saber si hay cambios sin guardar antes de comprar.
  const [guardado, setGuardado] = React.useState(() =>
    inicial ? JSON.stringify(aPayload(inicial.estado, inicial.id)) : null,
  );
  const actual = JSON.stringify(aPayload(estado, inicial?.id));
  const sinGuardar = guardado !== actual;

  const c = React.useMemo(() => calcular(estado), [estado]);

  /*
    El tipo de cambio del día, propuesto al abrir si no hay uno guardado: el
    desaduanaje se da en soles y la K se calcula en dólares. Una vez, al
    montar; si SUNAT no contesta, se escribe a mano.
  */
  const [tcAviso, setTcAviso] = React.useState<string | null>(null);
  const traerTipoCambio = React.useCallback(() => {
    setTcAviso("Consultando SUNAT…");
    void tipoCambioDelDia().then((r) => {
      if (r.ok) {
        despachar({ tipo: "cabecera", campo: "tipoCambio", valor: r.venta });
        setTcAviso(`SUNAT, venta del ${r.fecha.split("-").reverse().join("/")}.`);
      } else {
        setTcAviso("SUNAT no respondió: escríbelo a mano.");
      }
    });
  }, []);
  React.useEffect(() => {
    if (!soloLectura && !(estado.tipoCambio > 0)) traerTipoCambio();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir
  }, []);
  const bloqueos = calcularBloqueos(estado);

  /*
    La «f» y el último FOB, del servidor, cada vez que cambia la LISTA de
    productos o el proveedor. Depende de esa clave y no de `estado`: lo que
    despacha cambia `estado` pero no la clave, así que no hay bucle (CLAUDE.md
    §5, «un useEffect que despacha sobre lo que depende cuelga el navegador»).
  */
  const claveProductos = estado.lineas
    .map((l) => l.productoId)
    .filter(Boolean)
    .join(",");
  React.useEffect(() => {
    if (soloLectura || claveProductos === "") return;
    let vigente = true;
    void propuestasAnalisis(estado.proveedorId, claveProductos.split(","), inicial?.id).then(
      (p) => {
        if (vigente)
          despachar({
            tipo: "propuestas",
            frecuencias: p.frecuencias,
            fobs: p.fobs,
          });
      },
    );
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la clave resume lo que importa
  }, [claveProductos, estado.proveedorId, soloLectura]);

  const enviar = () => {
    if (bloqueos.length > 0) return;
    guardar(async () => {
      const r = await guardarAnalisis(aPayload(estado, inicial?.id));
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`${r.numero} guardado.`);
      setGuardado(JSON.stringify(aPayload(estado, r.id)));
      // A la ficha, a verlo guardado (y `refresh` para que la lea de nuevo).
      router.replace(`/compras/analisis/${r.id}`);
      router.refresh();
    });
  };

  // Lo que se puede llevar a una compra: del catálogo y con cantidad.
  const sinCatalogo = estado.lineas.filter((l) => !l.productoId && l.cantidadPedido > 0);
  const aComprar = estado.lineas.filter((l) => l.productoId && l.cantidadPedido > 0);

  const editarCampo = (
    l: LineaAnalisis,
    campo: Extract<Parameters<typeof reducir>[1], { tipo: "campo" }>["campo"],
  ) => ({
    valor: l[campo],
    onNumero: (n: number) => despachar({ tipo: "campo", key: l.key, campo, valor: n }),
    vacioEsNulo: campo === "frecuencia",
    disabled: soloLectura,
  });

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/compras/analisis" className="text-sm text-[var(--fg-muted)] underline">
            ← Análisis de importación
          </Link>
          <h1 className="mt-1 text-xl font-semibold">
            {!inicial
              ? "Nuevo análisis de importación"
              : soloLectura
                ? `Análisis ${inicial.numero}`
                : `Editando el análisis ${inicial.numero}`}
          </h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Antes de comprar: cuánto te cuesta cada producto puesto en Lima y cuánto ganas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {inicial && soloLectura ? (
            <>
              {/* Lo guardado, armado en el servidor: lo mismo que desde la lista. */}
              <a
                href={`/compras/analisis/${inicial.id}/excel`}
                download
                className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium hover:bg-[var(--surface-2)]"
              >
                <Download className="size-4" aria-hidden />
                Descargar en Excel
              </a>
              {comprado ? null : (
                <Link
                  href={`/compras/analisis/${inicial.id}/editar`}
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
                >
                  <Pencil className="size-4" aria-hidden />
                  Editar
                </Link>
              )}
            </>
          ) : (
            <DescargarExcel
              estado={estado}
              numero={inicial?.numero ?? null}
              proveedor={proveedor?.razon_social ?? null}
            />
          )}
          {inicial && !soloLectura ? (
            <Link
              href={`/compras/analisis/${inicial.id}`}
              className="inline-flex h-10 items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium hover:bg-[var(--surface-2)]"
            >
              {sinGuardar ? "Salir sin guardar" : "Volver"}
            </Link>
          ) : null}
          {soloLectura ? null : (
            <Button type="button" onClick={enviar} disabled={guardando || bloqueos.length > 0}>
              {guardando ? "Guardando…" : sinGuardar ? "Guardar análisis" : "Guardado"}
            </Button>
          )}
        </div>
      </header>

      {inicial?.comprado ? (
        <p className="rounded-md border border-[var(--ok)] bg-[var(--ok-bg)] p-3 text-sm">
          Este análisis ya se convirtió en la compra{" "}
          <Link href={`/compras/${inicial.comprado.compraId}`} className="font-semibold underline">
            {inicial.comprado.numero}
          </Link>
          . Para otra proforma, haz un análisis nuevo.
        </p>
      ) : null}

      {/* ----------------------------------------------- La proforma */}
      <section className="card p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">La proforma del proveedor</h2>
          <LeyendaIngreso />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="flex flex-col gap-1 md:col-span-2">
            {/* El buscador trae su propia etiqueta «Proveedor»; en lectura
                hace falta una. */}
            {soloLectura ? (
              <>
                <span className="text-sm font-medium">Proveedor</span>
                <p className="text-sm font-medium">{proveedor?.razon_social ?? "—"}</p>
              </>
            ) : (
              <BuscadorProveedores
                id="ana-proveedor"
                sugeridos={sugeridos}
                elegido={proveedor}
                onElegir={(p) => {
                  setProveedor(p);
                  despachar({
                    tipo: "cabecera",
                    campo: "proveedorId",
                    valor: p.id,
                  });
                }}
                onQuitar={() => {
                  setProveedor(null);
                  despachar({
                    tipo: "cabecera",
                    campo: "proveedorId",
                    valor: null,
                  });
                }}
                hoy={hoy}
              />
            )}
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">
              N.° de la proforma
              <Ingreso />
            </span>
            <Input
              value={estado.referencia}
              onChange={(e) =>
                despachar({
                  tipo: "cabecera",
                  campo: "referencia",
                  valor: e.target.value.slice(0, 80),
                })
              }
              placeholder="FT250730TA"
              disabled={soloLectura}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Fecha</span>
            <Input
              type="date"
              value={estado.fecha}
              onChange={(e) =>
                despachar({
                  tipo: "cabecera",
                  campo: "fecha",
                  valor: e.target.value,
                })
              }
              disabled={soloLectura}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">
              Costo de envío (DHL) $<Ingreso />
            </span>
            <CampoNumero
              valor={estado.costoEnvio}
              onNumero={(n) => despachar({ tipo: "cabecera", campo: "costoEnvio", valor: n })}
              placeholder="1039.00"
              className="text-right tabular"
              disabled={soloLectura}
            />
            <span className="text-sm text-[var(--fg-muted)]">
              El de toda la carga, como viene en la proforma.
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">
              Peso que dice el proveedor
              <Ingreso /> <span className="font-normal text-[var(--fg-muted)]">(opcional)</span>
            </span>
            <CampoNumero
              valor={estado.pesoDeclarado}
              onNumero={(n) =>
                despachar({
                  tipo: "cabecera",
                  campo: "pesoDeclarado",
                  valor: n,
                })
              }
              placeholder="kg"
              className="text-right tabular"
              disabled={soloLectura}
            />
            <span className="text-sm text-[var(--fg-muted)]">
              Para comprobar que la carga pesa lo que cobra.
            </span>
          </label>
          {/* Willy, 02/10: la K es *«precios en origen + gastos de envío +
              gastos de desaduanaje»* contra el mercado (101). */}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">
              Desaduanaje estimado S/
              <Ingreso />
            </span>
            <CampoNumero
              valor={estado.desaduanajeSoles}
              onNumero={(n) =>
                despachar({
                  tipo: "cabecera",
                  campo: "desaduanajeSoles",
                  valor: n,
                })
              }
              placeholder="750.00"
              className="text-right tabular"
              disabled={soloLectura}
            />
            <span className="text-sm text-[var(--fg-muted)]">
              Agente, almacén y tasas. Entra en la K.
            </span>
          </label>
          <div className="flex flex-col gap-1">
            <label htmlFor="ana-tc" className="text-sm font-medium">
              Tipo de cambio
              <Ingreso />
            </label>
            <div className="flex gap-2">
              <CampoNumero
                id="ana-tc"
                valor={estado.tipoCambio}
                onNumero={(n) => despachar({ tipo: "cabecera", campo: "tipoCambio", valor: n })}
                placeholder="3.750"
                className="min-w-0 flex-1 text-right tabular"
                disabled={soloLectura}
              />
              {soloLectura ? null : (
                <Button type="button" variant="outline" onClick={traerTipoCambio}>
                  Traer de SUNAT
                </Button>
              )}
            </div>
            <span
              className={`text-sm ${c.faltaTipoCambio ? "text-[var(--warn)]" : "text-[var(--fg-muted)]"}`}
            >
              {c.faltaTipoCambio
                ? "Sin tipo de cambio, el desaduanaje no se suma."
                : (tcAviso ?? "Soles por dólar, para pasar el desaduanaje a dólares.")}
            </span>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- Los totales */}
      <Resumen c={c} estado={estado} />

      {/* ------------------------------------------------- Productos */}
      <section className="card @container p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Productos de la proforma</h2>
            <LeyendaIngreso />
          </div>
          {soloLectura ? null : (
            <div className="flex flex-wrap gap-2">
              {estado.lineas.some((l) => !enBlanco(l)) ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => despachar({ tipo: "pedirLoCotizado" })}
                >
                  Pedir todo lo cotizado
                </Button>
              ) : null}
              <CargarExcel
                hayLineas={estado.lineas.filter((l) => !enBlanco(l)).length}
                despachar={despachar}
              />
            </div>
          )}
        </div>

        {/* Luis, 02/10: *«eso lo quiere rellenar acá para no usar el excel»*.
            Se escribe en la tabla, fila por fila, como en su hoja. */}
        {soloLectura ? null : (
          <p className="mb-3 text-sm text-[var(--fg-muted)]">
            Escribe cada producto de la proforma en una fila, como en tu hoja: el código, y el
            sistema lo busca en el catálogo. <strong>Enter</strong> baja a la fila de abajo.
          </p>
        )}

        {soloLectura ? null : (
          <div className="mb-3">
            <div>
              <span className="mb-1 flex items-center gap-1.5 text-sm font-medium">
                ¿No recuerdas el código? Búscalo por descripción
              </span>
              <BuscadorCompra
                ultimosCostos={{}}
                onElegir={(p) =>
                  despachar({
                    tipo: "agregar",
                    producto: {
                      id: p.id,
                      codigo: p.codigo,
                      descripcion: p.descripcion,
                      marca: p.marca,
                      peso_kg: p.peso_kg,
                      precio_mercado: p.precio_mercado,
                    },
                  })
                }
              />
            </div>
          </div>
        )}

        {c.sinPeso.length > 0 && estado.lineas.length > 0 ? (
          <p className="mb-3 rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm">
            <strong>
              {c.sinPeso.length === 1
                ? "Un producto sin peso"
                : `${c.sinPeso.length} productos sin peso`}
            </strong>
            : con ellos la carga pesa menos de lo real y el $/kg sale de más. Escribe el peso de
            cada uno.
          </p>
        ) : null}

        {estado.lineas.length === 0 ? null : (
          <>
            <ul className="flex flex-col gap-3 @6xl:hidden">
              {estado.lineas.map((l) => (
                <Tarjeta
                  key={l.key}
                  l={l}
                  r={c.lineas[l.key]!}
                  editar={editarCampo}
                  despachar={despachar}
                  soloLectura={soloLectura}
                />
              ))}
            </ul>
            <div className="hidden @6xl:block">
              <Tabla
                lineas={estado.lineas}
                c={c.lineas}
                calculo={c}
                editar={editarCampo}
                despachar={despachar}
                soloLectura={soloLectura}
              />
            </div>
          </>
        )}

        {soloLectura ? null : (
          <Button
            type="button"
            variant="outline"
            className="mt-3 w-full border-dashed sm:w-auto"
            onClick={agregarFila}
          >
            <Plus className="size-4" aria-hidden />
            Añadir fila
          </Button>
        )}

        <BarraK c={c} />
      </section>

      {/* ------------------------------------------- Notas y comprar */}
      <section className="card flex flex-col gap-4 p-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Notas</span>
          <textarea
            value={estado.notas}
            onChange={(e) =>
              despachar({
                tipo: "cabecera",
                campo: "notas",
                valor: e.target.value.slice(0, 2000),
              })
            }
            rows={2}
            disabled={soloLectura}
            placeholder="Lo que convenga recordar de esta proforma."
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 text-sm"
          />
        </label>

        {comprado ? null : (
          <div className="flex flex-col gap-2 border-t border-[var(--border-soft)] pt-4">
            <h2 className="text-base font-semibold">¿Ya lo tienes decidido?</h2>
            <p className="text-sm text-[var(--fg-muted)]">
              Cuando el proveedor te confirme la proforma, registra la compra: van el proveedor, las
              cantidades que pides, los precios FOB, los pesos y el envío por kilo.
            </p>
            {sinCatalogo.length > 0 ? (
              <div className="flex flex-col gap-3 rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm sm:flex-row sm:items-center">
                <p className="min-w-0 flex-1">
                  <strong>Estos no están en el catálogo</strong> y no pueden ir en la compra hasta
                  que los des de alta:{" "}
                  <span className="font-mono">{sinCatalogo.map((l) => l.codigo).join(" · ")}</span>.
                </p>
                {/* Aquí mismo y todos a la vez: el enlace a «Nuevo producto»
                    sacaba de la pantalla y, sin guardar, se perdía lo escrito. */}
                {/* Al VER no se cambia nada: el alta enlaza filas y eso hay
                    que guardarlo, así que se hace editando. */}
                {soloLectura && inicial ? (
                  <Link
                    href={`/compras/analisis/${inicial.id}/editar`}
                    className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
                  >
                    <Pencil className="size-4" aria-hidden />
                    Editar para darlos de alta
                  </Link>
                ) : (
                  <AltaEnBloque
                    lineas={estado.lineas.filter((l) => !enBlanco(l) && !l.productoId)}
                    onCreado={(key, producto) => despachar({ tipo: "enlazar", key, producto })}
                  />
                )}
              </div>
            ) : null}
            {bloqueos.length > 0 ? (
              <p className="text-sm text-[var(--fg-muted)]">{bloqueos.join(" ")}</p>
            ) : sinGuardar ? (
              <p className="text-sm text-[var(--warn)]">
                Guarda el análisis antes de registrar la compra.
              </p>
            ) : null}
            <div>
              {inicial && !sinGuardar && aComprar.length > 0 ? (
                <Link
                  href={`/compras/nueva?analisis=${inicial.id}`}
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
                >
                  <ShoppingCart className="size-4" aria-hidden />
                  Registrar la compra ({aComprar.length}{" "}
                  {aComprar.length === 1 ? "producto" : "productos"})
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className="inline-flex h-10 cursor-not-allowed items-center gap-2 rounded-md bg-[var(--surface-2)] px-4 text-sm font-medium text-[var(--fg-muted)]"
                >
                  <ShoppingCart className="size-4" aria-hidden />
                  Registrar la compra
                </span>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Un número que se puede escribir a medias.
 *
 * Con `value={n || ""}` teclear «0.005» es imposible: el «0» se vuelve vacío
 * antes de llegar al punto. Este guarda el TEXTO mientras se escribe y manda
 * el número; cuando se sale del campo, vuelve a enseñar el número guardado.
 */
function CampoNumero({
  valor,
  onNumero,
  vacioEsNulo = false,
  ...resto
}: Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> & {
  valor: number | null;
  onNumero: (n: number) => void;
  /** La «f»: vacío significa «no se sabe», no cero. */
  vacioEsNulo?: boolean;
}) {
  const fuera = valor === null || valor === 0 ? "" : String(valor);
  const [texto, setTexto] = React.useState<string | null>(null);
  // Al leer, el número tal cual: una casilla gris deshabilitada parece algo
  // que no funciona. Se conserva el ancho (w-*) y la alineación de la columna.
  if (resto.disabled) {
    return (
      <span className={`block py-2 ${resto.className ?? ""} border-0 bg-transparent`}>
        {fuera === "" ? <span className="text-[var(--fg-muted)]">—</span> : fuera}
      </span>
    );
  }
  return (
    <Input
      type="text"
      inputMode="decimal"
      {...resto}
      value={texto ?? fuera}
      onFocus={(e) => {
        setTexto(fuera);
        resto.onFocus?.(e);
      }}
      onBlur={(e) => {
        setTexto(null);
        resto.onBlur?.(e);
      }}
      onChange={(e) => {
        // Coma o punto: en Perú se escribe de las dos formas.
        const t = e.target.value.replace(",", ".");
        if (!/^\d*\.?\d*$/.test(t)) return;
        setTexto(t);
        onNumero(t === "" ? (vacioEsNulo ? Number.NaN : 0) : Number(t));
      }}
    />
  );
}

/**
 * Su bloque de abajo (D34–F41 de la hoja), con las dos columnas de él: lo
 * cotizado y lo que pides. Las filas, con sus nombres y en su orden.
 *
 * Arriba de todo, de dónde sale el $/kg, con los números a la vista. Luis,
 * 02/10: *«todavía no sé cómo es 10.15»*. Si quien lo hizo no lo sabía, Willy
 * mirando otra pantalla tampoco: la cuenta tiene que estar escrita.
 */
/**
 * Descargar lo que está en pantalla como SU hoja de Excel, con fórmulas que
 * funcionan (ver `api/analisis-excel.ts`). Luis, 02/10: *«puede exportar en
 * excel»*. Vale también sin guardar, y también en uno ya comprado.
 */
function DescargarExcel({
  estado,
  numero,
  proveedor,
}: {
  estado: EstadoAnalisis;
  numero: string | null;
  proveedor: string | null;
}) {
  const [armando, armar] = React.useTransition();
  const lineas = estado.lineas.filter((l) => !enBlanco(l));

  const descargar = () =>
    armar(async () => {
      const r = await exportarAnalisisExcel({
        numero,
        proveedor,
        referencia: estado.referencia,
        fecha: estado.fecha,
        costoEnvio: estado.costoEnvio,
        desaduanajeSoles: estado.desaduanajeSoles,
        tipoCambio: estado.tipoCambio,
        lineas: lineas.map((l) => ({
          cliente: l.cliente,
          frecuencia: l.frecuencia,
          codigo: l.codigo,
          marca: l.marca,
          cantidadRef: l.cantidadRef,
          precioFob: l.precioFob,
          pesoKg: l.pesoKg,
          cantidadPedido: l.cantidadPedido,
          precioMercado: l.precioMercado,
          proveedorMercado: l.proveedorMercado,
        })),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const bytes = Uint8Array.from(atob(r.base64), (ch) => ch.charCodeAt(0));
      const url = URL.createObjectURL(
        new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = r.nombre;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

  return (
    <Button
      type="button"
      variant="outline"
      onClick={descargar}
      disabled={armando || lineas.length === 0}
    >
      <Download className="size-4" aria-hidden />
      {armando ? "Armando el Excel…" : "Descargar en Excel"}
    </Button>
  );
}

/**
 * La K a la vista MIENTRAS se cambian las cantidades.
 *
 * Willy, 02/10: *«de tal modo que yo al variar las cantidades debo ver cómo
 * varía K»*. La K ya se recalculaba con cada tecla, pero vivía en el resumen,
 * arriba, y con 29 filas la tabla queda muy por debajo: se cambiaba una
 * cantidad y no se veía nada. Esta barra se queda pegada al pie de la
 * pantalla mientras la tabla está a la vista.
 */
function BarraK({ c }: { c: ReturnType<typeof calcular> }) {
  if (c.cantidadPedido === 0) return null;
  return (
    <div
      aria-live="polite"
      className="sticky bottom-0 z-20 -mx-4 -mb-4 mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-b-lg border-t-2 border-[var(--warn)] bg-[var(--surface)] px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]"
    >
      <span className="text-sm font-semibold">Lo que pides</span>
      <span className="text-sm">
        <span className="text-[var(--fg-muted)]">Costo total </span>
        <span className="tabular font-semibold">{dolar(c.costoTotal)}</span>
      </span>
      <span className="text-sm">
        <span className="text-[var(--fg-muted)]">A precio de mercado </span>
        <span className="tabular font-semibold">{dolar(c.totalMercado)}</span>
      </span>
      <span className="ml-auto flex items-baseline gap-2">
        <span className="text-base font-semibold">K</span>
        <span className={`tabular text-2xl font-bold ${tonoMargen(c.margen)}`}>
          {c.rinde !== null ? c.rinde.toFixed(2) : "—"}
        </span>
        {c.margen !== null ? (
          <span className={`text-sm font-medium ${tonoMargen(c.margen)}`}>
            {c.margen >= 0 ? `gana ${pct(c.margen)}` : `pierde ${pct(-c.margen)}`}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function Resumen({ c, estado }: { c: ReturnType<typeof calcular>; estado: EstadoAnalisis }) {
  const filas: {
    etiqueta: string;
    ayuda?: string;
    ref: string;
    ped: string;
    fuerte?: boolean;
  }[] = [
    {
      etiqueta: "TOT. FOB $",
      ref: dolar(c.fobRef),
      ped: dolar(c.fobPedido, 3),
    },
    {
      etiqueta: "DHL $",
      ayuda: "Lo que pides: su parte por peso",
      ref: dolar(estado.costoEnvio),
      ped: dolar(c.dhlPedido),
    },
    {
      etiqueta: "DESADUANAJE $",
      ayuda:
        c.desaduanaje > 0
          ? `${soles(estado.desaduanajeSoles)} ÷ ${estado.tipoCambio}`
          : c.faltaTipoCambio
            ? "Falta el tipo de cambio"
            : "Escríbelo arriba",
      ref: dolar(c.desaduanaje),
      ped: dolar(c.desaduanajePedido),
    },
    {
      etiqueta: "COSTO TOTAL $",
      ayuda: "FOB + DHL + desaduanaje",
      ref: dolar(c.costoTotalRef),
      ped: dolar(c.costoTotal),
      fuerte: true,
    },
    {
      etiqueta: "TOT. PM $",
      ayuda: "A precio de mercado",
      ref: dolar(c.totalMercadoRef),
      ped: dolar(c.totalMercado),
    },
    {
      etiqueta: "W. TOT (kg)",
      ref: kg(c.pesoRef, 3),
      ped: kg(c.pesoPedido, 3),
    },
    {
      etiqueta: "W. REAL (kg)",
      ayuda: "El peso más un 10 %",
      ref: kg(c.pesoRealRef),
      ped: kg(c.pesoRealPedido),
    },
    {
      etiqueta: "$ / kg",
      ayuda: "(DHL + desaduanaje) ÷ peso",
      ref: c.porKg > 0 ? dolar(c.porKg) : "—",
      ped: c.porKg > 0 ? dolar(c.porKg) : "—",
    },
    {
      etiqueta: "K",
      ayuda: "TOT. PM ÷ costo total",
      ref: c.rindeRef !== null ? c.rindeRef.toFixed(2) : "—",
      ped: c.rinde !== null ? c.rinde.toFixed(2) : "—",
      fuerte: true,
    },
  ];

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      {/* ---------------------------------------- De dónde sale el $/kg */}
      <div className="card flex flex-col gap-3 p-4">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Scale className="size-5 text-[var(--fg-muted)]" aria-hidden />
          Cómo sale el PU LIMA
        </h2>
        {/* Willy, 02/10: *«DHL + desaduanaje ÷ peso total, cortado a 2
            decimales […] después ya se divide por el peso»*. La cuenta entera,
            a la vista, paso por paso. */}
        {c.desaduanaje > 0 ? (
          <p className="tabular text-base">
            <span className="text-[var(--fg-muted)]">Desaduanaje</span>{" "}
            {soles(estado.desaduanajeSoles)}
            <span className="px-2 text-[var(--fg-muted)]">÷</span>
            {estado.tipoCambio}
            <span className="px-2 text-[var(--fg-muted)]">=</span>
            {dolar(c.desaduanaje)}
          </p>
        ) : null}
        {c.porKg > 0 ? (
          <>
            <p className="tabular text-base">
              (<span className="text-[var(--fg-muted)]">DHL</span> {dolar(estado.costoEnvio)}
              {c.desaduanaje > 0 ? (
                <>
                  <span className="px-1.5 text-[var(--fg-muted)]">+</span>
                  <span className="text-[var(--fg-muted)]">desaduanaje</span> {dolar(c.desaduanaje)}
                </>
              ) : null}
              )<span className="px-2 text-[var(--fg-muted)]">÷</span>
              {kg(c.pesoRef)}
              <span className="px-2 text-[var(--fg-muted)]">=</span>
              {c.porKgExacto.toFixed(4)}
            </p>
            <p className="flex flex-wrap items-baseline gap-2 rounded-md bg-[var(--info-bg)] p-3">
              <span className="text-sm">Se usa</span>
              <span className="tabular text-2xl font-semibold">{dolar(c.porKg)}</span>
              <span className="text-sm">por kilo</span>
            </p>
            <p className="rounded-md border border-[var(--info)] p-3 text-base">
              <strong>PU LIMA</strong> = FOB + peso × {c.porKg.toFixed(2)}
            </p>
            <p className="text-sm text-[var(--fg-muted)]">
              Con dos decimales, como en tu hoja. Cada producto paga su peso por este número: el DHL
              {c.desaduanaje > 0 ? " y el desaduanaje van" : " va"} repartidos por kilo.
            </p>
          </>
        ) : (
          <p className="text-sm text-[var(--fg-muted)]">
            Sale solo cuando estén el costo de DHL y los pesos: (DHL + desaduanaje) ÷ peso de toda
            la carga.
          </p>
        )}
        {c.faltaTipoCambio ? (
          <p className="text-sm text-[var(--warn)]">
            Falta el tipo de cambio: sin él, el desaduanaje no entra en el PU LIMA.
          </p>
        ) : c.desaduanaje > 0 ? null : (
          <p className="text-sm text-[var(--fg-muted)]">
            Escribe arriba el desaduanaje estimado en soles: se suma al DHL antes de dividir.
          </p>
        )}

        {/* Visto el 02/10: con 3 de sus 29 productos, el $/kg salía de 49.
            El DHL es de TODA la carga cotizada. */}
        <p className="rounded-md border border-[var(--border-soft)] p-3 text-sm">
          <strong>Cambia con cada proforma</strong>: depende del DHL y de lo que pese la carga. Por
          eso tienen que estar <strong>todos</strong> los productos que cotizó el proveedor, aunque
          luego no los pidas.
        </p>
        {c.difPeso !== null ? (
          <p
            className={`text-sm ${
              Math.abs(c.difPeso) > estado.pesoDeclarado * 0.05
                ? "text-[var(--warn)]"
                : "text-[var(--ok)]"
            }`}
          >
            El proveedor dice {kg(estado.pesoDeclarado)}; tus pesos suman {kg(c.pesoRef)}
            {Math.abs(c.difPeso) <= estado.pesoDeclarado * 0.05
              ? ": cuadra."
              : `: ${kg(Math.abs(c.difPeso))} de diferencia. Revisa los pesos o pregúntale.`}
          </p>
        ) : null}
      </div>

      {/* ------------------------------------------ Su bloque de abajo */}
      <div className="card p-4">
        <h2 className="mb-2 text-base font-semibold">Resumen</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--fg-muted)]">
              <th className="py-2 pr-2 text-left font-medium" />
              <th className="px-2 py-2 text-right font-medium">Lo cotizado</th>
              <th className="rounded-t-md bg-[var(--warn-bg)] px-2 py-2 text-right font-semibold text-[var(--fg)]">
                Lo que pides
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.etiqueta} className="border-b border-[var(--border-soft)] last:border-0">
                <th scope="row" className="py-2 pr-2 text-left align-top font-medium">
                  {f.etiqueta}
                  {f.ayuda ? (
                    <span className="block font-normal text-[var(--fg-muted)]">{f.ayuda}</span>
                  ) : null}
                </th>
                <td
                  className={`tabular px-2 py-2 text-right align-top ${f.fuerte ? "font-semibold" : ""}`}
                >
                  {f.ref}
                </td>
                <td
                  className={`tabular bg-[var(--warn-bg)] px-2 py-2 text-right align-top ${
                    f.fuerte ? "text-base font-semibold" : ""
                  }`}
                >
                  {f.ped}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-sm text-[var(--fg-muted)]">
          {c.rinde !== null && c.margen !== null
            ? `Con K ${c.rinde.toFixed(2)}, por cada dólar que te cuesta traerlo vendes ${dolar(c.rinde)} a precio de mercado: ganas ${pct(c.margen)} sobre el costo.`
            : "Pon el precio de mercado de cada producto para ver la K."}
          {c.desaduanaje > 0 ? null : " Sin desaduanaje, la K sale más alta de lo que es."}
        </p>
      </div>
    </section>
  );
}

/**
 * El código y la marca de una fila, escritos a mano como en su hoja.
 *
 * Al salir del campo se pregunta al catálogo: si está, la fila queda enlazada
 * —con su descripción a la vista y el peso y el precio de mercado que ya se
 * sepan—; si no, lo dice, y sigue valiendo para analizar. Para comprar sí hará
 * falta darlo de alta.
 */
function CeldaCodigo({
  l,
  despachar,
  soloLectura,
}: {
  l: LineaAnalisis;
  despachar: Despachar;
  soloLectura: boolean;
}) {
  const [buscando, setBuscando] = React.useState(false);

  const comprobar = () => {
    if (enBlanco(l) || l.productoId) return;
    setBuscando(true);
    void productoPorCodigo(l.codigo, l.marca)
      .then((p) => despachar({ tipo: "enlazar", key: l.key, producto: p }))
      .finally(() => setBuscando(false));
  };

  if (soloLectura) {
    return (
      <div>
        <span className="block whitespace-nowrap font-mono font-semibold">{l.codigo}</span>
        <span className="block whitespace-nowrap text-[var(--fg-subtle)]">{l.marca || "—"}</span>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex gap-1">
        <Input
          value={l.codigo}
          onChange={(e) =>
            despachar({
              tipo: "texto",
              key: l.key,
              campo: "codigo",
              valor: e.target.value.slice(0, 80),
            })
          }
          onBlur={comprobar}
          placeholder="Código"
          data-codigo-de={l.key}
          aria-label="Código del producto"
          className="w-36 min-w-0 flex-1 font-mono font-semibold"
        />
        <Input
          value={l.marca}
          onChange={(e) =>
            despachar({
              tipo: "texto",
              key: l.key,
              campo: "marca",
              valor: e.target.value.slice(0, 60),
            })
          }
          onBlur={comprobar}
          placeholder="Marca"
          aria-label={`Marca de ${l.codigo || "este producto"}`}
          className="w-20 shrink-0"
        />
      </div>
      {enBlanco(l) ? null : buscando ? (
        <span className="text-sm text-[var(--fg-muted)]">Buscando en el catálogo…</span>
      ) : l.productoId ? (
        <span
          className="flex max-w-60 items-center gap-1 text-sm text-[var(--ok)]"
          title={l.descripcion}
        >
          <Check className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{l.descripcion || "En el catálogo"}</span>
        </span>
      ) : (
        <span className="text-sm text-[var(--fg-muted)]">No está en el catálogo</span>
      )}
    </div>
  );
}

type Editar = (
  l: LineaAnalisis,
  campo: "cantidadRef" | "cantidadPedido" | "precioFob" | "pesoKg" | "precioMercado" | "frecuencia",
) => {
  valor: number | null;
  onNumero: (n: number) => void;
  vacioEsNulo: boolean;
  disabled: boolean;
};

type Despachar = React.Dispatch<Parameters<typeof reducir>[1]>;

const num = "text-right tabular";
/** Con los decimales de su hoja: 3 en los pesos y en el $PARC, 2 en el resto. */
const cifra = (n: number, dec = 2) =>
  n.toLocaleString("es-PE", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });

/** Su «%»: precio de mercado ÷ PU Lima. 2.53 es «vendo a 2.53 veces lo que me cuesta». */
function Rinde({ r }: { r: LineaCalculada }) {
  if (r.rinde === null || r.margen === null)
    return <span className="text-[var(--fg-muted)]">—</span>;
  return (
    <span className={`font-semibold ${tonoMargen(r.margen)}`}>
      {r.rinde.toFixed(2)}
      <span className="block whitespace-nowrap font-normal">
        {r.margen >= 0 ? `gana ${pct(r.margen)}` : `pierde ${pct(-r.margen)}`}
      </span>
    </span>
  );
}

/**
 * Subir su hoja de Excel tal cual. Ver `dominio/analisis-hoja.ts`: copiar y
 * pegar perdía los decimales del FOB.
 */
function CargarExcel({ hayLineas, despachar }: { hayLineas: number; despachar: Despachar }) {
  const entrada = React.useRef<HTMLInputElement>(null);
  const [leyendo, leer] = React.useTransition();
  const [avisos, setAvisos] = React.useState<string[]>([]);

  const subir = (archivo: File) => {
    const datos = new FormData();
    datos.set("archivo", archivo);
    leer(async () => {
      const r = await leerExcelAnalisis(datos);
      if (!r.ok) {
        toast.error(r.error);
        setAvisos(r.problemas ?? []);
        return;
      }
      despachar({
        tipo: "cargarHoja",
        lineas: r.lineas,
        costoEnvio: r.costoEnvio,
      });
      setAvisos(r.problemas);
      const fuera = r.lineas.length - r.enCatalogo;
      toast.success(
        `${r.lineas.length} productos cargados de tu hoja` +
          (fuera > 0 ? `; ${fuera} no están en el catálogo.` : "."),
      );
    });
  };

  return (
    <div className="flex flex-col gap-1">
      {/* Secundario: lo normal es escribirlo aquí. Sirve para las proformas
          que ya tiene en Excel. */}
      <Button
        type="button"
        variant="outline"
        onClick={() => entrada.current?.click()}
        disabled={leyendo}
        title={
          hayLineas > 0
            ? `Reemplaza los ${hayLineas} productos que hay ahora`
            : "Tu hoja de siempre: CLIENTE, f, CODIGO, MARCA, CANT.Ref, Price FOB $, PESO U(Kg.), CANT. PEDIDO, P.M y PROV."
        }
      >
        <FileSpreadsheet className="size-4" aria-hidden />
        {leyendo ? "Leyendo tu hoja…" : "Traer de un Excel"}
      </Button>
      {hayLineas > 0 ? (
        <span className="text-sm text-[var(--fg-muted)]">Reemplaza lo escrito</span>
      ) : null}
      <input
        ref={entrada}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          const a = e.target.files?.[0];
          e.target.value = "";
          if (a) subir(a);
        }}
      />
      {avisos.length > 0 ? (
        <ul className="list-disc pl-5 text-sm text-[var(--warn)]">
          {avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * La tabla, con las columnas de su hoja EN SU ORDEN (A–R) y sus nombres.
 *
 * Luis, 02/10: *«tiene que darme todos los datos como están ahí […] el mismo
 * formato o más amigable»*. Lo único movido es el CÓDIGO, que va primero y
 * fijo a la izquierda: con 18 columnas hay que desplazarse, y sin él no se
 * sabe de qué fila son los números de la derecha.
 *
 * Los cuatro bloques llevan color: el amarillo de lo que pide y el verde del
 * mercado son los de su hoja.
 */
function Tabla({
  lineas,
  c,
  calculo,
  editar,
  despachar,
  soloLectura,
}: {
  lineas: LineaAnalisis[];
  c: Record<string, LineaCalculada>;
  calculo: ReturnType<typeof calcular>;
  editar: Editar;
  despachar: Despachar;
  soloLectura: boolean;
}) {
  const th = "px-2 py-2 text-sm font-medium whitespace-nowrap";
  const fijo = "sticky left-0 z-10 bg-[var(--surface)]";
  const amarillo = "bg-[var(--warn-bg)]";
  const verde = "bg-[var(--ok-bg)]";
  const azul = "bg-[var(--info-bg)]";

  /*
    Enter baja a la misma columna de la fila de abajo, como en Excel; en la
    última, añade una fila. Se maneja aquí, una vez, y no campo por campo.
  */
  const tabla = React.useRef<HTMLTableElement>(null);
  const columnaPendiente = React.useRef<number | null>(null);
  React.useEffect(() => {
    const col = columnaPendiente.current;
    if (col === null) return;
    columnaPendiente.current = null;
    const filas = tabla.current?.tBodies[0]?.rows;
    filas?.[filas.length - 1]?.cells[col]?.querySelector("input")?.focus();
  }, [lineas.length]);
  const alPulsar = (e: React.KeyboardEvent<HTMLTableElement>) => {
    if (e.key !== "Enter" || soloLectura) return;
    const t = e.target as HTMLElement;
    const celda = t.closest("td");
    const fila = celda?.parentElement as HTMLTableRowElement | null;
    if (t.tagName !== "INPUT" || !celda || fila?.parentElement?.tagName !== "TBODY") return;
    e.preventDefault();
    const col = celda.cellIndex;
    const abajo = (fila.nextElementSibling as HTMLTableRowElement | null)?.cells[
      col
    ]?.querySelector("input");
    if (abajo) {
      abajo.focus();
      abajo.select();
    } else {
      columnaPendiente.current = col;
      despachar({ tipo: "agregarFila" });
    }
  };

  return (
    <div className="scroll-x">
      <table
        ref={tabla}
        onKeyDown={alPulsar}
        className="w-full border-separate border-spacing-0 text-sm"
      >
        <thead>
          <tr className="text-sm font-semibold">
            <th className={`${fijo} px-2 py-1.5`} />
            <th colSpan={7} className="bg-[var(--surface-2)] px-2 py-1.5 text-left">
              Lo que cotiza el proveedor
            </th>
            <th colSpan={3} className={`${amarillo} px-2 py-1.5 text-left`}>
              Lo que pides
            </th>
            <th colSpan={2} className={`${azul} px-2 py-1.5 text-left`}>
              Puesto en Lima
            </th>
            <th colSpan={4} className={`${verde} px-2 py-1.5 text-left`}>
              Contra el mercado
            </th>
            <th />
          </tr>
          <tr className="text-left text-[var(--fg-muted)] [&>th]:border-b [&>th]:border-[var(--border)]">
            <th className={`${th} ${fijo}`}>
              CÓDIGO · MARCA
              <Ingreso />
            </th>
            <th className={th}>
              CLIENTE
              <Ingreso />
            </th>
            <th className={`${th} text-right`} title="Veces al año que lo piden tus clientes">
              f<Ingreso />
            </th>
            <th className={`${th} text-right`}>
              CANT. Ref
              <Ingreso />
            </th>
            <th className={`${th} text-right`}>
              FOB $<Ingreso />
            </th>
            <th className={`${th} text-right`}>PARC. $</th>
            <th className={`${th} text-right`}>
              PESO U (kg)
              <Ingreso />
            </th>
            <th className={`${th} text-right`}>PESO PARC.</th>
            <th className={`${th} ${amarillo} text-right`}>
              CANT. PEDIDO
              <Ingreso />
            </th>
            <th className={`${th} ${amarillo} text-right`}>$ PARC</th>
            <th className={`${th} ${amarillo} text-right`}>PESO PED.</th>
            <th className={`${th} ${azul} text-right`} title="FOB + DHL + desaduanaje, por unidad">
              PU LIMA $
            </th>
            <th className={`${th} ${azul} text-right`}>TOT. $</th>
            <th className={`${th} ${verde} text-right`}>
              P.M
              <Ingreso />
            </th>
            <th className={`${th} ${verde} text-right`}>TOT. PM</th>
            <th className={`${th} ${verde}`}>
              PROV.
              <Ingreso />
            </th>
            <th className={`${th} ${verde} text-right`} title="Precio de mercado ÷ PU Lima">
              %
            </th>
            <th className={th} />
          </tr>
        </thead>
        <tbody>
          {lineas.map((l) => {
            const r = c[l.key]!;
            const td = "border-b border-[var(--border-soft)] px-1 py-1.5 align-top";
            const calc = `${td} ${num} px-2 pt-3.5`;
            return (
              <tr key={l.key}>
                <td className={`${td} ${fijo}`}>
                  <CeldaCodigo l={l} despachar={despachar} soloLectura={soloLectura} />
                </td>
                <td className={td}>
                  {soloLectura ? (
                    <span className="block py-2">
                      {l.cliente || <span className="text-[var(--fg-muted)]">—</span>}
                    </span>
                  ) : (
                    <Input
                      value={l.cliente}
                      onChange={(e) =>
                        despachar({
                          tipo: "texto",
                          key: l.key,
                          campo: "cliente",
                          valor: e.target.value,
                        })
                      }
                      className="w-28"
                      aria-label={`Cliente para el que se trae ${l.codigo}`}
                    />
                  )}
                </td>
                <td className={td}>
                  <CampoNumero
                    {...editar(l, "frecuencia")}
                    className={`w-14 ${num}`}
                    aria-label={`Veces al año que piden ${l.codigo}`}
                  />
                </td>
                <td className={td}>
                  <CampoNumero
                    {...editar(l, "cantidadRef")}
                    className={`w-16 ${num}`}
                    aria-label={`Cantidad cotizada de ${l.codigo}`}
                  />
                </td>
                <td className={td}>
                  <CampoNumero
                    {...editar(l, "precioFob")}
                    className={`w-24 ${num}`}
                    aria-label={`Precio FOB de ${l.codigo}`}
                  />
                  {l.fobAnterior ? (
                    <span className="mt-0.5 block whitespace-nowrap text-right text-[var(--fg-subtle)]">
                      {l.fobAnterior.numero}: {l.fobAnterior.precio}
                    </span>
                  ) : null}
                </td>
                <td className={calc}>{cifra(r.parcialRef)}</td>
                <td className={td}>
                  <CampoNumero
                    {...editar(l, "pesoKg")}
                    className={`w-24 ${num} ${l.pesoKg > 0 ? "" : "border-[var(--warn)] bg-[var(--warn-bg)]"}`}
                    aria-label={`Peso por unidad de ${l.codigo}, en kilos`}
                  />
                </td>
                <td className={calc}>{cifra(r.pesoRef, 3)}</td>
                <td className={`${td} ${amarillo}`}>
                  <CampoNumero
                    {...editar(l, "cantidadPedido")}
                    className={`w-16 ${num} border-[var(--warn)]`}
                    aria-label={`Cantidad a pedir de ${l.codigo}`}
                  />
                </td>
                <td className={`${calc} ${amarillo}`}>{cifra(r.parcialPedido, 3)}</td>
                <td className={`${calc} ${amarillo}`}>{cifra(r.pesoPedido, 3)}</td>
                <td className={`${calc} ${azul} font-semibold`}>
                  {r.puLima > 0 ? cifra(r.puLima) : "—"}
                </td>
                <td className={`${calc} ${azul}`}>{cifra(r.totalLima)}</td>
                <td className={`${td} ${verde}`}>
                  <CampoNumero
                    {...editar(l, "precioMercado")}
                    className={`w-24 ${num}`}
                    aria-label={`Precio de mercado de ${l.codigo}`}
                  />
                </td>
                <td className={`${calc} ${verde}`}>{cifra(r.totalMercado)}</td>
                <td className={`${td} ${verde}`}>
                  {soloLectura ? (
                    <span className="block py-2">
                      {l.proveedorMercado || <span className="text-[var(--fg-muted)]">—</span>}
                    </span>
                  ) : (
                    <Input
                      value={l.proveedorMercado}
                      onChange={(e) =>
                        despachar({
                          tipo: "texto",
                          key: l.key,
                          campo: "proveedorMercado",
                          valor: e.target.value,
                        })
                      }
                      className="w-28"
                      aria-label={`De quién es el precio de mercado de ${l.codigo}`}
                    />
                  )}
                </td>
                <td className={`${calc} ${verde}`}>
                  <Rinde r={r} />
                </td>
                <td className={`${td} text-right`}>
                  {soloLectura ? null : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-10 text-sm"
                      onClick={() => despachar({ tipo: "quitar", key: l.key })}
                      aria-label={`Quitar ${l.codigo}`}
                      title={`Quitar ${l.codigo}`}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        {/* Su fila 31: las sumas. */}
        <tfoot>
          <tr className="font-semibold [&>td]:border-t-2 [&>td]:border-[var(--border)] [&>td]:px-2 [&>td]:py-2.5">
            <td className={fijo}>TOTALES</td>
            <td />
            <td />
            <td className={num}>{cifra(calculo.cantidadRef, 0)}</td>
            <td />
            <td className={num}>{cifra(calculo.fobRef)}</td>
            <td />
            <td className={num}>{cifra(calculo.pesoRef, 3)}</td>
            <td className={`${num} ${amarillo}`}>{cifra(calculo.cantidadPedido, 0)}</td>
            <td className={`${num} ${amarillo}`}>{cifra(calculo.fobPedido, 3)}</td>
            <td className={`${num} ${amarillo}`}>{cifra(calculo.pesoPedido, 3)}</td>
            <td className={azul} />
            <td className={`${num} ${azul}`}>{cifra(calculo.totalLima)}</td>
            <td className={verde} />
            <td className={`${num} ${verde}`}>{cifra(calculo.totalMercado)}</td>
            <td className={`${verde} text-right`}>K</td>
            <td className={`${num} ${verde}`}>
              {calculo.rinde !== null ? calculo.rinde.toFixed(2) : "—"}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Tarjeta({
  l,
  r,
  editar,
  despachar,
  soloLectura,
}: {
  l: LineaAnalisis;
  r: LineaCalculada;
  editar: Editar;
  despachar: Despachar;
  soloLectura: boolean;
}) {
  // Todo lo que se pone con `campo` se escribe a mano: lleva el asterisco.
  const campo = (etiqueta: string, nodo: React.ReactNode, fondo = "") => (
    <label className={`flex min-w-0 flex-col gap-1 rounded-md p-1.5 ${fondo}`}>
      <span className="text-sm font-medium">
        {etiqueta}
        <Ingreso />
      </span>
      {nodo}
    </label>
  );
  const dato = (etiqueta: string, valor: string, fuerte = false) => (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[var(--fg-muted)]">{etiqueta}</dt>
      <dd className={`tabular ${fuerte ? "font-semibold" : ""}`}>{valor}</dd>
    </div>
  );
  return (
    <li className="rounded-md border border-[var(--border)] p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <CeldaCodigo l={l} despachar={despachar} soloLectura={soloLectura} />
        </div>
        {soloLectura ? null : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 text-sm"
            onClick={() => despachar({ tipo: "quitar", key: l.key })}
            aria-label={`Quitar ${l.codigo}`}
          >
            <Trash2 className="size-4" aria-hidden />
            Quitar
          </Button>
        )}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
        {campo(
          "Cliente",
          <Input
            value={l.cliente}
            onChange={(e) =>
              despachar({
                tipo: "texto",
                key: l.key,
                campo: "cliente",
                valor: e.target.value,
              })
            }
            disabled={soloLectura}
          />,
        )}
        {campo("f (veces al año)", <CampoNumero {...editar(l, "frecuencia")} className={num} />)}
        {campo("CANT. Ref", <CampoNumero {...editar(l, "cantidadRef")} className={num} />)}
        {campo("FOB $", <CampoNumero {...editar(l, "precioFob")} className={num} />)}
        {campo(
          "PESO U (kg)",
          <CampoNumero
            {...editar(l, "pesoKg")}
            className={`${num} ${l.pesoKg > 0 ? "" : "border-[var(--warn)] bg-[var(--warn-bg)]"}`}
          />,
        )}
        {campo(
          "CANT. PEDIDO",
          <CampoNumero
            {...editar(l, "cantidadPedido")}
            className={`${num} border-[var(--warn)]`}
          />,
          "bg-[var(--warn-bg)]",
        )}
        {campo(
          "P.M (mercado)",
          <CampoNumero {...editar(l, "precioMercado")} className={num} />,
          "bg-[var(--ok-bg)]",
        )}
        {campo(
          "PROV.",
          <Input
            value={l.proveedorMercado}
            onChange={(e) =>
              despachar({
                tipo: "texto",
                key: l.key,
                campo: "proveedorMercado",
                valor: e.target.value,
              })
            }
            disabled={soloLectura}
          />,
          "bg-[var(--ok-bg)]",
        )}
      </div>
      {l.fobAnterior ? (
        <p className="mt-1 text-sm text-[var(--fg-subtle)]">
          Cotizado antes en {l.fobAnterior.numero}: $ {l.fobAnterior.precio}
        </p>
      ) : null}

      <dl className="mt-3 grid gap-x-6 gap-y-1 border-t border-[var(--border-soft)] pt-2 text-sm sm:grid-cols-2">
        {dato("PARC. $", cifra(r.parcialRef))}
        {dato("PESO PARC.", cifra(r.pesoRef, 3))}
        {dato("$ PARC (pedido)", cifra(r.parcialPedido, 3))}
        {dato("PESO PED.", cifra(r.pesoPedido, 3))}
        {dato("PU LIMA $", r.puLima > 0 ? cifra(r.puLima) : "—", true)}
        {dato("TOT. $", cifra(r.totalLima), true)}
        {dato("TOT. PM", cifra(r.totalMercado))}
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[var(--fg-muted)]">% (P.M ÷ PU)</dt>
          <dd className="tabular text-right">
            <Rinde r={r} />
          </dd>
        </div>
      </dl>
    </li>
  );
}
