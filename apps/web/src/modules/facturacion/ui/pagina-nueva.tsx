import Link from "next/link";
import { redirect } from "next/navigation";
import { EstadoError, EstadoVacio, buttonVariants, cn } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";
import { AvisoSinPermiso } from "@/componentes/sin-permiso";
import { misPermisos } from "@/lib/permisos";
import { avisoSinPermiso } from "@/lib/permisos-comun";
import { Volver } from "@/componentes/volver";

import { cuentasParaCobrar, emisorParaImprimir } from "@/lib/emisor";

import { estadoConfiguracion } from "../api/configuracion";
import { cotizacionesFacturables, serieFacturaPredeterminada } from "../api/consultas";
import { EmisorComprobante } from "./emisor";

/** La misma lista que `permisos_rol` tiene para `comprobantes`. */
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
  // Desde el botón «Facturar» de una guía: esa guía y no todas (15/10).
  const guia = Array.isArray(sp.guia) ? sp.guia[0] : sp.guia;

  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) redirect("/login");
  const permisos = await misPermisos();
  if (!permisos.tiene("facturacion", "crear")) {
    return (
      <div className="flex flex-col gap-4">
        <Volver href="/facturacion">Volver a facturación</Volver>
        <AvisoSinPermiso mensaje={avisoSinPermiso("facturacion", "crear", permisos.nombreRol)} />
      </div>
    );
  }

  // El emisor y las cuentas van para la VISTA PREVIA: se pinta con el mismo
  // componente que imprime, así que necesita los mismos datos que el papel.
  const [cotizaciones, serie, estado, emisor, cuentas] = await Promise.all([
    cotizacionesFacturables(),
    serieFacturaPredeterminada(),
    estadoConfiguracion(),
    emisorParaImprimir(),
    cuentasParaCobrar(),
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
        descripcion="Un comprobante nace de una cotización aprobada que ya tiene su guía emitida y todavía no se ha facturado. Emite primero la guía y vuelve."
        accion={
          // Lo que dice el texto —emitir la guía—, y a la cotización como
          // segunda vía (auditoría 14/10: solo había esta, hecha a mano).
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/guias" className={cn(buttonVariants({ variant: "primary" }), "px-3")}>
              Ir a las guías
            </Link>
            <Link href="/cotizaciones" className={cn(buttonVariants({ variant: "outline" }), "px-3")}>
              Ver cotizaciones
            </Link>
            <Link href="/facturacion" className={cn(buttonVariants({ variant: "outline" }), "px-3")}>
              Volver a facturación
            </Link>
          </div>
        }
      />
    );
  }

  // Sin serie predeterminada la base no tiene por dónde numerar. Se dice aquí,
  // antes de rellenar nada, y no al pulsar «Emitir».
  if (!serie) {
    return (
      <EstadoVacio
        titulo="No hay serie de factura por defecto"
        descripcion="Marca una serie de factura con «Usar por defecto» en Configuración › SUNAT y numeración, en la tabla «Series y correlativos»."
        accion={
          <Link href="/configuracion/sunat" className={cn(buttonVariants({ variant: "primary" }), "px-3")}>
            Ir a SUNAT y numeración
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

      {serie.prueba && estado.ambiente === "produccion" ? (
        <p className="anim-entrada rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm">
          La serie por defecto es <strong>{serie.serie}</strong>, que es de <strong>pruebas</strong>, y
          el sistema está en producción: la base no dejará emitir. Marca la serie real con «Usar por
          defecto» en{" "}
          <Link href="/configuracion/sunat" className="font-semibold underline">
            SUNAT y numeración
          </Link>
          .
        </p>
      ) : null}

      <EmisorComprobante
        cotizaciones={cotizaciones.datos}
        hoy={hoy}
        // La predeterminada de «Series y correlativos», la misma que usan las
        // notas, la guía y la cotización (B1, 28/10). Antes salía del campo
        // «Serie factura» de las credenciales, y marcar F002 por defecto no
        // la movía.
        serieFactura={serie.serie}
        cotizacionInicial={crudo && crudo.length > 0 ? crudo : null}
        guiaInicial={guia && guia.length > 0 ? guia : null}
        emisor={emisor}
        cuentas={cuentas}
        // Sin certificado ni credenciales SOL no se puede mandar nada. Se
        // sigue pudiendo emitir: el documento queda pendiente, que es el caso
        // normal hoy y está avisado arriba.
        puedeEnviar={estado.listo}
      />
    </div>
  );
}
