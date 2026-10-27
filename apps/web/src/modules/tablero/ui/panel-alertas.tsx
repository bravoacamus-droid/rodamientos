import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { EstadoVacio, buttonVariants } from "@rodatech/ui";

// Las etiquetas salen del módulo de alertas y no de una copia local: aquí
// había una lista de cuatro niveles cuando el enum tiene cinco, así que una
// alerta `info` se pintaba con el estilo de `baja` y con el texto crudo del
// enum en minúsculas.
import { ETIQUETA_SEVERIDAD, type Severidad } from "@/modules/alertas";

import { alertasPrioritarias, alertasSinNotificar } from "../api/consultas";

const COLOR_SEVERIDAD: Record<Severidad, string> = {
  critica: "bg-[var(--danger-bg)] text-[var(--danger)]",
  alta: "bg-[var(--warn-bg)] text-[var(--warn)]",
  media: "bg-[var(--info-bg)] text-[var(--info)]",
  baja: "bg-[var(--surface-2)] text-[var(--fg-muted)]",
  info: "bg-[var(--surface-2)] text-[var(--fg-muted)]",
};

/**
 * Alertas prioritarias.
 *
 * El cliente fue explícito: «pero no te llega como una alerta, tú tienes que
 * entrar y ver» (25:21). Por eso se dice cuántas están **sin mandar**: es el
 * indicador de que el envío está funcionando o no. Mientras no exista el
 * worker que las empuja, ese contador dice la verdad en vez de disimularla.
 *
 * Auditoría del 27/10 (UI1-02, UI1-07): ese dato era una pastilla «43 sin
 * avisar» que no decía a quién, más un punto naranja de 6 px en cada fila cuyo
 * significado solo salía al pasar el ratón. Ahora es una frase entera, una
 * vez, y el punto no está. El mensaje ya no se corta en «…» justo antes de la
 * cifra y la fecha, que es lo único que dice algo, y cada alerta con enlace
 * lleva un botón «Abrir» en vez de ser una fila pulsable sin aspecto de nada.
 */
export async function PanelAlertas() {
  const [lista, pendientes] = await Promise.all([
    alertasPrioritarias(6),
    alertasSinNotificar(),
  ]);

  const alertas = lista.ok ? lista.datos : [];
  const sinNotificar = pendientes.ok ? pendientes.datos : 0;

  return (
    <section className="card flex flex-col">
      <header className="border-b border-[var(--border-soft)] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Alertas</h2>
          {/* Botón y no enlace suelto, como el de la cartera (revisión del 02/10). */}
          <Link href="/alertas" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Ver todas
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        {sinNotificar > 0 ? (
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            {sinNotificar === 1
              ? "1 alerta todavía no se mandó por WhatsApp ni por correo."
              : `${sinNotificar} alertas todavía no se mandaron por WhatsApp ni por correo.`}
          </p>
        ) : null}
      </header>

      {alertas.length === 0 ? (
        <div className="p-4">
          <EstadoVacio
            titulo="Sin alertas"
            descripcion="No hay nada que requiera atención ahora mismo."
          />
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border-soft)]">
          {alertas.map((a) => (
            // En el móvil el botón baja a su propia fila: a su lado, el mensaje
            // tenía 150 px y se cortaba justo en la cifra (visto a 390 px).
            <li key={a.id} className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-2.5">
              <span
                className={`mt-0.5 shrink-0 rounded-sm px-1.5 py-0.5 text-sm font-medium ${
                  COLOR_SEVERIDAD[a.severidad] ?? COLOR_SEVERIDAD.baja
                }`}
              >
                {ETIQUETA_SEVERIDAD[a.severidad] ?? a.severidad}
              </span>
              <div className="min-w-0 flex-1 basis-56">
                <p className="text-sm font-medium">{a.titulo}</p>
                {/* Dos líneas y no una: lo que se cortaba era la cifra y la
                    fecha. En el móvil, entero. */}
                <p className="text-sm text-[var(--fg-muted)] sm:line-clamp-2" title={a.mensaje}>
                  {a.mensaje}
                </p>
              </div>
              {a.accion_url ? (
                <Link
                  href={a.accion_url}
                  aria-label={`Abrir: ${a.titulo}`}
                  className={`ml-auto shrink-0 ${buttonVariants({ variant: "outline", size: "sm" })}`}
                >
                  Abrir
                  <ArrowRight aria-hidden="true" />
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
