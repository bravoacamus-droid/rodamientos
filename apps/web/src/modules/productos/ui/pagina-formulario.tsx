import { notFound, redirect } from "next/navigation";
import { EstadoError } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { catalogosParaProducto, productoPorId } from "../api/consultas";
import { esKit } from "../api/kits";
import { FormularioProducto } from "./formulario";
import { Volver } from "@/componentes/volver";

/**
 * Alta y edición de un producto.
 *
 * La misma página sirve para las dos cosas: cambia si recibe `id`. Separarlas
 * habría duplicado el formulario, que es donde está toda la lógica.
 */

const ROLES = ["gerencia", "admin", "compras"];

export default async function PaginaFormularioProducto({
  params,
}: {
  params?: Promise<{ id: string }>;
}) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo || !ROLES.includes(perfil.rol)) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-4 text-sm">
          Tu usuario no puede crear ni cambiar productos. Lo mantienen Compras o
          Gerencia.
        </div>
      </div>
    );
  }

  const id = params ? (await params).id : null;
  // Un kit no se edita con el formulario de producto (Luis, 25/09).
  if (id && (await esKit(id))) redirect(`/productos/kits/${id}`);

  const [catalogos, producto] = await Promise.all([
    catalogosParaProducto(),
    id ? productoPorId(id) : Promise.resolve(null),
  ]);

  if (!catalogos.ok) {
    return (
      <div className="p-6">
        <EstadoError
          titulo="No se pudieron cargar los catálogos"
          descripcion={catalogos.error}
        />
      </div>
    );
  }
  if (producto && !producto.ok) {
    if (producto.error.includes("no existe")) notFound();
    return (
      <div className="p-6">
        <EstadoError titulo="No se pudo cargar el producto" descripcion={producto.error} />
      </div>
    );
  }

  const p = producto?.ok ? producto.datos : undefined;

  return (
    // Sin `p-6`: el marco del ERP ya pone el margen, y sumado al suyo el
    // formulario quedaba 24 px más estrecho que la ficha en el teléfono.
    // Al editar, «Volver» lleva a la ficha de la que se vino, no al listado
    // (revisión por módulos del 02/10).
    <div className="flex flex-col gap-5">
      <header>
        {p ? (
          <Volver href={`/productos/${p.id}`}>Volver al producto</Volver>
        ) : (
          <Volver href="/productos">Volver a productos</Volver>
        )}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {p ? `Editar ${p.codigo}` : "Nuevo producto"}
        </h1>
        <p className="text-sm text-[var(--fg-muted)]">
          {p
            ? "Los cambios de precio afectan a las cotizaciones NUEVAS; las ya emitidas conservan lo que se pactó."
            : "Los productos se crean aquí y no desde la cotización: así el catálogo no se llena de repetidos."}
        </p>
        {p?.designacion_base ? (
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            Medida detectada: <strong>{p.designacion_base}</strong> — con ella se
            proponen los equivalentes de otras marcas.
          </p>
        ) : null}
      </header>

      <FormularioProducto catalogos={catalogos.datos} producto={p} />
    </div>
  );
}
