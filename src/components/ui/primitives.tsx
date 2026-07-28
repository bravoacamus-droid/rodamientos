import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ Button */

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all duration-150 " +
    "disabled:pointer-events-none disabled:opacity-50 active:scale-[0.985] select-none " +
    "[&_svg]:shrink-0 [&_svg]:size-4",
  {
    variants: {
      variant: {
        primary:
          "bg-brand-600 text-white hover:bg-brand-700 elev-1 hover:elev-2",
        accent:
          "bg-accent-400 text-steel-950 hover:bg-accent-300 elev-1 hover:elev-2 font-semibold",
        outline:
          "border bg-[var(--surface)] text-fg hover:bg-[var(--surface-2)] hover:border-brand-300",
        ghost: "text-muted hover:bg-[var(--surface-2)] hover:text-fg",
        subtle: "bg-[var(--surface-2)] text-fg border hover:border-brand-300",
        danger: "bg-[var(--danger)] text-white hover:brightness-95 elev-1",
        success: "bg-[var(--ok)] text-white hover:brightness-95 elev-1",
        link: "text-brand-600 underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        xs: "h-7 rounded-sm px-2 text-[11px] [&_svg]:size-3.5",
        sm: "h-8 rounded-md px-3 text-xs",
        md: "h-9.5 rounded-md px-4 text-sm",
        lg: "h-11 rounded-lg px-6 text-sm",
        icon: "h-9 w-9 rounded-md",
        "icon-sm": "h-7.5 w-7.5 rounded-sm [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  )
);
Button.displayName = "Button";

/* -------------------------------------------------------------------- Card */

export function Card({
  className,
  hover,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div
      className={cn(
        "card elev-1",
        hover && "transition-all duration-200 hover:elev-2 hover:border-brand-200",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-start justify-between gap-4 px-5 pt-4 pb-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-[13px] font-semibold tracking-tight text-fg", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-xs text-muted mt-0.5", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center gap-3 border-t px-5 py-3 bg-[var(--surface-2)] rounded-b-[var(--radius-lg)]", className)}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------- Badge */

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap border",
  {
    variants: {
      tone: {
        neutral: "bg-[var(--surface-2)] text-muted border-[var(--border)]",
        brand: "bg-brand-50 text-brand-700 border-brand-100",
        accent: "bg-accent-50 text-accent-800 border-accent-200",
        success: "text-[var(--ok)] border-transparent",
        warning: "text-[var(--warn)] border-transparent",
        danger: "text-[var(--danger)] border-transparent",
        info: "text-[var(--info)] border-transparent",
        solid: "bg-brand-600 text-white border-transparent",
      },
      size: {
        xs: "px-1.5 py-0.5 text-[10px]",
        sm: "px-2 py-0.5 text-[11px]",
        md: "px-2.5 py-1 text-xs",
      },
    },
    defaultVariants: { tone: "neutral", size: "sm" },
  }
);

export function Badge({
  className,
  tone,
  size,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  const bg =
    tone === "success" ? "var(--ok-bg)"
    : tone === "warning" ? "var(--warn-bg)"
    : tone === "danger" ? "var(--danger-bg)"
    : tone === "info" ? "var(--info-bg)"
    : undefined;
  return (
    <span
      className={cn(badgeVariants({ tone, size }), className)}
      style={bg ? { backgroundColor: bg } : undefined}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------ Fields */

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("block text-[11px] font-semibold uppercase tracking-wide text-subtle mb-1.5", className)}
      {...props}
    />
  );
}

const fieldBase =
  "w-full rounded-md border bg-[var(--surface)] text-fg placeholder:text-subtle " +
  "transition-colors duration-150 focus:border-brand-500 focus:outline-none focus:ring-2 " +
  "focus:ring-brand-600/15 disabled:opacity-60 disabled:bg-[var(--surface-2)]";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(fieldBase, "h-9.5 px-3 text-sm", className)} {...props} />
  )
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldBase, "px-3 py-2 text-sm resize-y min-h-[76px]", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      fieldBase,
      "h-9.5 pl-3 pr-8 text-sm appearance-none bg-no-repeat cursor-pointer",
      className
    )}
    style={{
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%238894a2' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      backgroundPosition: "right 0.6rem center",
      backgroundSize: "1rem",
    }}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {label && <Label>{label}</Label>}
      {children}
      {hint && !error && <p className="mt-1 text-[11px] text-subtle">{hint}</p>}
      {error && <p className="mt-1 text-[11px] text-[var(--danger)]">{error}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------- Table */

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="scroll-x -mx-px">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-[var(--surface-2)] [&_th]:backdrop-blur",
        "[&_th]:border-b [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-left [&_th]:text-[11px]",
        "[&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-subtle [&_th]:whitespace-nowrap",
        className
      )}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      className={cn(
        "[&_tr]:border-b [&_tr]:border-[var(--border-soft)] [&_tr:last-child]:border-0",
        "[&_tr]:transition-colors [&_tr:hover]:bg-[var(--surface-2)]",
        "[&_td]:px-3 [&_td]:py-2.5 [&_td]:align-middle",
        className
      )}
      {...props}
    />
  );
}

/* ---------------------------------------------------------------- Skeleton */

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton", className)} {...props} />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3" style={{ width: `${100 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="card elev-1 overflow-hidden">
      <div className="flex gap-3 border-b bg-[var(--surface-2)] px-3 py-2.5">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-[var(--border-soft)]">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-3 px-3 py-3">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton
                key={c}
                className="h-3 flex-1"
                style={{ opacity: 1 - r * 0.06, maxWidth: c === 0 ? "22%" : undefined }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonCards({ count = 4, height = 96 }: { count?: number; height?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card elev-1 p-4" style={{ height }}>
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="mt-3 h-6 w-32" />
          <Skeleton className="mt-3 h-2 w-20" />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- Otros */

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-[var(--border)]", className)} />;
}

export function EmptyState({
  icon,
  titulo,
  descripcion,
  accion,
  className,
}: {
  icon?: React.ReactNode;
  titulo: string;
  descripcion?: string;
  accion?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      {icon && (
        <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-[var(--surface-2)] text-subtle [&_svg]:size-6">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-fg">{titulo}</p>
      {descripcion && <p className="mt-1 max-w-sm text-xs text-muted">{descripcion}</p>}
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  );
}

export function Progress({
  value,
  max = 100,
  tone = "brand",
  className,
}: {
  value: number;
  max?: number;
  tone?: "brand" | "success" | "warning" | "danger" | "accent";
  className?: string;
}) {
  const p = Math.min(Math.max((value / (max || 1)) * 100, 0), 100);
  const color =
    tone === "success" ? "var(--ok)"
    : tone === "warning" ? "var(--warn)"
    : tone === "danger" ? "var(--danger)"
    : tone === "accent" ? "var(--color-accent-400)"
    : "var(--color-brand-600)";
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]", className)}>
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${p}%`, backgroundColor: color }}
      />
    </div>
  );
}

export function Avatar({
  nombre,
  size = 32,
  className,
}: {
  nombre?: string | null;
  size?: number;
  className?: string;
}) {
  const txt = (nombre ?? "··")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-brand-600 font-semibold text-white",
        className
      )}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {txt}
    </span>
  );
}

export function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap
                   rounded-md bg-steel-950 px-2 py-1 text-[11px] font-medium text-white opacity-0 elev-2
                   transition-opacity duration-150 group-hover/tt:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}
