import Link from "next/link";
import { Badge, EstadoError, EstadoVacio, PaginacionKeyset } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { listarProveedores } from "../api/consultas";
import { ETIQUETA_TIPO, type FiltrosProveedores } from "../dominio/tipos";
import { AccionesFila } from "./acciones-fila";

/**
 * Tabla del maestro de proveedores.
 *
 * La columna que la diferencia de la de clientes es **Marcas**: en una
 * distribuidora de rodamientos, «¿quién me vende SKF?» es la pregunta que se
 * le hace al maestro, y sin esa columna habría que abrir las fichas una a una.
 *
 * En móvil NO es una tabla: por debajo de `md` cada proveedor es una tarjeta
 * con lo mismo apilado, igual que en el resto del ERP.
 */
export async function TablaProveedores({ filtros }: { filtros: FiltrosProveedores }) {
  const [resultado, perfil] = await Promise.all([
    listarProveedores(filtros),
    perfilActual(),
  ]);

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No se pudo cargar el maestro de proveedores"
        descripcion="La consulta no llegó a completarse."
        detalle={resultado.error}
      />
    );
  }

  const { filas, siguiente } = resultado.datos;

  if (filas.length === 0) {
    const filtrando = Boolean(filtros.q || filtros.tipo || filtros.marca);
    return (
      <EstadoVacio
        titulo={filtrando ? "Ningún proveedor coincide" : "Todavía no hay proveedores"}
        descripcion={
          filtrando
            ? "Prueba con menos filtros, o busca por RUC."
            : "Crea el primero con «Nuevo proveedor». También se puede dar de alta sobre la marcha al recibir mercadería."
        }
      />
    );
  }

  const rol = perfil?.activo ? perfil.rol : null;
  const puedeEditar = rol !== null && ["gerencia", "admin", "compras"].includes(rol);

  return (
    <>
      {/* ------------------------------------------------ Escritorio */}
      <div className="scroll-x hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
              {/*
                Sin columna «Documento»: los 97 proveedores entraron del Excel
                con el código formado a partir del RUC —«RUC-20605598553»— y
                debajo del nombre ya se ve. Tenerlo en su propia columna era
                el mismo número dos veces en la misma fila.
              */}
              <th className="px-4 py-2.5 font-medium">Proveedor</th>
              <th className="px-4 py-2.5 font-medium">Marcas</th>
              <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Contacto</th>
              <th className="px-4 py-2.5 text-right font-medium">Pago</th>
              <th className="px-4 py-2.5 text-right font-medium">Entrega</th>
              <th className="px-4 py-2.5 font-medium">Tipo</th>
              {/* Con botones de verdad en la fila, la cabecera se dice en voz
                  alta: un `sr-only` valía cuando ahí solo había tres puntos. */}
              <th className="px-4 py-2.5 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((p) => (
              <tr
                key={p.id}
                className={`border-b border-[var(--border-soft)] transition-colors hover:bg-[var(--surface-2)] ${
                  p.activo ? "" : "opacity-60"
                }`}
              >
                <td className="max-w-xs px-4 py-2.5">
                  <Link
                    href={`/proveedores/${p.id}`}
                    className="block truncate font-medium text-brand-600 hover:underline"
                  >
                    {p.razon_social}
                  </Link>
                  <span className="block font-mono text-xs text-[var(--fg-subtle)]">
                    {p.codigo}
                    {p.activo ? "" : " · de baja"}
                  </span>
                </td>

                <td className="max-w-xs px-4 py-2.5">
                  {p.marcas.length === 0 ? (
                    <span className="text-xs text-[var(--fg-subtle)]">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {p.marcas.slice(0, 4).map((m) => (
                        <span
                          key={m}
                          className="rounded-sm bg-[var(--surface-2)] px-1.5 py-0.5 text-xs"
                        >
                          {m}
                        </span>
                      ))}
                      {p.marcas.length > 4 ? (
                        <span className="px-1 py-0.5 text-xs text-[var(--fg-subtle)]">
                          +{p.marcas.length - 4}
                        </span>
                      ) : null}
                    </div>
                  )}
                </td>
                {/* La celda entera iba en 12 px. El nombre de a quién se llama
                    no es una etiqueta que se reconoce: se lee, y va en 14. El
                    número debajo sí es dato secundario. */}
                <td className="hidden max-w-[14rem] px-4 py-2.5 lg:table-cell">
                  {p.contacto ? <span className="block truncate">{p.contacto}</span> : null}
                  {p.telefono || p.whatsapp ? (
                    <span className="block truncate text-xs text-[var(--fg-muted)]">
                      {p.telefono ?? p.whatsapp}
                    </span>
                  ) : null}
                  {!p.contacto && !p.telefono && !p.whatsapp ? (
                    <span className="text-[var(--fg-subtle)]">—</span>
                  ) : null}
                </td>
                {/* Estas dos iban en 12,8 px, y son cifras: cuánto se paga y en
                    cuánto llega. Ahora en los 14 de la tabla. */}
                <td className="px-4 py-2.5 text-right tabular">
                  {/* 0 días no es «sin dato»: es al contado, que es una
                      condición tan real como 30 días. */}
                  {p.dias_pago === 0 ? "contado" : `${p.dias_pago} d`}
                </td>
                <td className="px-4 py-2.5 text-right tabular">
                  {p.lead_time_dias} d
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`inline-block whitespace-nowrap rounded-sm px-1.5 py-0.5 text-xs font-medium ${
                      p.tipo === "importacion"
                        ? "bg-[var(--info-bg)] text-[var(--info)]"
                        : "bg-[var(--surface-2)] text-[var(--fg-muted)]"
                    }`}
                  >
                    {ETIQUETA_TIPO[p.tipo]}
                  </span>
                </td>
                <td className="px-2 py-1.5">
                  <AccionesFila
                    id={p.id}
                    razonSocial={p.razon_social}
                    activo={p.activo}
                    puedeEditar={puedeEditar}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ----------------------------------------------------- Móvil */}
      <ul className="flex flex-col gap-2.5 p-3 md:hidden">
        {filas.map((p) => (
          /*
            La tarjeta, en vertical, igual que la de clientes.

            Estaba en dos columnas —datos a la izquierda, acciones a la
            derecha— y aguantaba mientras las acciones eran un icono de tres
            puntos. Al sacar «Ver» y «Editar» a botones de verdad (11/09), los
            tres juntos se comían media tarjeta y el nombre se quedaba en
            cuatro letras y puntos suspensivos.

            Ahora: código y estado arriba, el nombre entero, los datos en dos
            columnas y los botones abajo repartiéndose el ancho. Y con su
            borde, suelta de la siguiente —*«todo junto, apegado»*, Luis el
            mismo día—, que es lo único que separa una ficha de otra cuando
            cada una lleva dos botones dentro.
          */
          <li
            key={p.id}
            className={`flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 ${p.activo ? "" : "opacity-60"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 truncate font-mono text-xs text-[var(--fg-subtle)]">
                {p.codigo}
              </span>
              <Badge tone={p.activo ? "success" : "neutral"} size="xs">
                {p.activo ? "Activo" : "De baja"}
              </Badge>
            </div>

            {/* Sin `truncate`: en la tabla el nombre compite con seis columnas;
                aquí tiene la tarjeta entera y se lee completo. */}
            <Link
              href={`/proveedores/${p.id}`}
              className="text-sm font-semibold text-brand-600"
            >
              {p.razon_social}
            </Link>

            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              {/* El documento, solo si el codigo no lo lleva ya dentro:
                  misma regla que en la tabla de escritorio. */}
              {p.numero_documento !== null &&
              !p.codigo.includes(p.numero_documento) ? (
                <DatoTarjeta etiqueta={p.tipo_documento}>
                  {p.numero_documento}
                </DatoTarjeta>
              ) : null}
              <DatoTarjeta etiqueta="Tipo">{ETIQUETA_TIPO[p.tipo]}</DatoTarjeta>
              <DatoTarjeta etiqueta="Pago">
                {p.dias_pago === 0 ? "Contado" : `${p.dias_pago} días`}
              </DatoTarjeta>
              <DatoTarjeta etiqueta="Entrega">
                {p.lead_time_dias} días
              </DatoTarjeta>
              {/* El contacto, que en escritorio tiene su columna y en la
                  tarjeta no bajaba. Es a quién se llama para pedir precio, y
                  en el teléfono es justamente cuando hace falta. Hoy los 97
                  proveedores entraron del Excel sin un solo número (CLAUDE.md
                  §2), así que la mitad de las tarjetas dirá «Sin datos de
                  contacto» — y eso también es información: dice a cuáles les
                  falta la ficha. */}
              <div className="col-span-2 min-w-0">
                <DatoTarjeta etiqueta="Contacto">
                  {p.contacto || p.telefono || p.whatsapp ? (
                    <>
                      {p.contacto ? <span className="block">{p.contacto}</span> : null}
                      {p.telefono || p.whatsapp ? (
                        <span className="block text-[var(--fg-muted)]">
                          {p.telefono ?? p.whatsapp}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-[var(--fg-subtle)]">
                      Sin datos de contacto
                    </span>
                  )}
                </DatoTarjeta>
              </div>
              {p.marcas.length > 0 ? (
                <div className="col-span-2 min-w-0">
                  <DatoTarjeta etiqueta="Marcas">
                    {p.marcas.join(" · ")}
                  </DatoTarjeta>
                </div>
              ) : null}
            </dl>

            <AccionesFila
              id={p.id}
              razonSocial={p.razon_social}
              activo={p.activo}
              puedeEditar={puedeEditar}
              ancho
            />
          </li>
        ))}
      </ul>

      <div className="px-3 py-3 sm:px-4">
        <PaginacionKeyset
          cantidadEnPagina={filas.length}
          cursorSiguiente={siguiente}
          cursorAnterior={null}
        />
      </div>
    </>
  );
}

/**
 * Un dato de la tarjeta de móvil: etiqueta pequeña encima, valor debajo.
 *
 * Sin cabecera de tabla que diga qué es cada cosa, cada dato tiene que
 * presentarse solo. La etiqueta va en 12 px porque no se lee, se reconoce; el
 * valor en 14, que es el mínimo de esta casa.
 */
function DatoTarjeta({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--fg-subtle)]">{etiqueta}</dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </div>
  );
}
