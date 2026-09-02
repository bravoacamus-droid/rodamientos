import Link from "next/link";
import { redirect } from "next/navigation";
import { EstadoError, EstadoVacio } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { proveedoresParaPedir } from "@/modules/proveedores";
import { proveedoresPorId, proveedoresSugeridos } from "@/modules/proveedores/api/consultas";

import { paraQuienEs, precargaDeCompra } from "../api/por-comprar";
import { ConstructorCompra } from "./constructor";

/** La misma lista que `permisos_rol` tiene para `compras`. */
const ROLES = ["gerencia", "admin", "compras"];

/**
 * Pantalla de alta de una compra.
 *
 * Server Component: resuelve permisos, el maestro de proveedores y la fecha, y
 * le pasa todo al constructor, que sí es de cliente. La fecha se calcula AQUÍ y
 * no en el navegador para que sea la del servidor y no la del reloj del equipo,
 * que es el que suele estar mal.
 *
 * Puede llegar con líneas puestas desde la bandeja «Por comprar»:
 * `?items=<producto>:<cantidad>,…`. Es la mitad que faltaba del flujo — la
 * bandeja dice qué falta, y esto lo convierte en una compra sin volver a
 * teclear los códigos.
 */
export default async function PaginaNuevaCompra({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) redirect("/login");
  if (!ROLES.includes(perfil.rol)) {
    return (
      <EstadoError
        titulo="No puedes registrar compras"
        descripcion="Tu rol no tiene permiso para el abastecimiento. Habla con Gerencia si crees que debería."
      />
    );
  }

  // Ocho, no el maestro entero: desde la 033 el selector busca contra el
  // servidor. La lista completa venía con `.limit(500)` y truncaba en silencio.
  const proveedores = await proveedoresSugeridos();

  const sp = searchParams ? await searchParams : {};
  const items = Array.isArray(sp.items) ? sp.items[0] : sp.items;
  const precarga = await precargaDeCompra(items);

  // Cuando la compra viene de la bandeja, dos cosas que el sistema ya sabe
  // y que antes había que averiguar a mano: a QUIÉN comprárselo y para
  // QUIÉN es. Se piden solo si hay líneas: sin ellas no hay nada que
  // proponer, y serían dos consultas para nada.
  const ids = precarga.map((p) => p.producto.id);
  const [quienesVenden, esperan] = await Promise.all([
    ids.length > 0 ? proveedoresParaPedir(ids) : Promise.resolve(null),
    ids.length > 0 ? paraQuienEs(ids) : Promise.resolve([]),
  ]);

  // Tres como mucho: una fila de botones para elegir, no otra lista que
  // leer. Y con la FICHA COMPLETA, no con media inventada: el selector
  // cuenta las marcas del elegido y con media ficha se cae (migración 050).
  const mejores = quienesVenden?.ok
    ? quienesVenden.datos.filter((c) => c.coincidencias > 0).slice(0, 3)
    : [];
  const fichas = await proveedoresPorId(mejores.map((m) => m.id));
  const candidatos = mejores.flatMap((m) => {
    const ficha = fichas.ok ? fichas.datos.find((f) => f.id === m.id) : undefined;
    // Sin ficha no se ofrece el botón. Es mejor no proponerlo que proponer
    // algo que al pulsarlo rompe la pantalla.
    return ficha
      ? [{ proveedor: ficha, coincidencias: m.coincidencias, deCuantos: ids.length }]
      : [];
  });

  if (!proveedores.ok) {
    return (
      <EstadoError
        titulo="No se pudo cargar el maestro de proveedores"
        descripcion="Sin él no se puede registrar a quién se le compra."
        detalle={proveedores.error}
      />
    );
  }

  // Sin NINGÚN proveedor activo no se corta el paso: el selector trae su alta
  // rápida dentro y crear el primero desde aquí es un paso menos. Pero cuando
  // el maestro está vacío conviene decirlo antes, porque una caja de búsqueda
  // que no encuentra nada se lee como «está roto» y no como «no hay ninguno».
  //
  // `proveedores_sugeridos` solo devuelve activos, así que cero aquí es cero
  // de verdad, no ocho que no caben.
  if (proveedores.datos.length === 0) {
    return (
      <EstadoVacio
        titulo="Primero hace falta un proveedor"
        descripcion="Una compra necesita saber a quién se le pide. Da de alta el proveedor y vuelve."
        accion={
          <Link
            href="/proveedores/nuevo"
            className="inline-flex h-9 items-center rounded-sm bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
          >
            Nuevo proveedor
          </Link>
        }
      />
    );
  }

  // `sv-SE` da `yyyy-mm-dd` directamente, que es lo que espera un <input
  // type="date"> y lo que valida el dominio. La zona es explícita: el servidor
  // corre en UTC y sin fijarla una compra de las 7 de la tarde en Lima se
  // registraría con la fecha del día siguiente.
  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(
    new Date(),
  );

  return (
    <ConstructorCompra
      sugeridos={proveedores.datos}
      hoy={hoy}
      precarga={precarga}
      candidatos={candidatos}
      esperan={esperan}
    />
  );
}
