import { notFound, redirect } from "next/navigation";
import { EstadoError } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { proveedoresPorId, proveedoresSugeridos } from "@/modules/proveedores/api/consultas";
import { couriersUsados, detalleCompra, ordenesDelPedido } from "../api/consultas";
import { precargaDeCompra } from "../api/por-comprar";
import type { PlantillaCompra } from "../dominio/constructor";
import { modalidadDe } from "../dominio/gastos";
import { ConstructorCompra } from "./constructor";

const ROLES = ["gerencia", "admin", "compras"];

/**
 * La factura de una orden del pedido (128): el mismo formulario de «Registrar
 * compra», ya lleno con la orden.
 *
 * Luis, 15/10: *«deberías lanzarme así, porque no se sabe si el producto es
 * compra local, aérea o marítima; tiene que subir número de factura, su
 * factura, todo eso, para que guarde una compra»*. Es la misma pantalla que
 * ya conoce, con el proveedor y las cantidades de la orden puestos.
 */
export default async function PaginaFacturaOrden({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) redirect("/login");
  if (!ROLES.includes(perfil.rol)) {
    return (
      <EstadoError
        titulo="No puedes registrar compras"
        descripcion="Tu rol no tiene permiso para el abastecimiento. Habla con Gerencia si crees que debería."
        mostrarReintentar={false}
      />
    );
  }

  const r = await detalleCompra(id);
  if (!r.ok) return <EstadoError titulo="No se pudo cargar la orden" detalle={r.error} />;
  if (!r.datos) notFound();
  const c = r.datos;
  // Ya tiene su factura, o no sale de un pedido: a su ficha.
  if (!c.falta_factura || !c.para || !c.pedido || c.estado !== "registrada") redirect(`/compras/${c.id}`);

  const [precarga, fichas, sugeridos, couriers, pedido] = await Promise.all([
    precargaDeCompra(c.lineas.map((l) => `${l.producto_id}:${l.cantidad}`).join(",")),
    proveedoresPorId([c.proveedor_id]),
    proveedoresSugeridos(),
    couriersUsados(),
    ordenesDelPedido(c.pedido.id),
  ]);

  const ordenes = pedido.ok ? pedido.datos : [];
  const posicion = Math.max(ordenes.findIndex((o) => o.id === c.id), 0) + 1;

  const ficha = fichas.ok ? (fichas.datos.find((f) => f.id === c.proveedor_id) ?? null) : null;
  // La orden nace «local». Un proveedor de fuera propone aérea y sin IGV,
  // como al elegirlo en «Registrar compra» (01/10).
  const deFuera = c.tipo === "local" && ficha?.tipo === "importacion";

  const plantilla: PlantillaCompra = {
    numero: c.numero,
    origen: "orden",
    modalidad: deFuera ? "aerea" : modalidadDe(c.tipo, c.via_importacion ?? "aerea"),
    courier: c.courier,
    gastos: c.gastos,
    entera: true,
    afectoIgv: !deFuera && c.tipo !== "importacion",
    moneda: c.moneda,
    // El costo de la orden —el del análisis— como decidido: el «último costo
    // del proveedor» no lo pisa. Si la factura dice otro, se corrige a mano.
    costos: Object.fromEntries(c.lineas.map((l) => [l.producto_id, l.costo_unitario])),
    pesos: Object.fromEntries(c.lineas.filter((l) => l.peso_kg > 0).map((l) => [l.producto_id, l.peso_kg])),
  };

  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());

  return (
    <ConstructorCompra
      orden={{
        compraId: c.id,
        numero: c.numero,
        pedidoId: c.pedido.id,
        pedido: c.pedido.numero,
        cotizacionId: c.para.cotizacionId,
        cotizacion: c.para.numero,
        cliente: c.para.cliente,
        posicion,
        de: Math.max(ordenes.length, 1),
      }}
      sugeridos={sugeridos.ok ? sugeridos.datos : []}
      hoy={hoy}
      precarga={precarga}
      couriers={couriers}
      plantilla={plantilla}
      elegido={ficha}
    />
  );
}
