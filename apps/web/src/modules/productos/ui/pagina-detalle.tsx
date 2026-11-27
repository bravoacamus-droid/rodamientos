import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import {
  ArrowRight,
  CircleAlert,
  FileText,
  GitCompareArrows,
  History,
  Layers,
  PackageCheck,
  PackageX,
  Pencil,
  PiggyBank,
  ShieldCheck,
  Tag,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { Badge, EstadoError, Moneda, Skeleton, buttonVariants, cn } from "@rodatech/ui";
import { HistorialProducto } from "@/modules/tablero";
import { misPermisos } from "@/lib/permisos";
import { avisoSinPermiso } from "@/lib/permisos-comun";
import { BotonBloqueado } from "@/componentes/sin-permiso";
import { PanelModulo } from "@/componentes/panel-modulo";

import { proveedoresDeProducto } from "@/modules/proveedores";

import { productoConDetalle } from "../api/consultas";
import { esKit } from "../api/kits";
import { AccionesFicha } from "./acciones-ficha";
import { comprasDelProducto, preciosPorProveedor } from "../api/compras";
import { AQuienPreguntar } from "./a-quien-preguntar";
import { ComprasAnteriores } from "./compras-anteriores";
import { QuienLoVende } from "./quien-lo-vende";
import { MovimientosDelProducto } from "./movimientos";
import { BloqueFicha, ChipIcono, CifraFicha, DatoFicha, PastillaEstado, type TonoFicha } from "./ficha";
import { kardex } from "@/modules/inventario";
import { Volver } from "@/componentes/volver";
import { UNIDADES, abreviaturaUnidad } from "@rodatech/config";

/**
 * Ficha de un producto.
 *
 * Es el «ver producto» del menú: todo lo que hace falta saber antes de
 * cotizarlo o de reponerlo, sin entrar a editar.
 *
 * Rediseño del 27/11. Lo que cambió, y por qué:
 *
 * - El CÓDIGO manda: va en grande y en letra de máquina sobre el azul de la
 *   marca. Es lo que Willy dicta por teléfono y lo que busca en la caja.
 * - El STOCK es la cifra héroe, con su estado DICHO EN PALABRAS («Sin stock»,
 *   «Bajo el mínimo») y no solo con un color: un rojo que no se distingue es
 *   un aviso que no existe.
 * - El precio mínimo de venta tiene tarjeta propia. Antes era un pie gris
 *   bajo el precio de venta; es la cifra que no se puede cruzar al negociar.
 * - Las acciones salen del menú de tres puntos: «Cotizar», «Ver kardex»,
 *   «Actualizar stock» y «Dar de baja» son botones con palabra (CLAUDE.md §2:
 *   la pieza estaba, el camino no se veía).
 * - Las alternativas de otras marcas suben al lado del stock: es la salida
 *   cuando no hay — y «Alternativas de un producto» está en la tabla de §2
 *   por haber sido un enlace ámbar de 12 px.
 */
export default async function PaginaDetalleProducto({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /** El periodo del historial (134). */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  // Un kit tiene su propia ficha: la de kits, que es donde se ve y se cambia
  // lo que lleva dentro. Desde el listado del catálogo se llegaba aquí.
  if (await esKit(id)) redirect(`/productos/kits/${id}`);
  const [resultado, permisos, quienVende, compras, precios, movimientos] = await Promise.all([
    productoConDetalle(id),
    misPermisos(),
    proveedoresDeProducto(id),
    comprasDelProducto(id),
    // A cuánto te lo deja cada uno, juntando lo pagado y lo cotizado (21/09).
    preciosPorProveedor(id),
    // Lo que movió su stock, los últimos seis (13/10).
    kardex({ producto: id, limite: 6 }),
  ]);

  if (!resultado.ok) {
    if (resultado.error.includes("no existe")) notFound();
    return (
      <div className="p-1">
        <EstadoError titulo="No se pudo cargar el producto" descripcion={resultado.error} />
      </div>
    );
  }

  const p = resultado.datos;
  // Configuración › Roles y permisos (143).
  const puedeEditar = permisos.tiene("productos", "editar");
  const puedeComprar = permisos.tiene("compras", "crear");
  // El cuadre de stock no pasa por la matriz: es de Gerencia y Administración,
  // como `ajustarStock` y `registrar_ajuste_inventario` en la base. Antes
  // aquí entraba también Almacén, y la acción le rebotaba al guardar.
  const puedeAjustarStock = permisos.rol === "gerencia" || permisos.rol === "admin";

  // Sobre el COSTO (023). Era el último sitio que seguía dividiendo entre la
  // venta, así que la ficha decía un número y el listado del catálogo otro
  // distinto del mismo producto.
  const margen =
    p.precio_venta > 0 && p.costo_promedio > 0
      ? ((p.precio_venta - p.costo_promedio) / p.costo_promedio) * 100
      : null;
  const bajoMinimo = p.stock_minimo > 0 && p.stock <= p.stock_minimo;
  const unidad = abreviaturaUnidad(p.unidad);

  // El estado del stock, con palabra, icono y color: los tres dicen lo mismo
  // para que ninguno haga falta por sí solo (27/11).
  const estadoStock: { tono: TonoFicha; palabra: string; icono: typeof PackageX } =
    p.stock <= 0
      ? { tono: "malo", palabra: "Sin stock", icono: PackageX }
      : bajoMinimo
        ? { tono: "aviso", palabra: "Bajo el mínimo", icono: TriangleAlert }
        : { tono: "ok", palabra: "Hay stock", icono: PackageCheck };

  // Los botones de la cabecera: todos de 44 px en el teléfono, que es el
  // tamaño de un dedo, y de la altura de control en escritorio.
  const alto = "h-11 md:h-control-md";
  const secundario = cn(buttonVariants({ variant: "outline" }), alto);

  return (
    <div className="flex flex-col gap-5">
      {/* ------------------------------------------------------- Cabecera */}
      <PanelModulo ruta="/productos">
        <div className="flex min-w-0 flex-col gap-3">
          <Volver href="/productos">Volver a productos</Volver>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge tone="neutral" size="md">
              {p.marca}
            </Badge>
            <Badge tone="neutral" size="md">
              {p.familia}
            </Badge>
            {p.archivado ? (
              <PastillaEstado tono="aviso" icono={CircleAlert}>
                De baja
              </PastillaEstado>
            ) : null}
          </div>

          {/* En letra de máquina y sin cortar: un código de rodamiento se
              lee carácter a carácter («6205-2RS», no «6205-2R…»). Puede
              partirse en cualquier sitio antes que salirse del teléfono. */}
          <h1 className="font-mono text-3xl font-extrabold tracking-tight text-[var(--titulo)] [overflow-wrap:anywhere] sm:text-5xl">
            {p.codigo}
          </h1>
          <p className="max-w-3xl text-lg text-[var(--fg)]">{p.descripcion}</p>
          <span className="h-2 w-32 -skew-x-[30deg] rounded-sm bg-accent-400" aria-hidden="true" />
        </div>

        {/* Las acciones, a la vista y con palabra. La principal en dorado —el
            único acento—, porque sobre el azul el botón azul no se ve. */}
        <div className="flex flex-wrap items-center gap-2">
          {p.archivado ? null : (
            <Link
              href={`/cotizaciones/nueva?producto=${p.id}`}
              className={cn(buttonVariants({ variant: "accent" }), alto)}
            >
              <FileText aria-hidden="true" />
              Cotizar este producto
            </Link>
          )}
          {/* Destacado a propósito: responde la pregunta que Willy hace a
              diario —«a quién se lo compré y a cuánto lo cocticé»— y hasta
              ahora se contestaba rebuscando en WhatsApp (26/08, 34:06). */}
          <Link href={`/productos/${p.id}/trazabilidad`} className={secundario}>
            <History aria-hidden="true" />
            Ver compras y ventas
            <ArrowRight aria-hidden="true" />
          </Link>
          {puedeEditar ? (
            <Link href={`/productos/${p.id}/editar`} className={secundario}>
              <Pencil aria-hidden="true" />
              Editar
            </Link>
          ) : (
            <BotonBloqueado mensaje={avisoSinPermiso("productos", "editar", permisos.nombreRol)}>
              Editar
            </BotonBloqueado>
          )}
          <AccionesFicha
            id={p.id}
            codigo={p.codigo}
            descripcion={p.descripcion}
            stock={p.stock}
            archivado={p.archivado}
            puedeEditar={puedeEditar}
            puedeAjustarStock={puedeAjustarStock}
            clase={alto}
          />
        </div>
      </PanelModulo>

      {p.archivado ? (
        <p
          role="note"
          className="flex items-start gap-2 rounded-lg border border-[var(--warn)] bg-[var(--warn-bg)] p-4 text-base"
        >
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-[var(--warn)]" aria-hidden="true" />
          <span>
            <strong>Este producto está dado de baja.</strong> No sale en el cotizador ni en el
            buscador, pero conserva su historial.
            {p.motivo_archivado ? <> Motivo: {p.motivo_archivado}</> : null}
          </span>
        </p>
      ) : null}

      {/* -------------------------------------------------------- Cifras */}
      <div className="@container">
        <div className="grid grid-cols-1 gap-3 @4xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          {/* El stock, la cifra héroe. Filo, icono, cifra y pastilla en el
              color de su estado; la cifra se pinta solo cuando no hay. */}
          <section
            aria-labelledby="cifra-stock"
            className={cn(
              "card elev-2 flex min-w-0 flex-col gap-3 border-l-[6px] p-5",
              estadoStock.tono === "malo"
                ? "border-l-[var(--danger)]"
                : estadoStock.tono === "aviso"
                  ? "border-l-[var(--warn)]"
                  : "border-l-[var(--ok)]",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-2">
                <h2 id="cifra-stock" className="text-lg font-bold text-fg">
                  En almacén
                </h2>
                <PastillaEstado tono={estadoStock.tono} icono={estadoStock.icono}>
                  {estadoStock.palabra}
                </PastillaEstado>
              </div>
              <ChipIcono icono={estadoStock.icono} tono={estadoStock.tono} grande />
            </div>
            <p
              className={cn(
                "tabular break-words text-5xl font-extrabold leading-none tracking-tight",
                estadoStock.tono === "malo" ? "text-[var(--danger)]" : "text-[var(--titulo)]",
              )}
            >
              {p.stock.toLocaleString("es-PE")}
              {/* «und» y no «NIU»: el código de SUNAT en pantalla es jerga. */}
              <span className="ml-2 text-2xl font-bold text-muted">{unidad}</span>
            </p>
            <dl className="grid grid-cols-1 gap-3 border-t border-[var(--border-soft)] pt-3 @md:grid-cols-2">
              <DatoFicha
                etiqueta="Stock mínimo"
                valor={p.stock_minimo > 0 ? `${p.stock_minimo.toLocaleString("es-PE")} ${unidad}` : "Sin fijar"}
                falta={p.stock_minimo <= 0}
              />
              <DatoFicha
                etiqueta="Ubicación en el almacén"
                valor={p.ubicacion ?? "Sin anotar"}
                falta={!p.ubicacion}
              />
            </dl>
            {/* El negativo es deliberado (002): se prefiere un descuadre
                visible a bloquear el despacho. Visible, entonces: se dice. */}
            {p.stock < 0 ? (
              <p className="text-base text-[var(--danger)]">
                Salió más de lo que entró. Revisa los movimientos de abajo o actualiza el stock
                después de contar.
              </p>
            ) : null}
          </section>

          <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
            <CifraFicha
              etiqueta="Precio de venta"
              icono={Tag}
              tono="ok"
              valor={
                p.precio_venta > 0 ? (
                  <Moneda valor={p.precio_venta} tamano="xl" className="text-3xl font-extrabold text-[var(--titulo)]" />
                ) : (
                  <span className="text-2xl font-bold text-muted">Sin precio</span>
                )
              }
              // Con su signo pegado por un espacio que no se parte: «mercado
              // 40.23» a secas no decía en qué moneda (revisión del 02/10).
              pie={p.precio_mercado > 0 ? `En el mercado: $ ${p.precio_mercado.toFixed(2)}` : undefined}
            />
            {/* «Precio mínimo de venta» y no «piso», que era jerga nuestra
                (CLAUDE.md §1). Tarjeta propia desde el 27/11. */}
            <CifraFicha
              etiqueta="Precio mínimo de venta"
              icono={ShieldCheck}
              tono={p.precio_minimo > 0 ? "aviso" : "neutro"}
              valor={
                p.precio_minimo > 0 ? (
                  <Moneda valor={p.precio_minimo} tamano="xl" className="text-3xl font-extrabold text-[var(--titulo)]" />
                ) : (
                  <span className="text-2xl font-bold text-muted">Sin fijar</span>
                )
              }
              pie={
                p.precio_minimo > 0
                  ? "No vendas por debajo de esta cifra."
                  : puedeEditar
                    ? "Se fija en «Editar», en la sección de precios."
                    : "Todavía nadie lo ha fijado."
              }
            />
            <CifraFicha
              etiqueta="Costo promedio"
              icono={Wallet}
              tono="info"
              valor={
                p.costo_promedio > 0 ? (
                  <Moneda valor={p.costo_promedio} tamano="xl" className="text-3xl font-extrabold text-[var(--titulo)]" />
                ) : (
                  <span className="text-2xl font-bold text-muted">Sin costo</span>
                )
              }
              pie={
                p.ultimo_costo > 0
                  ? `Última compra: $ ${p.ultimo_costo.toFixed(2)}`
                  : "Sin compras registradas"
              }
            />
            <CifraFicha
              etiqueta="Margen"
              icono={PiggyBank}
              // Los cortes suben con el denominador (023): sobre el costo, 12 y
              // 20 son el equivalente de los 10 y 15 de cuando se medía sobre
              // la venta.
              tono={margen === null ? "neutro" : margen < 12 ? "malo" : margen < 20 ? "aviso" : "ok"}
              pintarCifra={margen !== null}
              valor={
                margen !== null ? (
                  `${margen.toFixed(2)}%`
                ) : (
                  <span className="text-2xl font-bold text-muted">Sin calcular</span>
                )
              }
              pie={margen === null ? "Falta el costo o el precio de venta." : "Sobre el costo."}
            />
          </div>
        </div>
      </div>

      {/* --------------------------------- Alternativas y quién lo vende */}
      {/* Juntas y arriba: son las dos salidas del mismo callejón —«no tengo
          esto»—, una por otra marca y la otra por otro proveedor. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BloqueFicha
          icono={GitCompareArrows}
          titulo="Alternativas de otras marcas"
          ayuda={
            p.designacion_base ? (
              <>
                Misma medida (<strong className="font-mono text-fg">{p.designacion_base}</strong>),
                otra marca. Sale sola: es lo único que comparten las marcas.
              </>
            ) : (
              "De este código no se pudo sacar la medida, así que sus alternativas no salen solas."
            )
          }
        >
          {p.equivalentes.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-4 text-base text-muted">
              {p.designacion_base
                ? "Todavía no hay otro producto con esta medida en el catálogo."
                : "Puedes anotarlas a mano en «Equivalencias», en el menú de Catálogo."}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {p.equivalentes.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-mono text-lg font-bold text-[var(--titulo)] [overflow-wrap:anywhere]">
                      {e.codigo}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge tone="neutral">{e.marca}</Badge>
                      <span
                        className={cn(
                          "font-semibold",
                          e.stock <= 0 ? "text-[var(--danger)]" : "text-[var(--ok)]",
                        )}
                      >
                        {e.stock <= 0 ? "Sin stock" : `${e.stock.toLocaleString("es-PE")} en almacén`}
                      </span>
                    </span>
                  </div>
                  {e.precio_venta > 0 ? (
                    <Moneda valor={e.precio_venta} tamano="lg" className="font-bold" />
                  ) : (
                    <span className="text-sm text-muted">sin precio</span>
                  )}
                  <Link href={`/productos/${e.id}`} className="boton-fila">
                    Ver producto
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </BloqueFicha>

        <QuienLoVende
          productoId={p.id}
          proveedores={quienVende.ok ? quienVende.datos : []}
          puedeComprar={puedeComprar}
          sinPermiso={avisoSinPermiso("compras", "crear", permisos.nombreRol)}
        />
      </div>

      {/*
        Debajo de las cifras, a lo ancho: es la explicación de la primera
        (el stock). Willy, 06/10: el kardex visto desde el producto —qué
        ajuste, qué motivo, qué día—.
      */}
      <MovimientosDelProducto
        productoId={p.id}
        filas={movimientos.ok ? movimientos.datos.filas : []}
        hayMas={movimientos.ok && movimientos.datos.siguiente !== null}
        unidad={unidad}
        error={movimientos.ok ? null : movimientos.error}
      />

      {/* Cómo se mueve (134): vendido y comprado, precio y costo, margen, a
          quién se le vende y a quién se le compra, con su periodo. */}
      <Suspense key={JSON.stringify(sp)} fallback={<Skeleton className="h-96 w-full" />}>
        <HistorialProducto id={p.id} sp={sp} />
      </Suspense>

      {/* `grid-cols-1` explícito: sin él la columna implícita se mide por su
          contenido, y las tablas de proveedores la estiraban más allá del
          teléfono — las tarjetas salían cortadas por la derecha, a 390 y a
          820 (revisión por módulos del 02/10). */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/*
          Primero «a quién preguntarle» y debajo el diario.

          El orden no es casual: la pregunta que se hace al abrir la ficha de
          un producto que hay que reponer es a quién llamar, no qué pasó la
          última vez. El diario se mira cuando hay una discusión, que es
          mucho menos a menudo.
        */}
        <AQuienPreguntar precios={precios.ok ? precios.datos : []} />

        {/* ------------------------------------------------ Clasificación */}
        <BloqueFicha icono={Layers} titulo="Datos del producto" tono="neutro">
          <dl className="@container grid grid-cols-1 gap-x-6 gap-y-4 [&>*]:min-w-0 sm:grid-cols-2">
            <DatoFicha etiqueta="Familia" valor={p.familia} />
            <DatoFicha etiqueta="Subfamilia" valor={p.subfamilia} />
            {/* Sin tipo no se enseña la fila: un «—» bajo «Descripción
                (tipo)» parecía un dato que faltaba por llenar, y la
                descripción ya está en la cabecera. */}
            {p.tipo ? <DatoFicha etiqueta="Tipo" valor={p.tipo} /> : null}
            <DatoFicha
              etiqueta="Unidad"
              valor={UNIDADES.find((u) => u.codigo === p.unidad)?.etiqueta ?? unidad}
            />
            <DatoFicha
              etiqueta="Código alterno"
              valor={p.codigo_fabricante ?? "Sin anotar"}
              falta={!p.codigo_fabricante}
              mono
            />
            <DatoFicha
              etiqueta="Peso"
              valor={p.peso_kg > 0 ? `${p.peso_kg} kg` : "Sin registrar"}
              falta={p.peso_kg <= 0}
            />
            <DatoFicha
              etiqueta="Proveedor habitual"
              valor={p.proveedor ?? "Sin fijar"}
              falta={!p.proveedor}
            />
          </dl>
        </BloqueFicha>
      </div>

      {/* El diario de compras, a lo ancho: con siete columnas, a media
          pantalla pasaba a tarjetas y se perdía la comparación. */}
      <ComprasAnteriores
        compras={compras.ok ? compras.datos : []}
        productoId={p.id}
        puedeComprar={puedeComprar}
      />
    </div>
  );
}

