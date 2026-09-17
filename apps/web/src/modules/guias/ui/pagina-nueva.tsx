import Link from "next/link";
import { redirect } from "next/navigation";
import { EstadoError, EstadoVacio } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { transportePropioActivo } from "@/modules/transporte";

import {
  agenciasActivas,
  cotizacionesDespachables,
  guiasDeCotizacion,
  motivosTraslado,
  numeroDeCotizacion,
} from "../api/consultas";
import { ConstructorGuia } from "./constructor";

/** La misma lista que `permisos_rol` tiene para `guias_remision`. */
const ROLES = ["gerencia", "admin", "ventas", "almacen"];

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Pantalla de preparación de una guía.
 *
 * La fecha se calcula en el servidor con la zona de Lima: la fecha de traslado
 * va en un documento que puede parar un control de SUNAT en carretera, así que
 * no puede depender del reloj del equipo del almacén.
 */
export default async function PaginaNuevaGuia({ searchParams }: Props) {
  const sp = await searchParams;
  const crudo = Array.isArray(sp.cotizacion) ? sp.cotizacion[0] : sp.cotizacion;

  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) redirect("/login");
  if (!ROLES.includes(perfil.rol)) {
    return (
      <EstadoError
        titulo="No puedes preparar guías"
        descripcion="Tu rol no tiene permiso para despachar mercadería. Habla con Gerencia si crees que debería."
      />
    );
  }

  const [cotizaciones, motivos, agencias, propio] = await Promise.all([
    cotizacionesDespachables(),
    motivosTraslado(),
    agenciasActivas(),
    transportePropioActivo(),
  ]);

  if (!cotizaciones.ok) {
    return (
      <EstadoError
        titulo="No se pudieron cargar las cotizaciones"
        descripcion="Sin ellas no hay de dónde despachar."
        detalle={cotizaciones.error}
      />
    );
  }

  if (cotizaciones.datos.length === 0) {
    return (
      <EstadoVacio
        titulo="No hay nada pendiente de despachar"
        descripcion="Una guía sale de una cotización aprobada con mercadería que todavía no ha salido del almacén."
        accion={
          <Link
            href="/cotizaciones"
            className="inline-flex h-9 items-center rounded-sm bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
          >
            Ver cotizaciones
          </Link>
        }
      />
    );
  }

  /*
    Se pidió una cotización concreta y no está entre las despachables.

    Luis, 17/09, pulsando «Generar guía» en la COT1-000008: *«¿por qué no me
    trae mis datos automáticamente, como lo teníamos anteriormente?»*.

    No era el enlace —con una cotización con algo pendiente carga sola—: esa ya
    estaba despachada ENTERA en la T001-00000002, así que no entraba en la
    lista y el desplegable se quedaba en «Elige una cotización…» porque su
    opción no existía. Cero líneas, ningún error, nada que leer.

    El sistema estaba haciendo lo correcto. Pero una pantalla que hace lo
    correcto y no lo dice se parece demasiado a una rota, y lo que se rompe de
    verdad es la confianza en ella. Así que se dice, con el número de la guía y
    el camino para llegar.
  */
  const pedida = crudo && crudo.length > 0 ? crudo : null;
  const estaEnLaLista = pedida !== null && cotizaciones.datos.some((c) => c.id === pedida);

  if (pedida !== null && !estaEnLaLista) {
    const [numero, guias] = await Promise.all([
      numeroDeCotizacion(pedida),
      guiasDeCotizacion(pedida),
    ]);
    const suyas = guias.ok ? guias.datos : [];
    const nombre = numero ?? "Esa cotización";

    return (
      <EstadoVacio
        titulo={
          suyas.length > 0
            ? `${nombre} ya está despachada entera`
            : `${nombre} no tiene nada que despachar`
        }
        descripcion={
          suyas.length > 0
            ? `Todo lo que lleva ya salió en ${
                suyas.length === 1 ? "la guía" : "las guías"
              } ${suyas.map((g) => g.numero).join(", ")}. Para despachar de nuevo habría que corregir las cantidades de la cotización primero.`
            : "No le queda ninguna línea pendiente, así que no hay de dónde sacar una guía."
        }
        accion={
          <div className="flex flex-wrap items-center justify-center gap-2">
            {suyas.map((g) => (
              <Link
                key={g.id}
                href={`/guias/${g.id}`}
                className="inline-flex h-control-md items-center rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-700"
              >
                Ver {g.numero}
              </Link>
            ))}
            {/* Sin este, la única salida sería el botón de atrás: se llega
                aquí desde una cotización, no desde el menú. */}
            <Link
              href="/guias/nueva"
              className="inline-flex h-control-md items-center rounded-md border border-[var(--border)] px-4 text-sm font-medium transition-colors hover:bg-[var(--surface-2)]"
            >
              Despachar otra cotización
            </Link>
          </div>
        }
      />
    );
  }

  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(
    new Date(),
  );

  return (
    <ConstructorGuia
      cotizaciones={cotizaciones.datos}
      // Si el catálogo de motivos fallara, «Venta» es el 99 % de los casos y
      // permite seguir trabajando en vez de dejar la pantalla inservible.
      motivos={motivos.ok ? motivos.datos : [{ codigo: "01", descripcion: "Venta" }]}
      // Si el maestro fallara, el transporte se teclea como siempre: es un
      // atajo, no un requisito para emitir.
      agencias={agencias.ok ? agencias.datos : []}
      vehiculos={propio.ok ? propio.datos.vehiculos : []}
      conductores={propio.ok ? propio.datos.conductores : []}
      hoy={hoy}
      cotizacionInicial={pedida}
    />
  );
}
