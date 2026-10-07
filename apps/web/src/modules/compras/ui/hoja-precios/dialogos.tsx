"use client";

import * as React from "react";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  formatearFecha,
} from "@rodatech/ui";
import { Ship, ShoppingCart, TriangleAlert, UserPlus } from "lucide-react";

import { comprarDeLaRonda } from "../../acciones/comparar";
import { datosDeProveedor, listaDeAnalisis, traerAnalisis } from "../../acciones/hoja-precios";
import type { AnalisisParaHoja } from "../../api/hoja-precios";
import type { CompraDeLaHoja, ProveedorHoja } from "../../dominio/hoja-precios";
import { BuscadorProveedor } from "../pedir-precio/anadir";

const dinero = (n: number, moneda = "USD") =>
  `${moneda === "PEN" ? "S/" : "$"} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** «Añadir proveedor»: el buscador de siempre, en un diálogo. */
export function DialogoProveedor({
  yaEstan,
  onAnadir,
}: {
  yaEstan: ReadonlySet<string>;
  onAnadir: (p: ProveedorHoja) => void;
}) {
  const [abierto, setAbierto] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [, empezar] = React.useTransition();

  return (
    <Dialog open={abierto} onOpenChange={(v) => { setAbierto(v); setError(null); }}>
      <Button type="button" variant="outline" onClick={() => setAbierto(true)} className="gap-1.5">
        <UserPlus className="size-4" aria-hidden="true" />
        Añadir proveedor
      </Button>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Añadir proveedor</DialogTitle>
          <DialogDescription>Sale como una columna más de la hoja, para apuntar lo que te diga.</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <BuscadorProveedor
            yaEstan={yaEstan}
            enfocar
            onElegir={(p) =>
              empezar(async () => {
                const r = await datosDeProveedor(p.id);
                if (!r.ok) {
                  setError(r.error);
                  return;
                }
                onAnadir({ ...r.datos, moneda: "USD", tipoCambio: null, incluyeIgv: false });
                setAbierto(false);
              })
            }
          />
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

/**
 * «Traer de un análisis de importación».
 *
 * Luis, 07/10: *«en ese análisis ya sabe lo que quiere comprar»*. Se elige uno
 * y entran sus productos con la CANT. PEDIDO y, si se quiere, su proveedor con
 * el PU LIMA de cada uno como precio.
 */
export function DialogoAnalisis({
  onTraer,
}: {
  onTraer: (a: AnalisisParaHoja, conProveedor: boolean) => void;
}) {
  const [abierto, setAbierto] = React.useState(false);
  const [lista, setLista] = React.useState<
    { id: string; numero: string; fecha: string; proveedor: string; productos: number; estado: string }[] | null
  >(null);
  const [elegido, setElegido] = React.useState<AnalisisParaHoja | null>(null);
  const [conProveedor, setConProveedor] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [cargando, empezar] = React.useTransition();

  function abrir() {
    setAbierto(true);
    setElegido(null);
    setError(null);
    empezar(async () => {
      const r = await listaDeAnalisis();
      if (!r.ok) setError(r.error);
      else setLista(r.datos);
    });
  }

  function elegir(id: string) {
    setError(null);
    empezar(async () => {
      const r = await traerAnalisis(id);
      if (!r.ok) setError(r.error);
      else if (!r.datos) setError("Ese análisis ya no existe.");
      else setElegido(r.datos);
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <Button type="button" variant="outline" onClick={abrir} className="gap-1.5">
        <Ship className="size-4" aria-hidden="true" />
        Traer de un análisis de importación
      </Button>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{elegido ? `Traer ${elegido.numero}` : "Traer de un análisis de importación"}</DialogTitle>
          <DialogDescription>
            {elegido
              ? "Entran sus productos con la cantidad que pediste ahí."
              : "Elige el análisis. Entran sus productos con la cantidad pedida y su precio puesto en Lima."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

          {elegido ? (
            <>
              <ul className="flex max-h-72 flex-col divide-y divide-[var(--border-soft)] overflow-y-auto rounded-md border border-[var(--border)]">
                {elegido.productos.map((p) => (
                  <li key={p.productoId} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="font-mono font-semibold">{p.codigo}</span>{" "}
                      <span className="text-[var(--fg-muted)]">{p.descripcion}</span>
                    </span>
                    <span className="shrink-0 tabular">
                      {p.cantidad} ×{" "}
                      {elegido.precios[p.productoId] !== undefined ? dinero(elegido.precios[p.productoId]!) : "sin precio"}
                    </span>
                  </li>
                ))}
              </ul>
              {elegido.sinCatalogo.length > 0 ? (
                <p className="flex gap-2 rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-2.5 text-sm">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>
                    No entran porque no están en el catálogo: <strong>{elegido.sinCatalogo.join(" · ")}</strong>. Dalos
                    de alta desde el análisis («Editar») y vuelve a traerlo.
                  </span>
                </p>
              ) : null}
              {elegido.proveedor ? (
                <label className="flex items-start gap-2 text-base">
                  <input
                    type="checkbox"
                    checked={conProveedor}
                    onChange={(e) => setConProveedor(e.target.checked)}
                    className="mt-1 size-4"
                  />
                  <span>
                    Traer también a <strong>{elegido.proveedor.nombre}</strong> con el <strong>PU LIMA</strong> de cada
                    uno como su precio
                    <span className="block text-sm text-[var(--fg-muted)]">
                      Es lo que te cuesta puesto en Lima, con el envío y el desaduanaje: así se compara de igual a igual
                      con un proveedor de aquí.
                    </span>
                  </span>
                </label>
              ) : null}
            </>
          ) : lista === null ? (
            <p className="anim-latido py-6 text-center text-sm text-[var(--fg-muted)]">Cargando los análisis…</p>
          ) : lista.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--fg-muted)]">Todavía no hay ningún análisis de importación.</p>
          ) : (
            <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
              {lista.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    disabled={cargando}
                    onClick={() => elegir(a.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-left hover:bg-[var(--surface-2)] disabled:opacity-60"
                  >
                    <span className="min-w-0">
                      <span className="block font-mono text-sm font-semibold">{a.numero}</span>
                      <span className="block truncate text-sm text-[var(--fg-muted)]">{a.proveedor}</span>
                    </span>
                    <span className="shrink-0 text-right text-sm text-[var(--fg-muted)]">
                      {a.productos} {a.productos === 1 ? "producto" : "productos"}
                      <span className="block">
                        {formatearFecha(a.fecha)}
                        {a.estado === "comprado" ? " · ya comprado" : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
        <DialogFooter>
          {elegido ? (
            <>
              <Button type="button" variant="outline" onClick={() => setElegido(null)}>
                Elegir otro
              </Button>
              <Button
                type="button"
                disabled={elegido.productos.length === 0}
                onClick={() => {
                  onTraer(elegido, conProveedor);
                  setAbierto(false);
                }}
              >
                Traer {elegido.productos.length} {elegido.productos.length === 1 ? "producto" : "productos"}
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" onClick={() => setAbierto(false)}>
              Cerrar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * «Pasar a compras»: una compra por proveedor, con lo elegido en la hoja.
 *
 * Es el único paso que compra de verdad, así que se enseña antes qué sale,
 * a quién y por cuánto. Lo demás de la hoja es preguntar.
 */
export function DialogoComprar({
  consultaId,
  compras,
  deshabilitado,
  antes,
  onHecho,
}: {
  consultaId: string | null;
  compras: CompraDeLaHoja[];
  deshabilitado: boolean;
  /** Guardar la hoja antes de comprar; devuelve el id de la consulta o null si falló. */
  antes: () => Promise<string | null>;
  onHecho: (numeros: string[]) => void;
}) {
  const [abierto, setAbierto] = React.useState(false);
  const [afectos, setAfectos] = React.useState<Record<string, boolean>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [enCurso, empezar] = React.useTransition();

  function comprar() {
    setError(null);
    empezar(async () => {
      const id = (await antes()) ?? consultaId;
      if (!id) {
        setError("Primero hay que guardar la hoja.");
        return;
      }
      const r = await comprarDeLaRonda({
        consulta_id: id,
        compras: compras.map((c) => ({
          proveedor_id: c.proveedorId,
          moneda: c.moneda,
          tipo_cambio: c.moneda === "PEN" ? c.tipoCambio : null,
          tipo: c.tipo,
          afecto_igv: afectos[c.proveedorId] ?? c.afectoIgv,
          fecha_estimada: null,
          lineas: c.lineas.map((l) => ({ producto_id: l.productoId, cantidad: l.cantidad, costo_unitario: l.costoUnitario })),
        })),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (r.fallidas.length > 0) {
        setError(`Salieron ${r.compras.length}; fallaron ${r.fallidas.length}: ${r.fallidas[0]?.error}`);
        return;
      }
      setAbierto(false);
      onHecho(r.compras.map((c) => c.numero));
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <Button type="button" disabled={deshabilitado} onClick={() => setAbierto(true)} className="gap-1.5">
        <ShoppingCart className="size-4" aria-hidden="true" />
        Pasar a compras
      </Button>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Pasar a compras</DialogTitle>
          <DialogDescription>
            Sale una compra por proveedor, con lo que le elegiste en la hoja. Después la hoja queda cerrada.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          {compras.map((c) => (
            <section key={c.proveedorId} className="rounded-md border border-[var(--border)] p-3">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="min-w-0 truncate text-base font-semibold" title={c.proveedor}>
                  {c.proveedor}
                </h3>
                <span className="shrink-0 text-base font-semibold tabular">{dinero(c.subtotal, c.moneda)}</span>
              </div>
              <ul className="mt-1 text-sm text-[var(--fg-muted)]">
                {c.lineas.map((l) => (
                  <li key={l.productoId}>
                    {l.cantidad} × <span className="font-mono">{l.codigo}</span> a {dinero(l.costoUnitario, c.moneda)}
                  </li>
                ))}
              </ul>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={afectos[c.proveedorId] ?? c.afectoIgv}
                  onChange={(e) => setAfectos((a) => ({ ...a, [c.proveedorId]: e.target.checked }))}
                />
                Su factura lleva IGV {c.tipo === "importacion" ? "(es del exterior: normalmente no)" : ""}
              </label>
            </section>
          ))}
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setAbierto(false)}>
            Todavía no
          </Button>
          <Button type="button" disabled={enCurso || compras.length === 0} onClick={comprar}>
            {enCurso ? "Registrando…" : `Registrar ${compras.length} ${compras.length === 1 ? "compra" : "compras"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
