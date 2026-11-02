import JSZip from "jszip";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

/**
 * Los CR de un periodo, en un ZIP con sus carpetas (120).
 *
 * Willy, 14/10: *«con un solo botón descargar todo eso por clientes o por
 * carpetas, cada uno con su correspondiente»* — es lo que le manda al
 * contador cada mes. Filtra por la fecha de la FACTURA (desde/hasta) y, si
 * viene, por cliente. Solo lee, con la sesión y su RLS.
 *
 * 02/11 (Moisés): se descarga desde Cobranzas, que es donde se suben, y
 * `agrupar` elige las carpetas —por cliente, por mes, o cliente y dentro el
 * mes—. Va además `Resumen.csv` con una fila por CR (cliente, RUC, factura,
 * fecha, total, retención, número del CR): lo que el contador cuadra con su
 * declaración sin abrir los PDF uno por uno.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const limpio = (s: string) => s.replace(/[\/:*?"<>|\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
const MESES = ["01 Enero", "02 Febrero", "03 Marzo", "04 Abril", "05 Mayo", "06 Junio", "07 Julio", "08 Agosto", "09 Septiembre", "10 Octubre", "11 Noviembre", "12 Diciembre"];
const mes = (fecha: string) => `${fecha.slice(0, 4)}-${MESES[Number(fecha.slice(5, 7)) - 1] ?? fecha.slice(5, 7)}`;
/** Para Excel en español: punto y coma, y el texto entre comillas. */
const celda = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;

type Agrupar = "cliente" | "mes" | "cliente-mes";

export async function GET(req: Request) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return new Response("Hay que iniciar sesión.", { status: 401 });

  const url = new URL(req.url);
  const desde = url.searchParams.get("desde");
  const hasta = url.searchParams.get("hasta");
  const cliente = url.searchParams.get("cliente");
  const agrupar: Agrupar = (["cliente", "mes", "cliente-mes"] as const).find((a) => a === url.searchParams.get("agrupar")) ?? "cliente";

  const supabase = await clienteServidor();
  let consulta = supabase
    .from("comprobante_retenciones")
    .select(
      "comprobante_id, ruta, nombre, numero_cr, subido_en, comprobantes!inner(numero, fecha_emision, total, retencion_monto, moneda, cliente_id, clientes(razon_social, numero_documento))",
    )
    .order("subido_en");
  if (desde && FECHA.test(desde)) consulta = consulta.gte("comprobantes.fecha_emision", desde);
  if (hasta && FECHA.test(hasta)) consulta = consulta.lte("comprobantes.fecha_emision", hasta);
  if (cliente && UUID.test(cliente)) consulta = consulta.eq("comprobantes.cliente_id", cliente);

  const { data, error } = await consulta.limit(1000);
  if (error) return new Response(error.message, { status: 500 });
  if (!data || data.length === 0) {
    return new Response("No hay comprobantes de retención registrados en ese periodo.", { status: 404 });
  }

  // Lo retenido de verdad: lo cobrado como «Retención» (las facturas del
  // Excel nacieron sin `retencion_monto`, 175). Si no hay cobro, el de la factura.
  const ids = data.map((f) => String(f.comprobante_id));
  const { data: cobros } = await supabase.from("pagos").select("comprobante_id, monto").in("comprobante_id", ids).eq("medio", "retencion");
  const retenido = new Map<string, number>();
  for (const p of cobros ?? []) retenido.set(String(p.comprobante_id), (retenido.get(String(p.comprobante_id)) ?? 0) + Number(p.monto ?? 0));

  const zip = new JSZip();
  const filas: string[] = [
    ["Cliente", "RUC", "Factura", "Fecha factura", "Moneda", "Total", "Retención", "N.° CR", "Subido el", "Archivo"].map(celda).join(";"),
  ];
  for (const fila of data) {
    const comp = fila.comprobantes as unknown as {
      numero: string;
      fecha_emision: string;
      total: number;
      retencion_monto: number;
      moneda: string;
      clientes: { razon_social: string; numero_documento: string | null } | null;
    };
    const { data: archivo } = await supabase.storage.from("comprobantes-retencion").download(fila.ruta);
    if (!archivo) continue;
    const ext = fila.ruta.split(".").pop() ?? "pdf";
    const nombreCliente = limpio(comp.clientes?.razon_social ?? "Sin cliente");
    const carpeta =
      agrupar === "mes" ? mes(comp.fecha_emision) : agrupar === "cliente-mes" ? `${nombreCliente}/${mes(comp.fecha_emision)}` : nombreCliente;
    const nombre = limpio(`${comp.numero}${fila.numero_cr ? ` - CR ${fila.numero_cr}` : " - CR"}`);
    // Por mes, el cliente va en el nombre: si no, dos clientes en la misma
    // carpeta no se distinguen.
    const archivoNombre = agrupar === "mes" ? `${nombre} - ${nombreCliente}.${ext}` : `${nombre}.${ext}`;
    zip.file(`${carpeta}/${archivoNombre}`, await archivo.arrayBuffer());

    const monto = retenido.get(String(fila.comprobante_id)) ?? Number(comp.retencion_monto ?? 0);
    filas.push(
      [
        comp.clientes?.razon_social ?? "",
        comp.clientes?.numero_documento ?? "",
        comp.numero,
        comp.fecha_emision,
        comp.moneda,
        Number(comp.total ?? 0).toFixed(2),
        monto.toFixed(2),
        fila.numero_cr ?? "",
        String(fila.subido_en ?? "").slice(0, 10),
        `${carpeta}/${archivoNombre}`,
      ]
        .map(celda)
        .join(";"),
    );
  }
  // Con BOM: sin él, Excel abre las tildes como «Ã³».
  zip.file("Resumen.csv", "﻿" + filas.join("\r\n"));

  const contenido = await zip.generateAsync({ type: "arraybuffer" });
  const sufijo = [desde, hasta].filter(Boolean).join(" a ") || "todos";
  return new Response(contenido, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="Comprobantes de retencion ${sufijo}.zip"`,
    },
  });
}
