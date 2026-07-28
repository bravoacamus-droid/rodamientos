import Link from "next/link";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn, pct } from "@/lib/utils";

export function KpiCard({
  titulo,
  valor,
  sub,
  variacion: v,
  invertirColor,
  icon,
  href,
  acento,
  children,
}: {
  titulo: string;
  valor: string;
  sub?: string;
  variacion?: number;
  invertirColor?: boolean;
  icon?: React.ReactNode;
  href?: string;
  acento?: "brand" | "success" | "warning" | "danger" | "neutral";
  children?: React.ReactNode;
}) {
  const positivo = (v ?? 0) >= 0;
  const bueno = invertirColor ? !positivo : positivo;
  const Icono = v === undefined ? null : v === 0 ? Minus : positivo ? TrendingUp : TrendingDown;

  const barra =
    acento === "success" ? "var(--ok)"
    : acento === "warning" ? "var(--warn)"
    : acento === "danger" ? "var(--danger)"
    : acento === "neutral" ? "var(--fg-subtle)"
    : "var(--color-brand-600)";

  const contenido = (
    <div
      className={cn(
        "card elev-1 relative overflow-hidden p-4 transition-all duration-200",
        href && "hover:elev-2 hover:border-brand-200"
      )}
    >
      <span
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ backgroundColor: barra }}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{titulo}</p>
        {icon && <span className="text-subtle [&_svg]:size-4">{icon}</span>}
      </div>
      <p className="mt-2 text-[26px] font-bold leading-none tracking-tight text-fg tabular">
        {valor}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {v !== undefined && Icono && (
          <span
            className="inline-flex items-center gap-0.5 text-[11.5px] font-semibold tabular"
            style={{ color: v === 0 ? "var(--fg-subtle)" : bueno ? "var(--ok)" : "var(--danger)" }}
          >
            <Icono className="size-3" />
            {pct(Math.abs(v))}
          </span>
        )}
        {sub && <span className="text-[11.5px] text-muted">{sub}</span>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );

  return href ? <Link href={href}>{contenido}</Link> : contenido;
}

export function MiniStat({
  label,
  valor,
  tono,
  icon,
  href,
}: {
  label: string;
  valor: string;
  tono?: "brand" | "success" | "warning" | "danger";
  icon?: React.ReactNode;
  href?: string;
}) {
  const color =
    tono === "success" ? "var(--ok)"
    : tono === "warning" ? "var(--warn)"
    : tono === "danger" ? "var(--danger)"
    : "var(--color-brand-600)";

  const inner = (
    <div
      className={cn(
        "card elev-1 flex items-center gap-3 p-3 transition-all duration-200",
        href && "hover:elev-2 hover:border-brand-200"
      )}
    >
      {icon && (
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4"
          style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
        >
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <p className="text-[17px] font-bold leading-none text-fg tabular">{valor}</p>
        <p className="mt-1 truncate text-[11px] text-muted">{label}</p>
      </div>
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function SeccionTitulo({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion?: string;
  accion?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-[13.5px] font-semibold tracking-tight text-fg">{titulo}</h2>
        {descripcion && <p className="mt-0.5 text-[11.5px] text-muted">{descripcion}</p>}
      </div>
      {accion}
    </div>
  );
}
