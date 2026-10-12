"use client";

import * as React from "react";
import { History } from "lucide-react";
import { Button } from "@rodatech/ui";

import { armar, clave as claveDe, distinto, leer, type BorradorFormulario } from "@/lib/borrador";

/**
 * «Seguir donde me quedé / Empezar de cero» para cualquier formulario (13/10).
 *
 * Luis: *«cuando también esté creando un usuario o rellenando algo, que me
 * salga seguir o comenzar desde cero […] quiero volver donde me quedé»*.
 *
 * Uso: el formulario junta en UN objeto lo que la persona escribe (`datos`) y
 * dice cómo devolverlo a la pantalla (`recuperar`). El hook lo guarda solo
 * 800 ms después del último cambio, y al abrir ofrece recuperarlo con
 * {@link AvisoBorrador}. Al guardar en la base o al cancelar, `olvidar()`.
 *
 * Mientras hay un aviso pendiente NO se escribe encima: lo que se teclea antes
 * de contestar pisaría lo que se quiere recuperar.
 */
export function useBorrador<T>({
  formulario,
  id = null,
  datos,
  valeLaPena,
  recuperar,
}: {
  /** «cliente», «proveedor», «compra»… */
  formulario: string;
  /** El registro que se edita; null al crear. */
  id?: string | null;
  datos: T;
  /** Solo si hay algo que perder: un formulario recién abierto no se guarda. */
  valeLaPena: (d: T) => boolean;
  recuperar: (d: T) => void;
}) {
  const clave = claveDe(formulario, id);
  const [pendiente, setPendiente] = React.useState<BorradorFormulario<T> | null>(null);
  const decidido = React.useRef(false);
  const inicial = React.useRef(datos);
  /*
    Lo que la pantalla rellena SOLA al abrirse —«Recibir mercadería» precarga
    las líneas de la compra en un efecto, el análisis completa sugerencias—
    no es algo que se haya escrito: hasta que la persona toca algo (una tecla,
    un clic, un cambio), el punto de partida sigue a la pantalla. Desde ese
    momento lo que cambie es suyo y se guarda. (Un primer intento con «el
    primer segundo y medio» se tragaba lo que se escribe rápido al abrir.)
  */
  const tocado = React.useRef(false);
  if (!tocado.current) inicial.current = datos;
  React.useEffect(() => {
    const marcar = () => {
      tocado.current = true;
    };
    const eventos = ["keydown", "pointerdown", "input", "change"] as const;
    for (const e of eventos) document.addEventListener(e, marcar, true);
    return () => {
      for (const e of eventos) document.removeEventListener(e, marcar, true);
    };
  }, []);

  React.useEffect(() => {
    try {
      const b = leer<T>(window.localStorage.getItem(clave), new Date());
      if (b && valeLaPena(b.datos) && distinto(b.datos, inicial.current)) setPendiente(b);
      else decidido.current = true;
    } catch {
      decidido.current = true;
    }
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  React.useEffect(() => {
    if (pendiente || !decidido.current) return;
    const t = setTimeout(() => {
      try {
        if (valeLaPena(datos) && distinto(datos, inicial.current)) {
          window.localStorage.setItem(clave, JSON.stringify(armar(datos, new Date())));
        } else {
          window.localStorage.removeItem(clave);
        }
      } catch {
        // Sin almacenamiento (ventana privada, disco lleno): se trabaja igual.
      }
    }, 800);
    return () => clearTimeout(t);
    // `valeLaPena` puede venir como función nueva en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos, pendiente, clave]);

  const olvidar = React.useCallback(() => {
    try {
      window.localStorage.removeItem(clave);
    } catch {
      // Igual que arriba.
    }
  }, [clave]);

  const aviso = pendiente ? (
    <AvisoBorrador
      guardado={pendiente.guardado}
      onSeguir={() => {
        recuperar(pendiente.datos);
        decidido.current = true;
        setPendiente(null);
      }}
      onDescartar={() => {
        olvidar();
        decidido.current = true;
        setPendiente(null);
      }}
    />
  ) : null;

  return { aviso, olvidar };
}

export function AvisoBorrador({
  guardado,
  onSeguir,
  onDescartar,
  detalle,
}: {
  guardado: string;
  onSeguir: () => void;
  onDescartar: () => void;
  detalle?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-[var(--warn)] bg-[var(--warn-bg)] p-4">
      <History className="size-6 shrink-0 text-[var(--warn)]" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-base">
        <strong>Dejaste esto a medio llenar</strong> el{" "}
        {new Date(guardado).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
        {detalle ? ` · ${detalle}` : ""} — ¿sigues donde te quedaste?
      </p>
      <div className="flex gap-2">
        <Button type="button" onClick={onSeguir}>
          Seguir donde me quedé
        </Button>
        <Button type="button" variant="outline" onClick={onDescartar}>
          Empezar de cero
        </Button>
      </div>
    </div>
  );
}
