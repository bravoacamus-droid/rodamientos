import Link from "next/link";
import { ClipboardList, PackageCheck } from "lucide-react";

/**
 * Las dos vistas de «Pedidos» (130): la lista de pedidos con su etapa, y el
 * reparto del almacén entre los que esperan («Listos para entregar», que era
 * la pantalla entera hasta hoy).
 */
export function PestanasPedidos({ activa }: { activa: "todos" | "listos" }) {
  const clase = (on: boolean) =>
    `inline-flex h-10 items-center gap-2 rounded-t-md border-b-2 px-4 text-sm font-semibold ${
      on ? "border-brand-600 text-[var(--fg)]" : "border-transparent text-[var(--fg-muted)] hover:text-[var(--fg)]"
    }`;
  return (
    <nav className="flex gap-1 border-b border-[var(--border)]" aria-label="Vistas de pedidos">
      <Link href="/pedidos" className={clase(activa === "todos")} aria-current={activa === "todos" ? "page" : undefined}>
        <ClipboardList className="size-4" aria-hidden="true" />
        Todos los pedidos
      </Link>
      <Link
        href="/pedidos/listos"
        className={clase(activa === "listos")}
        aria-current={activa === "listos" ? "page" : undefined}
      >
        <PackageCheck className="size-4" aria-hidden="true" />
        Listos para entregar
      </Link>
    </nav>
  );
}
