import { Suspense } from "react";
import Link from "next/link";
import { Badge, EstadoError, EstadoVacio, Skeleton, formatearFecha } from "@rodatech/ui";
import { misPermisos } from "@/lib/permisos";

import {
  crossReference,
  declaradasDe,
  productoBase,
  totalDeclaradas,
} from "../api/consultas";
import {
  agruparPorOrigen,
  contarPorOrigen,
  resumenSustituto,
  tonoOrigen,
} from "../dominio/equivalencia";
import {
  ETIQUETA_CLASE,
  ETIQUETA_ORIGEN,
  EXPLICACION_ORIGEN,
  type ProductoBase,
  type Sustituto,
} from "../dominio/tipos";
import { BotonDeclarar, BotonQuitar, DeclararOtro } from "./acciones";
import { SelectorProducto } from "./selector";
import { PanelModulo } from "@/componentes/panel-modulo";
import { ArrowRight, GitCompareArrows, Link2, SearchX } from "lucide-react";
import { BloqueFicha } from "@/modules/productos/ui/ficha";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Los roles que `permisos_rol` deja escribir en `producto_equivalencias`. */

/**
 * Equivalencias · cross-reference entre marcas.
 *
 * El gesto que define a un distribuidor de rodamientos: el cliente pide un
 * 6205-2RS de SKF, no hay, y hay que saber en treinta segundos qué se le
 * ofrece.
 *
 * La cascada la resuelve `sustitutos_de()` y tiene cuatro peldaños, de menos a
 * más suposición: equivalencia declarada → misma medida ISO → mismo tipo con
 * precio parecido → misma subfamilia. La pantalla los enseña SEPARADOS y con
 * el motivo escrito, porque la diferencia entre «lo dice el código ISO» y «se
 * parece en el precio» es justo la que decide si se despacha o se llama al
 * cliente.
 *
 * Y existe para alimentar el primer peldaño, que es el único que la base no
 * puede deducir sola.
 */
export default async function PaginaEquivalencias({ searchParams }: Props) {
  const sp = await searchParams;
  const crudo = Array.isArray(sp.producto) ? sp.producto[0] : sp.producto;
  const productoId = crudo && UUID.test(crudo) ? crudo : null;

  // Configuración › Roles y permisos (143): declarar es «crear»; quitar, «eliminar».
  const permisos = await misPermisos();
  const puedeDeclarar = permisos.tiene("equivalencias", "crear");
  const puedeQuitar = permisos.tiene("equivalencias", "eliminar");

  return (
    <div className="flex flex-col gap-5">
      <PanelModulo ruta="/equivalencias">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Equivalencias</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Se busca un código y salen sus equivalentes, con el motivo por el que
            aparece cada uno.
          </p>
        </div>
      </PanelModulo>

      <section className="card elev-2 p-4 sm:p-5">
        <div className="max-w-xl">
          <SelectorProducto excluir={productoId ?? undefined} autoFocus={!productoId} />
        </div>
        <Suspense fallback={null}>
          <Contador />
        </Suspense>
      </section>

      {productoId === null ? (
        // El estado vacío dice para qué sirve la pantalla y cómo se usa: con
        // cero equivalencias marcadas, «busca un producto» a secas no
        // explicaba qué iba a pasar después (revisión por módulos del 02/10).
        // Desde el 27/11, los tres pasos con su número en círculo, como las
        // secciones de los formularios: se ven como pasos, no como un párrafo.
        <BloqueFicha icono={GitCompareArrows} titulo="Cómo se usa">
          <ol className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              <>Busca arriba el producto que te piden, por código, marca o descripción.</>,
              <>
                Salen los de otras marcas con la <strong>misma medida</strong>, con su precio y su
                stock.
              </>,
              <>
                Si sabes que otro sirve y no sale, búscalo allí mismo y pulsa{" "}
                <strong>Marcar como equivalente</strong>. Desde entonces saldrá el primero, aquí y
                al cotizar.
              </>,
            ].map((texto, i) => (
              <li
                key={i}
                className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-base"
              >
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-base font-bold text-white"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <span className="min-w-0">{texto}</span>
              </li>
            ))}
          </ol>
        </BloqueFicha>
      ) : (
        <Suspense key={productoId} fallback={<Skeleton className="h-96 w-full" />}>
          <Cross productoId={productoId} puedeDeclarar={puedeDeclarar} puedeQuitar={puedeQuitar} />
        </Suspense>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Cuántas equivalencias hay capturadas.
 *
 * No es adorno: la cascada mejora sola a medida que se declaran, y sin este
 * número nadie sabría si el módulo se está usando o si el primer peldaño lleva
 * meses vacío — que es exactamente lo que pasaba hasta hoy.
 */
async function Contador() {
  const r = await totalDeclaradas();
  if (!r.ok) return null;

  return (
    <p className="mt-3 text-base text-[var(--fg-muted)]">
      {r.datos.pares === 0
        ? "Todavía no se ha marcado ninguna a mano: lo que salga será por la medida del código."
        : `${r.datos.pares} ${r.datos.pares === 1 ? "equivalencia marcada" : "equivalencias marcadas"} a mano, entre ${r.datos.productos} productos.`}
    </p>
  );
}

async function Cross({
  productoId,
  puedeDeclarar,
  puedeQuitar,
}: {
  productoId: string;
  puedeDeclarar: boolean;
  puedeQuitar: boolean;
}) {
  const [base, sustitutos, declaradas] = await Promise.all([
    productoBase(productoId),
    crossReference(productoId),
    declaradasDe(productoId),
  ]);

  if (!base.ok) {
    return (
      <section className="card p-4">
        <EstadoError titulo="No se pudo cargar el producto" detalle={base.error} />
      </section>
    );
  }

  if (!sustitutos.ok) {
    return (
      <section className="flex flex-col gap-4">
        <Cabecera producto={base.datos} sustitutos={[]} />
        <EstadoError
          titulo="No se pudieron buscar equivalentes"
          detalle={sustitutos.error}
        />
      </section>
    );
  }

  // Ya declarados, para no ofrecer «Declarar» sobre algo que ya lo está.
  const yaDeclarados = new Set(
    declaradas.ok ? declaradas.datos.map((d) => d.otro_id) : [],
  );

  const grupos = agruparPorOrigen(sustitutos.datos);

  return (
    <div className="flex flex-col gap-4">
      <Cabecera producto={base.datos} sustitutos={sustitutos.datos} />

      {grupos.length === 0 ? (
        <section className="card elev-1 p-4">
          <EstadoVacio
            icono={<SearchX />}
            titulo="Sin equivalentes"
            descripcion={
              base.datos.designacion_base
                ? "No hay otro producto con esta medida, ni del mismo tipo en un precio parecido."
                : "De este código no se pudo sacar la medida, así que no salen equivalentes solos. Si conoces uno, márcalo aquí abajo."
            }
          />
        </section>
      ) : (
        grupos.map((grupo) => (
          // Cada peldaño de la cascada en su tarjeta, con la pastilla grande y
          // el motivo en letra de leer (27/11): la diferencia entre «lo dice el
          // código ISO» y «se parece en el precio» decide si se despacha o se
          // llama al cliente, así que no puede ir en gris pequeño.
          <section key={grupo.origen} className="card elev-1 overflow-hidden">
            <header className="flex flex-col gap-1.5 border-b border-[var(--border-soft)] bg-[var(--surface-2)] px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={tonoOrigen(grupo.origen)} size="md" className="text-base font-bold">
                  {ETIQUETA_ORIGEN[grupo.origen]}
                </Badge>
                <span className="text-base font-semibold text-[var(--fg-muted)]">
                  {grupo.sustitutos.length} {grupo.sustitutos.length === 1 ? "producto" : "productos"}
                </span>
              </div>
              <p className="text-base text-[var(--fg-muted)]">
                {EXPLICACION_ORIGEN[grupo.origen]}
              </p>
            </header>

            <ul className="flex flex-col">
              {grupo.sustitutos.map((s, i) => (
                <Fila
                  key={s.id}
                  sustituto={s}
                  productoId={productoId}
                  indice={i}
                  yaDeclarado={yaDeclarados.has(s.id)}
                  puedeDeclarar={puedeDeclarar}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {puedeDeclarar ? (
        <section className="card elev-1 p-4">
          <DeclararOtro productoId={productoId} />
        </section>
      ) : null}

      {declaradas.ok && declaradas.datos.length > 0 ? (
        <BloqueFicha icono={Link2} titulo="Marcadas a mano" ayuda="Las que alguien confirmó que sirven. Salen las primeras.">
          <ul className="flex flex-col gap-2">
            {declaradas.datos.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-base"
              >
                <div className="min-w-0">
                  <span className="font-mono text-lg font-bold text-[var(--titulo)] [overflow-wrap:anywhere]">
                    {d.otro_codigo}
                  </span>
                  <span className="ml-2 text-base text-[var(--fg-muted)]">
                    {d.otro_marca} · {ETIQUETA_CLASE[d.clase]}
                  </span>
                  {d.nota ? (
                    <p className="text-base text-[var(--fg-muted)]">{d.nota}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/equivalencias?producto=${d.otro_id}`} className="boton-fila">
                    Ver sus equivalentes
                    <ArrowRight aria-hidden="true" />
                  </Link>
                  <span className="text-sm text-[var(--fg-muted)]">
                    {/* dd/mm/aaaa y en hora de Lima, como las demás fechas del
                        ERP, y no el «2026-10-02» crudo de la base (02/11). */}
                    {d.creado_por ?? "—"} · {formatearFecha(d.creado_en)}
                  </span>
                  {puedeQuitar ? (
                    <BotonQuitar productoId={productoId} equivalenteId={d.otro_id} />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </BloqueFicha>
      ) : null}
    </div>
  );
}

function Cabecera({
  producto,
  sustitutos,
}: {
  producto: ProductoBase;
  sustitutos: readonly Sustituto[];
}) {
  // El producto que te piden, como cabecera de ficha (27/11): el código en
  // grande y en letra de máquina, el stock con su palabra y el precio como
  // cifras, y la ficha del producto como botón —antes era el código en azul,
  // y había que adivinar que se podía pulsar—.
  const sinStock = producto.stock <= 0;
  return (
    <section
      className={`card elev-2 flex flex-wrap items-start justify-between gap-4 border-l-[6px] p-4 sm:p-5 ${
        sinStock ? "border-l-[var(--danger)]" : "border-l-[var(--ok)]"
      }`}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="etiqueta-dato">Lo que te piden</span>
        <h2 className="font-mono text-3xl font-extrabold tracking-tight text-[var(--titulo)] [overflow-wrap:anywhere]">
          {producto.codigo}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral" size="md">
            {producto.marca}
          </Badge>
          {producto.designacion_base ? (
            <Badge tone="brand" size="md">
              medida <span className="font-mono">{producto.designacion_base}</span>
            </Badge>
          ) : null}
        </div>
        <p className="text-base text-[var(--fg-muted)]">{producto.descripcion}</p>
        <p className="text-base font-semibold text-fg">{contarPorOrigen(sustitutos)}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2">
          <span className="text-sm font-semibold text-[var(--fg-muted)]">En almacén</span>
          <span
            className={`tabular text-3xl font-extrabold leading-tight ${
              sinStock ? "text-[var(--danger)]" : "text-[var(--titulo)]"
            }`}
          >
            {producto.stock}
          </span>
          <span className={`text-base font-bold ${sinStock ? "text-[var(--danger)]" : "text-[var(--ok)]"}`}>
            {sinStock ? "Sin stock" : "Hay stock"}
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2">
          <span className="text-sm font-semibold text-[var(--fg-muted)]">Precio de venta</span>
          <span className="tabular text-3xl font-extrabold leading-tight text-[var(--titulo)]">
            {producto.precio_venta > 0 ? `$ ${producto.precio_venta.toFixed(2)}` : "Sin precio"}
          </span>
          <span className="text-base text-[var(--fg-muted)]">sin IGV</span>
        </div>
        <Link href={`/productos/${producto.id}`} className="boton-fila">
          Ver ficha del producto
          <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

function Fila({
  sustituto,
  productoId,
  indice,
  yaDeclarado,
  puedeDeclarar,
}: {
  sustituto: Sustituto;
  productoId: string;
  indice: number;
  yaDeclarado: boolean;
  puedeDeclarar: boolean;
}) {
  return (
    <li
      // En el teléfono, apilado: con el botón al lado, el texto se quedaba en
      // 60 px y la descripción salía como «62…» y el resumen una palabra por
      // renglón (revisión por módulos del 02/10).
      className="anim-entrada flex flex-col gap-2 border-b border-[var(--border-soft)] px-4 py-3 text-base transition-colors last:border-b-0 hover:bg-[var(--surface-2)] sm:flex-row sm:items-center sm:justify-between sm:gap-3"
      style={{ animationDelay: `${Math.min(indice, 6) * 24}ms` }}
    >
      <div className="min-w-0 sm:flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {/* El código ya no es el enlace (27/11): va en grande y en letra
              de máquina, y lo que se pulsa es el botón con palabra de la
              derecha (CLAUDE.md §1). */}
          <span className="font-mono text-lg font-bold text-[var(--titulo)] [overflow-wrap:anywhere]">
            {sustituto.codigo}
          </span>
          {sustituto.mejor_oferta ? (
            <Badge tone="success" size="md">
              Mejor oferta
            </Badge>
          ) : null}
          {sustituto.stock <= 0 ? (
            <Badge tone="danger" size="md">
              Sin stock
            </Badge>
          ) : null}
        </div>
        {/* Sin `truncate`: con la letra grande, la descripción cortada no
            decía qué producto era. */}
        <p className="text-base text-[var(--fg-muted)]">{sustituto.descripcion}</p>
        <p className="text-sm text-[var(--fg-muted)]">
          {resumenSustituto(sustituto)}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 sm:justify-end">
        <Link href={`/equivalencias?producto=${sustituto.id}`} className="boton-fila">
          Ver sus equivalentes
          <ArrowRight aria-hidden="true" />
        </Link>
        <span className="order-first whitespace-nowrap tabular text-lg font-bold">
          {`$ ${sustituto.precio_venta.toFixed(2)}`}
        </span>
        {puedeDeclarar && sustituto.origen !== "equivalencia" && !yaDeclarado ? (
          <BotonDeclarar
            productoId={productoId}
            equivalenteId={sustituto.id}
            codigoEquivalente={sustituto.codigo}
            // El mismo código básico es intercambiable por definición: el
            // núcleo ISO fija las tres medidas. La sugerencia se puede cambiar
            // en el diálogo.
            claseSugerida={sustituto.origen === "mismo_basico" ? "exacta" : "sustituto"}
          />
        ) : null}
      </div>
    </li>
  );
}
