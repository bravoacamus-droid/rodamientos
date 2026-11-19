"use client";

import * as React from "react";
import { CheckCheck, FileDown, FileSpreadsheet, ListFilter, Tag, Layers } from "lucide-react";
import { Button } from "@rodatech/ui";

import { CajaBuscar, FiltroDesplegable, FilaFiltros, LimpiarFiltros } from "@/componentes/filtros";
import { descargarListadoPdf } from "@/lib/pdf-listado";

import { excelDeLaHoja } from "../../acciones/exportar-hoja";
import {
  diferenciaDe,
  ETIQUETA_ESTADO_LINEA,
  FILTRO_HOJA_VACIO,
  hayFiltroHoja,
  type EstadoLinea,
  type FiltroHoja,
  type LineaConteo,
} from "../../dominio/ajuste";

const cant = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 2 });
const usd = (n: number) =>
  `$ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Filtrar la hoja ya cargada y bajarla (19/11).
 *
 * Luis: *«que me traiga todo por familia, pero una vez que me traiga también
 * tengo que filtrar la lista que me dio… y lo que me traiga, o dinámico con
 * los filtros, pueda exportarlo por Excel y PDF»*. El filtro es del
 * navegador —no vuelve a la base, así que lo contado no se pierde— y lo que
 * se baja es lo que queda a la vista.
 */
export function BarraHoja({
  lineas,
  visibles,
  filtro,
  onFiltro,
  onConforme,
  descripcionCarga,
}: {
  lineas: readonly LineaConteo[];
  visibles: readonly LineaConteo[];
  filtro: FiltroHoja;
  onFiltro: (f: FiltroHoja) => void;
  /** Marca como conforme lo que está a la vista. */
  onConforme: () => void;
  /** «Familia Rodamientos · marca SKF», para la cabecera de lo que se baja. */
  descripcionCarga: string;
}) {
  const [bajando, setBajando] = React.useState<"" | "excel" | "pdf">("");
  const [error, setError] = React.useState<string | null>(null);
  const filtrando = hayFiltroHoja(filtro);

  // Las marcas y subfamilias de lo que HAY en la hoja, no del catálogo.
  const marcas = React.useMemo(
    () => [...new Set(lineas.map((l) => l.marca).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")),
    [lineas],
  );
  const subfamilias = React.useMemo(
    () => [...new Set(lineas.map((l) => l.subfamilia).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")),
    [lineas],
  );
  const sinContarVisibles = visibles.filter((l) => l.cantidadFisica === null).length;

  const descripcion = [
    descripcionCarga,
    filtro.texto.trim() ? `que dicen «${filtro.texto.trim()}»` : null,
    filtro.marca ? `marca ${filtro.marca}` : null,
    filtro.subfamilia ? `subfamilia ${filtro.subfamilia}` : null,
    filtro.estado ? ETIQUETA_ESTADO_LINEA[filtro.estado].toLowerCase() : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const bajarExcel = async () => {
    setError(null);
    setBajando("excel");
    try {
      const r = await excelDeLaHoja({ descripcion, lineas: visibles });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(
        new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = r.archivo;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      setError("No se pudo armar el Excel.");
    } finally {
      setBajando("");
    }
  };

  const bajarPdf = async () => {
    setError(null);
    setBajando("pdf");
    try {
      let impacto = 0;
      const filas = visibles.map((l) => {
        const d = diferenciaDe(l);
        const imp = d === null ? null : Math.round(d * l.costoUnitario * 100) / 100;
        if (imp !== null) impacto += imp;
        return [
          l.codigo,
          l.descripcion,
          l.marca,
          l.subfamilia,
          `${cant(l.cantidadSistema)} ${l.unidad}`,
          // En blanco lo no contado: impresa, la hoja sirve para contar.
          l.cantidadFisica === null ? "" : cant(l.cantidadFisica),
          d === null ? "" : d > 0 ? `+${cant(d)}` : cant(d),
          imp === null ? "" : usd(imp),
        ];
      });
      const fecha = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());
      await descargarListadoPdf(
        {
          titulo: "Hoja de conteo",
          empresa: "Inversiones Rodatech E.I.R.L.",
          subtitulo: `${descripcion ? `${descripcion} · ` : ""}${visibles.length} productos · costos en dólares, sin IGV`,
          columnas: [
            { titulo: "Código", ancho: 32 },
            { titulo: "Descripción" },
            { titulo: "Marca", ancho: 24 },
            { titulo: "Subfamilia", ancho: 34 },
            { titulo: "Sistema", ancho: 22, derecha: true },
            { titulo: "Contado", ancho: 20, derecha: true },
            { titulo: "Diferencia", ancho: 20, derecha: true },
            { titulo: "Impacto", ancho: 24, derecha: true },
          ],
          filas,
          pie: ["Impacto neto", "", "", "", "", "", "", usd(Math.round(impacto * 100) / 100)],
        },
        `Hoja de conteo ${fecha}.pdf`,
      );
    } catch {
      setError("No se pudo armar el PDF.");
    } finally {
      setBajando("");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <FilaFiltros>
        <CajaBuscar
          valor={filtro.texto}
          onCambiar={(texto) => onFiltro({ ...filtro, texto })}
          placeholder="Filtrar la hoja: código, descripción…"
          etiqueta="Filtrar la hoja cargada"
        />
        <FiltroDesplegable
          icono={Tag}
          etiqueta="Marca"
          todos="Marca: todas"
          valor={filtro.marca}
          opciones={marcas.map((m) => ({ valor: m, etiqueta: m }))}
          onCambiar={(marca) => onFiltro({ ...filtro, marca })}
        />
        <FiltroDesplegable
          icono={Layers}
          etiqueta="Subfamilia"
          todos="Subfamilia: todas"
          valor={filtro.subfamilia}
          opciones={subfamilias.map((s) => ({ valor: s, etiqueta: s }))}
          onCambiar={(subfamilia) => onFiltro({ ...filtro, subfamilia })}
        />
        <FiltroDesplegable
          icono={ListFilter}
          etiqueta="Qué líneas"
          todos="Líneas: todas"
          valor={filtro.estado}
          opciones={Object.entries(ETIQUETA_ESTADO_LINEA).map(([valor, etiqueta]) => ({ valor, etiqueta }))}
          onCambiar={(estado) => onFiltro({ ...filtro, estado: estado as EstadoLinea })}
        />
        <LimpiarFiltros visible={filtrando} onLimpiar={() => onFiltro(FILTRO_HOJA_VACIO)} />
      </FilaFiltros>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--fg-muted)]" aria-live="polite">
          {filtrando ? (
            <>
              Mostrando <span className="tabular font-medium text-[var(--fg)]">{visibles.length}</span> de{" "}
              <span className="tabular">{lineas.length}</span> productos de la hoja
            </>
          ) : (
            <>
              <span className="tabular font-medium text-[var(--fg)]">{lineas.length}</span> productos en la hoja
            </>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {sinContarVisibles > 0 ? (
            <Button type="button" variant="outline" onClick={onConforme}>
              <CheckCheck className="size-[18px]" aria-hidden="true" />
              {filtrando
                ? `Marcar conformes las ${sinContarVisibles} que se ven`
                : "Marcar el resto como conforme"}
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={bajarExcel} disabled={bajando !== "" || visibles.length === 0}>
            <FileSpreadsheet className="size-[18px]" aria-hidden="true" />
            {bajando === "excel" ? "Armando…" : "Excel"}
          </Button>
          <Button type="button" variant="outline" onClick={bajarPdf} disabled={bajando !== "" || visibles.length === 0}>
            <FileDown className="size-[18px]" aria-hidden="true" />
            {bajando === "pdf" ? "Armando…" : "PDF"}
          </Button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
