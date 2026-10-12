"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La lectura sigue
// pasando en el servidor — la URL es el estado.

import { Archive, ListFilter, TriangleAlert, Users } from "lucide-react";

import { CajaBuscar, FiltroDesplegable, FilaFiltros, useBarraFiltros } from "@/componentes/filtros";

import {
  ETIQUETA_FAMILIA,
  ETIQUETA_SEVERIDAD,
  ETIQUETA_TIPO,
  TIPOS_QUE_SE_GENERAN,
  type Familia,
  type Severidad,
} from "../dominio/tipos";

const SEVERIDADES: readonly Severidad[] = ["critica", "alta", "media", "baja", "info"];
const FAMILIAS: readonly Familia[] = ["almacen", "dinero", "documentos"];

/**
 * La bandeja de alertas (13/10): una fila de desplegables, como el resto de
 * listas. «Ver archivadas» era un botón que cambiaba de texto; ahora es el
 * desplegable «Mostrar».
 */
export function FiltrosBandejaBarra() {
  const { valor, aplicar, texto, setTexto } = useBarraFiltros();

  return (
    <div className="px-4 pb-4">
      <FilaFiltros>
        <CajaBuscar
          valor={texto}
          onCambiar={setTexto}
          placeholder="Producto, cliente o número de documento"
          etiqueta="Buscar alertas"
        />
        <FiltroDesplegable
          icono={Users}
          etiqueta="A quién le toca"
          todos="Le toca a: todos"
          valor={valor("familia")}
          opciones={FAMILIAS.map((f) => ({ valor: f, etiqueta: ETIQUETA_FAMILIA[f] }))}
          onCambiar={(v) => aplicar("familia", v)}
        />
        <FiltroDesplegable
          icono={TriangleAlert}
          etiqueta="Gravedad"
          todos="Gravedad: toda"
          valor={valor("severidad")}
          opciones={SEVERIDADES.map((s) => ({ valor: s, etiqueta: ETIQUETA_SEVERIDAD[s] }))}
          onCambiar={(v) => aplicar("severidad", v)}
        />
        {/* Solo los tipos que `generar_alertas()` produce hoy: ofrecer los que
            nadie genera sería ofrecer filtros que siempre devuelven cero. */}
        <FiltroDesplegable
          icono={ListFilter}
          etiqueta="Tipo"
          todos="Tipo: todos"
          valor={valor("tipo")}
          opciones={TIPOS_QUE_SE_GENERAN.map((t) => ({ valor: t, etiqueta: ETIQUETA_TIPO[t] }))}
          onCambiar={(v) => aplicar("tipo", v)}
        />
        <FiltroDesplegable
          icono={Archive}
          etiqueta="Mostrar"
          todos="Las pendientes"
          valor={valor("ver") === "archivadas" ? "archivadas" : ""}
          opciones={[{ valor: "archivadas", etiqueta: "Las archivadas" }]}
          onCambiar={(v) => aplicar("ver", v)}
        />
      </FilaFiltros>
    </div>
  );
}
