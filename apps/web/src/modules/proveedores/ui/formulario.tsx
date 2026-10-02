"use client";

// Cliente: mantiene el estado del formulario, consulta el RUC y guarda.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Combobox, Input, SelectNativo, Textarea } from "@rodatech/ui";
import { Check, ChevronDown } from "lucide-react";

import { Volver } from "@/componentes/volver";
import {
  departamentosUbigeo,
  distritosUbigeo,
  provinciasUbigeo,
} from "@/modules/clientes/acciones/ubigeo";
import { SelectorUbigeoCascada } from "@/modules/clientes/ui/selector-ubigeo";

import { buscarProveedorPorDocumento } from "../acciones/consultar";
import { guardarProveedor } from "../acciones/guardar";
import { esConsultable } from "../dominio/documento";
import { PAISES } from "../dominio/paises";
import {
  ETIQUETA_DOCUMENTO,
  PAIS_POR_DEFECTO,
  type ProveedorDetalle,
  type ProveedorEditable,
  type TipoDocumento,
} from "../dominio/tipos";

/**
 * Alta y edición de un proveedor.
 *
 * Lo imprescindible arriba y todo lo demás detrás de «más datos». Un proveedor
 * nuevo aparece cuando su mercadería está en el mostrador; pedir la ficha
 * entera en ese momento no hace que los datos aparezcan, solo que la pantalla
 * estorbe.
 *
 * El único campo que no está en la ficha de un cliente y sí merece estar
 * arriba es **lead time**: es lo que alimenta el punto de reposición, y
 * preguntarlo cuando el proveedor está al teléfono es más fácil que
 * reconstruirlo después.
 */

const TIPOS: TipoDocumento[] = ["RUC", "DNI", "CE", "PAS", "SIN_DOC"];

function vacio(): ProveedorEditable {
  return {
    tipo_documento: "RUC",
    numero_documento: "",
    razon_social: "",
    tipo: "local",
    pais: PAIS_POR_DEFECTO,
    direccion: null,
    ubigeo_codigo: null,
    contacto: null,
    email: null,
    telefono: null,
    whatsapp: null,
    dias_pago: 0,
    lead_time_dias: 3,
    notas: null,
    marca_ids: [],
  };
}

function desdeDetalle(p: ProveedorDetalle): ProveedorEditable {
  // La cascada del distrito necesita los nombres para colocarse; la ficha los
  // trae juntos en `ubigeo_nombre` («Lima · Lima · Ate»).
  const [dep, prov, dist] = (p.ubigeo_nombre ?? "").split(" · ");
  return {
    ubigeo_departamento: dep || null,
    ubigeo_provincia: prov || null,
    ubigeo_distrito: dist || null,
    id: p.id,
    tipo_documento: p.tipo_documento,
    numero_documento: p.numero_documento,
    razon_social: p.razon_social,
    tipo: p.tipo,
    pais: p.pais,
    direccion: p.direccion,
    ubigeo_codigo: p.ubigeo_codigo,
    contacto: p.contacto,
    email: p.email,
    telefono: p.telefono,
    whatsapp: p.whatsapp,
    dias_pago: p.dias_pago,
    lead_time_dias: p.lead_time_dias,
    notas: p.notas,
    marca_ids: p.marca_ids,
  };
}

export function FormularioProveedor({
  inicial,
  marcas,
}: {
  inicial: ProveedorDetalle | null;
  marcas: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [datos, setDatos] = React.useState<ProveedorEditable>(
    inicial ? desdeDetalle(inicial) : vacio(),
  );
  const [aviso, setAviso] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [campoMalo, setCampoMalo] = React.useState<string | null>(null);
  const [consultando, consultar] = React.useTransition();
  const [guardando, guardar] = React.useTransition();

  const editando = Boolean(inicial);

  const set = <K extends keyof ProveedorEditable>(campo: K, valor: ProveedorEditable[K]) =>
    setDatos((d) => ({ ...d, [campo]: valor }));

  const alternarMarca = (id: string) =>
    setDatos((d) => ({
      ...d,
      marca_ids: d.marca_ids.includes(id)
        ? d.marca_ids.filter((m) => m !== id)
        : [...d.marca_ids, id],
    }));

  const puedeConsultar = esConsultable(datos.tipo_documento, datos.numero_documento);

  /*
    De Perú o del extranjero, como en el alta rápida (01/10).

    Aquí el país era una caja de texto escondida en «Más datos», y para dar de
    alta a un proveedor de Shanghái había que saber cambiar el documento a
    «Sin documento», el tipo a «Importación» y escribir el país a mano. El
    alta rápida ya preguntaba de dónde es, con dos botones y un buscador de
    país; el maestro, que es la pantalla completa, no (revisión por módulos
    del 02/10). Se deduce del país para que al editar salga solo.
  */
  const extranjero = datos.pais !== PAIS_POR_DEFECTO;
  const elegirOrigen = (o: "peru" | "extranjero") => {
    if ((o === "extranjero") === extranjero) return;
    setError(null);
    setAviso(null);
    setDatos((d) =>
      o === "extranjero"
        ? {
            ...d,
            tipo_documento: "SIN_DOC",
            numero_documento: null,
            tipo: "importacion",
            pais: "",
            ubigeo_codigo: null,
            ubigeo_departamento: null,
            ubigeo_provincia: null,
            ubigeo_distrito: null,
          }
        : { ...d, tipo_documento: "RUC", numero_documento: "", tipo: "local", pais: PAIS_POR_DEFECTO },
    );
  };

  // El país guardado sale aunque no esté en la lista: FORUN entró como
  // «Exterior», y sin esto el buscador lo mostraría vacío al editarlo.
  const opcionesPais = React.useMemo(
    () =>
      datos.pais && !OPCIONES_PAIS.some((o) => o.valor === datos.pais)
        ? [{ valor: datos.pais, etiqueta: datos.pais, claves: "" }, ...OPCIONES_PAIS]
        : OPCIONES_PAIS,
    [datos.pais],
  );

  const [masDatos, setMasDatos] = React.useState(false);
  const llenosDeMas = [
    datos.contacto,
    datos.telefono,
    datos.whatsapp,
    datos.email,
    datos.direccion,
    datos.ubigeo_codigo,
    datos.notas,
  ].filter((x) => x && String(x).trim() !== "").length;

  const listo =
    datos.razon_social.trim().length >= 2 && (!extranjero || datos.pais.trim().length >= 2);

  const traerDatos = () => {
    setError(null);
    setAviso(null);
    consultar(async () => {
      const r = await buscarProveedorPorDocumento(
        datos.tipo_documento,
        datos.numero_documento ?? "",
      );
      if (!r.ok) {
        // Cuota agotada NO bloquea: se escribe a mano y se sigue.
        setError(
          r.agotada ? `${r.error} Escribe la razón social a mano y guarda igual.` : r.error,
        );
        return;
      }
      setDatos((d) => ({
        ...d,
        razon_social: r.datos.razon_social,
        direccion: r.datos.direccion ?? d.direccion,
        ubigeo_codigo: r.datos.ubigeo_codigo ?? d.ubigeo_codigo,
        // Los nombres, para que el guardado dé de alta el distrito si falta
        // (01/10). Sin ellos el distrito que trajo SUNAT se perdía.
        ubigeo_departamento: r.datos.ubigeo_departamento,
        ubigeo_provincia: r.datos.ubigeo_provincia,
        ubigeo_distrito: r.datos.ubigeo_distrito,
      }));
      if (r.datos.condicion === "NO HABIDO") {
        setAviso("SUNAT lo marca como NO HABIDO. Su factura de compra es observable.");
      } else if (r.datos.estado && r.datos.estado !== "ACTIVO") {
        setAviso(`Estado en SUNAT: ${r.datos.estado}.`);
      }
    });
  };

  const enviar = () => {
    setError(null);
    setCampoMalo(null);
    guardar(async () => {
      const fd = new FormData();
      fd.set("proveedor", JSON.stringify(datos));
      const r = await guardarProveedor(null, fd);
      if (r.ok) {
        router.push(`/proveedores/${r.id}`);
        return;
      }
      setError(r.error);
      setCampoMalo(r.campo ?? null);
    });
  };

  const marcado = (campo: string) =>
    campoMalo === campo ? "border-[var(--danger)]" : "";

  return (
    <div className="flex flex-col gap-5">
      {/* «Volver» como en el resto de fichas, y los botones de guardar ABAJO,
          al terminar de rellenar, como en el alta de cliente: arriba quedaban
          antes del primer campo y en el teléfono había que volver a subir
          para guardar (revisión por módulos del 02/10). */}
      <header className="flex flex-col gap-1">
        <Volver href={inicial ? `/proveedores/${inicial.id}` : "/proveedores"}>
          {inicial ? "Volver a la ficha" : "Volver a proveedores"}
        </Volver>
        <h1 className="mt-1 text-xl font-semibold">
          {editando ? "Editar proveedor" : "Nuevo proveedor"}
        </h1>
        <p className="text-sm text-[var(--fg-muted)]">
          {editando
            ? inicial?.codigo
            : "Con el documento y la razón social basta para empezar."}
        </p>
      </header>

      {error ? (
        <p className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
      {aviso ? (
        <p className="rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm text-[var(--warn)]">
          {aviso}
        </p>
      ) : null}

      {/* ------------------------------------------------ Lo indispensable */}
      <section className="card flex flex-col gap-4 p-4">
        {/* La primera pregunta, la misma del alta rápida: dos botones a la
            vista, porque cambia qué se pide debajo. */}
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">¿De dónde es?</span>
          <div
            role="group"
            aria-label="De dónde es el proveedor"
            className="grid grid-cols-2 overflow-hidden rounded-md border border-[var(--border)] sm:max-w-md"
          >
            {ORIGENES.map(([valor, titulo, sub]) => {
              const puesto = (valor === "extranjero") === extranjero;
              return (
                <button
                  key={valor}
                  type="button"
                  aria-pressed={puesto}
                  onClick={() => elegirOrigen(valor)}
                  className={`flex flex-col items-center px-3 py-2 text-sm font-medium transition-colors first:border-r first:border-[var(--border)] ${
                    puesto
                      ? "bg-brand-600 text-white"
                      : "bg-[var(--surface)] text-[var(--fg)] hover:bg-[var(--surface-2)]"
                  }`}
                >
                  {titulo}
                  <span
                    className={`text-sm font-normal ${puesto ? "text-white/85" : "text-[var(--fg-muted)]"}`}
                  >
                    {sub}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {extranjero ? (
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label htmlFor="pais-proveedor-maestro" className="text-sm font-medium">
                País <span className="text-[var(--danger)]">*</span>
              </label>
              {/* El mismo buscador del alta rápida: filtra sin tildes y en
                  inglés —«germany» encuentra Alemania—, como viene en las
                  proformas. */}
              <Combobox
                id="pais-proveedor-maestro"
                opciones={opcionesPais}
                valor={datos.pais || null}
                onCambio={(v) => set("pais", v ?? "")}
                placeholder="Elige el país…"
                placeholderBusqueda="Escribe: China, Alemania, Japan…"
                textoVacio="No está en la lista. Avísanos y lo añadimos."
              />
              <span className="text-sm text-[var(--fg-subtle)]">
                Sin RUC: sus compras se registran como importación.
              </span>
            </div>
          ) : (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Documento</span>
                <SelectNativo
                  value={datos.tipo_documento}
                  onChange={(e) => set("tipo_documento", e.target.value as TipoDocumento)}
                >
                  {TIPOS.map((t) => (
                    <option key={t} value={t}>
                      {ETIQUETA_DOCUMENTO[t]}
                    </option>
                  ))}
                </SelectNativo>
              </label>

              {/* El número y su botón, con sitio: a 1280 el número se quedaba
                  en una caja de 140 px al lado de un «Traer» a secas. */}
              <div className="flex flex-col gap-1 lg:col-span-3">
                <span className="text-sm font-medium">Número</span>
                <div className="flex gap-2">
                  <Input
                    value={datos.numero_documento ?? ""}
                    onChange={(e) => set("numero_documento", e.target.value)}
                    disabled={datos.tipo_documento === "SIN_DOC"}
                    placeholder={datos.tipo_documento === "RUC" ? "20123456789" : ""}
                    inputMode={
                      datos.tipo_documento === "RUC" || datos.tipo_documento === "DNI"
                        ? "numeric"
                        : "text"
                    }
                    autoComplete="off"
                    className={`tabular sm:max-w-xs ${marcado("numero_documento")}`}
                  />
                  {/* Solo se ofrece cuando el documento pasa la validación local:
                      un RUC mal tecleado que sale a la red es una de las 100
                      consultas del mes quemada para siempre. Se llama como en
                      el alta de cliente y en la rápida: «Traer datos». */}
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    onClick={traerDatos}
                    disabled={!puedeConsultar || consultando}
                  >
                    {consultando ? "Buscando…" : "Traer datos"}
                  </Button>
                </div>
              </div>
            </>
          )}

          <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-4">
            <span className="text-sm font-medium">
              {extranjero ? "Nombre de la empresa" : "Razón social"}{" "}
              <span className="text-[var(--danger)]">*</span>
            </span>
            <Input
              value={datos.razon_social}
              onChange={(e) => set("razon_social", e.target.value)}
              placeholder={
                extranjero ? "Como sale en su proforma" : "Tal como figura en la factura"
              }
              className={marcado("razon_social")}
            />
          </label>

          {extranjero ? null : (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Tipo de compra</span>
              <SelectNativo
                value={datos.tipo}
                onChange={(e) => set("tipo", e.target.value as "local" | "importacion")}
              >
                <option value="local">Local</option>
                <option value="importacion">Importación</option>
              </SelectNativo>
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Días de pago</span>
            <Input
              type="number"
              min={0}
              max={365}
              value={datos.dias_pago}
              onChange={(e) => set("dias_pago", Number(e.target.value))}
              className="tabular"
            />
            <span className="text-sm text-[var(--fg-subtle)]">0 = al contado.</span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Plazo de entrega</span>
            <Input
              type="number"
              min={0}
              max={365}
              value={datos.lead_time_dias}
              onChange={(e) => set("lead_time_dias", Number(e.target.value))}
              className="tabular"
            />
            <span className="text-sm text-[var(--fg-subtle)]">
              Días desde que se le pide hasta que llega.
            </span>
          </label>
        </div>
      </section>

      {/* --------------------------------------------------------- Marcas */}
      <section className="card p-4">
        <h2 className="text-sm font-semibold">Marcas que representa</h2>
        <p className="mb-3 text-sm text-[var(--fg-muted)]">
          Es lo que permite responder «¿quién me vende SKF?» sin abrir las
          fichas una a una.
        </p>

        {marcas.length === 0 ? (
          <p className="text-sm text-[var(--fg-subtle)]">
            No hay marcas en el maestro todavía.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {marcas.map((m) => {
              const puesta = datos.marca_ids.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => alternarMarca(m.id)}
                  aria-pressed={puesta}
                  className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-3 py-1 text-sm transition-colors ${
                    puesta
                      ? "border-brand-600 bg-brand-50 font-medium text-brand-700 dark:bg-brand-950 dark:text-brand-200"
                      : "border-[var(--border)] hover:bg-[var(--surface-2)]"
                  }`}
                >
                  {/* La marca puesta lleva su visto: solo el color no basta
                      para quien ve mal (revisión por módulos del 02/10). */}
                  {puesta ? <Check className="size-4" aria-hidden="true" /> : null}
                  {m.nombre}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------ Más datos */}
      {/* Un botón con borde y su contador, como el «Más datos» del alta de
          cliente. Era un `<summary>` gris con un «›» escrito a mano, que no
          parecía pulsable (revisión por módulos del 02/10). */}
      <button
        type="button"
        onClick={() => setMasDatos((v) => !v)}
        aria-expanded={masDatos}
        aria-controls="mas-datos-proveedor"
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-left text-sm font-medium hover:bg-[var(--surface-2)]"
      >
        <span>
          Más datos
          <span className="ml-2 font-normal text-[var(--fg-muted)]">
            contacto, teléfonos, correo, dirección, notas · {llenosDeMas} de 7
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`size-4 shrink-0 transition-transform ${masDatos ? "rotate-180" : ""}`}
        />
      </button>

      {masDatos ? (
        <section id="mas-datos-proveedor" className="card p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Contacto</span>
              <Input
                value={datos.contacto ?? ""}
                onChange={(e) => set("contacto", e.target.value)}
                placeholder="Con quién se habla"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Teléfono</span>
              <Input
                type="tel"
                inputMode="tel"
                value={datos.telefono ?? ""}
                onChange={(e) => set("telefono", e.target.value)}
                placeholder={extranjero ? "+86 137 6406 3822" : "987 654 321"}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">WhatsApp</span>
              <Input
                type="tel"
                inputMode="tel"
                value={datos.whatsapp ?? ""}
                onChange={(e) => set("whatsapp", e.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Correo</span>
              <Input
                type="email"
                value={datos.email ?? ""}
                onChange={(e) => set("email", e.target.value)}
                placeholder="ventas@empresa.com"
                className={marcado("email")}
              />
            </label>

            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-sm font-medium">Dirección</span>
              <Input
                value={datos.direccion ?? ""}
                onChange={(e) => set("direccion", e.target.value)}
                placeholder={
                  extranjero ? "Como sale en su proforma" : "Se llena sola con «Traer datos»"
                }
              />
            </label>

            {/* El distrito, solo en Perú. «Traer datos» lo rellenaba y no se
                veía en ninguna parte del formulario: el alta rápida ya tenía
                la cascada de clientes y el maestro no. */}
            {extranjero ? null : (
              <div className="sm:col-span-2">
                <SelectorUbigeoCascada
                  id="ubigeo-proveedor-maestro"
                  codigo={datos.ubigeo_codigo ?? ""}
                  departamento={datos.ubigeo_departamento ?? ""}
                  provincia={datos.ubigeo_provincia ?? ""}
                  onElegir={(u) =>
                    setDatos((d) => ({
                      ...d,
                      ubigeo_codigo: u.codigo || null,
                      ubigeo_departamento: u.departamento || null,
                      ubigeo_provincia: u.provincia || null,
                      ubigeo_distrito: u.distrito || null,
                    }))
                  }
                  cargarDepartamentos={departamentosUbigeo}
                  cargarProvincias={provinciasUbigeo}
                  cargarDistritos={distritosUbigeo}
                  ayudaDistrito={null}
                />
              </div>
            )}

            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-sm font-medium">Notas</span>
              <Textarea
                value={datos.notas ?? ""}
                onChange={(e) => set("notas", e.target.value)}
                rows={3}
                placeholder="Mínimo de compra, forma de envío, con quién más hablar…"
              />
            </label>
          </div>
        </section>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full sm:w-auto md:h-control-md"
          onClick={() => router.back()}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          className="h-11 w-full sm:w-auto md:h-control-md"
          onClick={enviar}
          disabled={guardando || !listo}
        >
          {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Crear proveedor"}
        </Button>
      </div>
    </div>
  );
}

const ORIGENES: readonly (readonly ["peru" | "extranjero", string, string])[] = [
  ["peru", "De Perú", "Con RUC"],
  ["extranjero", "Del extranjero", "Sin RUC"],
];

const OPCIONES_PAIS = PAISES.map((p) => ({
  valor: p.nombre,
  etiqueta: p.nombre,
  claves: p.claves,
}));
