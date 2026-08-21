import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { Logo, FranjaMarca } from "@/components/marca/logo";
import { Skeleton } from "@/components/ui/primitives";
import {
  CircleDot, Package, ArrowLeftRight, Ship, Wallet, LineChart,
} from "lucide-react";

export const metadata: Metadata = { title: "Ingresar" };

const CAPACIDADES = [
  { icon: ArrowLeftRight, titulo: "Cross-reference de marcas", texto: "SKF ↔ FAG ↔ NSK ↔ NTN con sugerencia de alternativas en stock." },
  { icon: CircleDot, titulo: "Cotización inteligente", texto: "Precio vigente, historial por cliente y margen en tiempo real." },
  { icon: Package, titulo: "Kardex con trazabilidad", texto: "Qué se compró, a qué costo, de quién, cuándo entró y a quién se vendió." },
  { icon: Ship, titulo: "Landed cost de importación", texto: "Prorrateo de flete, seguro, aranceles, agente, almacenaje y transporte." },
  { icon: Wallet, titulo: "Crédito y cobranzas", texto: "Líneas por cliente, aging 30/40 días y estado de cuenta en PDF." },
  { icon: LineChart, titulo: "Tableros de proyección", texto: "Ingresos, márgenes, rotación y necesidades de reposición." },
];

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_minmax(420px,44%)]">
      {/* ------------------------------------------------------ Panel marca */}
      <section className="relative hidden overflow-hidden bg-brand-900 lg:block">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)",
            backgroundSize: "26px 26px",
          }}
          aria-hidden
        />
        <div
          className="absolute -right-40 -top-40 size-[34rem] rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle, #F2E307 0%, transparent 65%)" }}
          aria-hidden
        />
        <div
          className="absolute -bottom-52 -left-24 size-[30rem] rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle, #468cbe 0%, transparent 65%)" }}
          aria-hidden
        />

        <div className="relative flex h-full flex-col justify-between p-10 xl:p-14">
          <div className="inline-flex w-fit items-center rounded-xl bg-white px-4 py-3 elev-2">
            <Logo height={42} priority />
          </div>

          <div className="max-w-xl">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent-400/40 bg-accent-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-accent-300">
              ERP Comercial
            </p>
            <h1 className="text-4xl font-bold leading-[1.1] tracking-tight text-white xl:text-5xl">
              Rodamientos, repuestos y{" "}
              <span className="text-accent-400">mantenimiento industrial</span> bajo control.
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-brand-100/80">
              Plataforma a medida para la operación de Inversiones Rodatech: catálogo con
              equivalencias entre marcas, cotización con historial, inventario auditable,
              costo puesto en almacén y cartera por cobrar en un solo lugar.
            </p>

            <ul className="mt-8 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {CAPACIDADES.map(({ icon: Icon, titulo, texto }) => (
                <li key={titulo} className="flex gap-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-accent-400 ring-1 ring-inset ring-white/10">
                    <Icon className="size-4" />
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold text-white">{titulo}</p>
                    <p className="mt-0.5 text-[11.5px] leading-snug text-brand-100/60">{texto}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-end justify-between gap-6 border-t border-white/10 pt-6">
            <div>
              <p className="text-[13px] font-semibold text-white">
                Su proveedor de soluciones en Rodamientos y más…
              </p>
              <p className="mt-1 text-[11px] text-brand-100/60">
                Jr. Los Huertos N° 2232, Lima 36 · 01 608 5712 · ventas@rodatechperu.com
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-[10px] font-semibold uppercase tracking-wider text-brand-100/40">
              {["SKF", "FAG", "NSK", "NTN", "TIMKEN", "THK", "OPTIBELT", "PARKER"].map((m) => (
                <span key={m}>{m}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ Formulario */}
      <section className="flex flex-col bg-[var(--surface)]">
        <FranjaMarca />
        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-sm">
            <div className="mb-8 lg:hidden">
              <Logo height={40} priority />
            </div>
            <Suspense fallback={<Skeleton className="h-[420px] w-full rounded-lg" />}>
              <LoginForm />
            </Suspense>
          </div>
        </div>
        <footer className="border-t px-6 py-4 text-center text-[11px] text-subtle sm:px-10">
          Rodatech ERP · desarrollado a medida por{" "}
          <a
            href="https://www.promptivedev.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand-600 hover:underline"
          >
            Promptive
          </a>
        </footer>
      </section>
    </main>
  );
}
