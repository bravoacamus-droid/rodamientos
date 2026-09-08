import { notFound } from "next/navigation";

import { cuentasParaCobrar, emisorParaImprimir } from "@/lib/emisor";

import { cotizacionPorToken } from "../api/publica";
import { DISPONIBILIDADES, type Disponibilidad } from "../dominio/disponibilidad";
import { armarCotizacionImpresa, formaDePago } from "../dominio/impresion";
import { Documento } from "./detalle/documento";
import { BotonesDelCliente } from "./publica/botones";

/**
 * La cotización, tal como la ve el cliente de Willy.
 *
 * ---------------------------------------------------------------------------
 * Para qué existe
 * ---------------------------------------------------------------------------
 * Luis, 08/09: *«¿o se le manda un link que descargue automáticamente el PDF?
 * … siempre y cuando ese PDF tenga un botón de descargar la cotización»*.
 *
 * Ni WhatsApp ni el correo dejan adjuntar un archivo desde el navegador, así
 * que el PDF se arrastraba al chat a mano. Con esto se manda un enlace y el
 * cliente se lo descarga él.
 *
 * ---------------------------------------------------------------------------
 * Es el MISMO documento
 * ---------------------------------------------------------------------------
 * Se pinta con `Documento`, el componente que ya usa la ficha interna y que ya
 * sale por la impresora. No hay una versión «para el cliente»: una segunda
 * plantilla se separaría de la primera a la tercera corrección, y entonces lo
 * que el cliente ve dejaría de ser lo que Willy cree que mandó.
 *
 * Lo único que se añade son los dos botones de arriba, y llevan `print:hidden`
 * para no salir en el papel.
 *
 * ---------------------------------------------------------------------------
 * Lo que no llega aquí
 * ---------------------------------------------------------------------------
 * Ni el margen, ni los costos, ni el teléfono del cliente. No es que se
 * escondan al pintar: es que `cotizacion_por_token` (072) no los devuelve, así
 * que no están en esta página ni en el HTML que se manda al navegador. Lo que
 * no viaja no se puede filtrar.
 */
/** El enum, comprobado contra la lista y no a mano: si crece, esto crece. */
const esDisponibilidad = (v: string): v is Disponibilidad =>
  (DISPONIBILIDADES as readonly string[]).includes(v);

export default async function PaginaCotizacionPublica({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const cot = await cotizacionPorToken(token);

  // Un enlace que no lleva a ninguna parte es un 404, sin decir por qué. Token
  // inventado, cotización borrada y cotización anulada dan lo mismo: explicar
  // cuál de los tres es diría a quien prueba tokens cuáles existen.
  if (!cot) notFound();

  const [emisor, cuentas] = await Promise.all([
    emisorParaImprimir(),
    cuentasParaCobrar(),
  ]);

  const impresa = armarCotizacionImpresa({
    emisor: {
      razonSocial: emisor.razonSocial,
      nombreComercial: emisor.nombreComercial,
      ruc: emisor.ruc,
      direccion: emisor.direccion,
      telefono: emisor.telefono,
      email: emisor.email,
      web: emisor.web,
      logoUrl: emisor.logoUrl,
    },
    numero: cot.numero,
    fecha: cot.fecha,
    validezDias: cot.validez_dias,
    cliente: {
      razonSocial: cot.cliente.razon_social,
      documento: cot.cliente.numero_documento,
      tipoDocumento: cot.cliente.tipo_documento,
      direccion: cot.cliente.direccion,
      contacto: cot.contacto,
    },
    vendedor: cot.vendedor,
    tiempoEntrega: cot.tiempo_entrega,
    formaPago: formaDePago(cot.cliente.condicion_pago, cot.cliente.dias_credito),
    condiciones: cot.condiciones,
    observaciones: cot.observaciones,
    ordenCompraCliente: cot.orden_compra_cliente,
    mostrarDescuento: cot.mostrar_descuento,
    mostrarDisponibilidad: cot.mostrar_disponibilidad,
    lineas: cot.lineas.map((l) => ({
      codigo: l.codigo,
      marca: l.marca,
      descripcion: l.descripcion,
      cantidad: Number(l.cantidad),
      unidad: l.unidad_codigo,
      valorUnitario: Number(l.valor_unitario),
      descuentoPct: Number(l.descuento_pct),
      // Viene como texto del JSON de la base, así que se valida contra el
      // enum antes de entrar. Lo desconocido cae a `inmediata`, que es lo que
      // ya hace el resto del dominio: en el papel del cliente vale más una
      // entrega bien puesta por defecto que una columna en blanco.
      disponibilidad: esDisponibilidad(l.disponibilidad) ? l.disponibilidad : "inmediata",
      diasEntrega: l.dias_entrega,
    })),
  });

  return (
    <div className="min-h-dvh bg-[var(--surface-2)] py-6 print:bg-white print:py-0">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 print:max-w-none print:gap-0 print:px-0">
        <header className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="min-w-0">
            <p className="font-mono text-lg font-semibold">{impresa.numero}</p>
            <p className="text-sm text-[var(--fg-muted)]">
              Cotización de {emisor.nombreComercial ?? emisor.razonSocial} para{" "}
              {cot.cliente.razon_social}.
            </p>
          </div>
          <BotonesDelCliente />
        </header>

        <Documento c={impresa} cuentas={cuentas} />

        {/*
          Quién manda esto, para quien lo recibe.

          Un enlace que llega por WhatsApp sin remite se parece mucho a una
          estafa. Con el RUC y el teléfono de Rodatech delante, el cliente
          puede comprobar de quién es antes de fiarse — y ese es exactamente
          el reflejo que conviene que tenga.
        */}
        <p className="pb-4 text-center text-sm text-[var(--fg-muted)] print:hidden">
          {emisor.razonSocial}
          {emisor.ruc ? ` · RUC ${emisor.ruc}` : ""}
          {emisor.telefono ? ` · ${emisor.telefono}` : ""}
        </p>
      </div>
    </div>
  );
}
