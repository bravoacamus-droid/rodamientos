import Link from "next/link";
import { Badge, EstadoError, EstadoVacio, Moneda, PaginacionKeyset } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { listarClientes } from "../api/consultas";
import {
  ETIQUETA_CONDICION,
  type ClienteLista,
  type FiltrosClientes,
} from "../dominio/tipos";
import { AccionesFila } from "./acciones-fila";

/** Roles que mantienen la cartera. Ventas entra porque es quien da de alta. */
const ROLES_ESCRITURA = ["gerencia", "admin", "ventas"];

/**
 * Listado de la cartera.
 *
 * En escritorio son siete columnas. En un teléfono siete columnas no se leen
 * ni con scroll horizontal, así que por debajo de `md` cada cliente es una
 * tarjeta con la misma información apilada y el mismo menú de acciones. Es el
 * mismo dato, no una versión recortada.
 */
export async function TablaClientes({ filtros }: { filtros: FiltrosClientes }) {
  const [resultado, perfil] = await Promise.all([listarClientes(filtros), perfilActual()]);

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No se pudo cargar la cartera"
        descripcion="La consulta no llegó a completarse. No se ha modificado ni perdido nada."
        detalle={resultado.error}
      />
    );
  }

  const { filas, siguiente } = resultado.datos;

  if (filas.length === 0) {
    const filtrando = Boolean(filtros.q || filtros.condicion);
    return (
      <EstadoVacio
        titulo={filtrando ? "Ningún cliente coincide" : "La cartera está vacía"}
        descripcion={
          filtrando
            ? "Prueba con menos filtros, o busca por RUC. Los bloqueados y los desactivados están ocultos salvo que los pidas."
            : "Crea el primero con «Nuevo cliente»: pegando el RUC, los datos se traen solos."
        }
      />
    );
  }

  const rol = perfil?.activo ? perfil.rol : null;
  const puedeEditar = rol !== null && ROLES_ESCRITURA.includes(rol);

  return (
    <>
      {/* ------------------------------------------------------ Escritorio */}
      <div className="scroll-x hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
              {/*
                El documento baja a la razón social, y la línea de crédito se
                junta con la condición.

                Luis, 11/09: «CÓDIGO: RUC-20538379302» al lado de «DOCUMENTO:
                RUC 20538379302» es el mismo dato dos veces, y ocupaba una
                columna entera. Los 97 clientes entraron del Excel con el
                código formado a partir del RUC, así que la repetición es la
                norma, no la excepción.

                «Línea» estaba vacía en las 97 filas —todos a crédito 0 días—:
                una columna que nunca dice nada roba el ancho de las que sí.
                Cuando Willy ponga líneas, aparece bajo su condición, que es
                donde significa algo.
              */}
              <th className="px-4 py-2.5 font-medium">Código</th>
              <th className="px-4 py-2.5 font-medium">Razón social</th>
              <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Contacto</th>
              <th className="px-4 py-2.5 font-medium">Condición</th>
              <th className="px-4 py-2.5 font-medium">Estado</th>
              {/* Con botones de verdad en la fila, la cabecera se dice en voz
                  alta: un `sr-only` valia cuando ahi solo habia tres puntos. */}
              <th className="px-4 py-2.5 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((c) => (
              <tr
                key={c.id}
                className={`border-b border-[var(--border-soft)] transition-colors hover:bg-[var(--surface-2)] ${
                  c.activo ? "" : "opacity-60"
                }`}
              >
                <td className="px-4 py-2.5">
                  <Link
                    href={`/clientes/${c.id}`}
                    className="font-mono text-[0.8rem] font-medium text-brand-600 hover:underline"
                  >
                    {c.codigo}
                  </Link>
                </td>
                <td className="max-w-xs px-4 py-2.5">
                  <span className="block truncate font-medium">{c.razon_social}</span>
                  {/*
                    El documento, solo si el código no lo lleva ya dentro.

                    Los 97 clientes entraron del Excel con el código formado a
                    partir del RUC —«RUC-20538379302»— así que repetirlo debajo
                    es el mismo número dos veces en la misma fila. En los que se
                    dan de alta a mano el código es otro, y ahí sí hace falta.
                  */}
                  <SegundaLinea c={c} />
                </td>
                <td className="hidden max-w-[14rem] px-4 py-2.5 lg:table-cell">
                  <Contacto c={c} />
                </td>
                <td className="whitespace-nowrap px-4 py-2.5">
                  <Condicion c={c} />
                  {c.condicion_pago === "credito" && c.linea_credito > 0 ? (
                    <span className="mt-0.5 block text-sm text-[var(--fg-muted)]">
                      hasta <Moneda valor={c.linea_credito} tamano="sm" enfasis="suave" />
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-2.5">
                  <Estado c={c} />
                </td>
                <td className="px-2 py-1.5">
                  <AccionesFila
                    id={c.id}
                    codigo={c.codigo}
                    razonSocial={c.razon_social}
                    bloqueado={c.bloqueado}
                    puedeEditar={puedeEditar}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ------------------------------------------------------------ Móvil */}
      <ul className="flex flex-col gap-2.5 p-3 md:hidden">
        {filas.map((c) => (
          /*
            La tarjeta, en vertical.

            Estaba en dos columnas —datos a la izquierda, acciones a la
            derecha— y aguantaba mientras las acciones eran un icono de tres
            puntos. Al sacar «Ver» y «Cotizar» a botones de verdad (11/09),
            los tres juntos se comían media tarjeta y el nombre se quedaba en
            cuatro letras y puntos suspensivos.

            Ahora es una columna: el código y el estado arriba, el nombre
            entero, los datos, y los botones abajo repartiéndose el ancho. Es
            como lo tiene el prototipo de Luis, y es lo que se puede pulsar
            con el pulgar sin apuntar.

            Y suelta, con su borde, no pegada a la siguiente por una raya.
            Luis, el mismo día, mirando facturación: *«todo junto, apegado»*.
            Con cinco datos y dos botones dentro, un píxel de línea no basta
            para decir dónde acaba un cliente y empieza el otro.
          */
          <li
            key={c.id}
            className={`flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 ${c.activo ? "" : "opacity-60"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 truncate font-mono text-xs text-[var(--fg-subtle)]">
                {c.codigo}
              </span>
              <span className="shrink-0">
                <Estado c={c} />
              </span>
            </div>

            {/* Sin `truncate`: en la tabla el nombre compite con seis
                columnas, aquí tiene la tarjeta entera y se lee completo. */}
            <Link
              href={`/clientes/${c.id}`}
              className="text-sm font-semibold text-brand-600"
            >
              {c.razon_social}
            </Link>

            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              {/* El documento, solo si el código no lo lleva ya dentro: misma
                  regla que en la tabla de escritorio. Con los 97 del Excel el
                  código ES el RUC, así que repetirlo aquí sería el mismo
                  número dos veces en una tarjeta de 414 px. */}
              {c.numero_documento !== null &&
              !c.codigo.includes(c.numero_documento) ? (
                <Dato etiqueta={c.tipo_documento}>{c.numero_documento}</Dato>
              ) : null}
              <Dato etiqueta="Condición">
                <Condicion c={c} />
              </Dato>
              <div className="col-span-2 min-w-0">
                <Dato etiqueta="Contacto">
                  <Contacto c={c} />
                </Dato>
              </div>
            </dl>

            <AccionesFila
              id={c.id}
              codigo={c.codigo}
              razonSocial={c.razon_social}
              bloqueado={c.bloqueado}
              puedeEditar={puedeEditar}
              ancho
            />
          </li>
        ))}
      </ul>

      <div className="px-3 py-3 sm:px-4">
        <PaginacionKeyset
          porPagina={filtros.limite}
          cantidadEnPagina={filas.length}
          cursorSiguiente={siguiente}
          cursorAnterior={null}
        />
      </div>
    </>
  );
}

/**
 * Quién y por dónde.
 *
 * Se prioriza el WhatsApp sobre el teléfono fijo porque es por donde de verdad
 * se les escribe. El correo puede faltar y no pasa nada: hay clientes técnicos
 * que a las justas dan un número.
 */
function Contacto({ c }: { c: ClienteLista }) {
  const via = c.whatsapp ?? c.telefono;
  if (!c.contacto && !via && !c.email) {
    return <span className="text-[var(--fg-subtle)]">Sin datos de contacto</span>;
  }
  return (
    <>
      {c.contacto ? <span className="block truncate">{c.contacto}</span> : null}
      <span className="block truncate text-xs text-[var(--fg-subtle)]">
        {[via, c.email].filter(Boolean).join(" · ")}
      </span>
    </>
  );
}

function Condicion({ c }: { c: ClienteLista }) {
  if (c.condicion_pago === "contado") {
    return (
      <Badge tone="neutral" size="xs">
        {ETIQUETA_CONDICION.contado}
      </Badge>
    );
  }
  return (
    <Badge tone="info" size="xs">
      {ETIQUETA_CONDICION.credito}
      {c.dias_credito > 0 ? ` ${c.dias_credito}d` : ""}
    </Badge>
  );
}

/** Solo se pinta cuando hay algo que decir: un cliente normal no lleva insignia. */
function Estado({ c }: { c: ClienteLista }) {
  if (c.bloqueado) {
    return (
      <Badge tone="danger" size="xs">
        Bloqueado
      </Badge>
    );
  }
  if (!c.activo) {
    return (
      <Badge tone="warning" size="xs">
        Desactivado
      </Badge>
    );
  }
  return (
    <Badge tone="success" size="xs">
      Activo
    </Badge>
  );
}

/**
 * Lo que va bajo la razón social: el nombre comercial y el documento.
 *
 * Se calla el documento cuando el código ya lo contiene, que es el caso de
 * los 97 clientes cargados del Excel. Si no queda nada que decir, no se pinta
 * una línea vacía que descuadre el alto de la fila.
 */
function SegundaLinea({ c }: { c: ClienteLista }) {
  const codigoLlevaElDocumento =
    c.numero_documento !== null && c.codigo.includes(c.numero_documento);

  const partes = [
    c.nombre_comercial,
    codigoLlevaElDocumento
      ? null
      : `${c.tipo_documento} ${c.numero_documento ?? "sin documento"}`,
  ].filter(Boolean);

  if (partes.length === 0) return null;

  return (
    <span className="block truncate text-sm text-[var(--fg-subtle)]">
      {partes.join(" · ")}
    </span>
  );
}

/**
 * Un dato de la tarjeta: su etiqueta encima, pequeña, y el valor debajo.
 *
 * En móvil no hay cabecera de tabla que diga qué es cada cosa, así que cada
 * dato se presenta solo. La etiqueta va en 12 px porque no se lee, se
 * reconoce; el valor, en 14, que es el mínimo de esta casa.
 */
function Dato({
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
