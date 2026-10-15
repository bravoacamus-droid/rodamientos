import { redirect } from "next/navigation";

import { pedidoVigente } from "@/modules/pedidos/api/consultas";

/** Desde la 130 las compras cuelgan del PEDIDO: se va al vigente de la cotización. */
export default async function ComprasDelPedidoViejo({ params }: { params: Promise<{ cotizacionId: string }> }) {
  const { cotizacionId } = await params;
  const id = await pedidoVigente(cotizacionId);
  redirect(id ? `/pedidos/${id}` : `/cotizaciones/${cotizacionId}`);
}
