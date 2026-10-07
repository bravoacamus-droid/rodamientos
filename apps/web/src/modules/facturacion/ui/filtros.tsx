"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La lectura sigue
// pasando en el servidor — la URL es el estado, y así un filtro se puede
// compartir por enlace y sobrevive a recargar la página.

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input, SelectNativo } from "@rodatech/ui";

import { FiltroCliente } from "@/componentes/filtro-cliente";

import { ETIQUETA_SUNAT, ETIQUETA_TIPO } from "../dominio/tipos";

const ESPERA_MS = 300;

export function FiltrosFacturacionBarra({
  nombreCliente,
}: {
  /** La razón social del cliente filtrado, si hay uno. */
  nombreCliente: string | null;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [, iniciarTransicion] = React.useTransition();

  const vigentes = React.useRef(params);
  vigentes.current = params;

  const aplicar = React.useCallback(
    (clave: string, valor: string) => {
      const siguientes = new URLSearchParams(vigentes.current.toString());
      if (valor) siguientes.set(clave, valor);
      else siguientes.delete(clave);
      siguientes.delete("cursor");

      const query = siguientes.toString();
      const destino = query ? `${ruta}?${query}` : ruta;
      iniciarTransicion(() => router.replace(destino, { scroll: false }));
    },
    [ruta, router],
  );

  const [texto, setTexto] = React.useState(params.get("q") ?? "");

  React.useEffect(() => {
    const actual = vigentes.current.get("q") ?? "";
    if (texto === actual) return;
    const t = setTimeout(() => aplicar("q", texto.trim()), ESPERA_MS);
    return () => clearTimeout(t);
  }, [texto, aplicar]);

  return (
    /*
      Rejilla, no `flex-wrap`.

      Luis, 10/09: *«ese select, para que los filtros de desde y hasta estén
      alineados»*. Con flex libre, el desplegable de clientes se estiraba al
      ancho del nombre más largo de la cartera y empujaba las dos fechas a la
      fila de abajo. En rejilla, cada filtro ocupa lo que le toca y la fila no
      depende de los datos.
    */
    /*
      Y por el ancho de LA CAJA (`@container` en la sección), no de la
      pantalla (revisión por módulos del 02/10). En el teléfono, de dos en
      dos: uno debajo de otro eran siete campos y una pantalla entera antes
      del primer comprobante. Con la caja ancha, dos filas: lo que se teclea
      arriba y los desplegables debajo, todos del mismo ancho.

      Las fechas salen de aquí al 07/10: las pone la barra de periodo común
      (`BarraPeriodo`), la misma de las cinco listas de ventas.
    */
    <div className="grid grid-cols-2 gap-3 px-4 pb-4 @3xl:grid-cols-6">
      <label className="col-span-2 flex flex-col gap-1 @3xl:col-span-3">
        <span className="text-sm font-medium text-[var(--fg-muted)]">Buscar</span>
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Número del documento u orden de compra"
          autoComplete="off"
        />
      </label>

      <div className="col-span-2 @3xl:col-span-3">
        <FiltroCliente
          valor={params.get("cliente")}
          nombre={nombreCliente}
          onCambiar={(id) => aplicar("cliente", id ?? "")}
        />
      </div>

      <label className="flex flex-col gap-1 @3xl:col-span-2">
        <span className="text-sm font-medium text-[var(--fg-muted)]">Tipo</span>
        <SelectNativo
          value={params.get("tipo") ?? ""}
          onChange={(e) => aplicar("tipo", e.target.value)}
        >
          <option value="">Todos</option>
          {Object.entries(ETIQUETA_TIPO).map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </SelectNativo>
      </label>

      {/*
        El estado del cobro.

        La página leía `?estado=` y la consulta lo filtraba desde siempre, pero
        no había desplegable que lo escribiera: para ver las anuladas había
        que recorrer las 518 (revisión por módulos del 02/10). «Vencido» no
        se ofrece: ese estado no lo pone nadie, y lo vencido se cobra desde
        Cobranzas.
      */}
      <label className="flex flex-col gap-1 @3xl:col-span-2">
        <span className="text-sm font-medium text-[var(--fg-muted)]">Cobro</span>
        <SelectNativo
          value={params.get("estado") ?? ""}
          onChange={(e) => aplicar("estado", e.target.value)}
        >
          <option value="">Todos</option>
          <option value="emitido">Por cobrar</option>
          <option value="pagado">Cobrado</option>
          <option value="anulado">Anulado</option>
        </SelectNativo>
      </label>

      <label className="col-span-2 flex flex-col gap-1 @3xl:col-span-2">
        <span className="text-sm font-medium text-[var(--fg-muted)]">SUNAT</span>
        <SelectNativo
          value={params.get("sunat") ?? ""}
          onChange={(e) => aplicar("sunat", e.target.value)}
        >
          <option value="">Todos</option>
          {Object.entries(ETIQUETA_SUNAT).map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </SelectNativo>
      </label>

    </div>
  );
}
