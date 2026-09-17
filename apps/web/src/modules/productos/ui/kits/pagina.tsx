import Link from "next/link";
import { Boxes, Plus } from "lucide-react";
import { Badge, EstadoError, EstadoVacio } from "@rodatech/ui";

import { listarKits } from "../../api/kits";

const dolar = (n: number) =>
  n.toLocaleString("es-PE", { style: "currency", currency: "USD" });

/**
 * Los kits del catálogo.
 *
 * Willy, 16/09: *«ese kit debe tener un código interno para identificarlo para
 * una próxima vez; cuando él me pide, me envía el código nomás»*. Por eso la
 * lista se lee por CÓDIGO, como el catálogo, y no por nombre.
 *
 * La columna que de verdad se mira es «se pueden armar»: es lo que decide si
 * se puede prometer entrega inmediata. Y no es un número guardado —el kit no
 * tiene stock propio— sino el mínimo de lo que dan sus piezas.
 */
export async function PaginaKits() {
  const r = await listarKits();

  if (!r.ok) {
    return <EstadoError titulo="No se pudieron cargar los kits" detalle={r.error} />;
  }

  const kits = r.datos.filter((k) => !k.archivado);

  return (
    <div className="flex flex-col gap-5 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Kits</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Varios productos que se cotizan y se facturan como uno solo, con un
            precio total.
          </p>
        </div>
        <Link
          href="/productos/kits/nuevo"
          className="inline-flex h-control-md items-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          <Plus className="size-[18px]" />
          Nuevo kit
        </Link>
      </header>

      {kits.length === 0 ? (
        <EstadoVacio
          titulo="Todavía no hay kits"
          descripcion="Un kit junta varios productos con un código y un precio propios. El cliente lo pide por ese código y en la cotización sale como un solo ítem."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {kits.map((k) => (
            <Link
              key={k.id}
              href={`/productos/kits/${k.id}`}
              className="card flex flex-col gap-3 p-4 transition-colors hover:bg-[var(--surface-2)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="flex items-center gap-2">
                    <Boxes className="size-4 shrink-0 text-[var(--fg-muted)]" />
                    <span className="font-mono font-medium">{k.codigo}</span>
                  </span>
                  <span className="mt-0.5 block text-sm">{k.descripcion}</span>
                </div>

                <div className="text-right">
                  <span className="block tabular text-lg font-semibold">
                    {dolar(k.precioVenta)}
                  </span>
                  {/*
                    Cuando lo que se cobra no es la suma, se dice.

                    Willy: *«hay que ingresar el precio de cada uno para que te
                    calcule el precio final»*, pero un kit se vende redondeado
                    o negociado. Que el precio difiera de la suma no es un
                    error — no saberlo, sí.
                  */}
                  {Math.abs(k.precioVenta - k.sumaVenta) >= 0.01 ? (
                    <span className="block text-sm text-[var(--fg-muted)]">
                      suma {dolar(k.sumaVenta)}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border-soft)] pt-3 text-sm">
                <span>
                  <span className="text-[var(--fg-muted)]">Se pueden armar </span>
                  <strong className="tabular">{k.armable}</strong>
                </span>

                {k.armable <= 0 ? (
                  <Badge tone="danger" size="xs">falta material</Badge>
                ) : null}

                <span className="text-[var(--fg-muted)]">
                  {k.componentes.length === 1
                    ? "1 producto dentro"
                    : `${k.componentes.length} productos dentro`}
                </span>

                {/*
                  Cuál es el que frena, dicho en la propia lista.

                  Es la pregunta que sigue a «solo puedo armar 3»: cuál me
                  falta. Sin esto habría que abrir el kit para averiguarlo, y
                  se abre justo para eso.
                */}
                {k.armable > 0 || k.componentes.length > 0
                  ? (() => {
                      const freno = k.componentes.reduce(
                        (peor, c) => (c.alcanzaPara < peor.alcanzaPara ? c : peor),
                        k.componentes[0]!,
                      );
                      return k.componentes.length > 1 ? (
                        <span className="min-w-0 truncate text-[var(--fg-subtle)]">
                          lo frena {freno.codigo}
                        </span>
                      ) : null;
                    })()
                  : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
