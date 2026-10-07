import { redirect } from "next/navigation";

/** Se mudó a /reportes/clientes el 07/10; los enlaces guardados siguen llegando. */
export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") q.set(k, v);
  const s = q.toString();
  redirect(s ? `/reportes/clientes?${s}` : "/reportes/clientes");
}
