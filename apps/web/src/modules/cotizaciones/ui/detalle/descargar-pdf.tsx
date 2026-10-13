"use client";

import * as React from "react";
import { FileDown } from "lucide-react";
import { Button } from "@rodatech/ui";

import { siglaBanco, type CuentaParaPagar } from "@/componentes/cuentas-para-pagar";
import { descargarHojaPdf, nombreArchivo, type HojaPdf } from "@/lib/pdf-hoja";

import type { CotizacionImpresa } from "../../dominio/impresion";
import { formatoFecha } from "../../dominio/whatsapp";
import { useEnLaMonedaElegida } from "./moneda-papel";
import { columnasDelPapel, datosDelPapel } from "./papel";

/**
 * «Descargar PDF»: la cotización como archivo, con un clic (14/10).
 *
 * Luis: *«él quiere un botón para que se descargue directo en PDF, no como la
 * imagen que te pasé»* — la ventana de imprimir de Chrome, con «Guardar como
 * PDF». Sale en la moneda que esté elegida en la vista previa, igual que la
 * impresión.
 */

const dinero = (n: number) =>
  n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONEDA_CUENTA: Record<string, string> = { USD: "DÓLARES", PEN: "SOLES" };

/** La hoja del PDF, con lo mismo que dibuja `Documento`. Pura, para probarla. */
export function hojaDeCotizacion(c: CotizacionImpresa, cuentas: readonly CuentaParaPagar[]): HojaPdf {
  const moneda =
    c.moneda === "PEN" && c.tipoCambio
      ? [
          { texto: "Los precios están expresados en " },
          { texto: "soles", negrita: true },
          { texto: ", al tipo de cambio venta de " },
          { texto: `S/ ${c.tipoCambio.valor.toFixed(3)}`, negrita: true },
          {
            texto: ` por dólar del ${formatoFecha(c.tipoCambio.fecha)}, y no incluyen IGV en la columna de valor unitario.`,
          },
        ]
      : [
          { texto: "Los precios están expresados en " },
          { texto: "dólares americanos", negrita: true },
          { texto: " y no incluyen IGV en la columna de valor unitario." },
        ];

  // Dólares arriba, como en el papel.
  const ORDEN: Record<string, number> = { USD: 0, PEN: 1 };
  const orden = (m: string) => ORDEN[m.toUpperCase()] ?? 9;
  const ordenadas = [...cuentas].sort((a, b) => orden(a.moneda) - orden(b.moneda));

  return {
    emisor: c.emisor,
    titulo: "Cotización",
    numero: c.numero,
    datos: datosDelPapel(c),
    columnas: columnasDelPapel(c),
    filas: c.lineas.map((l) => ({
      n: String(l.n),
      codigo: l.codigo,
      marca: l.marca,
      descripcion: {
        texto: l.descripcion,
        debajo: [
          ...(l.contiene.length > 0
            ? [`Contiene: ${l.contiene.map((x) => `${x.cantidad} × ${x.texto}`).join(" · ")}`]
            : []),
          ...(l.nota ? [`Nota: ${l.nota}`] : []),
        ],
      },
      cantidad: String(l.cantidad),
      unidad: l.unidad,
      entrega: l.entrega,
      valorUnitario: dinero(l.valorUnitario),
      descuento: l.descuentoPct > 0 ? `${l.descuentoPct}%` : "—",
      importe: dinero(l.importe),
    })),
    totales: [
      { etiqueta: "Valor de venta", valor: `${c.simbolo} ${dinero(c.subtotal)}` },
      ...(c.mostrarDescuento && c.descuento > 0
        ? [{ etiqueta: "Descuento", valor: `${c.simbolo} - ${dinero(c.descuento)}` }]
        : []),
      { etiqueta: `IGV (${(c.tasaIgv * 100).toFixed(0)}%)`, valor: `${c.simbolo} ${dinero(c.igv)}` },
      { etiqueta: "Total", valor: `${c.simbolo} ${dinero(c.total)}`, destacado: true },
    ],
    enLetras: c.enLetras,
    pie: [
      ...(c.condiciones
        ? [{ tipo: "parrafo" as const, trozos: [{ texto: "Condiciones: ", negrita: true }, { texto: c.condiciones }] }]
        : []),
      ...(c.observaciones ? [{ tipo: "parrafo" as const, trozos: [{ texto: c.observaciones }] }] : []),
      { tipo: "parrafo" as const, trozos: moneda },
      ...(ordenadas.length > 0
        ? [
            {
              tipo: "cuentas" as const,
              titulo: "CUENTAS BANCARIAS",
              filas: ordenadas.map(
                (k) =>
                  [siglaBanco(k.banco), MONEDA_CUENTA[k.moneda.toUpperCase()] ?? k.moneda, k.numero, k.cci ?? "—"] as [
                    string,
                    string,
                    string,
                    string,
                  ],
              ),
            },
          ]
        : []),
      {
        tipo: "firma" as const,
        izquierda: c.vendedor ? `Atendido por ${c.vendedor}` : "",
        derecha: c.emisor.email ?? "",
      },
    ],
  };
}

export function DescargarPdf({
  c,
  cuentas = [],
  variante = "outline",
}: {
  c: CotizacionImpresa;
  cuentas?: readonly CuentaParaPagar[];
  variante?: "outline" | "primary";
}) {
  const papel = useEnLaMonedaElegida(c);
  const [armando, setArmando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const descargar = async () => {
    setError(null);
    setArmando(true);
    try {
      await descargarHojaPdf(
        hojaDeCotizacion(papel, cuentas),
        // El número y el cliente: es como lo busca Willy en su carpeta.
        nombreArchivo(papel.numero, papel.cliente.razonSocial, papel.moneda === "PEN" ? "en soles" : null),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo armar el PDF.");
    } finally {
      setArmando(false);
    }
  };

  return (
    <>
      <Button type="button" variant={variante} onClick={descargar} disabled={armando}>
        <FileDown className="size-[18px] shrink-0" aria-hidden="true" />
        {armando ? "Armando…" : "Descargar PDF"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </>
  );
}
