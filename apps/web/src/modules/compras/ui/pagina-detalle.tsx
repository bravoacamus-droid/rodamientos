// «NIU» es el código de SUNAT; en la tienda se dice «UND» (revisión por módulos del 02/10).
import { unidadLegible } from "@/modules/cotizaciones/dominio/unidades";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Button, EstadoBadge, EstadoError, Moneda } from "@rodatech/ui";
import {
  ArrowRight,
  Ban,
  ClipboardPen,
  Info,
  ListChecks,
  PackageCheck,
  PackageOpen,
  Pencil,
  Percent,
  Receipt,
  RotateCcw,
  Scale,
  UserRound,
  Wallet,
  Warehouse,
} from "lucide-react";
import { BotonDescargarPdf } from "@/componentes/boton-pdf";
import { nombreArchivo } from "@/lib/pdf-hoja";
import { misPermisos } from "@/lib/permisos";
import { HistorialDocumento } from "@/modules/bitacora/ui/historial-documento";
import { avisoSinPermiso } from "@/lib/permisos-comun";
import { BotonBloqueado } from "@/componentes/sin-permiso";

import { detalleCompra } from "../api/consultas";
import { quienEsperaEstos } from "../api/por-comprar";
import { AnularCompra } from "./anular";
import { DocumentosCompra } from "./documentos";
import { GastosFicha } from "./gastos-ficha";
import { ParaQuienEs } from "./para-quien";
import { ETIQUETA_MODALIDAD, costeoEstimado } from "../dominio/gastos";
import {
  AvisoFicha,
  BloqueFicha,
  CabeceraFicha,
  CifraFicha,
  DatoFicha,
  DatosFicha,
  PasosFicha,
  VacioFicha,
  type EstadoPaso,
} from "./ficha";
import { emisorParaImprimir } from "@/lib/emisor";
import { VistaPreviaDocumento } from "@/modules/cotizaciones/ui/detalle/vista-previa";
import { DocumentoOrdenCompra } from "./documento-orden";
import { hojaDeOrdenCompra, textoCondicionPago, textoEntrega } from "./papel";
import { enDolares } from "../dominio/moneda";

/**
 * Ficha de una compra.
 *
 * Es un documento. Mientras la orden no es un compromiso de nadie —sin
 * factura del proveedor y sin recepción— se edita (180), como la cotización.
 * Después, corregirla es anularla —con su motivo— y volver a registrarla,
 * igual que en recepciones: un documento que se reescribe en silencio no
 * sirve para cuadrar nada.
 */
export default async function PaginaDetalleCompra({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [resultado, permisos, emisor] = await Promise.all([detalleCompra(id), misPermisos(), emisorParaImprimir()]);

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No se pudo cargar la compra"
        descripcion="La consulta no llegó a completarse."
        detalle={resultado.error}
      />
    );
  }
  if (!resultado.datos) notFound();

  const c = resultado.datos;
  // Lo que dice Configuración › Roles y permisos (143).
  const puedeComprar = permisos.tiene("compras", "crear");
  const puedeAnular = permisos.tiene("compras", "eliminar");
  const puedeEditar = permisos.tiene("compras", "editar");

  // Para quién es. Una compra anulada no espera nadie: enseñar clientes
  // encima de un documento muerto mandaría a repartir mercadería que no viene.
  const espera =
    c.estado === "anulada"
      ? {}
      : await quienEsperaEstos(c.lineas.map((l) => l.producto_id));

  const recibido = c.lineas.reduce((a, l) => a + l.cantidad_recibida, 0);
  const pedido = c.lineas.reduce((a, l) => a + l.cantidad, 0);
  const falta = c.lineas.filter((l) => l.cantidad_recibida < l.cantidad);

  /*
    El costo PUESTO de cada producto (097): la columna «PU LIMA» del Excel de
    Willy. Con la misma cuenta que la recepción —`costeoEstimado` es su
    réplica—, así que lo que dice la ficha es lo que entra al kardex.
  */
  const costeo = costeoEstimado(
    c.lineas.map((l) => ({
      key: l.id,
      cantidad: l.cantidad,
      costoUnitario: l.costo_unitario,
      pesoKg: l.peso_kg,
    })),
    c.gastos.map((g) => ({ key: g.id, concepto: g.concepto, monto: g.monto, reparto: g.reparto })),
  );
  // Compras viejas: el total sin detalle se repartía por valor.
  const factorViejo =
    c.gastos.length === 0 && c.gastos_importacion > 0 && c.subtotal > 0
      ? 1 + c.gastos_importacion / c.subtotal
      : null;
  const puestoDe = (l: (typeof c.lineas)[number]): number | null =>
    c.gastos_importacion <= 0
      ? null
      : factorViejo !== null
        ? Math.round(l.costo_unitario * factorViejo * 1e4) / 1e4
        : (costeo.porLinea[l.id] ?? null);
  // Solo si hay pesos: la compra ya no los pide (02/10) y una columna de
  // «sin peso» en cada fila sería un aviso de algo que nadie tiene que hacer.
  const mostrarPeso = c.lineas.some((l) => l.peso_kg > 0);
  const todasConPeso = c.lineas.length > 0 && c.lineas.every((l) => l.peso_kg > 0);
  const etiquetaPuesto = c.tipo === "importacion" ? "Puesto en Lima" : "Con gastos";
  // El signo pegado a su cifra, con espacio de no separación: partidos en dos
  // líneas («$» arriba, «11.58» abajo) es lo que Luis vio feo el 02/10.
  const simbolo = c.moneda === "PEN" ? "S/\u00a0" : "$\u00a0";

  // Los gastos se tocan mientras no haya entrado mercadería: la base los
  // congela en cuanto se recibe (022).
  const editableGastos = c.estado === "registrada";
  // La orden se edita mientras no es un compromiso de nadie (180): lo mismo
  // que comprueba `actualizar_orden_compra` en la base.
  const editableOrden =
    puedeEditar && c.estado === "registrada" && !c.documento_proveedor && c.recepciones.length === 0;
  const archivo = nombreArchivo(c.numero, c.proveedor);
  // Una orden del pedido se registra antes de recibirla; los números y el
  // PDF son opcionales (187; la 182 pedía el archivo y la 186 el número).
  // Luis, 04/11: «si no quiere, que deje pasar nomás». La base lo exige igual.
  const tieneFactura = !c.falta_factura;
  const porRecibir = c.estado !== "anulada" && falta.length > 0;

  const porcentajeRecibido = pedido > 0 ? Math.round((recibido / pedido) * 100) : 0;

  /*
    El paso del flujo (27/11). La compra tiene tres momentos y la ficha los
    decía en tres sitios distintos —el estado, un aviso ámbar y la tarjeta de
    «Recibido»—. Ahora se leen juntos y en orden, arriba.
  */
  const pasos: { nombre: string; estado: EstadoPaso }[] = [
    { nombre: "Orden pedida", estado: "hecho" },
    { nombre: "Compra registrada", estado: c.falta_factura ? "ahora" : "hecho" },
    {
      nombre: recibido > 0 && recibido < pedido ? "Mercadería recibida (en parte)" : "Mercadería recibida",
      estado: c.falta_factura ? "falta" : falta.length === 0 ? "hecho" : "ahora",
    },
  ];

  return (
    <>
    <div className="flex flex-col gap-5 print:hidden">
      <CabeceraFicha
        ruta="/compras"
        volver={{ href: "/compras", texto: "Volver a órdenes de compra" }}
        tipo={c.tipo === "importacion" ? "Orden de compra · importación" : "Orden de compra"}
        numero={c.numero}
        estado={<EstadoBadge estado={c.estado} size="md" />}
        etiquetas={
          /* Con su vía desde la 095. Las importaciones de antes no la
             guardaban y siguen diciendo «Importación» a secas: es lo que se
             sabe de ellas, y no se inventa. */
          c.tipo === "importacion" ? (
            <Badge tone="neutral" className="px-3 py-1 text-base">
              {c.via_importacion
                ? ETIQUETA_MODALIDAD[c.via_importacion]
                : "Importación"}
            </Badge>
          ) : null
        }
        quien={{
          rotulo: "Proveedor",
          nombre: c.proveedor ?? "—",
          detalle: c.proveedor_documento ? `RUC ${c.proveedor_documento}` : undefined,
        }}
        cifra={{
          rotulo: "Total de la orden",
          valor: <Moneda valor={c.total} moneda={c.moneda} />,
          // En soles, también lo que es en dólares para el sistema (06/11).
          pie:
            c.moneda === "PEN" && c.tipo_cambio
              ? `US$ ${enDolares(c.total, c.tipo_cambio).toFixed(2)} al T.C. ${c.tipo_cambio.toFixed(3)}`
              : c.moneda === "PEN"
                ? "sin tipo de cambio"
                : c.igv > 0
                  ? "con IGV"
                  : "no afecto a IGV",
        }}
        acciones={
          <>
          {/* La acción que toca va primero y en dorado: sobre el azul, el
              botón azul de siempre no se distinguía del fondo (27/11). */}
          {c.falta_factura && c.estado === "registrada" ? (
            <Button asChild variant="accent" size="lg">
              <Link href={`/compras/${c.id}/factura`}>
                Registrar compra
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          ) : null}
          {porRecibir && tieneFactura ? (
            <Button asChild variant="accent" size="lg">
              <Link href={`/recepciones/nueva?compra=${c.id}`}>
                <PackageCheck aria-hidden="true" />
                Recibir mercadería
              </Link>
            </Button>
          ) : porRecibir ? (
            <BotonBloqueado
              mensaje="Antes de recibir la mercadería, regístrala con «Registrar compra». El número de factura es opcional."
            >
              Recibir mercadería
            </BotonBloqueado>
          ) : null}
          {/* Editar la orden mientras nadie la usó (180): sin factura del
              proveedor y sin recepción. Willy, 02/11: «cada orden de compra
              es como una cotización». */}
          {editableOrden ? (
            <Button asChild variant="outline">
              <Link href={`/compras/${c.id}/editar`}>
                <Pencil aria-hidden />
                Editar orden
              </Link>
            </Button>
          ) : null}
          {/* La orden en papel, para mandársela al proveedor (12/10), y en
              PDF directo (02/11), como la cotización y la factura. */}
          {c.estado !== "anulada" ? (
            <>
              <VistaPreviaDocumento
                numero={c.numero}
                junto={<BotonDescargarPdf hoja={hojaDeOrdenCompra(c, emisor)} nombre={archivo} />}
              >
                <DocumentoOrdenCompra c={c} emisor={emisor} />
              </VistaPreviaDocumento>
              <BotonDescargarPdf hoja={hojaDeOrdenCompra(c, emisor)} nombre={archivo} variante="outline" />
            </>
          ) : null}
          {/*
            «Volver a comprar» (§AO.5). Willy, 24/09: «se me acabó el stock y
            quiero comprar lo mismo una segunda vez… pero no sé a quién le he
            comprado… ni a qué precio… ni cuánto me han cobrado por el envío».

            Abre una compra NUEVA con todo esto propuesto: proveedor, productos,
            cantidades, modalidad, courier y gastos. Solo para quien puede
            comprar —un botón que lleva a «no tienes permiso» es peor que no
            tener botón— y también en una anulada: que se anulara no quita
            que se quiera volver a pedir lo mismo.
          */}
          {puedeComprar ? (
            <Button asChild variant="outline">
              <Link href={`/compras/nueva?desde=${c.id}`}>
                <RotateCcw aria-hidden />
                Volver a comprar
              </Link>
            </Button>
          ) : null}
          {c.estado === "anulada" ? null : puedeAnular ? (
            <AnularCompra id={c.id} numero={c.numero} recibida={recibido > 0} />
          ) : (
            <BotonBloqueado mensaje={avisoSinPermiso("compras", "eliminar", permisos.nombreRol)}>
              Anular
            </BotonBloqueado>
          )}
          </>
        }
      >
        {c.estado !== "anulada" ? <PasosFicha pasos={pasos} /> : null}
      </CabeceraFicha>

      {/* La orden del pedido todavía sin la factura del proveedor (128). */}
      {c.falta_factura && c.estado === "registrada" ? (
        <AvisoFicha
          icono={<ClipboardPen />}
          titulo="Orden pedida: falta registrar la compra"
          accion={
            <Button asChild size="lg">
              <Link href={`/compras/${c.id}/factura`}>
                Registrar compra
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          }
        >
          Cuando la compres, regístrala: cómo llegó y lo que cobró. El número de factura, la guía y el PDF son
          opcionales; registrada, ya se puede recibir.
        </AvisoFicha>
      ) : null}

      {/* Comprada y sin recibir (04/11): la compra 005 se registró y nadie
          la recibió, así que el stock no se enteró y otra cotización pidió
          comprarla otra vez. Que se vea, con el botón. */}
      {!c.falta_factura && porRecibir && tieneFactura && recibido === 0 ? (
        <AvisoFicha
          icono={<PackageOpen />}
          titulo="Comprada, falta recibir la mercadería"
          accion={
            <Button asChild size="lg">
              <Link href={`/recepciones/nueva?compra=${c.id}`}>
                <PackageCheck aria-hidden="true" />
                Recibir mercadería
              </Link>
            </Button>
          }
        >
          Hasta que la recibas no entra al almacén: el stock sigue sin contarla y las cotizaciones piden
          comprarla otra vez.
        </AvisoFicha>
      ) : null}

      {/*
        Para quién es (Luis, 09/10: *«enlazado al cliente y la cotización»*).
        Antes solo lo decían las observaciones, en gris y al final.
      */}
      {c.para ? (
        <AvisoFicha
          tono="sale"
          icono={<UserRound />}
          titulo={`Para el pedido ${c.pedido?.numero ?? c.para.numero} de ${c.para.cliente}`}
          accion={
            <>
              {c.pedido ? (
                <Button asChild variant="outline">
                  <Link href={`/pedidos/${c.pedido.id}`}>
                    Ver el pedido
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              ) : null}
              <Button asChild variant="outline">
                <Link href={`/cotizaciones/${c.para.cotizacionId}`}>
                  Ver la cotización
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </>
          }
        >
          {c.pedido ? <span className="text-[var(--fg-muted)]">Cotización {c.para.numero}</span> : null}
        </AvisoFicha>
      ) : null}

      {/* Solo el motivo: `compras` no guarda quién anuló ni cuándo (no tiene
          `anulada_por` ni `anulada_en`, a diferencia de guías y facturas).
          Lo apunta la bitácora, y se lee al pie en «Quién lo hizo y cuándo». */}
      {c.estado === "anulada" && c.motivo_anulacion ? (
        <AvisoFicha tono="urgente" icono={<Ban />} titulo="Esta orden está anulada">
          Motivo: {c.motivo_anulacion}
        </AvisoFicha>
      ) : null}

      {/* --------------------------------------------------------- Cifras */}
      {/* El total ya es el héroe de la cabecera; aquí van su desglose y lo
          recibido, con el filo que dice qué significa cada cifra (27/11). */}
      <div className="@container">
        <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @4xl:grid-cols-4">
          <CifraFicha
            etiqueta="Subtotal"
            valor={<Moneda valor={c.subtotal} moneda={c.moneda} />}
            pie="sin IGV"
            tono="sale"
            icono={<Receipt />}
          />
          <CifraFicha
            etiqueta="IGV"
            valor={<Moneda valor={c.igv} moneda={c.moneda} />}
            pie={c.igv === 0 ? "no afecto" : "18 %"}
            tono="sale"
            icono={<Percent />}
          />
          <CifraFicha
            etiqueta="Total"
            valor={<Moneda valor={c.total} moneda={c.moneda} />}
            pie={
              c.moneda === "PEN" && c.tipo_cambio
                ? `US$ ${enDolares(c.total, c.tipo_cambio).toFixed(2)} al T.C. ${c.tipo_cambio.toFixed(3)}`
                : c.moneda === "PEN"
                  ? "sin tipo de cambio"
                  : undefined
            }
            tono="sale"
            icono={<Wallet />}
          />
          <CifraFicha
            etiqueta="Recibido"
            valor={`${porcentajeRecibido} %`}
            pie={`${recibido} de ${pedido} ${pedido === 1 ? "unidad" : "unidades"}`}
            tono={
              c.estado === "anulada"
                ? "marca"
                : recibido >= pedido
                  ? "entra"
                  : "porHacer"
            }
            icono={<PackageCheck />}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* ------------------------------------------------------ Líneas */}
        <BloqueFicha
          icono={<ListChecks />}
          titulo="Qué se pidió"
          ayuda={`${c.lineas.length} ${c.lineas.length === 1 ? "producto" : "productos"} · ${pedido} ${
            pedido === 1 ? "unidad" : "unidades"
          }`}
        >
          {/*
            EN MÓVIL, TARJETAS. Medido a 390 px: esta pantalla se salía —el
            `main` pedía 588— y la tabla, 539.

            Una línea de compra se lee para contestar «¿llegó ya?», así que la
            tarjeta pone el pedido contra lo recibido en la misma línea y con
            el color que ya usaba la tabla.

            Desde la revisión por módulos del 02/10 el corte lo pone ESTA caja
            (`@container`) y no la pantalla: a 820 con el menú abierto la
            tabla se salía 204 px de la página. Y como a 1280 la caja también
            queda estrecha, la tarjeta lleva ya el costo unitario —antes solo
            en la tabla— y las cifras con su moneda: «240.00» a secas no decía
            de qué.
          */}
          <div className="flex flex-col gap-2.5 @3xl:hidden">
            {c.lineas.map((l) => {
              const completa = l.cantidad_recibida >= l.cantidad;
              return (
                <div
                  key={l.id}
                  className={`rounded-lg border border-l-4 border-[var(--border)] bg-[var(--surface-2)] p-3 ${
                    completa ? "border-l-[var(--ok)]" : "border-l-[var(--warn)]"
                  }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link
                      href={`/productos/${l.producto_id}`}
                      className="font-mono text-base font-bold text-brand-600 hover:underline dark:text-brand-300"
                    >
                      {l.codigo}
                    </Link>
                    <Moneda valor={l.importe} moneda={c.moneda} tamano="lg" enfasis="fuerte" />
                  </div>

                  <p className="mt-1 text-base">{l.descripcion}</p>
                  {l.marca ? (
                    <p className="text-sm text-[var(--fg-subtle)]">{l.marca}</p>
                  ) : null}

                  <p className="mt-2 text-sm">
                    <span className="text-[var(--fg-muted)]">Pedidas </span>
                    <span className="tabular font-medium">
                      {l.cantidad} {unidadLegible(l.unidad)}
                    </span>
                    <span className="text-[var(--fg-muted)]"> · llegaron </span>
                    <span
                      className={`tabular font-semibold ${
                        completa ? "text-[var(--ok)]" : "text-[var(--warn)]"
                      }`}
                    >
                      {l.cantidad_recibida}
                      {/* Con palabra además del color (27/11). */}
                      {completa ? " · completo" : " · falta"}
                    </span>
                  </p>
                  <p className="mt-1 flex flex-wrap justify-between gap-x-3 text-sm">
                    <span>
                      <span className="text-[var(--fg-muted)]">Costo </span>
                      <span className="tabular whitespace-nowrap">
                        {simbolo}
                        {l.costo_unitario.toFixed(4)}
                      </span>
                      <span className="text-[var(--fg-muted)]"> c/u</span>
                      {mostrarPeso ? (
                        <>
                          <span className="text-[var(--fg-muted)]"> · Peso </span>
                          <span className="tabular whitespace-nowrap">
                            {l.peso_kg > 0 ? `${l.peso_kg}\u00a0kg` : "sin peso"}
                          </span>
                        </>
                      ) : null}
                    </span>
                    {puestoDe(l) !== null ? (
                      <span>
                        <span className="text-[var(--fg-muted)]">{etiquetaPuesto} </span>
                        <span className="tabular whitespace-nowrap font-semibold text-brand-700 dark:text-brand-300">
                          {simbolo}
                          {puestoDe(l)!.toFixed(2)}
                        </span>
                        <span className="text-[var(--fg-muted)]"> c/u</span>
                      </span>
                    ) : null}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="hidden scroll-x @3xl:block">
            <table className="w-full text-base">
              <thead>
                <tr className="cabecera-tabla">
                  <th className="py-2 pr-3 font-medium">Código</th>
                  <th className="py-2 pr-3 font-medium">Descripción</th>
                  <th className="py-2 pr-3 text-right font-medium">Pedido</th>
                  <th className="py-2 pr-3 text-right font-medium">Recibido</th>
                  {mostrarPeso ? (
                    <th className="py-2 pr-3 text-right font-medium">Peso kg</th>
                  ) : null}
                  <th className="py-2 pr-3 text-right font-medium">Costo</th>
                  <th className="py-2 pr-3 text-right font-medium">Importe</th>
                  {c.gastos_importacion > 0 ? (
                    <th className="py-2 text-right font-medium">{etiquetaPuesto}</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {c.lineas.map((l) => {
                  const completa = l.cantidad_recibida >= l.cantidad;
                  return (
                    <tr key={l.id} className="border-b border-[var(--border-soft)] last:border-0">
                      <td className="py-2 pr-3">
                        <Link
                          href={`/productos/${l.producto_id}`}
                          className="font-mono text-sm font-medium text-brand-600 hover:underline"
                        >
                          {l.codigo}
                        </Link>
                        <span className="block text-sm text-[var(--fg-subtle)]">
                          {l.marca}
                        </span>
                      </td>
                      <td className="min-w-[12rem] max-w-sm py-2 pr-3">
                        {/* Entera, no cortada con «…» (27/11): la descripción
                            es lo que dice qué rodamiento es. */}
                        <span className="block break-words">{l.descripcion}</span>
                      </td>
                      <td className="py-2 pr-3 text-right tabular">
                        {l.cantidad} <span className="text-sm text-[var(--fg-subtle)]">{unidadLegible(l.unidad)}</span>
                      </td>
                      <td
                        className={`py-2 pr-3 text-right tabular font-semibold ${
                          completa ? "text-[var(--ok)]" : "text-[var(--warn)]"
                        }`}
                      >
                        {l.cantidad_recibida}
                        {completa ? null : <span className="block text-sm font-medium">falta {l.cantidad - l.cantidad_recibida}</span>}
                      </td>
                      {mostrarPeso ? (
                        <td className="py-2 pr-3 text-right tabular">
                          {l.peso_kg > 0 ? (
                            l.peso_kg
                          ) : (
                            <span className="text-[var(--warn)]">sin peso</span>
                          )}
                        </td>
                      ) : null}
                      <td className="py-2 pr-3 text-right tabular">
                        {l.costo_unitario.toFixed(4)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular font-medium">
                        {l.importe.toFixed(2)}
                      </td>
                      {c.gastos_importacion > 0 ? (
                        <td className="py-2 text-right tabular font-semibold text-brand-700 dark:text-brand-300">
                          {puestoDe(l)?.toFixed(2) ?? "—"}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </BloqueFicha>

        {/* ------------------------------------------------------- Datos */}
        <div className="flex flex-col gap-4">
          {c.estado !== "anulada" ? (
            <ParaQuienEs
              lineas={c.lineas.map((l) => ({
                producto_id: l.producto_id,
                codigo: l.codigo,
                // Lo que FALTA por recibir, no lo que se pidió: si ya llegaron
                // 20 de 50, lo que queda por repartir son 30.
                cantidad: Math.max(l.cantidad - l.cantidad_recibida, 0),
              }))}
              espera={espera}
            />
          ) : null}

          <BloqueFicha icono={<Info />} titulo="Datos de la orden">
            <DatosFicha>
              <DatoFicha etiqueta="Fecha de la factura" valor={c.fecha} />
              <DatoFicha etiqueta="Llega el" valor={c.fecha_estimada ?? "—"} />
              <DatoFicha etiqueta="Pago" valor={textoCondicionPago(c) ?? "—"} />
              <DatoFicha etiqueta="Entrega" valor={textoEntrega(c, emisor) ?? "—"} />
              <DatoFicha etiqueta="Factura" valor={c.documento_proveedor ?? "—"} />
              <DatoFicha etiqueta="Guía" valor={c.guia_proveedor ?? "—"} />
              {c.tipo === "importacion" ? (
                <>
                  <DatoFicha
                    etiqueta={c.via_importacion === "maritima" ? "Naviera o agente" : "Courier"}
                    valor={c.courier ?? "—"}
                  />
                  <DatoFicha
                    etiqueta={c.via_importacion === "maritima" ? "N.° de BL o contenedor" : "Tracking o guía aérea"}
                    valor={c.tracking ?? "—"}
                  />
                </>
              ) : null}
              <DatoFicha etiqueta="Registró" valor={c.comprador ?? "—"} />
            </DatosFicha>

            {/*
              LOS GASTOS, DESGLOSADOS, en las tres modalidades (095).

              Antes era una línea «Gastos: $ 485» y solo en importación. Es
              justo lo que Willy no quería perder (§AO.5): *«no sé a quién le
              he comprado… ni a qué precio… y tampoco sé cuánto me han cobrado
              por el envío; entonces tengo que volver a llamarlos»*. Con el
              desglose a la vista, la próxima vez que importe lo mismo ya sabe
              qué le cobraron y por qué.
            */}
            {/*
              Y desde la 097, con su reparto, la cuenta del $/kg y la puerta
              para añadir lo que llega después —el desaduanaje— mientras la
              compra siga sin recibir. Se enseña también sin gastos si todavía
              se pueden añadir: un bloque vacío con su botón es el camino.
            */}
            {c.gastos_importacion > 0 || (editableGastos && puedeEditar) ? (
              <GastosFicha
                compraId={c.id}
                gastos={c.gastos}
                total={c.gastos_importacion}
                editable={editableGastos}
                puedeTocar={puedeEditar}
                pedirDesaduanaje={
                  c.via_importacion === "aerea" &&
                  !c.gastos.some((g) => /desaduan|aduana/i.test(g.concepto))
                }
                porKg={costeo.porKg}
                kilos={costeo.kilos}
                conPesos={todasConPeso}
                faltanPesos={costeo.faltaPeso.length > 0}
                anulada={c.estado === "anulada"}
              />
            ) : null}

            {/*
              La vuelta a la ronda de precios.

              La ficha decía «De la consulta de precios» y ahí se acababa: ni
              cuál era ni cómo llegar. Es el mismo fallo que Luis vio del otro
              lado el 09/09 —*«esos enlaces ni yo los entiendo»*—, y aquí ni
              enlace había, con la columna guardada desde la 055.

              Sustituye a esa observación en vez de acompañarla: ese texto
              libre dice justo esto, en gris y sin llevar a ninguna parte.
            */}
            {c.consulta ? (
              <div className="mt-3 border-t border-[var(--border-soft)] pt-3">
                <Button asChild variant="outline" size="sm" className="w-full gap-1.5">
                  <Link href={`/compras/precios/${c.consulta.id}`}>
                    <Scale className="size-4" aria-hidden="true" />
                    Ver los precios que se compararon
                  </Link>
                </Button>
                <p className="mt-1.5 text-sm text-[var(--fg-muted)]">
                  Salió de la consulta <strong>{c.consulta.numero}</strong>.
                </p>
              </div>
            ) : null}

            {c.observaciones && !c.consulta ? (
              <p className="mt-3 border-t border-[var(--border-soft)] pt-3 text-base text-[var(--fg-muted)]">
                {c.observaciones}
              </p>
            ) : null}
          </BloqueFicha>

          {/* La proforma confirmada, en PDF (099, §AQ), y la factura, que
              hace falta para recibir (182). */}
          <div id="documentos" className="scroll-mt-4">
          <DocumentosCompra
            compraId={c.id}
            documentos={c.documentos}
            puedeTocar={puedeEditar && c.estado !== "anulada"}
          />
          </div>

          <BloqueFicha
            icono={<Warehouse />}
            tono={c.recepciones.length > 0 ? "entra" : "marca"}
            titulo="Recepciones"
          >
            {c.recepciones.length === 0 ? (
              <VacioFicha
                icono={<PackageOpen />}
                titulo="Todavía no ha llegado nada"
                accion={
                  porRecibir && tieneFactura ? (
                    <Button asChild>
                      <Link href={`/recepciones/nueva?compra=${c.id}`}>
                        <PackageCheck aria-hidden="true" />
                        Recibir mercadería
                      </Link>
                    </Button>
                  ) : null
                }
              >
                El stock se mueve al recibir, no al comprar.
              </VacioFicha>
            ) : (
              <ul className="flex flex-col gap-2">
                {c.recepciones.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3"
                  >
                    <span className="min-w-0">
                      <span className="block font-mono text-base font-bold">{r.numero}</span>
                      <span className="tabular text-sm text-[var(--fg-muted)]">{r.fecha}</span>
                    </span>
                    {/* Un botón con palabra y no el número en azul (27/11). */}
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/recepciones/${r.id}`}>
                        Ver
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </BloqueFicha>
        </div>
      </div>

      {/* Quién la registró, la recibió o la anuló, y cuándo (TR-03). */}
      <HistorialDocumento entidad="compras" id={c.id} />
    </div>

    {/* El papel: montado siempre, visible solo al imprimir (como la cotización). */}
    <div className="hidden print:block">
      <DocumentoOrdenCompra c={c} emisor={emisor} />
    </div>
    </>
  );
}
