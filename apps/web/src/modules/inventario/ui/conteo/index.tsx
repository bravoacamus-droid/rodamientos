"use client";

import { useActionState, useMemo, useReducer, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Combobox,
  Button,
  Input,
  SelectNativo,
  Table,
  TableContenedor,
  TBody,
  THead,
} from "@rodatech/ui";

import { registrarCuadre, type ResultadoAjuste } from "../../acciones/ajustar";
import { cargarHoja } from "../../acciones/cargar-hoja";
import {
  aPayload,
  bloqueos as calcularBloqueos,
  estadoInicial,
  filtrarLineas,
  FILTRO_HOJA_VACIO,
  hayFiltroHoja,
  impactoDe,
  reducir,
  type FiltroHoja,
} from "../../dominio/ajuste";
import { TIPOS_AJUSTE, type ProductoContable } from "../../dominio/tipos";
import { FilaConteo, TarjetaConteo } from "./linea";
import { BarraHoja } from "./barra-hoja";
import { useBorrador } from "@/componentes/borrador";
import { PanelModulo } from "@/componentes/panel-modulo";

/**
 * Hoja de conteo del cuadre de inventario.
 *
 * *"Un botón que lo va a usar con cuidado"* (26:49). El diseño se lo toma en
 * serio de tres maneras:
 *
 *  · Se carga por FILTRO, no producto a producto: un cuadre se hace contra una
 *    estantería o una familia entera.
 *  · Se enseña el IMPACTO en dinero antes de confirmar. Quien firma un cuadre
 *    tiene derecho a ver cuánto mueve antes de firmarlo.
 *  · Solo se manda lo que se ha CONTADO. Una línea en blanco no es un cero: es
 *    un producto que nadie ha mirado.
 */
export function HojaDeConteo({
  familias,
  subfamilias,
  marcas,
  hoy,
}: {
  familias: { id: string; nombre: string }[];
  subfamilias: { id: string; nombre: string; familia_id: string }[];
  marcas: { id: string; nombre: string }[];
  /** La fecha la fija el servidor: el dominio es puro y no lee reloj. */
  hoy: string;
}) {
  const router = useRouter();
  const [estado, despachar] = useReducer(reducir, estadoInicial(hoy));

  const [familia, setFamilia] = useState("");
  const [subfamilia, setSubfamilia] = useState("");
  const [marca, setMarca] = useState("");
  /** Código o descripción, para traer uno o unos pocos (19/11). */
  const [buscar, setBuscar] = useState("");
  /** El filtro sobre la hoja YA cargada: no vuelve a la base (19/11). */
  const [filtroHoja, setFiltroHoja] = useState<FiltroHoja>(FILTRO_HOJA_VACIO);
  /** Con qué se cargó, en palabras, para la cabecera del Excel y el PDF. */
  const [descripcionCarga, setDescripcionCarga] = useState("");
  const [soloConStock, setSoloConStock] = useState(true);
  const [avisoCarga, setAvisoCarga] = useState<string | null>(null);
  const [cargando, cargar] = useTransition();

  const [resultado, guardar, guardando] = useActionState<
    ResultadoAjuste | null,
    FormData
  >(async (previo, formData) => {
    const r = await registrarCuadre(previo, formData);
    if (r.ok) {
      // Ya está en la base: el borrador sobra.
      olvidarBorrador();
      router.push("/inventario/kardex?referencia=ajuste");
    }
    return r;
  }, null);

  /*
    El conteo a medias, guardado solo en el navegador (13/10). Luis: *«cuando
    esté creando un usuario o rellenando algo, que me salga seguir o comenzar
    desde cero»*. Una hoja de conteo es justo lo que se deja a medias: se
    cuenta una estantería, suena el teléfono, se cierra la pestaña.

    La FECHA no entra: arranca en la de hoy, que la fija el servidor. Un
    cuadre de ayer recuperado hoy se registraría con un día que nadie miró.
  */
  const { aviso: avisoBorrador, olvidar: olvidarBorrador } = useBorrador({
    formulario: "ajuste-inventario",
    id: null,
    datos: {
      tipo: estado.tipo,
      motivo: estado.motivo,
      lineas: estado.lineas,
      familia,
      marca,
      soloConStock,
    },
    // Solo si se contó algo o se explicó el porqué: cargar la hoja sin más se
    // rehace con un clic.
    valeLaPena: (d) =>
      Boolean(d.motivo.trim()) || d.lineas.some((l) => l.cantidadFisica !== null),
    recuperar: (d) => {
      setFamilia(d.familia);
      setMarca(d.marca);
      setSoloConStock(d.soloConStock);
      despachar({ tipo: "cabecera", campo: "tipo", valor: d.tipo });
      despachar({ tipo: "cabecera", campo: "motivo", valor: d.motivo });
      // La hoja tal como quedó, y encima lo contado. «cargar» conserva lo ya
      // contado de lo que está en pantalla, así que primero se vacía.
      despachar({ tipo: "limpiar" });
      despachar({
        tipo: "cargar",
        productos: d.lineas.map((l) => ({
          id: l.productoId,
          codigo: l.codigo,
          descripcion: l.descripcion,
          marca: l.marca,
          subfamilia: l.subfamilia,
          unidad: l.unidad,
          stock: l.cantidadSistema,
          costo_promedio: l.costoUnitario,
        })),
      });
      for (const l of d.lineas) {
        if (l.cantidadFisica !== null) {
          despachar({ tipo: "contar", productoId: l.productoId, valor: l.cantidadFisica });
        }
      }
      // El saldo del sistema es el de cuando se dejó. Al registrar manda el de
      // la base, pero la diferencia en pantalla podría no casar: se dice.
      if (d.lineas.length > 0) {
        setAvisoCarga(
          "Lo que dice el sistema es de cuando lo dejaste. Pulsa «Cargar hoja» para ponerlo al día: lo contado se conserva.",
        );
      }
    },
  });

  const impacto = useMemo(() => impactoDe(estado), [estado]);
  const visibles = useMemo(() => filtrarLineas(estado.lineas, filtroHoja), [estado.lineas, filtroHoja]);
  const subfamiliasVisibles = useMemo(
    () => (familia ? subfamilias.filter((s) => s.familia_id === familia) : subfamilias),
    [familia, subfamilias],
  );
  const bloqueos = useMemo(() => calcularBloqueos(estado), [estado]);

  /**
   * «Cargar hoja» la REEMPLAZA con lo del filtro (lo contado de lo que siga
   * en ella se conserva); «Añadir a la hoja» SUMA lo encontrado a lo que ya
   * hay. Lo segundo es el buscador por producto que pidió Luis el 19/11:
   * escribir un código y añadirlo, sin cargar la familia entera.
   */
  const traerProductos = (modo: "cargar" | "agregar") => {
    setAvisoCarga(null);
    cargar(async () => {
      const r = await cargarHoja({
        familia: familia || undefined,
        subfamilia: subfamilia || undefined,
        marca: marca || undefined,
        q: buscar.trim() || undefined,
        soloConStock,
      });
      if (!r.ok) {
        setAvisoCarga(r.error);
        return;
      }
      const productos: ProductoContable[] = r.datos.filas;
      const nombre = (lista: { id: string; nombre: string }[], id: string) => lista.find((x) => x.id === id)?.nombre;
      const carga = [
        familia ? `Familia ${nombre(familias, familia) ?? ""}` : null,
        subfamilia ? `subfamilia ${nombre(subfamilias, subfamilia) ?? ""}` : null,
        marca ? `marca ${nombre(marcas, marca) ?? ""}` : null,
        buscar.trim() ? `«${buscar.trim()}»` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      if (modo === "agregar") {
        const antes = estado.lineas.length;
        despachar({ tipo: "agregar", productos });
        const ya = new Set(estado.lineas.map((l) => l.productoId));
        const nuevos = productos.filter((p) => !ya.has(p.id)).length;
        setDescripcionCarga((d) => (d && carga ? `${d} + ${carga}` : d || carga));
        setAvisoCarga(
          productos.length === 0
            ? "Ningún producto coincide con esa búsqueda."
            : nuevos === 0
              ? "Ya estaban todos en la hoja."
              : `Se añadieron ${nuevos} a la hoja (ahora son ${antes + nuevos}).`,
        );
        return;
      }
      despachar({ tipo: "cargar", productos });
      setDescripcionCarga(carga || "Todo el almacén");
      setFiltroHoja(FILTRO_HOJA_VACIO);
      if (productos.length === 0) {
        setAvisoCarga("Ningún producto coincide con ese filtro.");
      } else if (r.datos.truncado) {
        setAvisoCarga(
          `Se han cargado los primeros ${productos.length}. Afina el filtro: una hoja más larga no se cuenta de una sentada.`,
        );
      }
    });
  };

  const dinero = (n: number) =>
    n.toLocaleString("es-PE", { style: "currency", currency: "USD" });

  return (
    <form
      action={guardar}
      className="flex flex-col gap-5"
      /*
        Enter en un campo NO confirma el cuadre: se confirma con el botón.

        Revisión por módulos del 02/10. Con el motivo puesto y una línea
        contada, un Enter en la cantidad —que es como se teclea una hoja de
        conteo, número y Enter— disparaba el envío implícito del navegador y
        REGISTRABA el ajuste: mueve stock real y «no hay deshacer». Es el
        mismo fallo que guardó dos cotizaciones sin querer el 02/10.
      */
      onKeyDown={(e) => {
        if (
          e.key === "Enter" &&
          e.target instanceof HTMLInputElement &&
          e.currentTarget.contains(e.target)
        )
          e.preventDefault();
      }}
    >
      <input type="hidden" name="ajuste" value={JSON.stringify(aPayload(estado))} />

      <PanelModulo ruta="/inventario/ajuste">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Cuadrar inventario</h1>
            <p className="text-sm text-[var(--fg-muted)]">
              Cuenta lo que hay de verdad. Al confirmar se registra un ajuste con
              tu nombre y el kardex recalcula el saldo.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              // Sobre el azul del panel, el `hover:bg-brand-50` de `outline` es
              // casi blanco y la letra es blanca: se aclara el vidrio (02/11).
              className="hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)]"
              onClick={() => {
                // Cancelar es decidir no seguir: no se ofrece otra vez.
                olvidarBorrador();
                router.push("/inventario");
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={bloqueos.length > 0 || guardando}>
              {guardando ? "Registrando…" : "Confirmar cuadre"}
            </Button>
          </div>
        </header>
      </PanelModulo>

      {avisoBorrador}

      {resultado && !resultado.ok ? (
        <p className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger)]">
          {resultado.error}
        </p>
      ) : null}

      {/* ----------------------------------------------------- Cabecera */}
      <section className="card p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Tipo de ajuste</span>
            <SelectNativo
              value={estado.tipo}
              onChange={(e) =>
                despachar({ tipo: "cabecera", campo: "tipo", valor: e.target.value })
              }
            >
              {TIPOS_AJUSTE.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </SelectNativo>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Fecha</span>
            <Input
              type="date"
              value={estado.fecha}
              onChange={(e) =>
                despachar({ tipo: "cabecera", campo: "fecha", valor: e.target.value })
              }
            />
          </label>

          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-sm font-medium">
              Motivo <span className="text-[var(--danger)]">*</span>
            </span>
            <Input
              value={estado.motivo}
              onChange={(e) =>
                despachar({ tipo: "cabecera", campo: "motivo", valor: e.target.value })
              }
              placeholder="Conteo físico de agosto, estantería B"
              maxLength={200}
            />
            {/* Obligatorio y no por formalismo: un ajuste sin explicación es un
                descuadre que nadie va a poder auditar en tres meses. */}
            <span className="text-sm text-[var(--fg-subtle)]">
              Quien lea esto dentro de tres meses tiene que entender qué pasó.
            </span>
          </label>
        </div>
      </section>

      {/* -------------------------------------------------- Qué se cuenta */}
      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">Qué vas a contar</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex w-full flex-col gap-1 sm:w-52">
            <label htmlFor="conteo-familia" className="text-sm font-medium text-[var(--fg-muted)]">Familia</label>
            <Combobox
              id="conteo-familia"
              opciones={familias.map((x) => ({ valor: x.id, etiqueta: x.nombre }))}
              valor={familia || null}
              onCambio={(v) => {
                setFamilia(v ?? "");
                // Otra familia invalida la subfamilia elegida.
                setSubfamilia("");
              }}
              placeholder="Todas"
              placeholderBusqueda="Escribe parte del nombre…"
              textoVacio="Ninguna coincide."
            />
          </div>

          <div className="flex w-full flex-col gap-1 sm:w-52">
            <label htmlFor="conteo-subfamilia" className="text-sm font-medium text-[var(--fg-muted)]">Subfamilia</label>
            <Combobox
              id="conteo-subfamilia"
              opciones={subfamiliasVisibles.map((x) => ({ valor: x.id, etiqueta: x.nombre }))}
              valor={subfamilia || null}
              onCambio={(v) => setSubfamilia(v ?? "")}
              placeholder="Todas"
              placeholderBusqueda="Rígido de bolas, cónicos…"
              textoVacio="Ninguna coincide."
            />
          </div>

          <div className="flex w-full flex-col gap-1 sm:w-52">
            <label htmlFor="conteo-marca" className="text-sm font-medium text-[var(--fg-muted)]">Marca</label>
            <Combobox
              id="conteo-marca"
              opciones={marcas.map((x) => ({ valor: x.id, etiqueta: x.nombre }))}
              valor={marca || null}
              onCambio={(v) => setMarca(v ?? "")}
              placeholder="Todas"
              placeholderBusqueda="SKF, FAG, NTN…"
              textoVacio="Ninguna coincide."
            />
          </div>

          <div className="flex w-full flex-col gap-1 sm:w-64">
            <label htmlFor="conteo-buscar" className="text-sm font-medium text-[var(--fg-muted)]">
              Código o descripción
            </label>
            <Input
              id="conteo-buscar"
              type="search"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="6205, retén 50x68…"
              autoComplete="off"
            />
          </div>

          <label className="flex items-center gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={soloConStock}
              onChange={(e) => setSoloConStock(e.target.checked)}
              className="size-4"
            />
            Solo con stock
          </label>

          <Button type="button" variant="outline" onClick={() => traerProductos("cargar")} disabled={cargando}>
            {cargando ? "Cargando…" : estado.lineas.length > 0 ? "Cargar hoja nueva" : "Cargar hoja"}
          </Button>

          {estado.lineas.length > 0 ? (
            <Button type="button" variant="outline" onClick={() => traerProductos("agregar")} disabled={cargando}>
              Añadir a la hoja
            </Button>
          ) : null}
        </div>

        {avisoCarga ? (
          <p className="mt-2 text-sm text-[var(--warn)]">{avisoCarga}</p>
        ) : null}

        {/* Sin `soloConStock` entra el catálogo entero, incluido lo que el
            sistema cree que está a cero. Es lo correcto para un cuadre inicial
            y una trampa para un conteo de rutina. */}
        {!soloConStock ? (
          <p className="mt-2 text-sm text-[var(--fg-subtle)]">
            Vas a cargar también lo que está a cero. Tiene sentido en un cuadre
            inicial; para un conteo de rutina suele sobrar.
          </p>
        ) : null}
      </section>

      {/* -------------------------------------------------------- Líneas */}
      {estado.lineas.length > 0 ? (
        /*
          El impacto va ENCIMA de la hoja salvo en pantallas muy anchas
          (revisión por módulos del 02/10). Al lado, a 1280 con el menú
          abierto, la tabla se quedaba en ~570 px y se cortaban el código y la
          diferencia; y debajo, con una hoja de 400 líneas, el resumen que se
          firma quedaba a 27.000 px del botón de confirmar.
        */
        <div className="flex flex-col-reverse gap-5 2xl:flex-row">
          <section className="@container flex min-w-0 flex-1 flex-col gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4">
            <BarraHoja
              lineas={estado.lineas}
              visibles={visibles}
              filtro={filtroHoja}
              onFiltro={setFiltroHoja}
              onConforme={() =>
                despachar({
                  tipo: "contarTodoConforme",
                  ids: hayFiltroHoja(filtroHoja) ? visibles.map((l) => l.productoId) : undefined,
                })
              }
              descripcionCarga={descripcionCarga}
            />
            {visibles.length === 0 ? (
              <p className="rounded-md border border-dashed border-[var(--border)] p-4 text-center text-sm text-[var(--fg-muted)]">
                Ninguna línea de la hoja coincide con el filtro. Lo contado sigue ahí: quita el filtro para verlo.
              </p>
            ) : null}
            <ul className="flex flex-col gap-2.5 @3xl:hidden">
              {visibles.map((l) => (
                <TarjetaConteo key={l.productoId} linea={l} despachar={despachar} />
              ))}
            </ul>
            <div className="hidden @3xl:block">
            <TableContenedor>
              <Table>
                <THead>
                  <tr>
                    <th className="text-left">Código</th>
                    <th className="text-left">Descripción</th>
                    <th className="text-right">Sistema</th>
                    <th className="text-left">Contado</th>
                    <th className="text-right">Diferencia</th>
                    <th className="text-right">Impacto</th>
                  </tr>
                </THead>
                <TBody>
                  {visibles.map((l) => (
                    <FilaConteo key={l.productoId} linea={l} despachar={despachar} />
                  ))}
                </TBody>
              </Table>
            </TableContenedor>
            </div>
          </section>

          {/* ---------------------------------------------------- Impacto */}
          <aside className="w-full shrink-0 2xl:w-80">
            <div className="card sticky top-4 flex flex-col gap-3 p-4">
              <h2 className="text-sm font-semibold">Impacto del cuadre</h2>

              {/* Con tope de ancho: a lo ancho de 900 px la cifra quedaba
                  lejos de su etiqueta y había que seguir la línea con el
                  dedo (revisión por módulos del 02/10). */}
              <dl className="flex w-full max-w-md flex-col gap-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-[var(--fg-muted)]">Contadas</dt>
                  <dd className="tabular">
                    {impacto.contadas} de {estado.lineas.length}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--fg-muted)]">Con diferencia</dt>
                  <dd className="tabular">{impacto.conDiferencia}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--fg-muted)]">Sobran</dt>
                  <dd className="tabular text-[var(--ok)]">
                    {impacto.unidadesSobran} · {dinero(impacto.valorSobrante)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--fg-muted)]">Faltan</dt>
                  <dd className="tabular text-[var(--danger)]">
                    {impacto.unidadesFaltan} · {dinero(impacto.valorFaltante)}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-[var(--border-soft)] pt-1.5 font-medium">
                  <dt>Neto</dt>
                  <dd
                    className={`tabular ${
                      impacto.impactoNeto < 0 ? "text-[var(--danger)]" : ""
                    }`}
                  >
                    {dinero(impacto.impactoNeto)}
                  </dd>
                </div>
              </dl>

              <p className="text-sm text-[var(--fg-subtle)]">
                Valorado al costo promedio vigente, que es a lo que la base va a
                registrar el movimiento.
              </p>

              {/* Motivos, no un booleano: un botón deshabilitado sin
                  explicación es de las cosas que más se odian de un ERP. */}
              {bloqueos.length > 0 ? (
                <ul className="flex flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2 text-sm text-[var(--fg-muted)]">
                  {bloqueos.map((b) => (
                    <li key={b.campo}>· {b.mensaje}</li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-2 text-sm text-[var(--warn)]">
                  Al confirmar se mueven {impacto.conDiferencia} productos. No hay
                  deshacer: corregirlo sería otro ajuste.
                </p>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </form>
  );
}
