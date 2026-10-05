import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Moneda, buttonVariants } from "@rodatech/ui";

import { cartera } from "../api/consultas";

/**
 * Aging de cartera en los cuatro tramos que usa el cliente.
 *
 * Las barras son proporcionales al total: el tamaño relativo se lee de un
 * vistazo, que es lo que interesa antes que la cifra exacta.
 */
export async function PanelCartera() {
  const resultado = await cartera();
  const c = resultado.ok
    ? resultado.datos
    : {
        porVencer: 0,
        vencido1a15: 0,
        vencido16a30: 0,
        vencido31a60: 0,
        vencidoMas60: 0,
        total: 0,
      };

  const tramos = [
    { etiqueta: "Por vencer", valor: c.porVencer, color: "var(--ok)" },
    { etiqueta: "1 – 15 días", valor: c.vencido1a15, color: "var(--warn)" },
    // Entre el ámbar y el rojo, y el rojo oscurecido: mezclas de los tokens y
    // no hexadecimales, para que sigan al tema oscuro (revisión del 02/10).
    { etiqueta: "16 – 30 días", valor: c.vencido16a30, color: "color-mix(in oklab, var(--warn) 55%, var(--danger))" },
    { etiqueta: "31 – 60 días", valor: c.vencido31a60, color: "var(--danger)" },
    { etiqueta: "Más de 60", valor: c.vencidoMas60, color: "color-mix(in oklab, var(--danger) 70%, var(--fg))" },
  ];

  const vencido = c.total - c.porVencer;

  return (
    <section className="card flex flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--border-soft)] px-4 py-3">
        <h2 className="text-sm font-semibold">Cartera</h2>
        {/* Botón con borde y no un enlace azul suelto: *«una persona que no
            sabe que tiene que darle click ahí»* (revisión del 02/10). */}
        <Link href="/cobranzas" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Ver cobranzas
          <ArrowRight aria-hidden="true" />
        </Link>
      </header>

      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-sm text-[var(--fg-subtle)]">Por cobrar</p>
            <Moneda valor={c.total} tamano="xl" enfasis="fuerte" />
          </div>
          {vencido > 0 ? (
            <div className="text-right">
              <p className="text-sm text-[var(--fg-subtle)]">Vencido</p>
              <Moneda valor={vencido} tamano="md" resaltarNegativo={false} />
            </div>
          ) : null}
        </div>

        {/*
          Sin nada por cobrar, el desglose no se pinta.

          Eran cinco tramos con «$ 0.00» y cinco barras vacías: seis ceros
          seguidos que hay que leer para descubrir que no dicen nada. Cuando la
          cartera está a cero, eso YA es la noticia entera y cabe en una línea.
        */}
        {c.total <= 0 ? (
          <p className="py-4 text-center text-sm text-[var(--fg-muted)]">
            No hay nada pendiente de cobro.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tramos.map((t) => {
              const pct = (t.valor / c.total) * 100;
              return (
                <li key={t.etiqueta} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="text-[var(--fg-muted)]">{t.etiqueta}</span>
                    <Moneda valor={t.valor} tamano="sm" enfasis="suave" />
                  </div>
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]"
                    role="presentation"
                  >
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: t.color }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
