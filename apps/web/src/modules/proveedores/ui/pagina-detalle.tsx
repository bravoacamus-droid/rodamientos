import Link from "next/link";
import { Suspense } from "react";
import { HistorialProveedor } from "@/modules/tablero";
import { notFound } from "next/navigation";
import { Badge, Button, EstadoError, Skeleton } from "@rodatech/ui";
import { Globe, PackageCheck, Pencil, Phone, Tags, Truck, Wallet } from "lucide-react";
import { misPermisos } from "@/lib/permisos";
import { avisoSinPermiso } from "@/lib/permisos-comun";
import { BotonBloqueado } from "@/componentes/sin-permiso";

import { productosDeProveedor } from "../api/catalogo";
import { detalleProveedor } from "../api/consultas";
import { ETIQUETA_DOCUMENTO, ETIQUETA_TIPO } from "../dominio/tipos";
import { QueVende } from "./que-vende";
import { BloqueFicha, CabeceraFicha, CifraFicha, DatoFicha, DatosFicha, VacioFicha } from "@/modules/compras/ui/ficha";

/**
 * La ficha de un proveedor.
 *
 * Desde el 27/11 con el patrón de ficha de compras: el nombre en grande
 * sobre el azul, las tres condiciones que deciden a quién pedirle —de dónde
 * es, cómo se le paga y cuánto tarda— como cifras, y el contacto en su propio
 * bloque, que es lo que se viene a buscar para llamarle.
 */
export default async function PaginaDetalleProveedor({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /** El periodo del historial (134). */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const [resultado, permisos, catalogo] = await Promise.all([
    detalleProveedor(id),
    misPermisos(),
    productosDeProveedor(id),
  ]);

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No se pudo cargar el proveedor"
        descripcion="La consulta no llegó a completarse."
        detalle={resultado.error}
      />
    );
  }
  if (!resultado.datos) notFound();

  const p = resultado.datos;
  // Configuración › Roles y permisos (143).
  const puedeEditar = permisos.tiene("proveedores", "editar");

  // El código interno suele SER el RUC: no se repite.
  const documento =
    p.numero_documento && p.codigo.includes(p.numero_documento)
      ? `${ETIQUETA_DOCUMENTO[p.tipo_documento]} ${p.numero_documento}`
      : `${p.codigo}${p.numero_documento ? ` · ${ETIQUETA_DOCUMENTO[p.tipo_documento]} ${p.numero_documento}` : " · sin documento"}`;

  // Ninguno de los 97 proveedores tiene teléfono (CLAUDE.md §2): el hueco
  // tiene que decir qué hacer, no quedarse en una raya.
  const sinComoLlamar = !p.telefono && !p.whatsapp && !p.email;

  return (
    <div className="flex flex-col gap-5">
      {/* No tenía ninguna forma de volver (revisión de diseño del 02/10). */}
      <CabeceraFicha
        ruta="/proveedores"
        volver={{ href: "/proveedores", texto: "Volver a proveedores" }}
        tipo="Proveedor"
        numero={<span className="font-sans">{p.razon_social}</span>}
        estado={p.activo ? <Badge tone="success">Activo</Badge> : <Badge tone="neutral">De baja</Badge>}
        quien={{ rotulo: "Documento", nombre: <span className="font-mono">{documento}</span> }}
        acciones={
          <>
            {puedeEditar ? (
              <Button asChild variant="accent" size="lg">
                <Link href={`/proveedores/${p.id}/editar`}>
                  <Pencil aria-hidden="true" />
                  Editar
                </Link>
              </Button>
            ) : (
              <BotonBloqueado mensaje={avisoSinPermiso("proveedores", "editar", permisos.nombreRol)}>
                Editar
              </BotonBloqueado>
            )}
            {/* Con fondo e icono, como «Editar» en la ficha de cliente: sin
                fondo era gris sobre el gris de la página (revisión por módulos
                del 02/10). */}
            <Button asChild variant="outline">
              <Link href={`/recepciones?proveedor=${p.id}`}>
                <PackageCheck aria-hidden="true" />
                Ver recepciones
              </Link>
            </Button>
          </>
        }
      />

      <div className="@container">
        <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-3">
          <CifraFicha
            etiqueta="Tipo de compra"
            valor={ETIQUETA_TIPO[p.tipo]}
            pie={p.pais || undefined}
            tono="marca"
            icono={<Globe />}
          />
          <CifraFicha
            etiqueta="Condición de pago"
            valor={p.dias_pago === 0 ? "Al contado" : `${p.dias_pago} días`}
            pie="lo que él nos da a nosotros"
            tono="sale"
            icono={<Wallet />}
          />
          <CifraFicha
            etiqueta="Plazo de entrega"
            valor={`${p.lead_time_dias} días`}
            pie="desde que se le pide hasta que llega"
            tono="marca"
            icono={<Truck />}
          />
        </div>
      </div>

      <BloqueFicha
        icono={<Phone />}
        tono={sinComoLlamar ? "porHacer" : "marca"}
        titulo="Contacto"
        ayuda={sinComoLlamar ? "Todavía no hay cómo llamarle ni escribirle." : undefined}
        accion={
          sinComoLlamar && puedeEditar ? (
            <Button asChild variant="outline">
              <Link href={`/proveedores/${p.id}/editar`}>
                <Pencil aria-hidden="true" />
                Añadir teléfono
              </Link>
            </Button>
          ) : undefined
        }
      >
        <DatosFicha className="@3xl:grid-cols-4">
          <DatoFicha etiqueta="Persona de contacto" valor={p.contacto ?? "—"} />
          <DatoFicha etiqueta="Teléfono" valor={p.telefono ?? "—"} />
          <DatoFicha etiqueta="WhatsApp" valor={p.whatsapp ?? "—"} />
          <DatoFicha etiqueta="Correo" valor={p.email ?? "—"} />
          {p.direccion ? (
            <DatoFicha
              etiqueta="Dirección"
              ancho
              valor={
                <>
                  {p.direccion}
                  {p.ubigeo_nombre ? (
                    <span className="block text-sm font-normal text-[var(--fg-muted)]">{p.ubigeo_nombre}</span>
                  ) : null}
                </>
              }
            />
          ) : null}
        </DatosFicha>
        {p.notas ? (
          <div className="border-t border-[var(--border-soft)] pt-3">
            <p className="etiqueta-dato">Notas</p>
            <p className="mt-0.5 whitespace-pre-wrap text-base">{p.notas}</p>
          </div>
        ) : null}
      </BloqueFicha>

      {/* Lo que se le ha comprado (134): cifras, gráfico y sus compras, con
          su periodo. Arriba, que es a lo que se viene desde el reporte de
          compras (Luis, 15/10: el periodo quedaba debajo de toda la lista). */}
      <Suspense key={JSON.stringify(sp)} fallback={<Skeleton className="h-96 w-full" />}>
        <HistorialProveedor id={p.id} sp={sp} />
      </Suspense>

      <BloqueFicha icono={<Tags />} titulo="Marcas que representa">
        {p.marcas.length === 0 ? (
          <VacioFicha icono={<Tags />} titulo="Ninguna todavía">
            No hace falta escribirlas: se rellenan solas con la marca de lo que se le vaya comprando. Y en cuanto haya
            alguna, este proveedor aparece al filtrar por marca.
          </VacioFicha>
        ) : (
          <div className="flex flex-wrap gap-2">
            {p.marcas.map((m) => (
              <span
                key={m}
                className="rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-1.5 text-base font-semibold"
              >
                {m}
              </span>
            ))}
          </div>
        )}
      </BloqueFicha>

      {/* Qué vende. Va aquí, justo debajo de las marcas, porque las dos
          contestan a la misma pregunta —«¿le pido esto a él?»— y la de
          arriba se rellena a partir de la de abajo. */}
      <QueVende
        proveedorId={p.id}
        productos={catalogo.ok ? catalogo.datos : []}
        puedeEditar={puedeEditar}
      />
    </div>
  );
}
