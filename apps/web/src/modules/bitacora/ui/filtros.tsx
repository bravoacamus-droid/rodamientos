"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La lectura sigue
// pasando en el servidor — la URL es el estado.

import { FolderOpen, ShieldAlert } from "lucide-react";
import { Switch } from "@rodatech/ui";

import { BarraPeriodo } from "@/componentes/barra-periodo";
import {
  CajaBuscar,
  FiltroBuscable,
  FiltroDesplegable,
  FilaFiltros,
  LimpiarFiltros,
  useBarraFiltros,
} from "@/componentes/filtros";

import { ENTIDADES, ETIQUETA_ENTIDAD, QUE_PASO, QUIEN_SISTEMA } from "../dominio/tipos";

/**
 * La bitácora (13/10): el periodo arriba y una fila debajo, como el resto de
 * listas. «Quién» sigue con buscador: son las cuentas del equipo.
 *
 * 27/10 (TR-09): no se podía escribir «PED-26-00014» y ver su historia, ni
 * pedir solo lo grave. Y de 10 114 filas, 8 300 eran cargas de datos —el
 * maestro de productos, el histórico— que enterraban lo demás. Ahora se busca
 * por número o nombre, «Qué pasó» separa lo grave, y las cargas se ocultan
 * salvo que se pidan.
 */
export function FiltrosBarra({ personas }: { personas: { id: string; nombre: string }[] }) {
  const { valor, aplicar, limpiar, texto, setTexto } = useBarraFiltros();
  const hay = ["entidad", "usuario", "desde", "hasta", "q", "que", "cargas"].some((k) => valor(k));
  const cargas = valor("cargas") === "1";

  return (
    <div className="flex flex-col gap-3 px-4 pb-3">
      <BarraPeriodo />
      <FilaFiltros>
        <CajaBuscar
          valor={texto}
          onCambiar={setTexto}
          placeholder="Buscar documento o persona"
          etiqueta="Buscar documento o persona"
        />
        {/* Más ancho que los otros: enseña la opción elegida, y con cinco
            filtros en fila «Borrados y anulaciones» se cortaba a 120 px. */}
        <div className="flex min-w-0 flex-[1.5_1_15rem]">
          <FiltroDesplegable
            icono={ShieldAlert}
            etiqueta="Qué pasó"
            todos="Qué pasó: todo"
            valor={valor("que")}
            opciones={Object.entries(QUE_PASO).map(([v, e]) => ({ valor: v, etiqueta: e }))}
            onCambiar={(v) => aplicar("que", v)}
          />
        </div>
        <FiltroDesplegable
          icono={FolderOpen}
          etiqueta="Dónde"
          todos="Dónde: en todo"
          valor={valor("entidad")}
          opciones={ENTIDADES.map((e) => ({ valor: e, etiqueta: ETIQUETA_ENTIDAD[e] ?? e }))}
          onCambiar={(v) => aplicar("entidad", v)}
        />
        <FiltroBuscable
          id="f-quien"
          etiqueta="Quién"
          todos="Quién: cualquiera"
          buscar="Escribe el nombre…"
          valor={valor("usuario")}
          opciones={[
            // Lo que no hizo una persona: las cargas de datos y los cambios
            // por SQL. Antes no había forma de pedirlo.
            { valor: QUIEN_SISTEMA, etiqueta: "Sistema / carga de datos" },
            ...personas.map((p) => ({ valor: p.id, etiqueta: p.nombre })),
          ]}
          onCambiar={(v) => aplicar("usuario", v)}
        />
        <LimpiarFiltros visible={hay} onLimpiar={limpiar} />
      </FilaFiltros>
      <div className="flex items-center gap-3">
        <Switch
          id="f-cargas"
          checked={cargas}
          onCheckedChange={(v) => aplicar("cargas", v ? "1" : "")}
        />
        <label htmlFor="f-cargas" className="cursor-pointer text-sm">
          <span className="font-medium">Incluir cargas de datos</span>
          <span className="text-[var(--fg-muted)]">
            {" "}
            · los productos, clientes y el histórico que entraron del Excel hasta el 23/10
          </span>
        </label>
      </div>
    </div>
  );
}
