import Link from "next/link";
import { Boxes, Plus } from "lucide-react";
import {
  Badge,
  EstadoError,
  EstadoVacio,
  KpiCard,
  PaginacionKeyset,
  Table,
  TableContenedor,
  TBody,
  THead,
  leerTamano,
} from "@rodatech/ui";

import { listarKits, type KitDetalle } from "../../api/kits";
import { AccionesKit } from "./acciones";
import { FiltrosKits } from "./filtros";

const dolar = (n: number) =>
  n.toLocaleString("es-PE", { style: "currency", currency: "USD" });

/** Toma el primer valor de un search param, que puede venir repetido. */
function uno(v: string | string[] | undefined): string | undefined {
  const valor = Array.isArray(v) ? v[0] : v;
  return valor && valor.length > 0 ? valor : undefined;
}

/** Sin tildes ni mayúsculas, como el resto de los buscadores de la casa. */
const normal = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/**
 * Los kits del catálogo.
 *
 * Luis, 17/09, viendo la primera versión: *«en el panel principal no veo ni
 * filtro, ni los KPIs de información; debería ser lista, aparte de responsivo,
 * diseño escalable — si tengo varios kits se puede hacer larga, que tenga
 * paginación»*.
 *
 * Y tiene razón: era una lista de tarjetas que se lee bien con uno y mal con
 * treinta. Aquí se sigue la composición que el cliente ya aprobó en el resto
 * del ERP —indicadores arriba, barra de filtros, tabla y paginación—, porque
 * una pantalla que se parece a las otras no hay que aprenderla.
 *
 * ---------------------------------------------------------------------------
 * Por qué el filtrado es en MEMORIA y no en la consulta
 * ---------------------------------------------------------------------------
 * Porque «cuántos se pueden armar» no es una columna: se calcula desde el
 * stock de los componentes de cada kit. Filtrar u ordenar por eso en SQL
 * obligaría a una vista materializada que habría que refrescar con cada
 * movimiento de almacén.
 *
 * Y porque son POCOS: Willy tiene tres y habla de «uno por máquina». Con
 * decenas esto sobra; el día que sean cientos, la paginación ya está puesta y
 * lo que cambia es de dónde salen las filas, no la pantalla.
 */
export async function PaginaKits({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = searchParams ? await searchParams : {};
  const q = uno(sp.q);
  const estado = uno(sp.estado); // "armables" | "faltos" | undefined
  const verArchivados = uno(sp.archivados) === "1";
  const porPagina = leerTamano(uno(sp.n));
  const pagina = Math.max(1, Number(uno(sp.p) ?? 1) || 1);

  const r = await listarKits();
  if (!r.ok) {
    return <EstadoError titulo="No se pudieron cargar los kits" detalle={r.error} />;
  }

  const todos = r.datos;
  const activos = todos.filter((k) => !k.archivado);

  // Los indicadores miran SIEMPRE el catálogo entero, no la página: un
  // «2 sin material» que cambiara al filtrar no sería un indicador, sería un
  // recuento de lo que hay en pantalla.
  const sinMaterial = activos.filter((k) => k.armable <= 0).length;
  const valorizado = activos.reduce((t, k) => t + k.precioVenta * k.armable, 0);

  const busca = q ? normal(q) : "";
  const filtrados = (verArchivados ? todos : activos).filter((k) => {
    if (busca && !normal(`${k.codigo} ${k.descripcion}`).includes(busca)) return false;
    if (estado === "armables" && k.armable <= 0) return false;
    if (estado === "faltos" && k.armable > 0) return false;
    return true;
  });

  const desde = (pagina - 1) * porPagina;
  const enPagina = filtrados.slice(desde, desde + porPagina);
  const hayMas = desde + porPagina < filtrados.length;

  return (
    <div className="flex flex-col gap-5 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Kits</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Varios productos que se cotizan y se facturan como uno solo, con un
            precio total.
          </p>
        </div>
        <Link
          href="/productos/kits/nuevo"
          className="inline-flex h-control-md items-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          <Plus className="size-[18px]" />
          Nuevo kit
        </Link>
      </div>

      {/* Tres y no cuatro: un indicador que no decide nada es ruido. Estos son
          los que se miran antes de prometer una entrega. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <KpiCard
          etiqueta="Kits activos"
          valor={activos.length.toLocaleString("es-PE")}
          detalle="sin contar archivados"
        />
        <KpiCard
          etiqueta="Sin material"
          valor={sinMaterial.toLocaleString("es-PE")}
          detalle="falta alguna pieza para armarlos"
        />
        <KpiCard
          etiqueta="Listos para vender"
          valor={dolar(valorizado)}
          detalle="a precio de kit, con el stock de hoy"
        />
      </div>

      <FiltrosKits q={q} estado={estado} archivados={verArchivados} />

      {filtrados.length === 0 ? (
        <EstadoVacio
          titulo={
            todos.length === 0 ? "Todavía no hay kits" : "Ningún kit coincide"
          }
          descripcion={
            todos.length === 0
              ? "Un kit junta varios productos con un código y un precio propios. El cliente lo pide por ese código y en la cotización sale como un solo ítem."
              : "Prueba con otro código, o quita los filtros."
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <TableContenedor>
            <Table>
              <THead>
                <tr>
                  <th className="text-left">Código</th>
                  <th className="text-left">Descripción</th>
                  <th className="text-right">Se arman</th>
                  <th className="text-left">Lo frena</th>
                  <th className="text-right">Piezas</th>
                  <th className="text-right">Precio</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </THead>
              <TBody>
                {enPagina.map((k) => (
                  <FilaKit key={k.id} kit={k} />
                ))}
              </TBody>
            </Table>
          </TableContenedor>

          <PaginacionKeyset
            cantidadEnPagina={enPagina.length}
            total={filtrados.length}
            porPagina={porPagina}
            cursorSiguiente={hayMas ? String(pagina + 1) : null}
            cursorAnterior={pagina > 1 ? String(pagina - 1) : null}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Una fila de la tabla.
 *
 * La fila ENTERA no es un enlace, y el código tampoco: es la regla de la casa
 * desde el 08/09 —una celda pulsable no se ve pulsable, y un texto azul obliga
 * a descubrir que lo es—. Lo que se pulsa son los dos botones de la derecha,
 * como en las otras diez tablas del ERP.
 */
function FilaKit({ kit: k }: { kit: KitDetalle }) {
  const freno =
    k.componentes.length > 1
      ? k.componentes.reduce(
          (peor, c) => (c.alcanzaPara < peor.alcanzaPara ? c : peor),
          k.componentes[0]!,
        )
      : null;

  return (
    <tr className={k.archivado ? "opacity-60" : ""}>
      {/*
        El código ya NO es el enlace.

        Luis, 17/09: *«¿por qué no tenemos los botones necesarios, ver,
        editar?»*. Un código azul subrayado obliga a descubrir que se puede
        pulsar; dos botones con su palabra, no. Es la regla de la primera
        página, y la columna de acciones es como se resuelve en las otras diez
        tablas del ERP.
      */}
      <td className="whitespace-nowrap">
        <span className="inline-flex items-center gap-2 font-mono font-medium">
          <Boxes className="size-4 shrink-0 text-[var(--fg-muted)]" />
          {k.codigo}
        </span>
        {k.archivado ? (
          <Badge tone="neutral" size="xs" className="ml-2">
            de baja
          </Badge>
        ) : null}
      </td>

      <td className="text-sm">{k.descripcion}</td>

      <td className="text-right">
        <span className="tabular font-medium">{k.armable}</span>
        {k.armable <= 0 ? (
          <Badge tone="danger" size="xs" className="ml-2">
            falta material
          </Badge>
        ) : null}
      </td>

      {/* La respuesta a «¿por qué solo 3?», sin tener que abrir el kit. */}
      <td className="text-sm text-[var(--fg-muted)]">
        {freno && k.armable === freno.alcanzaPara ? (
          <span className="font-mono">{freno.codigo}</span>
        ) : (
          "—"
        )}
      </td>

      <td className="text-right tabular text-sm">{k.componentes.length}</td>

      <td className="text-right">
        <span className="tabular font-medium">{dolar(k.precioVenta)}</span>
        {/* Cuando lo que se cobra no es la suma, se dice: no es un error
            —un kit se vende redondeado— pero no saberlo sí lo sería. */}
        {Math.abs(k.precioVenta - k.sumaVenta) >= 0.01 ? (
          <span className="block text-sm text-[var(--fg-muted)]">
            suma {dolar(k.sumaVenta)}
          </span>
        ) : null}
      </td>

      <td className="text-right">
        <AccionesKit kit={k} />
      </td>
    </tr>
  );
}
