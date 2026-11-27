import Link from "next/link";
import { ArrowRight, CircleCheck, TriangleAlert, Wallet } from "lucide-react";
import { buttonVariants, formatearMoneda } from "@rodatech/ui";

import { cartera } from "../api/consultas";

/**
 * Aging de cartera en los cuatro tramos que usa el cliente.
 *
 * Las barras son proporcionales al total: el tamaño relativo se lee de un
 * vistazo, que es lo que interesa antes que la cifra exacta.
 *
 * Rediseño del 27/11 (el supervisor: «muy plano»; y Willy no ve bien). Era
 * una lista de tramos en 14 px con barras de 6 px de alto: había que leer la
 * letra pequeña para saber si la cartera iba bien. Ahora la respuesta está
 * arriba y en grande —cuánto se debe y cuánto de eso YA venció, con su
 * palabra— y cada tramo lleva una barra gruesa y su cifra en negrita. El filo
 * es verde porque es dinero que entra; si hay vencido, la frase lo dice en
 * rojo con su icono, no solo con color.
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
  const pctVencido = c.total > 0 ? Math.round((vencido / c.total) * 100) : 0;

  return (
    <section className="card elev-1 flex flex-col border-l-[6px] border-l-[var(--ok)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-soft)] px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-ok-bg text-ok ring-1 ring-inset ring-[var(--border)]">
            <Wallet className="size-6" aria-hidden="true" />
          </span>
          {/* El mismo nivel que el título de `Bloque` (02/11, y 27/11): en la
              misma fila del tablero, «En qué quedó lo cotizado» y «Cartera»
              no pueden tener dos jerarquías. */}
          <h2 className="text-xl font-bold text-[var(--titulo)]">Cartera</h2>
        </div>
        {/* Botón con borde y no un enlace azul suelto: *«una persona que no
            sabe que tiene que darle click ahí»* (revisión del 02/10). */}
        <Link href="/cobranzas" className={`${buttonVariants({ variant: "outline" })} text-base`}>
          Ver cobranzas
          <ArrowRight aria-hidden="true" />
        </Link>
      </header>

      <div className="flex flex-col gap-4 p-4">
        <div>
          <p className="text-base font-semibold text-[var(--fg-muted)]">Te deben</p>
          <p className="tabular break-words text-3xl font-extrabold leading-tight text-[var(--titulo)]">
            {formatearMoneda(c.total)}
          </p>
          {c.total > 0 ? (
            vencido > 0 ? (
              <p className="mt-1 inline-flex flex-wrap items-center gap-1.5 text-base font-semibold text-danger">
                <TriangleAlert className="size-5 shrink-0" aria-hidden="true" />
                <span className="tabular">{formatearMoneda(vencido)}</span>
                <span>ya vencido ({pctVencido} %)</span>
              </p>
            ) : (
              <p className="mt-1 inline-flex items-center gap-1.5 text-base font-semibold text-ok">
                <CircleCheck className="size-5 shrink-0" aria-hidden="true" />
                Nada vencido: todo está a tiempo.
              </p>
            )
          ) : null}
        </div>

        {/*
          Sin nada por cobrar, el desglose no se pinta.

          Eran cinco tramos con «$ 0.00» y cinco barras vacías: seis ceros
          seguidos que hay que leer para descubrir que no dicen nada. Cuando la
          cartera está a cero, eso YA es la noticia entera y cabe en una línea.
        */}
        {c.total <= 0 ? (
          <p className="flex items-center justify-center gap-2 rounded-xl bg-ok-bg px-4 py-4 text-center text-base font-semibold text-ok">
            <CircleCheck className="size-5 shrink-0" aria-hidden="true" />
            No hay nada pendiente de cobro.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {tramos.map((t) => (
              <li key={t.etiqueta} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-base font-medium text-[var(--fg)]">{t.etiqueta}</span>
                  <span
                    className={`tabular text-base ${t.valor > 0 ? "font-bold text-[var(--fg)]" : "text-[var(--fg-muted)]"}`}
                  >
                    {formatearMoneda(t.valor)}
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-[var(--surface-3)]" role="presentation">
                  <div
                    className="anim-crecer h-full origin-left rounded-full"
                    style={{ width: `${(t.valor / c.total) * 100}%`, background: t.color }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
