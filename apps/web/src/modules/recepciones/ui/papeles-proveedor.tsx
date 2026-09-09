"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@rodatech/ui";

import {
  enlaceAlPapel,
  quitarPapelDelProveedor,
  subirPapelDelProveedor,
} from "../acciones/adjuntos";

/**
 * La guía y la factura del proveedor, escaneadas.
 *
 * Willy, 07/09 (29:34): *«¿quiere subir su guía y su factura también?»* —
 * *«claro»*. Y cómo lo pidió: *«dos botones: por guía y su factura»*.
 *
 * Son exactamente dos botones y no un selector con un desplegable. Es lo que
 * él dijo y además es menos: elegir «guía» en una lista y luego buscar el
 * archivo son dos decisiones donde puede haber una.
 *
 * ---------------------------------------------------------------------------
 * Se abre con enlace firmado, no con una URL fija
 * ---------------------------------------------------------------------------
 * El bucket es privado: una factura de compra lleva el RUC del proveedor y los
 * precios a los que compra Rodatech. El enlace se pide al abrir y dura diez
 * minutos, lo justo para mirarlo o descargarlo.
 */

export interface PapelDelProveedor {
  id: string;
  tipo: "guia" | "factura" | "pago" | "otro";
  ruta: string;
  nombre: string;
  tamanoBytes: number | null;
  creadoEn: string;
}

const ETIQUETA: Record<PapelDelProveedor["tipo"], string> = {
  guia: "Guía",
  factura: "Factura",
  pago: "Pago",
  otro: "Otro",
};

/** Los tipos que acepta el bucket, dichos al `<input>` para que filtre él. */
type Papel = PapelDelProveedor["tipo"];

const TONO: Record<Papel, "success" | "info" | "neutral"> = {
  guia: "neutral",
  factura: "info",
  pago: "success",
  otro: "neutral",
};

const ACEPTA = "application/pdf,image/jpeg,image/png,image/webp,image/heic";

function pesa(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return "";
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

export function PapelesDelProveedor({
  recepcionId,
  papeles,
  puedeEditar,
}: {
  recepcionId: string;
  papeles: PapelDelProveedor[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [subiendo, setSubiendo] = React.useState<string | null>(null);
  const [enCurso, empezar] = React.useTransition();

  /*
    Un `<input type="file">` oculto por cada botón.

    Con uno solo compartido habría que recordar para qué se abrió, y ese
    «recordar» es justo donde se cuela el fallo de subir la factura marcada
    como guía.
  */
  const refGuia = React.useRef<HTMLInputElement>(null);
  const refFactura = React.useRef<HTMLInputElement>(null);
  const refPago = React.useRef<HTMLInputElement>(null);

  function subir(tipo: Papel, archivo: File | null | undefined) {
    if (!archivo) return;
    setError(null);
    setSubiendo(tipo);
    empezar(async () => {
      const fd = new FormData();
      fd.set("recepcion_id", recepcionId);
      fd.set("tipo", tipo);
      fd.set("archivo", archivo);
      const r = await subirPapelDelProveedor(fd);
      setSubiendo(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  function abrir(ruta: string) {
    setError(null);
    empezar(async () => {
      const r = await enlaceAlPapel(ruta);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // Pestaña nueva: si abriera en esta, volver perdería la recepción.
      window.open(r.url, "_blank", "noopener,noreferrer");
    });
  }

  function quitar(id: string) {
    setError(null);
    empezar(async () => {
      const r = await quitarPapelDelProveedor(id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="card flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Papeles del proveedor</h2>
          <p className="text-sm text-[var(--fg-muted)]">
            La guía y la factura con las que te atendieron, y el voucher
            cuando se le pague. PDF o foto, y todos opcionales.
          </p>
        </div>

        {puedeEditar ? (
          <div className="flex items-center gap-2">
            <input
              ref={refGuia}
              type="file"
              accept={ACEPTA}
              className="hidden"
              onChange={(e) => {
                subir("guia", e.target.files?.[0]);
                // Se limpia para que subir DOS VECES el mismo archivo vuelva a
                // disparar el `change`: sin esto, la segunda no hace nada y
                // parece que la pantalla se colgó.
                e.target.value = "";
              }}
            />
            <input
              ref={refFactura}
              type="file"
              accept={ACEPTA}
              className="hidden"
              onChange={(e) => {
                subir("factura", e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <input
              ref={refPago}
              type="file"
              accept={ACEPTA}
              className="hidden"
              onChange={(e) => {
                subir("pago", e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={enCurso}
              onClick={() => refGuia.current?.click()}
            >
              {subiendo === "guia" ? "Subiendo…" : "Subir guía"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={enCurso}
              onClick={() => refFactura.current?.click()}
            >
              {subiendo === "factura" ? "Subiendo…" : "Subir factura"}
            </Button>
            {/*
              El tercero, y el que no trae el proveedor.

              Luis, 09/09: *«no tengo dónde subir… la guía, la factura que
              me hizo el proveedor y el pago»*. La guía y la factura llegan
              con la mercadería; el voucher sale después, a veces semanas
              después, y es el papel que cierra la operación por el otro
              lado. Por eso tiene tipo propio y no se guarda como «otro»:
              guardado ahí no se encuentra el día que el proveedor dice que
              no le pagaron.
            */}
            <Button
              type="button"
              variant="outline"
              disabled={enCurso}
              onClick={() => refPago.current?.click()}
            >
              {subiendo === "pago" ? "Subiendo…" : "Subir pago"}
            </Button>
          </div>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm"
        >
          {error}
        </p>
      ) : null}

      {papeles.length === 0 ? (
        <p className="rounded-md bg-[var(--surface-2)] p-3 text-sm text-[var(--fg-muted)]">
          Todavía no hay ningún papel. Sube la guía y la factura con las que
          llegó la mercadería —es lo que se busca si después no cuadra un
          precio— y el voucher cuando le pagues.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
          {papeles.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 py-2.5">
              {/* La factura es el papel del dinero que se debe y el pago el
                  de que ya se pagó: los dos en color, y distintos, porque
                  la pregunta de la lista es «¿está pagada esta?». */}
              <Badge tone={TONO[p.tipo]} size="xs">
                {ETIQUETA[p.tipo]}
              </Badge>
              <span className="min-w-0 flex-1 truncate text-sm" title={p.nombre}>
                {p.nombre}
              </span>
              <span className="text-sm text-[var(--fg-subtle)]">
                {pesa(p.tamanoBytes)}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-sm"
                disabled={enCurso}
                onClick={() => abrir(p.ruta)}
              >
                Ver
              </Button>
              {puedeEditar ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-sm"
                  disabled={enCurso}
                  onClick={() => quitar(p.id)}
                >
                  Quitar
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
