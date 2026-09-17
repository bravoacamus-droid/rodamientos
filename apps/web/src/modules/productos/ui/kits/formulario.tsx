"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  Button,
  Campo,
  Input,
  Table,
  TableContenedor,
  TBody,
  THead,
  toast,
} from "@rodatech/ui";

import { BuscadorLineas } from "@/modules/cotizaciones/ui/constructor/buscador";
import type { ProductoParaCotizar } from "@/modules/cotizaciones/dominio/constructor";

import { guardarKit } from "../../acciones/kits";
import type { KitDetalle } from "../../api/kits";

const dolar = (n: number) =>
  n.toLocaleString("es-PE", { style: "currency", currency: "USD" });

interface Linea {
  producto_id: string;
  codigo: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  stock: number;
  precioVenta: number;
  costo: number;
}

/**
 * Armar un kit, que es literalmente hacer una cotización que se guarda.
 *
 * Luis, 17/09: *«un kit es poner varios productos como haciendo una cotización;
 * se le pone un código único, una descripción y un precio general, o sea la
 * suma de todos los productos»*.
 *
 * Por eso reutiliza el MISMO buscador del constructor de cotizaciones y no uno
 * propio: es el gesto que Willy ya tiene aprendido —teclear el código y dar a
 * Enter— y el que sabe crear un producto que no existe sin salir de aquí.
 */
export function FormularioKit({ kit }: { kit: KitDetalle | null }) {
  const router = useRouter();
  const [guardando, empezar] = React.useTransition();

  const [codigo, setCodigo] = React.useState(kit?.codigo ?? "");
  const [descripcion, setDescripcion] = React.useState(kit?.descripcion ?? "");
  const [lineas, setLineas] = React.useState<Linea[]>(
    (kit?.componentes ?? []).map((c) => ({
      producto_id: c.producto_id,
      codigo: c.codigo,
      descripcion: c.descripcion,
      unidad: c.unidad,
      cantidad: c.cantidad,
      stock: c.stock,
      precioVenta: c.precioVenta,
      costo: c.costo,
    })),
  );

  const suma = lineas.reduce((t, l) => t + l.precioVenta * l.cantidad, 0);
  const sumaCosto = lineas.reduce((t, l) => t + l.costo * l.cantidad, 0);

  /*
    El precio se PROPONE y se puede cambiar.

    La suma es el punto de partida —Willy: *«hay que ingresar el precio de cada
    uno para que te calcule el precio final»*— pero un kit se cobra redondeado,
    o con un descuento por llevarlo junto. Si el precio fuera la suma y nada
    más, habría que retocar los productos para poder cobrar 400 en vez de
    415.04, y eso cambiaría el precio de cada pieza suelta.
  */
  const [precio, setPrecio] = React.useState(
    kit ? String(kit.precioVenta) : "",
  );
  /** Si nadie lo tocó, sigue lo que digan los componentes. */
  const [precioAMano, setPrecioAMano] = React.useState(Boolean(kit));

  React.useEffect(() => {
    if (!precioAMano) setPrecio(suma > 0 ? suma.toFixed(2) : "");
  }, [suma, precioAMano]);

  /** Cuántos kits se pueden armar: el componente que menos alcanza manda. */
  const armable =
    lineas.length === 0
      ? 0
      : Math.min(
          ...lineas.map((l) => (l.cantidad > 0 ? Math.floor(l.stock / l.cantidad) : 0)),
        );

  function agregar(p: ProductoParaCotizar) {
    setLineas((ls) => {
      const ya = ls.find((l) => l.producto_id === p.id);
      // Repetir un producto suma cantidad en vez de crear otra línea: la clave
      // de `kit_componentes` es (kit, producto) y dos filas del mismo código
      // en una lista se leen como un error de quien la escribió.
      if (ya) {
        return ls.map((l) =>
          l.producto_id === p.id ? { ...l, cantidad: l.cantidad + 1 } : l,
        );
      }
      return [
        ...ls,
        {
          producto_id: p.id,
          codigo: p.codigo,
          descripcion: p.descripcion,
          unidad: p.unidad ?? "NIU",
          cantidad: 1,
          stock: p.stock ?? 0,
          precioVenta: p.precio_venta,
          costo: p.costo_promedio || p.ultimo_costo || 0,
        },
      ];
    });
  }

  const listo =
    codigo.trim().length > 0 && descripcion.trim().length >= 3 && lineas.length > 0;

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!listo) return;

    empezar(async () => {
      const r = await guardarKit({
        id: kit?.id,
        codigo: codigo.trim(),
        descripcion: descripcion.trim(),
        precio_venta: Number(precio) || 0,
        componentes: lineas.map((l) => ({
          producto_id: l.producto_id,
          cantidad: l.cantidad,
        })),
      });

      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`${r.codigo} guardado.`);
      router.push("/productos/kits");
      router.refresh();
    });
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5 p-6">
      <header>
        <h1 className="text-xl font-semibold">
          {kit ? `Editar ${kit.codigo}` : "Nuevo kit"}
        </h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Junta varios productos bajo un código y un precio. El cliente lo pide
          por ese código y en la cotización sale como un solo ítem.
        </p>
      </header>

      <section className="card p-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <Campo
            id="kit-codigo"
            label="Código"
            requerido
            ayuda="Es por el que el cliente lo va a pedir."
          >
            <Input
              id="kit-codigo"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              className="font-mono"
              placeholder="KIT-MOTOR-1"
              required
            />
          </Campo>

          <Campo
            id="kit-descripcion"
            label="Descripción"
            requerido
            ayuda="Lo que se imprime en la cotización y en la factura."
          >
            <Input
              id="kit-descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Kit de reparación para motorreductor 1"
              required
            />
          </Campo>
        </div>
      </section>

      {/* --------------------------------------------------- Contenido */}
      <section className="card p-4">
        <div className="mb-3">
          <h2 className="text-base font-semibold">Qué lleva dentro</h2>
          <p className="text-sm text-[var(--fg-muted)]">
            Búscalos igual que en una cotización. El precio de cada uno no se
            imprime: solo suma para el total.
          </p>
        </div>

        <BuscadorLineas onElegir={agregar} />

        {lineas.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--fg-muted)]">
            Busca un producto arriba para empezar a armar el kit.
          </p>
        ) : (
          <TableContenedor>
            <Table>
              <THead>
                <tr>
                  <th className="text-left">Código</th>
                  <th className="text-left">Descripción</th>
                  <th className="text-right">Cant.</th>
                  <th className="text-left">U.M.</th>
                  <th className="text-right">Stock</th>
                  <th className="text-right">Alcanza</th>
                  <th className="text-right">Quitar</th>
                </tr>
              </THead>
              <TBody>
                {lineas.map((l) => {
                  const alcanza =
                    l.cantidad > 0 ? Math.floor(l.stock / l.cantidad) : 0;
                  // El que frena al kit entero se marca: es la respuesta a
                  // «¿por qué solo puedo armar 3?».
                  const frena = alcanza === armable && lineas.length > 1;
                  return (
                    <tr key={l.producto_id}>
                      <td className="whitespace-nowrap font-medium">{l.codigo}</td>
                      <td className="text-sm">{l.descripcion}</td>
                      <td className="w-24">
                        <Input
                          type="number"
                          min={0.01}
                          step="any"
                          value={l.cantidad}
                          onChange={(e) =>
                            setLineas((ls) =>
                              ls.map((x) =>
                                x.producto_id === l.producto_id
                                  ? { ...x, cantidad: Number(e.target.value) || 0 }
                                  : x,
                              ),
                            )
                          }
                          className="min-w-[4.5rem] text-right tabular"
                          aria-label={`Cuántos ${l.codigo} lleva el kit`}
                        />
                      </td>
                      <td className="text-sm text-[var(--fg-muted)]">{l.unidad}</td>
                      <td className="text-right tabular text-sm">{l.stock}</td>
                      <td
                        className={`text-right tabular text-sm ${
                          frena ? "font-semibold text-[var(--warn)]" : ""
                        }`}
                        title={frena ? "Es el que limita cuántos kits se pueden armar" : undefined}
                      >
                        {alcanza}
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setLineas((ls) =>
                              ls.filter((x) => x.producto_id !== l.producto_id),
                            )
                          }
                          title={`Quitar ${l.codigo} del kit`}
                          aria-label={`Quitar ${l.codigo} del kit`}
                          className="inline-flex h-9 items-center rounded-md border border-[var(--border)] px-2 text-[var(--danger)] transition-colors hover:bg-[var(--danger-bg)]"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </TBody>
            </Table>
          </TableContenedor>
        )}
      </section>

      {/* ------------------------------------------------------ Precio */}
      <section className="card flex flex-col gap-4 p-4 lg:flex-row lg:items-start">
        <div className="flex-1">
          <h2 className="mb-2 text-base font-semibold">Precio del kit</h2>
          <div className="flex flex-col gap-1 text-sm">
            <span className="flex items-baseline justify-between">
              <span className="text-[var(--fg-muted)]">Suma de los productos</span>
              <span className="tabular">{dolar(suma)}</span>
            </span>
            {sumaCosto > 0 ? (
              <span className="flex items-baseline justify-between">
                <span className="text-[var(--fg-muted)]">Te cuesta</span>
                <span className="tabular">{dolar(sumaCosto)}</span>
              </span>
            ) : null}
            {sumaCosto > 0 && Number(precio) > 0 ? (
              <span className="flex items-baseline justify-between border-t border-[var(--border-soft)] pt-1">
                <span className="text-[var(--fg-muted)]">Margen sobre el costo</span>
                <span
                  className={`tabular font-semibold ${
                    (Number(precio) - sumaCosto) / sumaCosto < 0.12
                      ? "text-[var(--danger)]"
                      : (Number(precio) - sumaCosto) / sumaCosto < 0.2
                        ? "text-[var(--warn)]"
                        : "text-[var(--ok)]"
                  }`}
                >
                  {(((Number(precio) - sumaCosto) / sumaCosto) * 100).toFixed(1)}%
                </span>
              </span>
            ) : null}
          </div>
        </div>

        <div className="lg:w-72">
          <Campo
            id="kit-precio"
            label="Se vende a"
            ayuda="Arranca en la suma. Puedes redondearlo o bajarlo."
          >
            <Input
              id="kit-precio"
              type="number"
              min={0}
              step="0.01"
              value={precio}
              onChange={(e) => {
                setPrecioAMano(true);
                setPrecio(e.target.value);
              }}
              className="tabular text-right"
            />
          </Campo>

          {precioAMano && suma > 0 && Math.abs(Number(precio) - suma) >= 0.01 ? (
            <button
              type="button"
              onClick={() => {
                setPrecioAMano(false);
                setPrecio(suma.toFixed(2));
              }}
              className="mt-1 text-sm text-brand-600 underline"
            >
              volver a la suma ({dolar(suma)})
            </button>
          ) : null}
        </div>
      </section>

      {/* La barra al pie, como en la cotización (Luis, 16/09). */}
      <div className="sticky bottom-0 -mx-6 -mb-6 border-t border-[var(--border)] bg-[var(--surface)] px-6 py-3 elev-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm">
            <span className="text-[var(--fg-muted)]">Con el stock de hoy se pueden armar </span>
            <strong className="tabular">{armable}</strong>
          </span>
          <span className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!listo || guardando}>
              {guardando ? "Guardando…" : kit ? "Guardar cambios" : "Crear kit"}
            </Button>
          </span>
        </div>
      </div>
    </form>
  );
}
