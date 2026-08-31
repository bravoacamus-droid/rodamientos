"use client";

// Cliente: carga los contactos al elegir cliente y alterna entre la lista y
// escribir uno suelto.

import * as React from "react";
import { Input, SelectNativo } from "@rodatech/ui";

import { contactosDeCliente } from "@/modules/clientes/acciones/contactos";
import type { ContactoCliente } from "@/modules/clientes/dominio/tipos";

/**
 * A quién va dirigida la cotización.
 *
 * Willy, 31/08 (4:02): *«Cuando hago la cotización debo tener la opción para
 * elegir a qué contacto de los ya creados va dirigido el presupuesto»*. Antes
 * era una caja de texto libre, escondida además dentro de «Más datos del
 * documento», que está plegado por defecto — o sea que en la práctica nadie lo
 * rellenaba.
 *
 * Y no es un adorno: él mismo explicó por qué importa (2:36). La cotización va
 * al jefe de compras, al asistente de logística, o al de mantenimiento que fue
 * quien pidió el repuesto. Poner el nombre correcto es la diferencia entre que
 * la cotización llegue a quien la aprueba o se quede en una bandeja.
 *
 * ---------------------------------------------------------------------------
 * Se puede elegir de la lista O escribir uno suelto
 * ---------------------------------------------------------------------------
 * Deliberado. Hay clientes donde quien pide hoy no es quien está en la ficha, y
 * obligar a darlo de alta antes de poder cotizar es poner una puerta donde
 * hacía falta un pasillo. Lo escrito a mano se imprime igual; lo que pierde es
 * el enlace, o sea la pregunta «¿qué le hemos cotizado a esta persona?».
 */
export function SelectorContacto({
  clienteId,
  contactoId,
  contacto,
  onElegir,
  onEscribir,
}: {
  clienteId: string | null;
  contactoId: string | null;
  contacto: string;
  /** Uno de la lista: llegan id y nombre, porque se guardan los dos. */
  onElegir: (id: string | null, nombre: string) => void;
  /** Uno escrito a mano: solo nombre, sin ficha detrás. */
  onEscribir: (nombre: string) => void;
}) {
  const [lista, setLista] = React.useState<ContactoCliente[]>([]);
  const [cargando, setCargando] = React.useState(false);
  // «Otro»: la caja de texto en vez del desplegable.
  const [aMano, setAMano] = React.useState(false);

  // Al cambiar de cliente se recarga y se limpia lo elegido: dejar puesto al
  // comprador de la empresa anterior imprimiría un nombre ajeno en el PDF.
  React.useEffect(() => {
    let vigente = true;
    if (!clienteId) {
      setLista([]);
      setAMano(false);
      return;
    }
    setCargando(true);
    void contactosDeCliente(clienteId)
      .then((r) => {
        if (!vigente) return;
        const gente = r.ok ? r.datos : [];
        setLista(gente);
        // Si el cliente no tiene ninguno, la caja de texto directamente: un
        // desplegable vacío no explica nada.
        setAMano(gente.length === 0);
        // Y se propone el principal, que es a quien se le manda casi siempre.
        // Solo si no hay nada elegido todavía —al volver de un borrador ya
        // viene puesto y pisarlo sería perder lo que la persona decidió—.
        const principal = gente.find((g) => g.principal);
        if (principal && contactoId === null && contacto === "") {
          onElegir(principal.id, principal.nombre);
        }
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
    // `contactoId`, `contacto` y los callbacks quedan fuera a propósito: esto
    // tiene que dispararse al cambiar de CLIENTE y nada más. Con ellos dentro,
    // proponer el principal se volvería a disparar en cuanto se proponga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  const sinCliente = clienteId === null;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="cot-contacto" className="text-sm font-medium">
        A quién va dirigida
      </label>

      {aMano || sinCliente ? (
        <Input
          id="cot-contacto"
          value={contacto}
          onChange={(e) => onEscribir(e.target.value)}
          placeholder={sinCliente ? "Elige el cliente primero" : "Nombre de la persona"}
          disabled={sinCliente}
          autoComplete="off"
        />
      ) : (
        <SelectNativo
          id="cot-contacto"
          value={contactoId ?? ""}
          onChange={(e) => {
            if (e.target.value === "__otro__") {
              setAMano(true);
              onEscribir("");
              return;
            }
            const elegido = lista.find((c) => c.id === e.target.value);
            onElegir(elegido?.id ?? null, elegido?.nombre ?? "");
          }}
        >
          <option value="">Sin destinatario</option>
          {lista.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
              {c.cargo ? ` · ${c.cargo}` : c.area ? ` · ${c.area}` : ""}
            </option>
          ))}
          <option value="__otro__">Otra persona…</option>
        </SelectNativo>
      )}

      <span className="text-xs text-[var(--fg-subtle)]">
        {cargando
          ? "Cargando sus contactos…"
          : sinCliente
            ? "Sale impreso en la cotización."
            : aMano && lista.length > 0 ? (
                <button
                  type="button"
                  className="text-brand-600 hover:underline"
                  onClick={() => {
                    setAMano(false);
                    onElegir(null, "");
                  }}
                >
                  Volver a la lista de contactos
                </button>
              ) : lista.length === 0 ? (
                "Este cliente no tiene contactos guardados. Lo que escribas se imprime igual."
              ) : (
                "Sale impreso en la cotización."
              )}
      </span>
    </div>
  );
}
