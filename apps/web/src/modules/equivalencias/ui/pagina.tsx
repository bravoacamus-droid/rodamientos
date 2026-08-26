import { Suspense } from "react";
import Link from "next/link";
import { Badge, EstadoError, EstadoVacio, Skeleton } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

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
import { BotonDeclarar, BotonQuitar } from "./acciones";
import { SelectorProducto } from "./selector";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Los roles que `permisos_rol` deja escribir en `producto_equivalencias`. */
const ROLES_QUE_DECLARAN = ["gerencia", "admin", "ventas", "compras"];

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

  const perfil = await perfilActual();
  const puedeDeclarar =
    perfil?.activo === true && ROLES_QUE_DECLARAN.includes(perfil.rol);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Equivalencias</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Se busca un código y salen sus equivalentes, con el motivo por el que
          aparece cada uno.
        </p>
      </div>

      <section className="card p-4">
        <div className="max-w-xl">
          <SelectorProducto excluir={productoId ?? undefined} autoFocus={!productoId} />
        </div>
        <Suspense fallback={null}>
          <Contador />
        </Suspense>
      </section>

      {productoId === null ? (
        <section className="card p-4">
          <EstadoVacio
            titulo="Busca un producto para empezar"
            descripcion="Se puede buscar por código, por código de fabricante, por marca o por descripción."
          />
        </section>
      ) : (
        <Suspense key={productoId} fallback={<Skeleton className="h-96 w-full" />}>
          <Cross productoId={productoId} puedeDeclarar={puedeDeclarar} />
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
    <p className="mt-3 text-xs text-[var(--fg-subtle)]">
      {r.datos.pares === 0
        ? "Todavía no hay ninguna equivalencia declarada: lo que salga abajo será todo deducido del código."
        : `${r.datos.pares} ${r.datos.pares === 1 ? "equivalencia declarada" : "equivalencias declaradas"} sobre ${r.datos.productos} productos.`}
    </p>
  );
}

async function Cross({
  productoId,
  puedeDeclarar,
}: {
  productoId: string;
  puedeDeclarar: boolean;
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
      <section className="card p-4">
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
      <section className="card p-4">
        <Cabecera producto={base.datos} sustitutos={sustitutos.datos} />
      </section>

      {grupos.length === 0 ? (
        <section className="card p-4">
          <EstadoVacio
            titulo="Sin equivalentes"
            descripcion={
              base.datos.designacion_base
                ? "No hay otro producto con esta medida, ni del mismo tipo en un precio parecido."
                : "Este producto no tiene designación base, así que la búsqueda por medida no puede hacer nada. Se puede declarar una equivalencia a mano."
            }
          />
        </section>
      ) : (
        grupos.map((grupo) => (
          <section key={grupo.origen} className="card overflow-hidden">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border-soft)] px-4 py-3">
              <div className="flex items-center gap-2">
                <Badge tone={tonoOrigen(grupo.origen)} size="sm">
                  {ETIQUETA_ORIGEN[grupo.origen]}
                </Badge>
                <span className="text-xs text-[var(--fg-subtle)]">
                  {grupo.sustitutos.length}
                </span>
              </div>
              <p className="text-xs text-[var(--fg-muted)]">
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

      {declaradas.ok && declaradas.datos.length > 0 ? (
        <section className="card p-4">
          <h2 className="mb-2 text-sm font-semibold">Declaradas a mano</h2>
          <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
            {declaradas.datos.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <Link
                    href={`/equivalencias?producto=${d.otro_id}`}
                    className="font-mono text-[0.8rem] font-medium text-brand-600 hover:underline"
                  >
                    {d.otro_codigo}
                  </Link>
                  <span className="ml-2 text-xs text-[var(--fg-muted)]">
                    {d.otro_marca} · {ETIQUETA_CLASE[d.clase]}
                  </span>
                  {d.nota ? (
                    <p className="text-xs text-[var(--fg-subtle)]">{d.nota}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--fg-subtle)]">
                    {d.creado_por ?? "—"} · {d.creado_en.slice(0, 10)}
                  </span>
                  {puedeDeclarar ? (
                    <BotonQuitar productoId={productoId} equivalenteId={d.otro_id} />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
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
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <Link
            href={`/productos/${producto.id}`}
            className="font-mono text-base font-semibold text-brand-600 hover:underline"
          >
            {producto.codigo}
          </Link>
          <span className="text-sm text-[var(--fg-muted)]">{producto.marca}</span>
          {producto.designacion_base ? (
            <Badge tone="neutral" size="xs">
              medida {producto.designacion_base}
            </Badge>
          ) : null}
        </div>
        <p className="mt-0.5 text-sm text-[var(--fg-muted)]">{producto.descripcion}</p>
        <p className="mt-0.5 text-xs text-[var(--fg-subtle)]">
          {producto.stock > 0 ? `${producto.stock} en stock` : "sin stock"} ·
          {" "}
          $ {producto.precio_venta.toFixed(2)} · {contarPorOrigen(sustitutos)}
        </p>
      </div>
    </div>
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
      className="anim-entrada flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-soft)] px-4 py-2.5 text-sm transition-colors last:border-b-0 hover:bg-[var(--surface-2)]"
      style={{ animationDelay: `${Math.min(indice, 6) * 24}ms` }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <Link
            href={`/equivalencias?producto=${sustituto.id}`}
            className="font-mono text-[0.8rem] font-medium text-brand-600 hover:underline"
          >
            {sustituto.codigo}
          </Link>
          {sustituto.mejor_oferta ? (
            <Badge tone="success" size="xs">
              Mejor oferta
            </Badge>
          ) : null}
        </div>
        <p className="truncate text-xs text-[var(--fg-muted)]">{sustituto.descripcion}</p>
        <p className="text-xs text-[var(--fg-subtle)]">
          {resumenSustituto(sustituto)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span className="tabular text-sm">$ {sustituto.precio_venta.toFixed(2)}</span>
        {puedeDeclarar && sustituto.origen !== "equivalencia" && !yaDeclarado ? (
          <BotonDeclarar
            productoId={productoId}
            equivalenteId={sustituto.id}
            codigoEquivalente={sustituto.codigo}
            // La misma medida ISO es intercambiable por definición; lo que
            // llega por tipo o subfamilia, no. La sugerencia se puede cambiar
            // en el diálogo.
            claseSugerida={sustituto.origen === "misma_medida" ? "exacta" : "sustituto"}
          />
        ) : null}
      </div>
    </li>
  );
}
