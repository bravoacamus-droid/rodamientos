"use client";
/*
 * "use client" OBLIGATORIO: mantiene el popover abierto/cerrado y el texto que
 * el operador va tecleando.
 *
 * DECISIÓN DE OPERACIÓN: el DatePicker es un INPUT DE TEXTO con calendario al
 * lado, no un calendario a secas. Willy teclea "15/09" cien veces al día; si
 * el único camino es abrir el calendario y buscar el día con el ratón, se
 * pierden segundos en cada documento. El calendario queda para cuando hay
 * que mirar en qué día de la semana cae algo.
 *
 * El valor viaja SIEMPRE como ISO `YYYY-MM-DD` (lo que guarda Postgres en un
 * `date`), no como `Date`: así no hay conversiones de zona horaria que muevan
 * la fecha de emisión un día.
 */
import * as React from "react";
import { CalendarDays } from "lucide-react";
import type { Matcher } from "react-day-picker";

import { cn } from "../lib/utils";
import { Calendar } from "./calendar";
import { campoBase } from "./input";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

/** `dd/mm/aaaa` → ISO, o null si no es una fecha válida. */
function textoAIso(texto: string): string | null {
  const limpio = texto.trim().replace(/[-.]/g, "/");
  const partes = limpio.split("/");
  if (partes.length < 2) return null;
  const dia = Number(partes[0]);
  const mes = Number(partes[1]);
  const anioTexto = partes[2] ?? String(new Date().getFullYear());
  let anio = Number(anioTexto);
  if (anioTexto.length === 2) anio += 2000;
  if (!dia || !mes || !anio || mes > 12 || dia > 31) return null;
  const d = new Date(anio, mes - 1, dia, 12);
  if (d.getMonth() !== mes - 1 || d.getDate() !== dia) return null;
  return `${anio.toString().padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function isoATexto(iso: string | null | undefined): string {
  if (!iso || iso.length < 10) return "";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : "";
}

function isoADate(iso: string | null | undefined): Date | undefined {
  if (!iso || iso.length < 10) return undefined;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function dateAIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface DatePickerProps {
  id: string;
  /** Fecha en ISO `YYYY-MM-DD`. */
  valor: string | null;
  onCambio: (iso: string | null) => void;
  placeholder?: string;
  deshabilitado?: boolean;
  /** Rango permitido, también en ISO. */
  minimo?: string;
  maximo?: string;
  invalido?: boolean;
  className?: string;
  /** Se pasa al `<input>` para asociarlo con el mensaje de error del Form. */
  "aria-describedby"?: string;
}

export function DatePicker({
  id,
  valor,
  onCambio,
  placeholder = "dd/mm/aaaa",
  deshabilitado,
  minimo,
  maximo,
  invalido,
  className,
  ...aria
}: DatePickerProps) {
  const [abierto, setAbierto] = React.useState(false);
  const [texto, setTexto] = React.useState(() => isoATexto(valor));

  const fechaMinima = isoADate(minimo);
  const fechaMaxima = isoADate(maximo);
  const bloqueadas = React.useMemo(() => {
    // Matcher es una unión: {before} O {after}, nunca un objeto con ambas
    // opcionales. Por eso van como dos reglas separadas y no como una sola.
    const reglas: Matcher[] = [];
    if (fechaMinima) reglas.push({ before: fechaMinima });
    if (fechaMaxima) reglas.push({ after: fechaMaxima });
    return reglas;
  }, [fechaMinima, fechaMaxima]);

  // Si el valor cambia desde fuera (reset del formulario, carga diferida),
  // el texto tiene que seguirlo.
  React.useEffect(() => {
    setTexto(isoATexto(valor));
  }, [valor]);

  const confirmarTexto = () => {
    if (texto.trim() === "") {
      onCambio(null);
      return;
    }
    const iso = textoAIso(texto);
    if (iso) onCambio(iso);
    else setTexto(isoATexto(valor)); // entrada inválida: se revierte
  };

  return (
    <div className={cn("relative", className)}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={texto}
        placeholder={placeholder}
        disabled={deshabilitado}
        aria-invalid={invalido || undefined}
        className={cn(campoBase, "tabular h-control-md pl-3 pr-10 text-sm")}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={confirmarTexto}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            confirmarTexto();
          }
        }}
        {...aria}
      />
      <Popover open={abierto} onOpenChange={setAbierto}>
        <PopoverTrigger
          type="button"
          disabled={deshabilitado}
          aria-label="Abrir calendario"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-1.5 text-subtle transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-50"
        >
          <CalendarDays className="size-4" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto">
          <Calendar
            mode="single"
            autoFocus
            selected={isoADate(valor)}
            defaultMonth={isoADate(valor)}
            startMonth={fechaMinima}
            endMonth={fechaMaxima}
            disabled={bloqueadas}
            onSelect={(d) => {
              onCambio(d ? dateAIso(d) : null);
              setAbierto(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
