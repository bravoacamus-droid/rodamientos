import Link from "next/link";
import { notFound } from "next/navigation";
import { EstadoError } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { buscarUbigeo, catalogosCliente, clientePorId } from "../api/consultas";
import { FormularioCliente, type OpcionUbigeo } from "./formulario";

/**
 * Búsqueda de distrito para el formulario.
 *
 * Es una lectura, no una mutación, así que no vive en `acciones/`: se declara
 * aquí y se le pasa al componente cliente como prop. Existe solo porque
 * `api/consultas` es `server-only` y el selector la necesita mientras la
 * persona teclea; envolverla es lo único que hace.
 *
 * Que quede expuesta como endpoint no añade riesgo: el ubigeo es la lista
 * pública de distritos del Perú, la misma que publica el INEI.
 */
async function buscarDistrito(q: string): Promise<OpcionUbigeo[]> {
  "use server";
  const r = await buscarUbigeo(q);
  // Si la búsqueda falla, se devuelve vacío en vez de reventar: el selector
  // dirá «ningún distrito coincide» y el alta sigue su curso.
  return r.ok ? r.datos : [];
}

/**
 * Alta y edición de un cliente.
 *
 * La misma página sirve para las dos cosas: cambia si recibe `id`. Separarlas
 * habría duplicado el formulario, que es donde está toda la lógica.
 */

/** Roles que mantienen la cartera. Ventas entra porque es quien da de alta. */
const ROLES_ESCRITURA = ["gerencia", "admin", "ventas"];

export default async function PaginaFormularioCliente({
  params,
}: {
  params?: Promise<{ id: string }>;
}) {
  const perfil = await perfilActual();
  // El permiso se comprueba aquí, en el servidor, y no solo escondiendo el
  // botón del listado: a esta URL se puede llegar escribiéndola.
  if (!perfil || !perfil.activo || !ROLES_ESCRITURA.includes(perfil.rol)) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-4 text-sm">
          Tu rol no puede dar de alta ni editar clientes. La cartera la mantienen
          Ventas, Administración o Gerencia.
        </div>
      </div>
    );
  }

  const id = params ? (await params).id : null;

  const [catalogos, cliente] = await Promise.all([
    catalogosCliente(),
    id ? clientePorId(id) : Promise.resolve(null),
  ]);

  if (cliente && !cliente.ok) {
    if (cliente.error.includes("no existe")) notFound();
    return (
      <div className="p-6">
        <EstadoError titulo="No se pudo cargar el cliente" descripcion={cliente.error} />
      </div>
    );
  }

  // Si los vendedores no cargan NO se corta el alta: el cliente se crea sin
  // asignar y se le pone dueño después. Perder un cliente nuevo porque no
  // cargó un desplegable sería absurdo.
  const datosCatalogos = catalogos.ok ? catalogos.datos : { vendedores: [] };

  const c = cliente?.ok ? cliente.datos : undefined;

  return (
    <div className="flex flex-col gap-5">
      <header>
        <Link
          href={c ? `/clientes/${c.id}` : "/clientes"}
          className="text-sm text-[var(--fg-muted)] underline"
        >
          ← {c ? "Volver a la ficha" : "Clientes"}
        </Link>
        <h1 className="mt-1 break-words text-xl font-semibold tracking-tight sm:text-2xl">
          {c ? c.razon_social : "Nuevo cliente"}
        </h1>
        <p className="text-sm text-[var(--fg-muted)]">
          {c
            ? "Cambiar la condición de pago o la línea de crédito afecta a los documentos NUEVOS; los ya emitidos conservan lo que se pactó."
            : "Con el RUC basta: pulsa «Traer datos» y el resto se rellena solo. Lo que falte se puede completar después."}
        </p>
      </header>

      {!catalogos.ok ? (
        <p
          role="status"
          className="rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm"
        >
          No se pudo cargar la lista de vendedores ({catalogos.error}). Puedes
          guardar igual: el cliente queda sin asignar y se le pone dueño después.
        </p>
      ) : null}

      <FormularioCliente
        catalogos={datosCatalogos}
        cliente={c}
        buscarDistrito={buscarDistrito}
      />
    </div>
  );
}
