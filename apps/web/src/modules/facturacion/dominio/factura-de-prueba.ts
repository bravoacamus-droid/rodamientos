/**
 * La factura de mentira de «Probar con SUNAT» (29/10).
 *
 * Va SOLO al ambiente beta, que no tiene valor fiscal, y nunca a la base: no
 * hay fila, no hay correlativo. Sirve para que SUNAT diga si acepta la firma
 * del certificado real, que es lo que no se puede probar en producción sin
 * emitir de verdad.
 *
 * El cliente es la propia SUNAT, como en `beta.sunat.ts`: un RUC que existe y
 * que no es de nadie de la cartera de Willy. El número sale del reloj, alto y
 * distinto cada vez, porque beta guarda lo que recibe y contesta «ya
 * registrado» si se repite.
 */

import type { ComprobanteDetalle } from "./tipos";

export function facturaDePrueba(ahora: Date): ComprobanteDetalle {
  const correlativo = 90_000_000 + (Math.floor(ahora.getTime() / 1000) % 9_000_000);
  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(ahora);
  const importe = 35;
  const igv = Math.round(importe * 0.18 * 100) / 100;
  const total = Math.round((importe + igv) * 100) / 100;

  return {
    id: "prueba",
    tipo: "factura",
    serie: "F001",
    numero: `F001-${correlativo}`,
    correlativo,
    cliente_id: "prueba",
    cliente: "SUPERINTENDENCIA NACIONAL DE ADUANAS Y DE ADMINISTRACION TRIBUTARIA",
    cliente_documento: "20131312955",
    cliente_tipo_documento: "RUC",
    cliente_direccion: "AV. GARCILASO DE LA VEGA 1472 LIMA",
    cliente_email: null,
    cotizacion_id: null,
    cotizacion_numero: null,
    pedido: null,
    orden_compra_cliente: null,
    referencia_id: null,
    referencia_numero: null,
    motivo_nota_codigo: null,
    fecha_emision: hoy,
    fecha_vencimiento: null,
    condicion_pago: "contado",
    dias_credito: 0,
    moneda: "USD",
    tipo_cambio: null,
    pen: null,
    mostrar_cuenta: false,
    guia_numero: null,
    cuotas: [],
    op_gravada: importe,
    op_exonerada: 0,
    op_inafecta: 0,
    descuento_global: 0,
    igv,
    total,
    total_letras: null,
    pagado: 0,
    saldo: total,
    estado: "emitido",
    estado_sunat: "pendiente",
    sunat_codigo_respuesta: null,
    sunat_mensaje: null,
    sunat_enviado_en: null,
    sunat_hash_cdr: null,
    detraccion_aplica: false,
    detraccion_porcentaje: 0,
    detraccion_monto: 0,
    detraccion_codigo: null,
    retencion_aplica: false,
    retencion_monto: 0,
    vendedor: null,
    observaciones: null,
    motivo_anulacion: null,
    creado_en: hoy,
    lineas: [
      {
        id: "prueba-1",
        producto_id: null,
        codigo: "6205-2RSH",
        marca: "SKF",
        descripcion: "6205-2RSH RODAMIENTO RIGIDO DE BOLAS (PRUEBA DE CONEXION)",
        unidad: "NIU",
        cantidad: 10,
        valor_unitario: 3.5,
        descuento_pct: 0,
        importe,
      },
    ],
  };
}
