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
  /*
    Ciclo SUNAT — los ocho del enum `estado_sunat` de la base.

    Antes había cuatro aquí —`enviada_sunat`, `aceptada_sunat`,
    `rechazada_sunat`, `baja_sunat`— que no los usaba nadie y que además no
    coincidían con el esquema: facturación tenía su propio mapa de tonos con
    los nombres reales. Dos catálogos para lo mismo, y el que se usaba era el
    que no tenía punto.
  */
  | "no_enviado"
  | "enviado"
  | "aceptado"
  | "observado"
  | "rechazado"
  | "baja_solicitada"
  | "baja_aceptada"
  // Cobranza
  | "pendiente"
  | "parcial"
  | "pagada"
  // Compra / almacén
  | "por_recibir"
  | "registrada"
  | "recibida_parcial"
  | "recibida"
  | "archivado"
  // Guía de remisión
  | "emitida";

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

  /*
    Gris = no ha salido de casa. Azul = va de camino. Verde = aceptado. Ámbar =
    hay que mirarlo. Rojo = parado.

    «Observado» es aviso y no error, y esto viene del comentario de
    `facturacion/dominio/tipos.ts`: SUNAT lo aceptó, pero con reparos. En rojo
    se trataría como un rechazo y se reemitiría un documento que ya es válido.
  */
  no_enviado: { etiqueta: "Sin enviar", tono: "gris", forma: "hueco", matiz: "todavía no salió a SUNAT" },
  enviado: { etiqueta: "Enviado", tono: "azul", forma: "anillo", matiz: "esperando respuesta de SUNAT" },
  aceptado: { etiqueta: "Aceptado", tono: "verde", forma: "relleno" },
  observado: { etiqueta: "Observado", tono: "ambar", forma: "anillo", matiz: "aceptado, pero con reparos" },
  rechazado: { etiqueta: "Rechazado", tono: "rojo", forma: "raya", matiz: "requiere corrección" },
  baja_solicitada: { etiqueta: "Baja pedida", tono: "ambar", forma: "raya" },
  baja_aceptada: { etiqueta: "Dado de baja", tono: "rojo", forma: "raya", matiz: "sin efecto" },

  pendiente: { etiqueta: "Pendiente", tono: "ambar", forma: "hueco" },
  parcial: { etiqueta: "Pago parcial", tono: "ambar", forma: "anillo" },
  pagada: { etiqueta: "Pagada", tono: "verde", forma: "relleno" },

  /*
    Una guía emitida es AZUL, no verde.

    Verde es «terminado bien», y emitir la guía no termina nada: descarga el
    stock y arranca lo siguiente —la mercadería va en camino y falta facturar—.
    Azul es «en curso», que es exactamente donde queda. En verde se leería como
    operación cerrada y hay una factura esperando.
  */
  emitida: { etiqueta: "Emitida", tono: "azul", forma: "relleno", matiz: "la mercadería ya salió" },

  por_recibir: { etiqueta: "Por recibir", tono: "azul", forma: "hueco" },
  registrada: { etiqueta: "Registrada", tono: "azul", forma: "hueco", matiz: "todavía no ha llegado" },
  /*
    «Parcial» es aviso y no éxito, y esto viene de `compras/dominio/tipos.ts`:
    una compra a medio recibir es justo la que hay que perseguir, y en verde se
    esconde entre las que ya están cerradas.
  */
  recibida_parcial: { etiqueta: "Parcial", tono: "ambar", forma: "anillo", matiz: "falta parte por llegar" },
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
        (estado === "anulada" || estado === "baja_aceptada") && "line-through decoration-1",
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
