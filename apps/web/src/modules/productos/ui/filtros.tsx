"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La lectura sigue
// pasando en el servidor — la URL es el estado, y así un filtro se puede
// compartir por enlace y sobrevive a recargar la página.

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useParamsVigentes } from "@/lib/use-filtros-url";
import { Combobox, campoBase } from "@rodatech/ui";
import { X } from "lucide-react";

import type { Opcion } from "../dominio/tipos";

export function FiltrosProductosBarra({
  marcas,
  familias,
  subfamilias,
}: {
  marcas: Opcion[];
  familias: Opcion[];
  subfamilias: Opcion[];
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [pendiente, iniciarTransicion] = React.useTransition();

  // Los parámetros vigentes se leen de una ref y no de la clausura.
  //
  // Antes `aplicar` capturaba `params` y se recreaba con cada cambio, así que
  // un temporizador de la búsqueda que ya estaba en vuelo llevaba la copia
  // VIEJA: al dispararse reconstruía la URL sin el filtro recién elegido y lo
  // borraba solo. Con la ref, `aplicar` es estable y siempre parte del estado
  // actual, dispare cuando dispare.
  // Parte del último filtro pedido, no del último cargado (07/10).
  const vigentes = useParamsVigentes();

  /** Aplica un cambio de filtro. Siempre borra el cursor: al cambiar el
   *  criterio, seguir en la página 3 del resultado anterior no significa nada. */
  const aplicar = React.useCallback(
    (clave: string, valor: string) => {
      const siguientes = new URLSearchParams(vigentes.current.toString());
      if (valor) siguientes.set(clave, valor);
      else siguientes.delete(clave);
      siguientes.delete("cursor");

      const query = siguientes.toString();
      vigentes.current = siguientes;
      const destino = query ? `${ruta}?${query}` : ruta;
      // Sin esto, cada render programaba una navegación al mismo sitio.
      if (destino === `${ruta}${params.toString() ? `?${params}` : ""}`) return;

      iniciarTransicion(() => {
        router.replace(destino, { scroll: false });
      });
    },
    [params, ruta, router, vigentes],
  );

  const marca = params.get("marca") ?? "";
  const familia = params.get("familia") ?? "";
  const subfamilia = params.get("subfamilia") ?? "";
  const archivados = params.get("archivados") === "1";
  const hayFiltros =
    Boolean(params.get("q")) || Boolean(marca) || Boolean(familia) || Boolean(subfamilia) || archivados;

  // Al elegir una familia, la subfamilia se limita a las suyas. Sin esto se
  // podían combinar dos niveles incompatibles y la tabla salía vacía sin que
  // se entendiera por qué.
  const subfamiliasVisibles = React.useMemo(
    () =>
      familia
        ? subfamilias.filter((s) => s.familia_id === familia)
        : subfamilias,
    [familia, subfamilias],
  );

  /**
   * Ancho de cada filtro.
   *
   * Willy, 01/09: *«en todos los select que hay tenemos que tener un buscador,
   * porque es una lista larga»*. Los tres de aquí son justo eso —24 marcas, 9
   * familias, 35 sub-familias, y creciendo con cada alta— y son los que más se
   * usan, porque esta barra está encima del catálogo entero.
   *
   * Con ancho fijo y no `flex-1`: un `Combobox` es un botón cuyo texto cambia
   * al elegir, y dejándolo crecer la barra se recolocaba entera cada vez que
   * se aplicaba un filtro.
   */
  const anchoFiltro = "w-full sm:w-48";

  return (
    <div
      className="flex flex-wrap items-center gap-2 px-4 pb-4 sm:px-6"
      data-pendiente={pendiente ? "" : undefined}
    >
      <BuscadorConRetardo valorEnUrl={params.get("q") ?? ""} aplicar={aplicar} />

      <label className="sr-only" htmlFor="f-marca">
        Marca
      </label>
      <Combobox
        id="f-marca"
        className={anchoFiltro}
        opciones={marcas.map((m) => ({ valor: m.id, etiqueta: m.nombre }))}
        // Controlado por la URL, no por estado propio: al volver atrás en el
        // navegador o al limpiar los filtros tiene que reflejar lo que de
        // verdad está aplicado.
        valor={marca || null}
        onCambio={(v) => aplicar("marca", v ?? "")}
        placeholder="Todas las marcas"
        placeholderBusqueda="SKF, FAG, NTN…"
        textoVacio="Ninguna marca coincide."
      />

      <label className="sr-only" htmlFor="f-familia">
        Familia
      </label>
      <Combobox
        id="f-familia"
        className={anchoFiltro}
        opciones={familias.map((c) => ({ valor: c.id, etiqueta: c.nombre }))}
        valor={familia || null}
        onCambio={(v) => {
          // Cambiar de familia invalida la subfamilia elegida.
          const siguientes = new URLSearchParams(vigentes.current.toString());
          if (v) siguientes.set("familia", v);
          else siguientes.delete("familia");
          siguientes.delete("subfamilia");
          siguientes.delete("cursor");
          const query = siguientes.toString();
          vigentes.current = siguientes;
          iniciarTransicion(() => {
            router.replace(query ? `${ruta}?${query}` : ruta, { scroll: false });
          });
        }}
        placeholder="Todas las familias"
        placeholderBusqueda="Rodamiento, retén…"
        textoVacio="Ninguna familia coincide."
      />

      <label className="sr-only" htmlFor="f-subfamilia">
        Subfamilia
      </label>
      <Combobox
        id="f-subfamilia"
        className={anchoFiltro}
        opciones={subfamiliasVisibles.map((x) => ({ valor: x.id, etiqueta: x.nombre }))}
        valor={subfamilia || null}
        onCambio={(v) => aplicar("subfamilia", v ?? "")}
        placeholder="Todas las subfamilias"
        placeholderBusqueda="Rígido de bolas, cónicos…"
        textoVacio="Ninguna sub-familia coincide."
      />

      {hayFiltros ? (
        // Con borde: era un texto subrayado en gris, y en esta casa un botón
        // tiene que parecer un botón (revisión por módulos del 02/10).
        <button
          type="button"
          onClick={() => iniciarTransicion(() => router.replace(ruta, { scroll: false }))}
          className="inline-flex h-control-md items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium hover:bg-[var(--surface-2)]"
        >
          <X className="size-4" aria-hidden />
          Quitar filtros
        </button>
      ) : null}

      <label className="ml-auto flex items-center gap-2 text-sm text-[var(--fg-muted)]">
        <input
          type="checkbox"
          checked={archivados}
          onChange={(e) => aplicar("archivados", e.target.checked ? "1" : "")}
          className="size-4 accent-[var(--ring)]"
        />
        {/* «De baja», como dice la etiqueta de cada producto: «archivados»
            era otra palabra para lo mismo. */}
        Incluir los dados de baja
      </label>
    </div>
  );
}

/**
 * Caja de búsqueda con retardo.
 *
 * Sin él, cada tecla dispararía una consulta contra un catálogo de 2.000+ SKU.
 *
 * Recibe `aplicar` directamente en vez de un `onBuscar` en línea: una función
 * nueva en cada render hacía que el efecto se reprogramara siempre y escribiera
 * la URL sin que nadie hubiera tecleado nada.
 */
function BuscadorConRetardo({
  valorEnUrl,
  aplicar,
}: {
  valorEnUrl: string;
  aplicar: (clave: string, valor: string) => void;
}) {
  const [texto, setTexto] = React.useState(valorEnUrl);

  // Si la URL cambia por fuera —atrás del navegador, botón de limpiar— la caja
  // tiene que seguirla.
  React.useEffect(() => {
    setTexto(valorEnUrl);
  }, [valorEnUrl]);

  React.useEffect(() => {
    const limpio = texto.trim();
    // Solo se navega si de verdad cambió respecto a lo que ya está aplicado.
    if (limpio === valorEnUrl) return;
    const id = setTimeout(() => aplicar("q", limpio), 300);
    return () => clearTimeout(id);
  }, [texto, valorEnUrl, aplicar]);

  return (
    <>
      <label className="sr-only" htmlFor="f-buscar">
        Buscar producto
      </label>
      <input
        id="f-buscar"
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        // Más corto: el largo salía cortado en el teléfono («…descripció»).
        // Y `campoBase`, que es el borde y la altura de los tres buscadores de
        // al lado (revisión por módulos del 02/10).
        placeholder="Buscar por código o descripción…"
        className={`${campoBase} h-control-md min-w-0 flex-1 px-3 text-sm sm:min-w-64`}
      />
    </>
  );
}
