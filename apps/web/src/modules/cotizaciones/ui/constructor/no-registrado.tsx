"use client";

import * as React from "react";
import { PackagePlus } from "lucide-react";
import {
  Button,
  Combobox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  SelectNativo,
  Textarea,
} from "@rodatech/ui";

import { catalogosParaAlta } from "@/modules/productos/acciones/alta-rapida";

import { crearNoRegistrado } from "../../acciones/no-registrado";
import type { ProductoParaCotizar } from "../../dominio/constructor";

/**
 * «Producto no registrado», arriba a la derecha de «Productos» (Luis, 09/10).
 *
 * *«A veces le piden un producto que no vende o no es habitual, pero lo
 * consigue; solo necesita poner descripción larga»*. Lo único obligatorio es
 * la descripción; el código, si no se escribe, lo pone el sistema. Entra al
 * catálogo como OTROS / POR CLASIFICAR para que pueda llevar guía, factura y
 * orden de compra (ver `crearNoRegistrado`).
 */
export function NoRegistrado({ onAgregar }: { onAgregar: (p: ProductoParaCotizar, cantidad: number) => void }) {
  const [abierto, setAbierto] = React.useState(false);
  const [descripcion, setDescripcion] = React.useState("");
  const [codigo, setCodigo] = React.useState("");
  const [cantidad, setCantidad] = React.useState("1");
  const [precio, setPrecio] = React.useState("");
  const [unidad, setUnidad] = React.useState("NIU");
  const [marcaId, setMarcaId] = React.useState("");
  const [catalogos, setCatalogos] = React.useState<{
    marcas: { id: string; nombre: string }[];
    unidades: { codigo: string; nombre: string }[];
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, empezar] = React.useTransition();

  const abrir = () => {
    setDescripcion("");
    setCodigo("");
    setCantidad("1");
    setPrecio("");
    setMarcaId("");
    setError(null);
    setAbierto(true);
    if (!catalogos) {
      void catalogosParaAlta().then((r) => {
        if (r.ok) setCatalogos({ marcas: r.datos.marcas, unidades: r.datos.unidades });
      });
    }
  };

  const agregar = () =>
    empezar(async () => {
      setError(null);
      const n = Number(cantidad.replace(",", "."));
      if (!(n > 0)) {
        setError("La cantidad tiene que ser mayor que cero.");
        return;
      }
      const r = await crearNoRegistrado({
        descripcion,
        codigo,
        marcaId: marcaId || null,
        unidad,
        precioVenta: Number(precio.replace(",", ".")) || 0,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onAgregar(r.producto, n);
      setAbierto(false);
    });

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <Button type="button" variant="outline" onClick={abrir} className="gap-1.5">
        <PackagePlus className="size-4" aria-hidden="true" />
        Producto no registrado
      </Button>
      <DialogContent ancho="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Producto no registrado</DialogTitle>
          <DialogDescription>
            Para lo que no vendes siempre pero puedes conseguir. Basta con la descripción; queda en el catálogo como
            «Otros — por clasificar».
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Descripción *</span>
            <Textarea
              value={descripcion}
              maxLength={500}
              rows={4}
              autoFocus
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Todo lo que el cliente necesita leer: medidas, material, aplicación…"
            />
            <span className="self-end text-sm text-[var(--fg-muted)]">{descripcion.length} / 500</span>
          </label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Cantidad</span>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                className="tabular text-right"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Unidad</span>
              <SelectNativo value={unidad} onChange={(e) => setUnidad(e.target.value)}>
                {(catalogos?.unidades ?? [{ codigo: "NIU", nombre: "Unidad" }]).map((u) => (
                  <option key={u.codigo} value={u.codigo}>
                    {u.nombre}
                  </option>
                ))}
              </SelectNativo>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Precio de venta</span>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
                placeholder="0.00"
                className="tabular text-right"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Código</span>
              <Input value={codigo} maxLength={60} onChange={(e) => setCodigo(e.target.value)} placeholder="Opcional" />
            </label>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="no-registrado-marca" className="text-sm font-medium">
              Marca
            </label>
            <Combobox
              id="no-registrado-marca"
              opciones={(catalogos?.marcas ?? []).map((m) => ({ valor: m.id, etiqueta: m.nombre }))}
              valor={marcaId || null}
              onCambio={(v) => setMarcaId(v ?? "")}
              placeholder="Sin marca"
              placeholderBusqueda="Busca la marca…"
            />
          </div>
          <p className="text-sm text-[var(--fg-muted)]">
            Sin código, el sistema le pone uno. El precio de compra lo pones después con «Analizar».
          </p>
          {error ? <p className="text-sm font-medium text-[var(--danger)]">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={agregar} disabled={guardando || descripcion.trim().length < 3}>
            {guardando ? "Agregando…" : "Agregar a la cotización"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
