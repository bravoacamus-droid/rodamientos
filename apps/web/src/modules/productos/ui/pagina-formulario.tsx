import { notFound } from "next/navigation";
import Link from "next/link";
import { EstadoError } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { catalogosParaProducto, productoPorId } from "../api/consultas";
import { FormularioProducto } from "./formulario";

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
          Tu rol no puede tocar el maestro de productos. Lo mantienen Compras o
          Gerencia.
        </div>
      </div>
    );
  }

  const id = params ? (await params).id : null;

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
    <div className="flex flex-col gap-5 p-6">
      <header>
        <Link href="/productos" className="text-sm text-[var(--fg-muted)] underline">
          ← Productos
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {p ? p.codigo : "Nuevo producto"}
        </h1>
        <p className="text-sm text-[var(--fg-muted)]">
          {p
            ? "Los cambios de precio afectan a las cotizaciones NUEVAS; las ya emitidas conservan lo que se pactó."
            : "El alta va por el maestro, no desde la cotización: así el catálogo no se llena de duplicados."}
        </p>
        {p?.designacion_base ? (
          <p className="mt-1 text-xs text-[var(--fg-muted)]">
            Medida detectada: <strong>{p.designacion_base}</strong> — con ella se
            proponen los equivalentes de otras marcas.
          </p>
        ) : null}
      </header>

      <FormularioProducto catalogos={catalogos.datos} producto={p} />
    </div>
  );
}
