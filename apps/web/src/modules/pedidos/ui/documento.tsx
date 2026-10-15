import { HojaDocumento, type EmisorHoja } from "@/componentes/hoja-documento";

import type { PapelPedido } from "../dominio/hoja";

/** La hoja de pedido en pantalla y al imprimir (15/10). Los datos, de `papelDelPedido`. */
export function DocumentoPedido({ numero, papel, emisor }: { numero: string; papel: PapelPedido; emisor: EmisorHoja }) {
  return (
    <HojaDocumento
      emisor={emisor}
      titulo="Hoja de pedido"
      numero={numero}
      datos={papel.datos}
      columnas={papel.columnas}
      filas={papel.filas}
      totales={papel.totales}
      pie={<p className="text-xs text-[#444]">{papel.nota}</p>}
    />
  );
}
