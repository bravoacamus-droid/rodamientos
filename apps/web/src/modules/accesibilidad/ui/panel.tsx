"use client";

// Cliente: cambia el <html> al momento y escribe la cookie y el tema, que
// viven en el navegador.

import * as React from "react";
import { useTheme } from "next-themes";
import { Check, Moon, RotateCcw, Sun, TrendingUp } from "lucide-react";
import { Button, cn } from "@rodatech/ui";

import {
  COOKIE_ACCESIBILIDAD,
  ETIQUETA_LETRA,
  PREFERENCIAS_POR_DEFECTO,
  TAMANOS_LETRA,
  atributosHtml,
  serializar,
  type Preferencias,
} from "@/lib/accesibilidad";

/**
 * Las opciones de accesibilidad (27/11).
 *
 * Cada ajuste es una fila de TARJETAS grandes con su muestra dentro, no un
 * interruptor. Un interruptor de 44 px con la palabra al lado obliga a saber
 * qué significa «encendido»; una tarjeta que ya enseña la letra grande, o el
 * negro sobre blanco, se elige mirándola. Luis: *«una persona que no sabe que
 * tiene que darle click ahí»* — por eso la elegida dice «Elegido» con palabra.
 *
 * Se aplica AL PULSAR, sin botón de guardar: el que no ve bien necesita ver
 * el cambio para saber si le sirve, y un «Guardar» al fondo de la página es
 * justo lo que no encuentra.
 */
export function PanelAccesibilidad({ inicial }: { inicial: Preferencias }) {
  const [prefs, setPrefs] = React.useState(inicial);
  const { resolvedTheme, setTheme } = useTheme();
  const [montado, setMontado] = React.useState(false);
  React.useEffect(() => setMontado(true), []);

  const cambiar = React.useCallback((parche: Partial<Preferencias>) => {
    setPrefs((antes) => {
      const nuevas = { ...antes, ...parche };
      aplicar(nuevas);
      return nuevas;
    });
  }, []);

  const volverAlInicio = () => {
    setPrefs(PREFERENCIAS_POR_DEFECTO);
    aplicar(PREFERENCIAS_POR_DEFECTO);
    setTheme("light");
  };

  const oscuro = montado && resolvedTheme === "dark";
  const todoNormal =
    serializar(prefs) === "" && (!montado || resolvedTheme !== "dark");

  return (
    <div className="flex flex-col gap-5">
      <Seccion
        numero={1}
        titulo="Tamaño de la letra"
        ayuda="Agranda todo el sistema: la letra, los botones y las casillas crecen juntos."
      >
        <Opciones columnas="@2xl:grid-cols-4 @md:grid-cols-2">
          {TAMANOS_LETRA.map((t) => (
            <Opcion
              key={t}
              elegida={prefs.letra === t}
              onElegir={() => cambiar({ letra: t })}
              titulo={ETIQUETA_LETRA[t].nombre}
            >
              <span
                className="font-bold leading-none text-[var(--titulo)]"
                // En px y no en rem, la única excepción a propósito: con
                // «Muy grande» elegido, en rem crecerían las cuatro muestras
                // y «Normal» ya no enseñaría cómo es la letra normal.
                style={{ fontSize: `${ETIQUETA_LETRA[t].px * 1.75}px` }}
                aria-hidden="true"
              >
                Aa
              </span>
            </Opcion>
          ))}
        </Opciones>
      </Seccion>

      <Seccion
        numero={2}
        titulo="Colores de la pantalla"
        ayuda="Claro es fondo blanco. Oscuro cansa menos la vista de noche o con poca luz."
      >
        <Opciones columnas="@md:grid-cols-2">
          <Opcion elegida={montado && !oscuro} onElegir={() => setTheme("light")} titulo="Claro">
            <Muestra fondo="#ffffff" letra="#14181d" borde="#c7d2de" icono={<Sun className="size-6" />} />
          </Opcion>
          <Opcion elegida={oscuro} onElegir={() => setTheme("dark")} titulo="Oscuro">
            <Muestra fondo="#121922" letra="#e7edf3" borde="#33465a" icono={<Moon className="size-6" />} />
          </Opcion>
        </Opciones>
      </Seccion>

      <Seccion
        numero={3}
        titulo="Contraste"
        ayuda="Alto pone la letra en negro puro, marca los bordes y quita los grises suaves. Ayuda cuando cuesta distinguir las cosas."
      >
        <Opciones columnas="@md:grid-cols-2">
          <Opcion elegida={!prefs.contrasteAlto} onElegir={() => cambiar({ contrasteAlto: false })} titulo="Normal">
            <Muestra fondo="#eef2f7" letra="#5c6773" borde="#dde4ec" tarjeta="#ffffff" />
          </Opcion>
          <Opcion elegida={prefs.contrasteAlto} onElegir={() => cambiar({ contrasteAlto: true })} titulo="Alto">
            <Muestra fondo="#ffffff" letra="#000000" borde="#000000" tarjeta="#ffffff" gruesa />
          </Opcion>
        </Opciones>
      </Seccion>

      <Seccion
        numero={4}
        titulo="Animaciones"
        ayuda="Sin movimiento, las cosas aparecen de golpe en su sitio, sin deslizarse ni girar."
      >
        <Opciones columnas="@md:grid-cols-2">
          <Opcion elegida={!prefs.sinMovimiento} onElegir={() => cambiar({ sinMovimiento: false })} titulo="Con movimiento">
            <span className="text-base text-muted">Como viene de fábrica</span>
          </Opcion>
          <Opcion elegida={prefs.sinMovimiento} onElegir={() => cambiar({ sinMovimiento: true })} titulo="Sin movimiento">
            <span className="text-base text-muted">Más tranquilo para la vista</span>
          </Opcion>
        </Opciones>
      </Seccion>

      {/* Lo elegido, aplicado a piezas de verdad del sistema: una cifra del
          tablero, un párrafo y los dos botones de siempre. */}
      <section aria-labelledby="muestra-titulo" className="card elev-1 flex flex-col gap-4 p-5">
        <h2 id="muestra-titulo" className="text-xl font-bold text-[var(--titulo)]">
          Así se ve con lo que elegiste
        </h2>
        <div className="grid gap-4 @2xl:grid-cols-[minmax(0,18rem)_1fr]">
          <div className="card flex flex-col gap-1 border-l-4 border-l-[var(--ok)] p-4">
            <span className="flex items-center justify-between gap-3 text-base font-semibold">
              Vendido
              <span className="flex size-12 items-center justify-center rounded-xl bg-ok-bg text-ok">
                <TrendingUp className="size-6" aria-hidden="true" />
              </span>
            </span>
            <span className="tabular text-3xl font-extrabold text-[var(--titulo)]">$ 18,850</span>
            <span className="text-sm text-muted">neto, sin IGV</span>
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <p className="text-base">
              La cotización <strong>COT1-000123</strong> para <strong>Minera Los Andes</strong> vence el
              viernes. Faltan dos productos por confirmar con el proveedor.
            </p>
            <p className="text-sm text-muted">Este es el gris de las notas y las ayudas.</p>
            <div className="flex flex-wrap gap-3">
              <Button type="button" size="lg" tabIndex={-1}>
                Botón principal
              </Button>
              <Button type="button" size="lg" variant="outline" tabIndex={-1}>
                Botón secundario
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-[var(--border-strong)] p-4">
        <p className="text-base">
          Lo que elijas se guarda <strong>en esta computadora</strong>. Si entras desde otra, elígelo
          otra vez allí.
        </p>
        <Button type="button" variant="outline" size="lg" onClick={volverAlInicio} disabled={todoNormal}>
          <RotateCcw aria-hidden="true" />
          Volver a como venía
        </Button>
      </div>
    </div>
  );
}

/** Escribe la cookie y cambia el <html> sin recargar. */
function aplicar(p: Preferencias) {
  const valor = serializar(p);
  document.cookie = valor
    ? `${COOKIE_ACCESIBILIDAD}=${valor}; path=/; max-age=31536000; samesite=lax`
    : `${COOKIE_ACCESIBILIDAD}=; path=/; max-age=0; samesite=lax`;
  const html = document.documentElement;
  for (const [atributo, dato] of Object.entries(atributosHtml(p))) {
    if (dato === undefined) html.removeAttribute(atributo);
    else html.setAttribute(atributo, dato);
  }
}

function Seccion({
  numero,
  titulo,
  ayuda,
  children,
}: {
  numero: number;
  titulo: string;
  ayuda: string;
  children: React.ReactNode;
}) {
  const id = `acc-${numero}`;
  return (
    <section aria-labelledby={id} className="card elev-1 flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-base font-bold text-white"
          aria-hidden="true"
        >
          {numero}
        </span>
        <div className="min-w-0">
          <h2 id={id} className="text-xl font-bold text-[var(--titulo)]">
            {titulo}
          </h2>
          <p className="mt-0.5 text-base text-muted">{ayuda}</p>
        </div>
      </div>
      {/* El grupo de opciones se nombra con el título de su sección. */}
      <div role="radiogroup" aria-labelledby={id}>
        {children}
      </div>
    </section>
  );
}

function Opciones({ columnas, children }: { columnas: string; children: React.ReactNode }) {
  return <div className={cn("grid grid-cols-1 gap-3", columnas)}>{children}</div>;
}

function Opcion({
  elegida,
  onElegir,
  titulo,
  children,
}: {
  elegida: boolean;
  onElegir: () => void;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={elegida}
      onClick={onElegir}
      className={cn(
        "relative flex min-h-32 flex-col items-center justify-center gap-3 rounded-xl border-2 p-4 text-center transition-[border-color,background-color,box-shadow]",
        elegida
          ? "border-brand-600 bg-brand-50 shadow-[var(--elev-2)] dark:border-brand-300 dark:bg-surface-3"
          : "border-[var(--border-strong)] bg-[var(--surface)] hover:border-brand-400 hover:bg-[var(--surface-2)]",
      )}
    >
      {children}
      <span className="text-lg font-bold text-fg">{titulo}</span>
      {/* En el flujo y no en una esquina: con la letra grande, una pastilla
          flotante se montaba encima de la muestra. El hueco se reserva
          también en las no elegidas para que la fila no baile al pulsar. */}
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-bold",
          elegida ? "bg-brand-600 text-white" : "invisible",
        )}
        aria-hidden={!elegida}
      >
        <Check className="size-4" aria-hidden="true" />
        Elegido
      </span>
    </button>
  );
}

/**
 * Una tarjetita con dos rayas de texto: enseña cómo quedan fondo, letra y
 * borde. Con colores escritos y no con tokens a propósito: tiene que enseñar
 * el tema oscuro estando en claro, y al revés.
 */
function Muestra({
  fondo,
  letra,
  borde,
  tarjeta,
  icono,
  gruesa = false,
}: {
  fondo: string;
  letra: string;
  borde: string;
  tarjeta?: string;
  icono?: React.ReactNode;
  gruesa?: boolean;
}) {
  return (
    <span
      className="flex w-full max-w-56 items-center gap-3 rounded-lg p-3"
      style={{ background: fondo, border: `${gruesa ? 2 : 1}px solid ${borde}` }}
      aria-hidden="true"
    >
      {icono ? (
        <span style={{ color: letra }}>{icono}</span>
      ) : null}
      <span
        className="flex flex-1 flex-col gap-1.5 rounded-md p-2"
        style={{ background: tarjeta ?? "transparent", border: tarjeta ? `${gruesa ? 2 : 1}px solid ${borde}` : undefined }}
      >
        <span className="h-2 w-4/5 rounded-full" style={{ background: letra }} />
        <span className="h-2 w-3/5 rounded-full" style={{ background: letra, opacity: 0.85 }} />
      </span>
    </span>
  );
}
