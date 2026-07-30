import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Lock } from "lucide-react";
import { createClient, getSesion } from "@/lib/supabase/server";
import { PageHeader, Contenedor } from "@/components/layout/shell";
import { Card, EmptyState } from "@/components/ui/primitives";
import { EstadoBadge } from "@/components/ui/estados";
import { ConstructorCotizacion, type CotizacionExistente } from "../../nueva/constructor";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

/** Estados en los que la cotización sigue siendo negociable y, por tanto, editable. */
const EDITABLES = ["borrador", "enviada", "en_negociacion"];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("cotizaciones").select("numero").eq("id", id).single();
  return { title: `Editar ${data?.numero ?? "cotización"}` };
}

export default async function EditarCotizacionPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const sesion = await getSesion();

  const { data: c } = await supabase
    .from("cotizaciones")
    .select("*, cotizacion_items(*), cotizacion_cargos(*)")
    .eq("id", id)
    .single();

  if (!c) notFound();

  if (!EDITABLES.includes(c.estado)) {
    return (
      <>
        <PageHeader
          titulo={`${c.numero} no es editable`}
          descripcion="Solo pueden modificarse las cotizaciones en borrador, enviadas o en negociación."
          badge={<EstadoBadge tipo="cotizacion" valor={c.estado} />}
          acciones={
            <Link
              href={`/cotizaciones/${id}`}
              className="inline-flex h-9 items-center gap-2 rounded-md border bg-[var(--surface)] px-3.5 text-[13px] font-medium text-fg transition-colors hover:border-brand-300"
            >
              <ArrowLeft className="size-4" />
              Ver la cotización
            </Link>
          }
        />
        <Contenedor>
          <Card>
            <EmptyState
              icon={<Lock />}
              titulo="Documento cerrado"
              descripcion="Una cotización aceptada, convertida, rechazada o vencida conserva su contenido para efectos de trazabilidad. Duplíquela si necesita partir de ella."
            />
          </Card>
        </Contenedor>
      </>
    );
  }

  const { data: clientes } = await supabase
    .from("clientes")
    .select("id, codigo, razon_social, ruc, contacto, lista_precio, dias_credito, linea_credito, distrito")
    .eq("activo", true)
    .order("razon_social");

  const items = (c.cotizacion_items ?? []) as Record<string, unknown>[];
  const cargos = (c.cotizacion_cargos ?? []) as Record<string, unknown>[];

  const existente: CotizacionExistente = {
    id: c.id,
    numero: c.numero,
    cliente_id: c.cliente_id,
    estado: c.estado,
    lista_precio: c.lista_precio,
    validez_dias: c.validez_dias,
    tiempo_entrega: c.tiempo_entrega,
    observaciones: c.observaciones,
    mostrar_igv: c.mostrar_igv ?? true,
    mostrar_margen: c.mostrar_margen ?? false,
    items: items
      .sort((a, b) => Number(a.orden) - Number(b.orden))
      .map((i) => ({
        producto_id: (i.producto_id as string) ?? null,
        codigo: String(i.codigo),
        descripcion: String(i.descripcion),
        marca: (i.marca as string) ?? null,
        unidad: String(i.unidad),
        cantidad: Number(i.cantidad),
        precio_unitario: Number(i.precio_unitario),
        descuento_pct: Number(i.descuento_pct),
        costo_unitario: Number(i.costo_unitario),
      })),
    cargos: cargos
      .sort((a, b) => Number(a.orden) - Number(b.orden))
      .map((g) => ({
        concepto: String(g.concepto),
        detalle: (g.detalle as string) ?? null,
        monto: Number(g.monto),
        costo: Number(g.costo),
      })),
  };

  return (
    <>
      <PageHeader
        titulo={`Editar ${c.numero}`}
        descripcion="Ajuste cantidades, precios, cargos y condiciones mientras la propuesta sigue en negociación con el cliente."
        badge={<EstadoBadge tipo="cotizacion" valor={c.estado} />}
        acciones={
          <Link
            href={`/cotizaciones/${id}`}
            className="inline-flex h-9 items-center gap-2 rounded-md border bg-[var(--surface)] px-3.5 text-[13px] font-medium text-fg transition-colors hover:border-brand-300"
          >
            <ArrowLeft className="size-4" />
            Cancelar
          </Link>
        }
      />
      <Contenedor>
        <ConstructorCotizacion
          clientes={clientes ?? []}
          vendedorId={sesion?.perfil?.id ?? null}
          clienteInicial={null}
          productoInicial={null}
          existente={existente}
        />
      </Contenedor>
    </>
  );
}
