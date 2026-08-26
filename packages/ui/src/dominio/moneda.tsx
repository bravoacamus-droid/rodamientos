/*
 * Moneda — SIN "use client". Es un `<data>` con clases.
 *
 * TODO importe del ERP se pinta con este componente. Motivos:
 *  · Siempre 2 decimales. Un total con un decimal ("$ 1,240.5") parece
 *    truncado y en un documento fiscal genera desconfianza.
 *  · Siempre `tabular-nums`. En una columna de 50 facturas, los dígitos de
 *    ancho variable desalinean las unidades y las cifras dejan de compararse
 *    de un vistazo.
 *  · `<data value>` lleva el número crudo en el DOM: eso hace que copiar y
 *    pegar en Excel, y los scripts de las pruebas E2E, vean `1240.50` y no
 *    `$ 1,240.50`.
 *  · El signo negativo va DELANTE del símbolo y en rojo: en cuentas por
 *    cobrar la diferencia entre saldo y abono tiene que verse sin leer.
 */
import * as React from "react";

import { formatearMoneda, type CodigoMoneda } from "../lib/formato";
import { cn } from "../lib/utils";

export interface MonedaProps {
  valor: number | string | null | undefined;
  /** Willy cotiza y factura siempre en dólares; PEN existe para el IGV local. */
  moneda?: CodigoMoneda;
  /** Oculta el símbolo: en una tabla de una sola moneda, ahorra ancho. */
  sinSimbolo?: boolean;
  /** Fuerza el signo `+` en positivos. Para variaciones y ajustes de kardex. */
  conSigno?: boolean;
  /** Los negativos se pintan en rojo. Desactívalo en columnas de descuento. */
  resaltarNegativo?: boolean;
  /** `fuerte` para totales de documento. */
  enfasis?: "normal" | "fuerte" | "suave";
  tamano?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

const TAMANOS: Record<NonNullable<MonedaProps["tamano"]>, string> = {
  xs: "text-xs",
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
  xl: "text-2xl",
};

export function Moneda({
  valor,
  moneda = "USD",
  sinSimbolo = false,
  conSigno = false,
  resaltarNegativo = true,
  enfasis = "normal",
  tamano = "md",
  className,
}: MonedaProps) {
  const n = typeof valor === "number" ? valor : Number(valor ?? 0);
  const numero = Number.isFinite(n) ? n : 0;
  const texto = formatearMoneda(numero, moneda, sinSimbolo ? { sinSimbolo: true } : undefined);
  const prefijo = conSigno && numero > 0 ? "+" : "";

  return (
    <data
      value={numero.toFixed(2)}
      className={cn(
        "tabular whitespace-nowrap",
        TAMANOS[tamano],
        enfasis === "fuerte" && "font-semibold text-fg",
        enfasis === "suave" && "text-muted",
        enfasis === "normal" && "text-fg",
        resaltarNegativo && numero < 0 && "text-danger",
        className,
      )}
    >
      {prefijo}
      {texto}
    </data>
  );
}
