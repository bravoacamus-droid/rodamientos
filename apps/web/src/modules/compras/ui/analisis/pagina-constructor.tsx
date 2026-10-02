import { notFound, redirect } from "next/navigation";
import { EstadoError } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { proveedoresPorId, proveedoresSugeridos } from "@/modules/proveedores/api/consultas";

import { analisisPorId } from "../../api/analisis";
import type { EstadoAnalisis } from "../../dominio/analisis";
import { ConstructorAnalisis } from "./constructor";

const ROLES = ["gerencia", "admin", "compras"];

/** Nuevo análisis (sin `params`) o uno guardado (con `id`). */
async function construir({
  params,
  modo = "ver",
}: {
  params?: Promise<{ id: string }>;
  /** Uno guardado se abre para VER; `/editar` lo abre para escribir. */
  modo?: "ver" | "editar";
}) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) redirect("/login");
  if (!ROLES.includes(perfil.rol)) {
    return (
      <EstadoError
        titulo="No puedes hacer análisis de importación"
        descripcion="Los hacen Compras y Gerencia. Habla con Gerencia si crees que deberías."
      />
    );
  }

  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());
  const sugeridos = await proveedoresSugeridos();

  const id = params ? (await params).id : null;
  if (!id) {
    return <ConstructorAnalisis hoy={hoy} sugeridos={sugeridos.ok ? sugeridos.datos : []} inicial={null} />;
  }

  const r = await analisisPorId(id);
  if (!r.ok) {
    return (
      <EstadoError titulo="No se pudo cargar el análisis" descripcion="La consulta no llegó a completarse." detalle={r.error} />
    );
  }
  if (!r.datos) notFound();
  const a = r.datos;

  const fichas = await proveedoresPorId([a.proveedor_id]);
  const proveedor = fichas.ok ? (fichas.datos.find((f) => f.id === a.proveedor_id) ?? null) : null;

  const estado: EstadoAnalisis = {
    proveedorId: a.proveedor_id,
    fecha: a.fecha,
    referencia: a.referencia ?? "",
    costoEnvio: a.costo_envio,
    pesoDeclarado: a.peso_declarado ?? 0,
    notas: a.notas ?? "",
    desaduanajeSoles: a.desaduanaje_soles,
    tipoCambio: a.tipo_cambio ?? 0,
    lineas: a.items.map((i, n) => ({
      key: `a${n + 1}`,
      productoId: i.producto_id,
      codigo: i.codigo,
      marca: i.marca ?? "",
      descripcion: i.descripcion ?? "",
      cantidadRef: i.cantidad_ref,
      cantidadPedido: i.cantidad_pedido,
      precioFob: i.precio_fob,
      pesoKg: i.peso_kg,
      precioMercado: i.precio_mercado,
      proveedorMercado: i.proveedor_mercado ?? "",
      cliente: i.cliente ?? "",
      frecuencia: i.frecuencia,
      fobAnterior: null,
    })),
    proximaKey: a.items.length + 1,
  };

  return (
    <ConstructorAnalisis
      hoy={hoy}
      modo={modo}
      sugeridos={sugeridos.ok ? sugeridos.datos : []}
      inicial={{
        id: a.id,
        numero: a.numero,
        estado,
        proveedor,
        comprado:
          a.estado === "comprado" && a.compra_id
            ? { compraId: a.compra_id, numero: a.compra_numero ?? "la compra" }
            : null,
      }}
    />
  );
}

/** Nuevo (sin `params`) o uno guardado, para VER. */
export default async function PaginaConstructorAnalisis({ params }: { params?: Promise<{ id: string }> }) {
  return construir({ params, modo: "ver" });
}

/** `/compras/analisis/[id]/editar`: el mismo análisis, para escribir. */
export async function PaginaEditarAnalisis({ params }: { params: Promise<{ id: string }> }) {
  return construir({ params, modo: "editar" });
}
