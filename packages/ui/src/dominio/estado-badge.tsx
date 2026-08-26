/*
 * EstadoBadge — SIN "use client".
 *
 * El estado de un documento es la información más consultada del ERP y la que
 * más cara sale confundir: facturar una cotización anulada, o dar por enviada
 * a SUNAT una que fue rechazada.
 *
 * Reglas que aplica este componente:
 *
 *  1. EL COLOR ES SEMÁNTICO, NO DECORATIVO. Verde = terminado bien. Rojo =
 *     detenido o rechazado. Ámbar = requiere acción. Azul = en curso. Gris =
 *     todavía no ha salido de casa. Ningún estado usa el amarillo de marca:
 *     ese color es de interfaz y no transporta significado de datos.
 *
 *  2. EL COLOR NUNCA ES EL ÚNICO CANAL. Cada estado lleva su punto de forma
 *     distinta (relleno, hueco, anillo) y su texto. Alrededor del 8 % de los
 *     hombres tiene alguna deficiencia de visión del color; "aprobada" y
 *     "rechazada" no pueden distinguirse solo por verde/rojo.
 *
 *  3. LA ETIQUETA ES LA DEL NEGOCIO, no la de la base de datos. `enviada_sunat`
 *     se lee "Enviada a SUNAT".
 */
import * as React from "react";

import { cn } from "../lib/utils";

/** Estados de documento del ERP. Es la lista cerrada: si aparece uno nuevo en
 *  el esquema, se añade aquí y TypeScript señala dónde falta tratarlo. */
export type EstadoDocumento =
  // Comunes al ciclo comercial
  | "borrador"
  | "enviada"
  | "aprobada"
  | "rechazada"
  // "atendida" es el nombre real del enum `estado_cotizacion` de Postgres.
  // Antes decía "facturada", que no existe en el esquema y no lo usaba nadie:
  // una cotización atendida es la que YA se convirtió en comprobante.
  | "atendida"
  | "anulada"
  | "vencida"
  // Ciclo SUNAT
  | "enviada_sunat"
  | "aceptada_sunat"
  | "rechazada_sunat"
  | "baja_sunat"
  // Cobranza
  | "pendiente"
  | "parcial"
  | "pagada"
  // Compra / almacén
  | "por_recibir"
  | "recibida"
  | "archivado";

type Tono = "gris" | "azul" | "verde" | "ambar" | "rojo" | "marca";
type Forma = "relleno" | "hueco" | "anillo" | "raya";

interface Definicion {
  etiqueta: string;
  tono: Tono;
  forma: Forma;
  /** Texto adicional solo para lectores de pantalla, cuando el estado engaña. */
  matiz?: string;
}

const DEFINICIONES: Record<EstadoDocumento, Definicion> = {
  borrador: { etiqueta: "Borrador", tono: "gris", forma: "hueco", matiz: "no enviada al cliente" },
  enviada: { etiqueta: "Enviada", tono: "azul", forma: "relleno" },
  aprobada: { etiqueta: "Aprobada", tono: "verde", forma: "relleno" },
  rechazada: { etiqueta: "Rechazada", tono: "rojo", forma: "raya" },
  atendida: { etiqueta: "Atendida", tono: "marca", forma: "relleno", matiz: "ya se facturó" },
  anulada: { etiqueta: "Anulada", tono: "rojo", forma: "raya", matiz: "sin efecto" },
  vencida: { etiqueta: "Vencida", tono: "ambar", forma: "anillo" },

  enviada_sunat: { etiqueta: "Enviada a SUNAT", tono: "azul", forma: "anillo", matiz: "esperando respuesta" },
  aceptada_sunat: { etiqueta: "Aceptada por SUNAT", tono: "verde", forma: "relleno" },
  rechazada_sunat: { etiqueta: "Rechazada por SUNAT", tono: "rojo", forma: "raya", matiz: "requiere corrección" },
  baja_sunat: { etiqueta: "Dada de baja", tono: "gris", forma: "raya" },

  pendiente: { etiqueta: "Pendiente", tono: "ambar", forma: "hueco" },
  parcial: { etiqueta: "Pago parcial", tono: "ambar", forma: "anillo" },
  pagada: { etiqueta: "Pagada", tono: "verde", forma: "relleno" },

  por_recibir: { etiqueta: "Por recibir", tono: "azul", forma: "hueco" },
  recibida: { etiqueta: "Recibida", tono: "verde", forma: "relleno" },
  archivado: { etiqueta: "Archivado", tono: "gris", forma: "hueco", matiz: "fuera de las cotizaciones" },
};

const CLASES_TONO: Record<Tono, string> = {
  gris: "bg-surface-2 text-muted border-app",
  azul: "bg-info-bg text-info border-transparent",
  verde: "bg-ok-bg text-ok border-transparent",
  ambar: "bg-warn-bg text-warn border-transparent",
  rojo: "bg-danger-bg text-danger border-transparent",
  marca: "bg-brand-50 text-brand-700 border-brand-100 dark:bg-brand-950 dark:text-brand-200 dark:border-brand-800",
};

/** Segundo canal, además del color: la forma del punto. */
function Punto({ forma }: { forma: Forma }) {
  const base = "inline-block shrink-0";
  if (forma === "raya") return <span aria-hidden="true" className={cn(base, "h-0.5 w-2 rounded-full bg-current")} />;
  if (forma === "hueco")
    return (
      <span aria-hidden="true" className={cn(base, "size-1.5 rounded-full border border-current bg-transparent")} />
    );
  // Rombo: forma claramente distinta del círculo, para que "en curso" no se
  // confunda con "terminado" cuando el color no se percibe.
  if (forma === "anillo") return <span aria-hidden="true" className={cn(base, "size-1.5 rotate-45 bg-current")} />;
  return <span aria-hidden="true" className={cn(base, "size-1.5 rounded-full bg-current")} />;
}

export interface EstadoBadgeProps {
  estado: EstadoDocumento;
  /** Sobrescribe la etiqueta. Úsalo solo si el módulo la nombra distinto. */
  etiqueta?: string;
  size?: "xs" | "sm" | "md";
  className?: string;
}

const TAMANOS = {
  xs: "px-1.5 py-0.5 text-xs gap-1",
  sm: "px-2 py-0.5 text-xs gap-1.5",
  md: "px-2.5 py-1 text-xs gap-1.5",
} as const;

export function EstadoBadge({ estado, etiqueta, size = "sm", className }: EstadoBadgeProps) {
  const def = DEFINICIONES[estado];
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border font-medium",
        CLASES_TONO[def.tono],
        TAMANOS[size],
        // Un documento anulado se lee tachado además de en rojo.
        (estado === "anulada" || estado === "baja_sunat") && "line-through decoration-1",
        className,
      )}
    >
      <Punto forma={def.forma} />
      {etiqueta ?? def.etiqueta}
      {def.matiz && <span className="sr-only"> ({def.matiz})</span>}
    </span>
  );
}

/** Etiqueta legible de un estado, para PDFs, exportaciones y textos. */
export function etiquetaEstado(estado: EstadoDocumento): string {
  return DEFINICIONES[estado].etiqueta;
}
