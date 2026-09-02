import Link from "next/link";
import { redirect } from "next/navigation";
import { EstadoError, EstadoVacio, Moneda } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";
import { PackageCheck } from "lucide-react";

import { bandejaPorComprar, ofertasDeLosProductos } from "../../api/por-comprar";
import { TablaPorComprar } from "./tabla";

/** La misma lista que `permisos_rol` tiene para `compras`. */
const ROLES = ["gerencia", "admin", "compras"];

/**
 * La bandeja «Por comprar».
 *
 * Willy, 01/09, describiendo su día: *«aveces el no tiene mercaderia o si
 * tiene puede ser algunos nomas y tiene que pedir mas […] si no tiene, que en
 * compras le avise que no tiene y tiene que pedir o comprar a sus
 * proveedores»*.
 *
 * Esta pantalla es ese aviso. Junta tres cosas que hasta ahora estaban en
 * sitios distintos —lo que los clientes confirmaron, lo que hay en almacén y
 * lo que ya se pidió— y responde a una sola pregunta: **qué hay que comprar
 * hoy, y para quién**.
 *
 * No decide nada por su cuenta. De ella se sale a registrar la compra con las
 * líneas ya puestas; el precio lo sigue poniendo el proveedor.
 */
export default async function PaginaPorComprar() {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) redirect("/login");
  if (!ROLES.includes(perfil.rol)) {
    return (
      <EstadoError
        titulo="No puedes ver el abastecimiento"
        descripcion="Tu rol no tiene permiso para las compras. Habla con Gerencia si crees que debería."
      />
    );
  }

  const r = await bandejaPorComprar();

  if (!r.ok) {
    return (
      <EstadoError
        titulo="No se pudo armar la bandeja"
        descripcion="La consulta no llegó a completarse."
        detalle={r.error}
      />
    );
  }

  const { filas, resumen, truncado } = r.datos;

  // Quién vende cada cosa, para poder repartir la compra por proveedor en
  // vez de dejarle separarlas a mano. Si no se puede averiguar, la bandeja
  // funciona igual: solo deja de proponer el reparto.
  const ofertas = await ofertasDeLosProductos(filas.map((f) => f.producto_id));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Por comprar</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Lo que los clientes ya confirmaron y el almacén no cubre.
          </p>
        </div>
        <Link
          href="/compras/nueva"
          className="inline-flex h-9 items-center rounded-sm border border-[var(--border-strong)] px-3 text-sm font-medium hover:bg-[var(--surface-2)]"
        >
          Registrar una compra suelta
        </Link>
      </div>

      {/* El tope de la consulta, dicho. Ver la nota de `api/por-comprar.ts`:
          un número incompleto que se anuncia se arregla; uno que no, se cree. */}
      {truncado ? (
        <p
          role="alert"
          className="rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm"
        >
          Hay tantas líneas confirmadas que la bandeja solo pudo leer las
          primeras. <strong>Las cifras se quedan cortas.</strong> Avísanos: hay
          que paginar esta pantalla antes de seguir usándola.
        </p>
      ) : null}

      {filas.length === 0 ? (
        <EstadoVacio
          icono={<PackageCheck className="size-8" aria-hidden="true" />}
          titulo="No falta nada por comprar"
          descripcion="Todo lo que los clientes han confirmado está en almacén o ya viene en camino."
          accion={
            <Link
              href="/cotizaciones"
              className="inline-flex h-9 items-center rounded-sm bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
            >
              Ver cotizaciones
            </Link>
          }
        />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Dato
              etiqueta="Productos que faltan"
              valor={String(resumen.porComprar)}
              detalle={
                resumen.vencidos > 0
                  ? `${resumen.vencidos} con la fecha ya pasada`
                  : "ninguno vencido"
              }
              alarma={resumen.vencidos > 0}
            />
            <Dato
              etiqueta="Clientes esperando"
              valor={String(resumen.clientes)}
              detalle="con mercadería confirmada"
            />
            <Dato
              etiqueta="Ya pedido"
              valor={String(resumen.enCamino)}
              detalle="productos en camino"
            />
            <Dato
              etiqueta="Costo aproximado"
              valor={<Moneda valor={resumen.estimado} />}
              detalle="con los costos con que se cotizó"
            />
          </section>

          <section className="card pt-2">
            <TablaPorComprar filas={filas} ofertas={ofertas} />
          </section>

          <p className="text-xs text-[var(--fg-subtle)]">
            El stock que hay se reparte por orden de confirmación: el primero
            que confirmó se lo lleva entero.{" "}
            <strong>No queda apartado</strong> — mientras no se decida si
            confirmar una cotización reserva mercadería, nada impide facturarle
            antes a otro.
          </p>
        </>
      )}
    </div>
  );
}

/** Un número grande con su explicación debajo. Sin comparativa: no hay serie. */
function Dato({
  etiqueta,
  valor,
  detalle,
  alarma = false,
}: {
  etiqueta: string;
  valor: React.ReactNode;
  detalle: string;
  alarma?: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-3 ${
        alarma
          ? "border-[var(--danger)] bg-[var(--danger-bg)]"
          : "border-[var(--border)]"
      }`}
    >
      <p className="text-sm text-[var(--fg-muted)]">{etiqueta}</p>
      <p className="mt-1 text-2xl font-semibold tabular">{valor}</p>
      <p className="mt-0.5 text-sm text-[var(--fg-subtle)]">{detalle}</p>
    </div>
  );
}
