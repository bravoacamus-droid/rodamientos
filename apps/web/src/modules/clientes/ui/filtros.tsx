"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La lectura sigue
// pasando en el servidor — la URL es el estado.

import { Eye, Wallet } from "lucide-react";

import { CajaBuscar, FiltroDesplegable, FilaFiltros, LimpiarFiltros, useBarraFiltros } from "@/componentes/filtros";

import { ETIQUETA_CONDICION } from "../dominio/tipos";

/**
 * Clientes (13/10): una fila de desplegables, como el resto de listas.
 *
 * Las dos casillas «Ver bloqueados» y «Ver desactivados» pasan a UN
 * desplegable «Mostrar» con las cuatro combinaciones; en la URL siguen siendo
 * las dos claves de siempre, así que los enlaces viejos valen.
 */
export function FiltrosClientesBarra() {
  const { valor, aplicar, aplicarVarios, limpiar, texto, setTexto } = useBarraFiltros();
  const bloqueados = valor("bloqueados") === "1";
  const inactivos = valor("inactivos") === "1";
  const mostrar = bloqueados && inactivos ? "todos" : bloqueados ? "bloqueados" : inactivos ? "inactivos" : "";
  const hay = ["q", "condicion", "bloqueados", "inactivos"].some((k) => valor(k));

  return (
    <div className="px-4 pb-4 sm:px-6">
      <FilaFiltros>
        <CajaBuscar
          valor={texto}
          onCambiar={setTexto}
          placeholder="Razón social, RUC o código"
          etiqueta="Buscar clientes"
        />
        <FiltroDesplegable
          icono={Wallet}
          etiqueta="Condición de pago"
          todos="Contado y crédito"
          valor={valor("condicion")}
          opciones={[
            { valor: "contado", etiqueta: ETIQUETA_CONDICION.contado },
            { valor: "credito", etiqueta: ETIQUETA_CONDICION.credito },
          ]}
          onCambiar={(v) => aplicar("condicion", v)}
        />
        <FiltroDesplegable
          icono={Eye}
          etiqueta="Mostrar"
          todos="Solo activos"
          valor={mostrar}
          opciones={[
            { valor: "bloqueados", etiqueta: "También bloqueados" },
            { valor: "inactivos", etiqueta: "También desactivados" },
            { valor: "todos", etiqueta: "Todos" },
          ]}
          onCambiar={(v) =>
            aplicarVarios({
              bloqueados: v === "bloqueados" || v === "todos" ? "1" : "",
              inactivos: v === "inactivos" || v === "todos" ? "1" : "",
            })
          }
        />
        <LimpiarFiltros visible={hay} onLimpiar={limpiar} />
      </FilaFiltros>
    </div>
  );
}
