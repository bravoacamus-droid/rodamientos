"use client";

import * as React from "react";
import { FileArchive, FolderTree } from "lucide-react";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
} from "@rodatech/ui";

import { FiltroCliente } from "@/componentes/filtro-cliente";

/**
 * Descargar los comprobantes de retención (02/11).
 *
 * Moisés: *«para descargar los comprobantes de retención tiene que ser desde
 * cobranza, porque ahí es donde suben los documentos, y que funcione con los
 * filtros de qué fecha a qué fecha, por carpeta, por clientes, así
 * profesional»*. Usa el ZIP de `/facturacion/cr`, que ya los separaba por
 * cliente, y le pide el orden de las carpetas. Si en el periodo no hay
 * ninguno, lo dice aquí en vez de abrir una página con un texto.
 */

type Agrupar = "cliente" | "mes" | "cliente-mes";

const AGRUPAR: { valor: Agrupar; titulo: string; ejemplo: string }[] = [
  { valor: "cliente", titulo: "Una carpeta por cliente", ejemplo: "OVOSUR S.A. / F002-553 - CR E001-12.pdf" },
  { valor: "mes", titulo: "Una carpeta por mes", ejemplo: "2026-10 Octubre / F002-553 - CR E001-12 - OVOSUR.pdf" },
  { valor: "cliente-mes", titulo: "Cliente, y dentro cada mes", ejemplo: "OVOSUR S.A. / 2026-10 Octubre / F002-553…" },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function DescargarCr({ hoy }: { hoy: string }) {
  const [abierto, setAbierto] = React.useState(false);
  const inicioMes = `${hoy.slice(0, 8)}01`;
  const [desde, setDesde] = React.useState(inicioMes);
  const [hasta, setHasta] = React.useState(hoy);
  const [cliente, setCliente] = React.useState<{ id: string; nombre: string } | null>(null);
  const [agrupar, setAgrupar] = React.useState<Agrupar>("cliente");
  const [aviso, setAviso] = React.useState<string | null>(null);
  const [bajando, iniciar] = React.useTransition();

  const periodo = (d: string, h: string) => {
    setDesde(d);
    setHasta(h);
    setAviso(null);
  };
  const [a, m] = [Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7))];
  const mesPasado = new Date(Date.UTC(a, m - 2, 1));
  const finMesPasado = new Date(Date.UTC(a, m - 1, 0));
  const ATAJOS = [
    { etiqueta: "Este mes", d: inicioMes, h: hoy },
    { etiqueta: "Mes pasado", d: iso(mesPasado), h: iso(finMesPasado) },
    { etiqueta: "Este año", d: `${a}-01-01`, h: hoy },
    { etiqueta: "Todo", d: "", h: "" },
  ];

  const descargar = () =>
    iniciar(async () => {
      setAviso(null);
      const params = new URLSearchParams({ agrupar });
      if (desde) params.set("desde", desde);
      if (hasta) params.set("hasta", hasta);
      if (cliente) params.set("cliente", cliente.id);
      const r = await fetch(`/facturacion/cr?${params.toString()}`);
      if (!r.ok) {
        setAviso(
          r.status === 404
            ? "No hay comprobantes de retención subidos en ese periodo. Prueba con otras fechas o con «Todo»."
            : `No se pudo armar el ZIP: ${await r.text()}`,
        );
        return;
      }
      const blob = await r.blob();
      const enlace = document.createElement("a");
      enlace.href = URL.createObjectURL(blob);
      enlace.download = `Comprobantes de retencion ${[desde, hasta].filter(Boolean).join(" a ") || "todos"}${cliente ? ` - ${cliente.nombre}` : ""}.zip`;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      URL.revokeObjectURL(enlace.href);
      setAbierto(false);
    });

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        if (!v) setAviso(null);
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex h-11 items-center gap-2 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-base font-semibold shadow-sm hover:bg-[var(--surface-2)]"
        >
          <FileArchive className="size-5 shrink-0" aria-hidden="true" />
          Descargar comprobantes de retención
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Descargar comprobantes de retención</DialogTitle>
          <DialogDescription>
            Un ZIP con los PDF ordenados en carpetas y un resumen para Excel. Se filtra por la fecha de la factura.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Periodo</span>
            <div className="flex flex-wrap gap-2">
              {ATAJOS.map((x) => {
                const activo = desde === x.d && hasta === x.h;
                return (
                  <button
                    key={x.etiqueta}
                    type="button"
                    onClick={() => periodo(x.d, x.h)}
                    className={`h-9 rounded-md border px-3 text-sm font-medium ${activo ? "border-brand-600 bg-brand-600 text-white" : "border-[var(--border-strong)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"}`}
                  >
                    {x.etiqueta}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-sm text-[var(--fg-muted)]">Desde</span>
                <Input type="date" value={desde} onChange={(e) => periodo(e.target.value, hasta)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-[var(--fg-muted)]">Hasta</span>
                <Input type="date" value={hasta} onChange={(e) => periodo(desde, e.target.value)} />
              </label>
            </div>
          </div>

          <FiltroCliente
            valor={cliente?.id ?? null}
            nombre={cliente?.nombre ?? null}
            onCambiar={(id, c) => {
              setCliente(id && c ? { id, nombre: c.razon_social } : null);
              setAviso(null);
            }}
          />
          <span className="-mt-3 text-sm text-[var(--fg-muted)]">Vacío: todos los clientes.</span>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 flex items-center gap-1.5 text-sm font-medium">
              <FolderTree className="size-4 text-brand-600" aria-hidden="true" />
              Cómo ordenar las carpetas
            </legend>
            {AGRUPAR.map((o) => (
              <label
                key={o.valor}
                className={`flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5 ${agrupar === o.valor ? "border-brand-600 bg-[var(--surface-2)]" : "border-[var(--border)]"}`}
              >
                <input
                  type="radio"
                  name="agrupar"
                  className="mt-0.5 size-4"
                  checked={agrupar === o.valor}
                  onChange={() => setAgrupar(o.valor)}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">{o.titulo}</span>
                  <span className="truncate text-sm text-[var(--fg-muted)]">{o.ejemplo}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {aviso ? (
            <p role="alert" className="rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-2.5 text-sm">
              {aviso}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setAbierto(false)} disabled={bajando}>
            Cancelar
          </Button>
          <Button type="button" onClick={descargar} disabled={bajando}>
            <FileArchive className="size-4" aria-hidden="true" />
            {bajando ? "Armando el ZIP…" : "Descargar ZIP"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
