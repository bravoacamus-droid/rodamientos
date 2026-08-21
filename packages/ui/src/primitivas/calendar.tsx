"use client";
/*
 * "use client" OBLIGATORIO: react-day-picker mantiene el mes visible y toda
 * la navegación por teclado de la rejilla de días.
 *
 * Locale `es` fijo y semana empezando en lunes: es lo que espera cualquiera
 * que trabaje en Perú, y las fechas de traslado y de vencimiento se leen mal
 * si el domingo abre la semana.
 */
import * as React from "react";
import { DayPicker, type DayPickerProps } from "react-day-picker";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "../lib/utils";

export type CalendarProps = DayPickerProps;

export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      locale={es}
      weekStartsOn={1}
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col gap-4 sm:flex-row",
        month: "space-y-3",
        month_caption: "flex h-8 items-center justify-center",
        caption_label: "text-[13px] font-semibold capitalize text-fg",
        nav: "flex items-center gap-1",
        button_previous: cn(
          "absolute left-3 top-3 inline-flex size-7 items-center justify-center rounded-md",
          "text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40",
        ),
        button_next: cn(
          "absolute right-3 top-3 inline-flex size-7 items-center justify-center rounded-md",
          "text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40",
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-8 text-[10px] font-semibold uppercase tracking-wide text-subtle",
        week: "mt-1 flex w-full",
        day: "relative size-8 p-0 text-center text-[13px]",
        day_button: cn(
          "tabular inline-flex size-8 items-center justify-center rounded-md font-normal text-fg",
          "transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40",
        ),
        selected:
          "[&>button]:bg-brand-600 [&>button]:font-semibold [&>button]:text-white [&>button]:hover:bg-brand-700",
        today: "[&>button]:ring-1 [&>button]:ring-inset [&>button]:ring-brand-400",
        outside: "[&>button]:text-subtle [&>button]:opacity-50",
        disabled: "[&>button]:opacity-40",
        range_middle: "[&>button]:rounded-none [&>button]:bg-brand-50 [&>button]:text-brand-800",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...rest }) =>
          orientation === "left" ? (
            <ChevronLeft className="size-4" {...rest} />
          ) : (
            <ChevronRight className="size-4" {...rest} />
          ),
      }}
      {...props}
    />
  );
}
