import Link from "next/link";
import { redirect } from "next/navigation";
import { EstadoError, EstadoVacio } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { configFiscal, estadoConfiguracion } from "../api/configuracion";
import { cotizacionesFacturables } from "../api/consultas";
import { EmisorComprobante } from "./emisor";

/** La misma lista que `permisos_rol` tiene para `comprobantes`. */
const ROLES = ["gerencia", "admin", "ventas"];

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Pantalla de emisión.
 *
 * Server Component: resuelve permisos, las cotizaciones facturables, las
 * series y la fecha, y se lo pasa al emisor, que sí es de cliente.
 *
 * La fecha se calcula AQUÍ y no en el navegador: tiene que ser la del
 * servidor, no la del reloj del equipo, porque acaba en un documento fiscal
 * con validez de fecha.
 */
export default async function PaginaNuevoComprobante({ searchParams }: Props) {
  const sp = await searchParams;
  const crudo = Array.isArray(sp.cotizacion) ? sp.cotizacion[0] : sp.cotizacion;

  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) redirect("/login");
  if (!ROLES.includes(perfil.rol)) {
    return (
      <EstadoError
        titulo="No puedes emitir comprobantes"
        descripcion="Tu rol no tiene permiso de facturación. Habla con Gerencia si crees que debería."
      />
    );
  }

  const [cotizaciones, config, estado] = await Promise.all([
    cotizacionesFacturables(),
    configFiscal(),
    estadoConfiguracion(),
  ]);

  if (!cotizaciones.ok) {
    return (
      <EstadoError
        titulo="No se pudieron cargar las cotizaciones"
        descripcion="Sin ellas no hay de dónde emitir."
        detalle={cotizaciones.error}
      />
    );
  }

  if (cotizaciones.datos.length === 0) {
    return (
      <EstadoVacio
        titulo="No hay nada que facturar"
        descripcion="Un comprobante nace de una cotización aprobada que todavía no se ha facturado. Aprueba una y vuelve."
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

  // `sv-SE` da `yyyy-mm-dd`, que es lo que espera un <input type="date"> y lo
  // que valida el dominio. La zona es explícita: el servidor corre en UTC y sin
  // fijarla una venta de las 7 de la tarde en Lima se fecharía al día siguiente
  // — en un documento fiscal eso no es un detalle.
  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(
    new Date(),
  );

  return (
    <div className="flex flex-col gap-4">
      {!estado.listo ? (
        <p className="anim-entrada rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm">
          Se puede emitir, pero <strong>no se enviará a SUNAT</strong> hasta que la
          configuración esté completa. El documento queda pendiente y se envía
          después.
        </p>
      ) : null}

      <EmisorComprobante
        cotizaciones={cotizaciones.datos}
        hoy={hoy}
        // Si la configuración no se puede leer —porque quien mira no es
        // gerencia— se usan las series por defecto del esquema.
        serieFactura={config.ok ? config.datos.serie_factura : "F001"}
        serieBoleta={config.ok ? config.datos.serie_boleta : "B001"}
        cotizacionInicial={crudo && crudo.length > 0 ? crudo : null}
      />
    </div>
  );
}
