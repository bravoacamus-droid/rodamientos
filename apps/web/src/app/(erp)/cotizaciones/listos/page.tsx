import { redirect } from "next/navigation";

/** «Listos para entregar» vive desde la 130 dentro de «Pedidos». */
export default async function ListosViejo({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const estado = Array.isArray(sp.estado) ? sp.estado[0] : sp.estado;
  redirect(estado ? `/pedidos/listos?estado=${encodeURIComponent(estado)}` : "/pedidos/listos");
}
