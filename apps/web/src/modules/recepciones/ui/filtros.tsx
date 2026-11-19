"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La lectura sigue
// pasando en el servidor — la URL es el estado.

import * as React from "react";
import { Ban, Coins, Package } from "lucide-react";
import { Input } from "@rodatech/ui";

import { BarraPeriodo } from "@/componentes/barra-periodo";
import {
  CajaBuscar,
  FiltroBuscable,
  FiltroDesplegable,
  FilaFiltros,
  LimpiarFiltros,
  useBarraFiltros,
} from "@/componentes/filtros";

import type { ProveedorOpcion } from "../dominio/tipos";

interface Opcion {
  id: string;
  nombre: string;
}

/**
 * Los filtros de recepciones.
 *
 * Luis, 19/11: *«en el módulo de recepciones también faltan buenos filtros,
 * necesarios, igual que en el inventario»*. Hasta ese día solo se buscaba
 * por número, guía o factura del proveedor, y por proveedor. Ahora también:
 *
 *  · por PRODUCTO —«¿cuándo entró el 6205?»—, en su propia caja, porque
 *    busca dentro de las líneas y no en la cabecera;
 *  · por familia, subfamilia y marca de lo que trae;
 *  · por moneda, por si está anulada y por quién la recibió.
 */
export function FiltrosRecepcionesBarra({
  proveedores,
  familias,
  subfamilias,
  marcas,
  usuarios,
}: {
  proveedores: ProveedorOpcion[];
  familias: Opcion[];
  subfamilias: (Opcion & { familia_id: string })[];
  marcas: Opcion[];
  usuarios: Opcion[];
}) {
  const { valor, aplicar, aplicarVarios, limpiar, texto, setTexto } = useBarraFiltros();
  const familia = valor("familia");
  const hay = ["q", "producto", "proveedor", "familia", "subfamilia", "marca", "usuario", "moneda", "estado", "desde", "hasta"].some(
    (k) => valor(k),
  );

  // La caja de producto con su propia espera: `useBarraFiltros` solo la trae
  // para «q».
  const [producto, setProducto] = React.useState(valor("producto"));
  const ultimo = React.useRef(valor("producto"));
  React.useEffect(() => {
    if (producto.trim() === ultimo.current) return;
    const t = setTimeout(() => {
      ultimo.current = producto.trim();
      aplicar("producto", producto.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [producto, aplicar]);

  const subfamiliasVisibles = React.useMemo(
    () => (familia ? subfamilias.filter((s) => s.familia_id === familia) : subfamilias),
    [familia, subfamilias],
  );

  return (
    <div className="flex flex-col gap-3 px-4 pb-4">
      <BarraPeriodo />
      <FilaFiltros>
        <CajaBuscar
          valor={texto}
          onCambiar={setTexto}
          placeholder="Número, orden, guía, factura o proveedor"
          etiqueta="Buscar recepciones"
        />
        <div className="relative min-w-0 flex-[2_1_14rem]">
          <Package
            className={`pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 ${producto ? "text-brand-600" : "text-[var(--fg-subtle)]"}`}
            aria-hidden="true"
          />
          <Input
            type="search"
            value={producto}
            onChange={(e) => setProducto(e.target.value)}
            placeholder="Producto: código o descripción"
            aria-label="Recepciones que traen este producto"
            autoComplete="off"
            className={`w-full pl-9 ${producto ? "border-brand-300 bg-brand-50 dark:bg-brand-950" : ""}`}
          />
        </div>
        <FiltroBuscable
          id="f-proveedor"
          etiqueta="Proveedor"
          todos="Todos los proveedores"
          buscar="Escribe parte del nombre…"
          valor={valor("proveedor")}
          opciones={proveedores.map((p) => ({ valor: p.id, etiqueta: p.razon_social }))}
          onCambiar={(v) => aplicar("proveedor", v)}
        />
      </FilaFiltros>
      <FilaFiltros>
        <FiltroBuscable
          id="r-familia"
          etiqueta="Familia"
          todos="Todas las familias"
          buscar="Rodamiento, retén…"
          valor={familia}
          opciones={familias.map((f) => ({ valor: f.id, etiqueta: f.nombre }))}
          onCambiar={(v) => aplicarVarios({ familia: v, subfamilia: "" })}
        />
        <FiltroBuscable
          id="r-subfamilia"
          etiqueta="Subfamilia"
          todos="Todas las subfamilias"
          buscar="Rígido de bolas, cónicos…"
          valor={valor("subfamilia")}
          opciones={subfamiliasVisibles.map((s) => ({ valor: s.id, etiqueta: s.nombre }))}
          onCambiar={(v) => aplicar("subfamilia", v)}
        />
        <FiltroBuscable
          id="r-marca"
          etiqueta="Marca"
          todos="Todas las marcas"
          buscar="SKF, FAG, NTN…"
          valor={valor("marca")}
          opciones={marcas.map((m) => ({ valor: m.id, etiqueta: m.nombre }))}
          onCambiar={(v) => aplicar("marca", v)}
        />
      </FilaFiltros>
      <FilaFiltros>
        <FiltroDesplegable
          icono={Coins}
          etiqueta="Moneda"
          todos="Moneda: todas"
          valor={valor("moneda")}
          opciones={[
            { valor: "USD", etiqueta: "Dólares" },
            { valor: "PEN", etiqueta: "Soles" },
          ]}
          onCambiar={(v) => aplicar("moneda", v)}
        />
        <FiltroDesplegable
          icono={Ban}
          etiqueta="Estado"
          todos="Vigentes y anuladas"
          valor={valor("estado")}
          opciones={[
            { valor: "vigentes", etiqueta: "Solo vigentes" },
            { valor: "anuladas", etiqueta: "Solo anuladas" },
          ]}
          onCambiar={(v) => aplicar("estado", v)}
        />
        <FiltroBuscable
          id="r-usuario"
          etiqueta="Recibido por"
          todos="Recibido por: todos"
          buscar="Nombre…"
          valor={valor("usuario")}
          opciones={usuarios.map((u) => ({ valor: u.id, etiqueta: u.nombre }))}
          onCambiar={(v) => aplicar("usuario", v)}
        />
        <LimpiarFiltros
          visible={hay}
          onLimpiar={() => {
            setProducto("");
            ultimo.current = "";
            limpiar();
          }}
        />
      </FilaFiltros>
    </div>
  );
}
