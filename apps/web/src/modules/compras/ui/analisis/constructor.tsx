"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, toast } from "@rodatech/ui";
import { Plus, Scale, ShoppingCart, Trash2 } from "lucide-react";

import { BuscadorProveedores } from "@/modules/proveedores/ui/buscador";
import type { ProveedorOpcion } from "@/modules/proveedores/dominio/opcion";

import { guardarAnalisis, propuestasAnalisis } from "../../acciones/analisis";
import {
  aPayload,
  bloqueos as calcularBloqueos,
  calcular,
  estadoInicial,
  reducir,
  type EstadoAnalisis,
  type LineaAnalisis,
  type LineaCalculada,
} from "../../dominio/analisis";
import { BuscadorCompra } from "../constructor/buscador";

const dolar = (n: number, dec = 2) =>
  `$ ${n.toLocaleString("es-PE", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
const kg = (n: number) =>
  `${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
const pct = (n: number) => `${Math.round(n * 100)} %`;

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
}: {
  hoy: string;
  sugeridos: ProveedorOpcion[];
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
    () => inicial?.estado ?? estadoInicial(hoy),
  );
  const [proveedor, setProveedor] = React.useState<ProveedorOpcion | null>(
    inicial?.proveedor ?? null,
  );
  const [guardando, guardar] = React.useTransition();
  const soloLectura = Boolean(inicial?.comprado);

  // Lo guardado, para saber si hay cambios sin guardar antes de comprar.
  const [guardado, setGuardado] = React.useState(() =>
    inicial ? JSON.stringify(aPayload(inicial.estado, inicial.id)) : null,
  );
  const actual = JSON.stringify(aPayload(estado, inicial?.id));
  const sinGuardar = guardado !== actual;

  const c = React.useMemo(() => calcular(estado), [estado]);
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
        if (vigente) despachar({ tipo: "propuestas", frecuencias: p.frecuencias, fobs: p.fobs });
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
      if (!inicial) router.replace(`/compras/analisis/${r.id}`);
      else router.refresh();
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
            {inicial ? `Análisis ${inicial.numero}` : "Nuevo análisis de importación"}
          </h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Antes de comprar: cuánto te cuesta cada producto puesto en Lima y cuánto ganas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
        <h2 className="mb-3 text-base font-semibold">La proforma del proveedor</h2>
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
                  despachar({ tipo: "cabecera", campo: "proveedorId", valor: p.id });
                }}
                onQuitar={() => {
                  setProveedor(null);
                  despachar({ tipo: "cabecera", campo: "proveedorId", valor: null });
                }}
                hoy={hoy}
              />
            )}
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">N.° de la proforma</span>
            <Input
              value={estado.referencia}
              onChange={(e) => despachar({ tipo: "cabecera", campo: "referencia", valor: e.target.value.slice(0, 80) })}
              placeholder="FT250730TA"
              disabled={soloLectura}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Fecha</span>
            <Input
              type="date"
              value={estado.fecha}
              onChange={(e) => despachar({ tipo: "cabecera", campo: "fecha", valor: e.target.value })}
              disabled={soloLectura}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Costo de envío (DHL) $</span>
            <CampoNumero
              valor={estado.costoEnvio}
              onNumero={(n) => despachar({ tipo: "cabecera", campo: "costoEnvio", valor: n })}
              placeholder="1039.00"
              className="text-right tabular"
              disabled={soloLectura}
            />
            <span className="text-sm text-[var(--fg-muted)]">El de toda la carga, como viene en la proforma.</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">
              Peso que dice el proveedor{" "}
              <span className="font-normal text-[var(--fg-muted)]">(opcional)</span>
            </span>
            <CampoNumero
              valor={estado.pesoDeclarado}
              onNumero={(n) => despachar({ tipo: "cabecera", campo: "pesoDeclarado", valor: n })}
              placeholder="kg"
              className="text-right tabular"
              disabled={soloLectura}
            />
            <span className="text-sm text-[var(--fg-muted)]">Para comprobar que la carga pesa lo que cobra.</span>
          </label>
        </div>
      </section>

      {/* ------------------------------------------------- Los totales */}
      <Totales c={c} estado={estado} />

      {/* ------------------------------------------------- Productos */}
      <section className="card @container p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Productos de la proforma</h2>
          {estado.lineas.length > 0 && !soloLectura ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-sm"
              onClick={() => despachar({ tipo: "pedirLoCotizado" })}
            >
              Pedir todo lo cotizado
            </Button>
          ) : null}
        </div>

        {soloLectura ? null : (
          <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1">
              <span className="mb-1 flex items-center gap-1.5 text-sm font-medium">
                <Plus className="size-4" aria-hidden />
                Añadir un producto del catálogo
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
                      precio_mercado: (p as { precio_mercado?: number }).precio_mercado,
                    },
                  })
                }
              />
            </div>
            <CodigoLibre onAgregar={(codigo, marca) => despachar({ tipo: "agregarLibre", codigo, marca })} />
          </div>
        )}

        {c.sinPeso.length > 0 && estado.lineas.length > 0 ? (
          <p className="mb-3 rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm">
            <strong>
              {c.sinPeso.length === 1 ? "Un producto sin peso" : `${c.sinPeso.length} productos sin peso`}
            </strong>
            : con ellos la carga pesa menos de lo real y el $/kg sale de más. Escribe el peso de cada uno.
          </p>
        ) : null}

        {estado.lineas.length === 0 ? (
          <p className="rounded-md border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--fg-muted)]">
            Busca arriba cada producto de la proforma. Si todavía no está en el catálogo, añádelo
            con su código.
          </p>
        ) : (
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
                editar={editarCampo}
                despachar={despachar}
                soloLectura={soloLectura}
              />
            </div>
          </>
        )}
      </section>

      {/* ------------------------------------------- Notas y comprar */}
      <section className="card flex flex-col gap-4 p-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Notas</span>
          <textarea
            value={estado.notas}
            onChange={(e) => despachar({ tipo: "cabecera", campo: "notas", valor: e.target.value.slice(0, 2000) })}
            rows={2}
            disabled={soloLectura}
            placeholder="Lo que convenga recordar de esta proforma."
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 text-sm"
          />
        </label>

        {soloLectura ? null : (
          <div className="flex flex-col gap-2 border-t border-[var(--border-soft)] pt-4">
            <h2 className="text-base font-semibold">¿Ya lo tienes decidido?</h2>
            <p className="text-sm text-[var(--fg-muted)]">
              Cuando el proveedor te confirme la proforma, registra la compra: van el proveedor, las
              cantidades que pides, los precios FOB, los pesos y el envío por kilo.
            </p>
            {sinCatalogo.length > 0 ? (
              <p className="rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm">
                <strong>Estos no están en el catálogo</strong> y no pueden ir en la compra hasta que
                los des de alta:{" "}
                <span className="font-mono">{sinCatalogo.map((l) => l.codigo).join(" · ")}</span>.{" "}
                <Link href="/productos/nuevo" className="font-medium underline">
                  Dar de alta un producto
                </Link>
              </p>
            ) : null}
            {bloqueos.length > 0 ? (
              <p className="text-sm text-[var(--fg-muted)]">{bloqueos.join(" ")}</p>
            ) : sinGuardar ? (
              <p className="text-sm text-[var(--warn)]">Guarda el análisis antes de registrar la compra.</p>
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

function Totales({ c, estado }: { c: ReturnType<typeof calcular>; estado: EstadoAnalisis }) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
          Lo que cotiza
        </h2>
        <dl className="mt-2 flex flex-col gap-1.5 text-sm">
          <Fila etiqueta="Valor FOB" valor={dolar(c.fobRef)} />
          <Fila etiqueta="Peso de la carga" valor={kg(c.pesoRef)} />
          <Fila etiqueta="Costo de envío" valor={dolar(estado.costoEnvio)} />
        </dl>
        <p className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-[var(--surface-2)] p-3 text-base">
          <Scale className="size-5 text-[var(--fg-muted)]" aria-hidden />
          <span className="text-[var(--fg-muted)]">Envío por kilo</span>
          <span className="tabular text-lg font-semibold">
            {c.porKg > 0 ? `${dolar(c.porKg)} / kg` : "—"}
          </span>
        </p>
        {/* Visto en la prueba del 02/10: con 3 de sus 29 productos y los
            $1,039 de DHL, el $/kg salía de 49 y todo «perdía». El envío es de
            TODA la carga: hay que cargar todos los productos de la proforma. */}
        <p className="mt-2 text-sm text-[var(--fg-muted)]">
          {c.porKg === 0 && estado.lineas.length > 0
            ? "Sale cuando estén el costo de envío y los pesos."
            : "El envío es de toda la carga: sale bien cuando están todos los productos de la proforma."}
        </p>
        {c.difPeso !== null ? (
          <p
            className={`mt-2 text-sm ${
              Math.abs(c.difPeso) > estado.pesoDeclarado * 0.05 ? "text-[var(--warn)]" : "text-[var(--ok)]"
            }`}
          >
            El proveedor dice {kg(estado.pesoDeclarado)}; tus pesos suman {kg(c.pesoRef)}
            {Math.abs(c.difPeso) <= estado.pesoDeclarado * 0.05
              ? ": cuadra."
              : `: ${kg(Math.abs(c.difPeso))} de diferencia. Revisa los pesos o pregúntale.`}
          </p>
        ) : null}
      </div>

      <div className="card border-[var(--warn)] p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
          Lo que vas a pedir
        </h2>
        <dl className="mt-2 flex flex-col gap-1.5 text-sm">
          <Fila etiqueta="Valor FOB" valor={dolar(c.fobPedido)} />
          <Fila etiqueta="Peso" valor={kg(c.pesoPedido)} />
          <Fila etiqueta="Envío (por kilo)" valor={dolar(c.envioPedido)} />
          <Fila etiqueta="Puesto en Lima" valor={dolar(c.totalLima)} fuerte />
          <Fila etiqueta="A precio de mercado" valor={dolar(c.totalMercado)} />
        </dl>
        {c.rinde !== null ? (
          <p className="mt-3 flex flex-wrap items-baseline gap-2 rounded-md bg-[var(--ok-bg)] p-3">
            <span className="text-sm text-[var(--fg-muted)]">Rinde</span>
            <span className="tabular text-lg font-semibold text-[var(--ok)]">
              × {c.rinde.toFixed(2)}
            </span>
            <span className="text-sm text-[var(--fg-muted)]">
              · margen {c.margen !== null ? pct(c.margen) : "—"} sobre el costo
            </span>
          </p>
        ) : (
          <p className="mt-3 text-sm text-[var(--fg-muted)]">
            Pon el precio de mercado de cada producto para ver cuánto rinde.
          </p>
        )}
        <p className="mt-2 text-sm text-[var(--fg-muted)]">
          Sin desaduanaje: ese llega después y se anota en la compra.
        </p>
      </div>
    </section>
  );
}

function Fila({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--fg-muted)]">{etiqueta}</dt>
      <dd className={`tabular ${fuerte ? "text-base font-semibold" : ""}`}>{valor}</dd>
    </div>
  );
}

/** Un código que todavía no está en el catálogo. */
function CodigoLibre({ onAgregar }: { onAgregar: (codigo: string, marca: string) => void }) {
  const [codigo, setCodigo] = React.useState("");
  const [marca, setMarca] = React.useState("");
  const agregar = () => {
    if (codigo.trim() === "") return;
    onAgregar(codigo, marca);
    setCodigo("");
    setMarca("");
  };
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium">¿No está en el catálogo?</span>
      <div className="flex flex-wrap gap-2">
        <Input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.slice(0, 80))}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), agregar())}
          placeholder="Código"
          aria-label="Código del producto que no está en el catálogo"
          className="w-36 font-mono"
        />
        <Input
          value={marca}
          onChange={(e) => setMarca(e.target.value.slice(0, 60))}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), agregar())}
          placeholder="Marca"
          aria-label="Marca"
          className="w-28"
        />
        <Button type="button" variant="outline" onClick={agregar} disabled={codigo.trim() === ""}>
          <Plus className="size-4" aria-hidden />
          Añadir
        </Button>
      </div>
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

const num = "text-right tabular";

function Tabla({
  lineas,
  c,
  editar,
  despachar,
  soloLectura,
}: {
  lineas: LineaAnalisis[];
  c: Record<string, LineaCalculada>;
  editar: Editar;
  despachar: React.Dispatch<Parameters<typeof reducir>[1]>;
  soloLectura: boolean;
}) {
  const th = "px-2 py-2 text-sm font-medium";
  return (
    <div className="scroll-x">
      <table className="w-full text-sm">
        <thead>
          {/* Los cuatro bloques de su hoja, con su color. */}
          <tr className="text-sm font-semibold">
            <th colSpan={4} className="rounded-tl-md bg-[var(--surface-2)] px-2 py-1.5 text-left">
              Lo que cotiza el proveedor
            </th>
            <th colSpan={1} className="bg-[var(--info-bg)] px-2 py-1.5 text-left">
              En Lima
            </th>
            <th colSpan={4} className="bg-[var(--ok-bg)] px-2 py-1.5 text-left">
              Contra el mercado
            </th>
            <th colSpan={3} className="rounded-tr-md bg-[var(--warn-bg)] px-2 py-1.5 text-left">
              Lo que pides
            </th>
          </tr>
          <tr className="border-b border-[var(--border)] text-left text-[var(--fg-muted)]">
            <th className={th}>Código</th>
            <th className={`${th} text-right`}>Cant.</th>
            <th className={`${th} text-right`}>FOB $</th>
            <th className={`${th} text-right`}>Peso kg</th>
            <th className={`${th} text-right`}>PU Lima</th>
            <th className={`${th} text-right`}>P. mercado</th>
            <th className={th}>De quién</th>
            <th className={`${th} text-right`}>Margen</th>
            <th className={`${th} text-right`} title="Veces al año que lo piden tus clientes">
              f / año
            </th>
            <th className={`${th} text-right`}>Cant.</th>
            <th className={`${th} text-right`}>Total Lima</th>
            <th className={th} />
          </tr>
        </thead>
        <tbody>
          {lineas.map((l) => {
            const r = c[l.key]!;
            return (
              <tr key={l.key} className="border-b border-[var(--border-soft)] align-top">
                <td className="px-2 py-2">
                  <span className="block font-mono font-semibold">{l.codigo}</span>
                  <span className="block text-[var(--fg-subtle)]">
                    {l.marca || "—"}
                    {l.productoId ? "" : " · no está en el catálogo"}
                  </span>
                </td>
                <td className="px-1 py-2">
                  <CampoNumero {...editar(l, "cantidadRef")} className={`w-20 ${num}`} aria-label={`Cantidad cotizada de ${l.codigo}`} />
                </td>
                <td className="px-1 py-2">
                  <CampoNumero {...editar(l, "precioFob")} className={`w-24 ${num}`} aria-label={`Precio FOB de ${l.codigo}`} />
                  {l.fobAnterior ? (
                    <span className="mt-0.5 block text-right text-[var(--fg-subtle)]">
                      {l.fobAnterior.numero}: {l.fobAnterior.precio}
                    </span>
                  ) : null}
                </td>
                <td className="px-1 py-2">
                  <CampoNumero
                    {...editar(l, "pesoKg")}
                    className={`w-24 ${num} ${l.pesoKg > 0 ? "" : "border-[var(--warn)] bg-[var(--warn-bg)]"}`}
                    aria-label={`Peso por unidad de ${l.codigo}, en kilos`}
                  />
                </td>
                <td className={`px-2 py-2 ${num} pt-4 font-semibold`}>{r.puLima > 0 ? r.puLima.toFixed(2) : "—"}</td>
                <td className="px-1 py-2">
                  <CampoNumero {...editar(l, "precioMercado")} className={`w-24 ${num}`} aria-label={`Precio de mercado de ${l.codigo}`} />
                </td>
                <td className="px-1 py-2">
                  <Input
                    value={l.proveedorMercado}
                    onChange={(e) => despachar({ tipo: "texto", key: l.key, campo: "proveedorMercado", valor: e.target.value })}
                    disabled={soloLectura}
                    placeholder="Proveedor"
                    className="w-32"
                    aria-label={`De quién es el precio de mercado de ${l.codigo}`}
                  />
                </td>
                <td className={`px-2 py-2 pt-4 ${num} font-semibold ${tonoMargen(r.margen)}`}>
                  {r.margen !== null ? pct(r.margen) : "—"}
                </td>
                <td className="px-1 py-2">
                  <CampoNumero {...editar(l, "frecuencia")} className={`w-16 ${num}`} aria-label={`Veces al año que piden ${l.codigo}`} />
                </td>
                <td className="px-1 py-2">
                  <CampoNumero {...editar(l, "cantidadPedido")} className={`w-20 ${num} border-[var(--warn)]`} aria-label={`Cantidad a pedir de ${l.codigo}`} />
                </td>
                <td className={`px-2 py-2 pt-4 ${num} font-semibold`}>{r.totalLima.toFixed(2)}</td>
                <td className="px-1 py-2 text-right">
                  {soloLectura ? null : (
                    <Button type="button" variant="outline" size="sm" className="h-10 text-sm" onClick={() => despachar({ tipo: "quitar", key: l.key })} aria-label={`Quitar ${l.codigo}`} title={`Quitar ${l.codigo}`}>
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
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
  despachar: React.Dispatch<Parameters<typeof reducir>[1]>;
  soloLectura: boolean;
}) {
  const campo = (etiqueta: string, nodo: React.ReactNode, fondo = "") => (
    <label className={`flex min-w-0 flex-col gap-1 rounded-md p-1.5 ${fondo}`}>
      <span className="text-sm font-medium">{etiqueta}</span>
      {nodo}
    </label>
  );
  return (
    <li className="rounded-md border border-[var(--border)] p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm font-semibold">{l.codigo}</p>
          <p className="text-sm text-[var(--fg-subtle)]">
            {l.marca || "—"}
            {l.productoId ? "" : " · no está en el catálogo"}
          </p>
        </div>
        {soloLectura ? null : (
          <Button type="button" variant="outline" size="sm" className="shrink-0 text-sm" onClick={() => despachar({ tipo: "quitar", key: l.key })} aria-label={`Quitar ${l.codigo}`}>
            <Trash2 className="size-4" aria-hidden />
            Quitar
          </Button>
        )}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
        {campo("Cant. cotizada", <CampoNumero {...editar(l, "cantidadRef")} className={num} />)}
        {campo("FOB $", <CampoNumero {...editar(l, "precioFob")} className={num} />)}
        {campo(
          "Peso kg",
          <CampoNumero {...editar(l, "pesoKg")} className={`${num} ${l.pesoKg > 0 ? "" : "border-[var(--warn)] bg-[var(--warn-bg)]"}`} />,
        )}
        {campo("Precio de mercado", <CampoNumero {...editar(l, "precioMercado")} className={num} />, "bg-[var(--ok-bg)]")}
        {campo(
          "De quién",
          <Input value={l.proveedorMercado} onChange={(e) => despachar({ tipo: "texto", key: l.key, campo: "proveedorMercado", valor: e.target.value })} disabled={soloLectura} />,
          "bg-[var(--ok-bg)]",
        )}
        {campo("f / año", <CampoNumero {...editar(l, "frecuencia")} className={num} />, "bg-[var(--ok-bg)]")}
        {campo("Cant. a pedir", <CampoNumero {...editar(l, "cantidadPedido")} className={`${num} border-[var(--warn)]`} />, "bg-[var(--warn-bg)]")}
      </div>
      {l.fobAnterior ? (
        <p className="mt-1 text-sm text-[var(--fg-subtle)]">
          Cotizado antes en {l.fobAnterior.numero}: $ {l.fobAnterior.precio}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-[var(--border-soft)] pt-2 text-sm">
        <p>
          <span className="text-[var(--fg-muted)]">PU Lima </span>
          <span className="tabular font-semibold">{r.puLima > 0 ? r.puLima.toFixed(2) : "—"}</span>
        </p>
        <p>
          <span className="text-[var(--fg-muted)]">Margen </span>
          <span className={`tabular font-semibold ${tonoMargen(r.margen)}`}>
            {r.margen !== null ? pct(r.margen) : "—"}
          </span>
        </p>
        <p>
          <span className="text-[var(--fg-muted)]">Total Lima </span>
          <span className="tabular font-semibold">{r.totalLima.toFixed(2)}</span>
        </p>
      </div>
    </li>
  );
}
