"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { Button, Input } from "@rodatech/ui";

import { ordenesUsadas } from "../acciones/ordenes-usadas";
import { juntarOrdenes, partirOrdenes, sugerenciasPara } from "../dominio/ordenes";

/**
 * Las órdenes de compra del cliente, como etiquetas (14/10).
 *
 * Luis: anotar las órdenes de compra «con buscador inteligente bien hecho» —
 * varias por guía, como etiquetas que se quitan con su ×, y con las que ya
 * usó ese cliente a mano para no teclearlas otra vez.
 *
 * Se escribe y se pulsa Enter (o coma, o «Agregar»). Lo tecleado también
 * FILTRA las ya usadas: escribir «347» deja a la vista la «2026-000-347».
 */
export function OrdenesCompra({
  id,
  valor,
  onCambio,
  clienteId,
}: {
  id: string;
  /** El texto como se guarda: «OC-345, OC-346». */
  valor: string;
  onCambio: (texto: string) => void;
  /** Para sugerir las que ya usó. Sin cliente, no hay sugerencias. */
  clienteId: string | null;
}) {
  const puestas = partirOrdenes(valor);
  const [texto, setTexto] = React.useState("");
  const [usadas, setUsadas] = React.useState<string[]>([]);

  React.useEffect(() => {
    let vigente = true;
    if (!clienteId) {
      setUsadas([]);
      return;
    }
    void ordenesUsadas(clienteId).then((lista) => {
      if (vigente) setUsadas(lista);
    });
    return () => {
      vigente = false;
    };
  }, [clienteId]);

  const agregar = (nuevas: string) => {
    const lista = partirOrdenes(nuevas);
    if (lista.length === 0) return;
    onCambio(juntarOrdenes([...puestas, ...lista]));
    setTexto("");
  };
  const quitar = (o: string) => onCambio(juntarOrdenes(puestas.filter((p) => p !== o)));

  const sugeridas = sugerenciasPara(usadas, puestas, texto).slice(0, 6);

  return (
    <div className="flex flex-col gap-2">
      {puestas.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Órdenes de compra puestas">
          {puestas.map((o) => (
            <li
              key={o}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)] py-1 pl-3 pr-1 text-sm font-medium"
            >
              <span className="font-mono">{o}</span>
              <button
                type="button"
                onClick={() => quitar(o)}
                aria-label={`Quitar ${o}`}
                className="inline-flex size-7 items-center justify-center rounded text-[var(--fg-muted)] hover:bg-[var(--surface)] hover:text-[var(--danger)]"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex gap-2">
        <Input
          id={id}
          value={texto}
          onChange={(e) => {
            const v = e.target.value;
            // La coma cierra la etiqueta, como en cualquier campo de etiquetas.
            if (v.includes(",")) agregar(v);
            else setTexto(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              agregar(texto);
            } else if (e.key === "Backspace" && texto === "" && puestas.length > 0) {
              quitar(puestas[puestas.length - 1]!);
            }
          }}
          placeholder={puestas.length ? "Otra O/C…" : "Escribe la O/C y pulsa Enter"}
          maxLength={60}
          className="min-w-0 flex-1"
        />
        <Button type="button" variant="outline" onClick={() => agregar(texto)} disabled={!texto.trim()}>
          <Plus className="size-4" aria-hidden="true" />
          Agregar
        </Button>
      </div>

      {sugeridas.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[var(--fg-muted)]">Ya usadas con este cliente:</span>
          {sugeridas.map((s) => (
            <Button key={s} type="button" variant="outline" size="sm" className="text-sm" onClick={() => agregar(s)}>
              <Plus className="size-4" aria-hidden="true" />
              <span className="font-mono">{s}</span>
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
