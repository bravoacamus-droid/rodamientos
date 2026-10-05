"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, SelectNativo, toast } from "@rodatech/ui";
import { Eye, FileUp, Trash2 } from "lucide-react";

import {
  enlaceDocumentoCompra,
  quitarDocumentoCompra,
  subirDocumentoCompra,
} from "../acciones/adjuntos";

export interface DocumentoCompra {
  id: string;
  tipo: "proforma" | "factura" | "otro";
  nombre: string;
  creado_en: string;
}

const ETIQUETA: Record<DocumentoCompra["tipo"], string> = {
  proforma: "Proforma",
  factura: "Factura",
  otro: "Otro",
};

/**
 * Los documentos de la compra: la proforma confirmada, la factura… (099, §AQ).
 *
 * Willy, 01/10: *«ese documento tiene que estar registrado […] para cualquier
 * cosa que se le pierda»*. Un botón grande para subir, y cada documento con
 * «Ver» y quitar, a la vista.
 */
export function DocumentosCompra({
  compraId,
  documentos,
  puedeTocar,
}: {
  compraId: string;
  documentos: DocumentoCompra[];
  puedeTocar: boolean;
}) {
  const router = useRouter();
  const [tipo, setTipo] = React.useState<DocumentoCompra["tipo"]>("proforma");
  const [ocupado, empezar] = React.useTransition();
  const input = React.useRef<HTMLInputElement>(null);

  const subir = (archivo: File) => {
    empezar(async () => {
      const fd = new FormData();
      fd.set("compra_id", compraId);
      fd.set("tipo", tipo);
      fd.set("archivo", archivo);
      const r = await subirDocumentoCompra(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`${ETIQUETA[tipo]} guardada.`);
      router.refresh();
    });
  };

  const ver = (id: string) => {
    // La ventana se abre YA, en el clic: si se abriera después de esperar al
    // servidor, el navegador la tomaría por un anuncio y la bloquearía.
    const ventana = window.open("", "_blank");
    void enlaceDocumentoCompra(id).then((r) => {
      if (r.ok && ventana) ventana.location.href = r.url;
      else {
        ventana?.close();
        toast.error(r.ok ? "No se pudo abrir." : r.error);
      }
    });
  };

  const quitar = (d: DocumentoCompra) => {
    empezar(async () => {
      const r = await quitarDocumentoCompra(d.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`${d.nombre} quitado.`);
      router.refresh();
    });
  };

  return (
    <section className="card p-4">
      <h2 className="mb-1 text-sm font-semibold">Documentos</h2>
      <p className="mb-3 text-sm text-[var(--fg-muted)]">
        La proforma confirmada, la factura, la guía aérea… en PDF o foto.
      </p>

      {documentos.length === 0 ? (
        <p className="mb-3 text-sm text-[var(--fg-subtle)]">Todavía no hay ningún documento.</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-2">
          {documentos.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border-soft)] p-2 text-sm">
              <span className="min-w-0">
                <span className="font-medium">{ETIQUETA[d.tipo]}</span>
                <span className="block truncate text-[var(--fg-muted)]">{d.nombre}</span>
              </span>
              <span className="flex shrink-0 gap-2">
                <Button type="button" variant="outline" size="sm" className="text-sm" onClick={() => ver(d.id)}>
                  <Eye className="size-4" aria-hidden />
                  Ver
                </Button>
                {puedeTocar ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-sm"
                    disabled={ocupado}
                    onClick={() => quitar(d)}
                    aria-label={`Quitar ${d.nombre}`}
                    title={`Quitar ${d.nombre}`}
                  >
                    {/* Con su palabra, al lado de «Ver» (revisión por módulos
                        del 02/10). */}
                    <Trash2 className="size-4" aria-hidden />
                    Quitar
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      {puedeTocar ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Qué es</span>
            <SelectNativo value={tipo} onChange={(e) => setTipo(e.target.value as DocumentoCompra["tipo"])}>
              <option value="proforma">Proforma</option>
              <option value="factura">Factura</option>
              <option value="otro">Otro</option>
            </SelectNativo>
          </label>
          <input
            ref={input}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) subir(f);
              e.target.value = "";
            }}
          />
          <Button type="button" onClick={() => input.current?.click()} disabled={ocupado}>
            <FileUp className="size-4" aria-hidden />
            {ocupado ? "Subiendo…" : "Subir documento"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
