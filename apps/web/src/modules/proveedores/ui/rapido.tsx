"use client";

// Cliente: es un diálogo con estado propio y llama a una Server Action.

import * as React from "react";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Combobox,
  Input,
  SelectNativo,
} from "@rodatech/ui";
import { Plus } from "lucide-react";

import { rucValido } from "@rodatech/consultas/validacion";

import { buscarProveedorPorDocumento } from "../acciones/consultar";
import { guardarProveedor } from "../acciones/guardar";
import type { ProveedorOpcion } from "../dominio/opcion";
import { PAISES } from "../dominio/paises";
import {
  departamentosUbigeo,
  distritosUbigeo,
  provinciasUbigeo,
} from "@/modules/clientes/acciones/ubigeo";
import { SelectorUbigeoCascada } from "@/modules/clientes/ui/selector-ubigeo";

/**
 * Alta rápida de proveedor sin salir de la pantalla en la que se esté.
 *
 * Vivía dentro de recepciones y solo la usaba recepciones. Ahora la usan las
 * DOS pantallas que eligen proveedor —la compra y la recepción—, así que se
 * mudó al módulo dueño del dato. Es la misma razón por la que
 * `proveedoresParaSelector` vive aquí: un alta paralela por pantalla sería un
 * segundo sitio donde validar el RUC, generar el código y desambiguar
 * duplicados, y los dos se separarían al primer cambio.
 *
 * Guarda con la MISMA Server Action que el maestro. Aquí solo se recortan los
 * campos: lo demás se completa después desde la ficha.
 *
 * ---------------------------------------------------------------------------
 * El RUC SÍ se consulta, desde el 21/09
 * ---------------------------------------------------------------------------
 * Hasta hoy no lo hacía, y estaba razonado: son 100 consultas de Decolecta al
 * mes, un proveedor se da de alta una vez cada muchos meses, y en el mostrador
 * su razón social está impresa en la factura que se tiene delante. El propio
 * comentario admitía que **en la compra el argumento es más flojo** —quien
 * pide mercadería está en un escritorio— y lo dejaba anotado como decisión
 * pendiente.
 *
 * Luis la tomó el 21/09: *«si voy a registrar un nuevo proveedor tenemos que
 * tener la validación de RUC»*. Es el mismo gesto que ya tiene el alta de
 * agencia y el de cliente, y tenerlo en dos de tres sitios era lo peor de
 * ambos mundos: quien lo aprende en una pantalla lo busca en la otra.
 *
 * Lo que SÍ se conserva del argumento de la cuota: la consulta solo sale si
 * se pulsa el botón. No se dispara al teclear, y el dígito verificador se
 * comprueba antes de salir a la red — un RUC mal copiado no se lleva por
 * delante una de las cien.
 *
 * ---------------------------------------------------------------------------
 * Y un proveedor DEL EXTRANJERO, sin RUC (01/10)
 * ---------------------------------------------------------------------------
 * Willy le pasó a Luis la proforma de FORUN Transmission (Shanghái): *«solo
 * necesita registrar su nombre de empresa, opcional correo y teléfono, no
 * tiene RUC»*. La base ya lo admitía —`SIN_DOC`, código `SD-…`— pero este
 * diálogo pedía RUC sí o sí, así que no había forma de llegar ahí sin ir al
 * maestro y saber que hay que cambiar el «Documento». Ahora la primera
 * pregunta es de dónde es, con dos botones; del extranjero pide el nombre y
 * el país, y la compra queda como importación.
 *
 * Correo y teléfono, opcionales y para los dos: Luis, 01/10, *«los opcionales
 * que te dije, si puede ser para cualquier tipo de compra»*. Es además lo que
 * falta en los 97 proveedores —ninguno tiene teléfono— y pedirlo al darlo de
 * alta es cuando se tiene delante.
 */
export function ProveedorRapido({
  documentoInicial = "",
  nombreInicial = "",
  variante = "boton",
  onCreado,
}: {
  /** Lo tecleado en la caja de búsqueda, si parecía un RUC. */
  documentoInicial?: string;
  /** Lo tecleado, si parecía un nombre. */
  nombreInicial?: string;
  /**
   * `boton` al lado de la caja de búsqueda; `enlace` para el aviso de «todavía
   * no hay proveedores», donde un segundo botón competiría con el de la
   * pantalla.
   */
  variante?: "boton" | "enlace";
  onCreado: (proveedor: ProveedorOpcion) => void;
}) {
  const [abierto, setAbierto] = React.useState(false);
  const [origen, setOrigen] = React.useState<Origen>("peru");
  const [numero, setNumero] = React.useState(documentoInicial);
  const [razonSocial, setRazonSocial] = React.useState(nombreInicial);
  const [tipo, setTipo] = React.useState<"local" | "importacion">("local");
  const [pais, setPais] = React.useState("");
  const [telefono, setTelefono] = React.useState("");
  const [correo, setCorreo] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, guardar] = React.useTransition();

  /** Lo que contestó SUNAT, para poder decirlo bajo el campo. */
  const [aviso, setAviso] = React.useState<string | null>(null);
  const [traido, setTraido] = React.useState(false);
  /*
    Dirección y distrito, A LA VISTA y editables (Luis, 01/10: *«en RUC, para
    proveedor, toda la data de SUNAT: el ubigeo, dirección, todo eso»*, y
    después, viéndolo: *«no veo los datos que trae el RUC, ubigeo, dirección»*).
    «Traer datos» los rellena; si no se trae, se escriben. Antes SUNAT los
    devolvía y este diálogo los tiraba.
  */
  const [direccion, setDireccion] = React.useState("");
  const [ubigeo, setUbigeo] = React.useState<UbigeoElegido>(UBIGEO_VACIO);
  const [consultando, consultar] = React.useTransition();

  const extranjero = origen === "extranjero";

  /*
    Traer la razón social del padrón.

    Pisa lo que hubiera: quien pulsa el botón quiere el dato oficial, que es el
    que va a acabar impreso en una orden de compra. Un fallo NUNCA bloquea —se
    avisa y se escribe a mano— porque el alta de un proveedor no puede depender
    de que queden consultas.
  */
  const traerDatos = () => {
    setError(null);
    setAviso(null);
    consultar(async () => {
      const r = await buscarProveedorPorDocumento("RUC", numero.replace(/\D/g, ""));
      if (!r.ok) {
        setTraido(false);
        setAviso(
          r.agotada
            ? "Se agotó la cuota de consultas de este mes. Escribe la razón social a mano y guarda igual; la cuota se renueva el día 1."
            : `${r.error} Escribe la razón social a mano y guarda igual.`,
        );
        return;
      }
      setRazonSocial(r.datos.razon_social);
      setTraido(true);
      if (r.datos.direccion) setDireccion(r.datos.direccion);
      if (r.datos.ubigeo_codigo) {
        setUbigeo({
          codigo: r.datos.ubigeo_codigo,
          departamento: r.datos.ubigeo_departamento ?? "",
          provincia: r.datos.ubigeo_provincia ?? "",
          distrito: r.datos.ubigeo_distrito ?? "",
        });
      }
      // El estado del contribuyente se dice, no se esconde: un proveedor de
      // baja se puede seguir usando, pero conviene saberlo antes.
      const estado = [r.datos.estado, r.datos.condicion]
        .filter((x): x is string => Boolean(x))
        .join(" · ");
      setAviso(estado ? `SUNAT: ${estado}.` : null);
    });
  };

  // Lo tecleado en la caja llega ya escrito. Si el diálogo está cerrado se
  // sincroniza; abierto no, o borraría lo que se esté escribiendo dentro.
  React.useEffect(() => {
    if (abierto) return;
    setNumero(documentoInicial);
    setRazonSocial(nombreInicial);
  }, [abierto, documentoInicial, nombreInicial]);

  const limpiar = () => {
    setOrigen("peru");
    setNumero(documentoInicial);
    setRazonSocial(nombreInicial);
    setTipo("local");
    setPais("");
    setTelefono("");
    setCorreo("");
    setError(null);
    setAviso(null);
    setTraido(false);
    setDireccion("");
    setUbigeo(UBIGEO_VACIO);
  };

  const elegirOrigen = (o: Origen) => {
    setOrigen(o);
    setError(null);
    setAviso(null);
    // Del extranjero siempre es importación; volver a Perú vuelve a «Local»,
    // que es lo más frecuente.
    setTipo(o === "extranjero" ? "importacion" : "local");
  };

  // El correo se revisa aquí para decirlo junto al campo; el servidor lo
  // vuelve a revisar, que es donde no se puede saltar.
  const correoMalo =
    correo.trim() !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim());

  const listo =
    razonSocial.trim().length >= 2 &&
    !correoMalo &&
    (extranjero ? pais.trim().length >= 2 : numero.trim() !== "");

  const enviar = () => {
    if (!listo) return;
    setError(null);
    guardar(async () => {
      const documento = extranjero
        ? { tipo_documento: "SIN_DOC" as const, numero_documento: null }
        : { tipo_documento: "RUC" as const, numero_documento: numero.trim() };
      const paisFinal = extranjero ? pais.trim() : "Perú";
      const tel = telefono.trim() || null;
      const email = correo.trim() || null;
      const dir = direccion.trim() || null;
      // El distrito solo en Perú: el ubigeo es la lista de distritos del Perú.
      const ub = !extranjero && ubigeo.codigo ? ubigeo : null;

      const fd = new FormData();
      fd.set(
        "proveedor",
        JSON.stringify({
          ...documento,
          razon_social: razonSocial.trim(),
          tipo,
          pais: paisFinal,
          telefono: tel,
          email,
          direccion: dir,
          ubigeo_codigo: ub?.codigo ?? null,
          ubigeo_departamento: ub?.departamento || null,
          ubigeo_provincia: ub?.provincia || null,
          ubigeo_distrito: ub?.distrito || null,
          dias_pago: 0,
          lead_time_dias: 3,
          marca_ids: [],
        }),
      );

      const r = await guardarProveedor(null, fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }

      // La ficha recién creada, completa. Lo que no se preguntó son los valores
      // por defecto que la acción acaba de escribir, no ceros inventados: un
      // proveedor nuevo no tiene compras ni marcas todavía.
      onCreado({
        id: r.id,
        codigo: r.codigo,
        razon_social: r.razonSocial,
        numero_documento: documento.numero_documento,
        tipo_documento: documento.tipo_documento,
        tipo,
        pais: paisFinal,
        direccion: dir,
        contacto: null,
        telefono: tel,
        whatsapp: null,
        email,
        dias_pago: 0,
        lead_time_dias: 3,
        activo: true,
        marcas: [],
        compras: 0,
        ultima_compra: null,
      });
      setAbierto(false);
      limpiar();
    });
  };

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        if (!v) limpiar();
      }}
    >
      <DialogTrigger asChild>
        {variante === "boton" ? (
          <Button type="button" variant="outline" className="shrink-0">
            <Plus aria-hidden="true" />
            Nuevo
          </Button>
        ) : (
          <button
            type="button"
            className="text-sm font-medium text-brand-600 underline hover:text-brand-700"
          >
            + Nuevo proveedor
          </button>
        )}
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo proveedor</DialogTitle>
          <DialogDescription>
            Lo mínimo para saber a quién se le compra. El resto de la ficha
            —contacto, plazo de entrega, marcas que representa— se completa
            después desde el maestro de proveedores.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4">
            {/*
              La primera pregunta: de dónde es. Dos botones a la vista y no un
              desplegable: cambia qué se pide debajo, y tiene que leerse sin
              abrir nada.
            */}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">¿De dónde es?</span>
              <div
                role="group"
                aria-label="De dónde es el proveedor"
                className="grid grid-cols-2 overflow-hidden rounded-md border border-[var(--border)]"
              >
                {ORIGENES.map(([valor, titulo, sub]) => (
                  <button
                    key={valor}
                    type="button"
                    aria-pressed={origen === valor}
                    onClick={() => elegirOrigen(valor)}
                    className={`flex flex-col items-center px-3 py-2 text-sm font-medium transition-colors first:border-r first:border-[var(--border)] ${
                      origen === valor
                        ? "bg-brand-600 text-white"
                        : "bg-[var(--surface)] text-[var(--fg)] hover:bg-[var(--surface-2)]"
                    }`}
                  >
                    {titulo}
                    <span
                      className={`text-sm font-normal ${
                        origen === valor ? "text-white/85" : "text-[var(--fg-muted)]"
                      }`}
                    >
                      {sub}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {extranjero ? null : (
              <>
                {/* El RUC y su botón, en la misma fila y alineados por abajo. */}
                <div className="flex items-end gap-2">
                  <label className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-sm font-medium">RUC</span>
                    <Input
                      value={numero}
                      onChange={(e) => {
                        // `\D`: todo lo que no sea dígito. Era `/D/`, que solo
                        // quitaba la letra «D» y dejaba pasar cualquier otra.
                        setNumero(e.target.value.replace(/\D/g, "").slice(0, 11));
                        // Cambiar el RUC invalida lo que trajo el anterior.
                        setTraido(false);
                        setAviso(null);
                      }}
                      onKeyDown={(e) => {
                        // Enter consulta en vez de guardar: es lo que se espera
                        // al terminar de pegar once dígitos.
                        if (e.key === "Enter" && rucValido(numero)) {
                          e.preventDefault();
                          traerDatos();
                        }
                      }}
                      placeholder="20XXXXXXXXX"
                      className="tabular"
                      inputMode="numeric"
                      autoComplete="off"
                    />
                  </label>
                  {/*
                    Se apaga hasta que el RUC sea válido DE VERDAD —once dígitos
                    y el verificador cuadrando—, no solo hasta que tenga largo.
                    Cada consulta que sale gasta una de las cien del mes.
                  */}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={traerDatos}
                    disabled={!rucValido(numero) || consultando}
                    className="shrink-0"
                  >
                    {consultando ? "Buscando…" : "Traer datos"}
                  </Button>
                </div>

                {aviso ? (
                  <p className="-mt-2 text-sm text-[var(--fg-muted)]">{aviso}</p>
                ) : null}
              </>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                {extranjero ? "Nombre de la empresa" : "Razón social"}
              </span>
              <Input
                value={razonSocial}
                onChange={(e) => {
                  setRazonSocial(e.target.value);
                  setTraido(false);
                }}
                placeholder={
                  extranjero ? "Como sale en su proforma" : "Tal como figura en la factura"
                }
                autoComplete="off"
              />
              {extranjero ? null : (
                <span className="text-sm text-[var(--fg-muted)]">
                  {traido ? "La trajo SUNAT." : "Tal cual de la factura, o tráela con el RUC."}
                </span>
              )}
            </label>

            {/* Dirección: en los dos (la proforma de fuera también la trae). */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                Dirección{" "}
                <span className="font-normal text-[var(--fg-muted)]">(opcional)</span>
              </span>
              <Input
                value={direccion}
                onChange={(e) => setDireccion(e.target.value.slice(0, 300))}
                placeholder={
                  extranjero ? "Como sale en su proforma" : "Se llena sola con «Traer datos»"
                }
                autoComplete="off"
              />
              {!extranjero && traido && direccion ? (
                <span className="text-sm text-[var(--fg-muted)]">La trajo SUNAT.</span>
              ) : null}
            </label>

            {/* El distrito, solo en Perú: la misma cascada de clientes. */}
            {extranjero ? null : (
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">
                  Distrito{" "}
                  <span className="font-normal text-[var(--fg-muted)]">(opcional)</span>
                </span>
                <SelectorUbigeoCascada
                  id="ubigeo-proveedor"
                  codigo={ubigeo.codigo}
                  departamento={ubigeo.departamento}
                  provincia={ubigeo.provincia}
                  onElegir={setUbigeo}
                  cargarDepartamentos={departamentosUbigeo}
                  cargarProvincias={provinciasUbigeo}
                  cargarDistritos={distritosUbigeo}
                />
                {traido && ubigeo.distrito ? (
                  <span className="text-sm text-[var(--fg-muted)]">
                    SUNAT: {ubigeo.distrito} · {ubigeo.provincia} · {ubigeo.departamento}
                  </span>
                ) : null}
              </div>
            )}

            {extranjero ? (
              <div className="flex flex-col gap-1">
                <label htmlFor="pais-proveedor" className="text-sm font-medium">
                  País
                </label>
                {/* Buscador y no lista nativa (Luis, 01/10): filtra al
                    escribir, sin tildes, y también en inglés —«germany»
                    encuentra Alemania—, que es como viene en las proformas. */}
                <Combobox
                  id="pais-proveedor"
                  opciones={OPCIONES_PAIS}
                  valor={pais || null}
                  onCambio={(v) => setPais(v ?? "")}
                  placeholder="Elige el país…"
                  placeholderBusqueda="Escribe: China, Alemania, Japan…"
                  textoVacio="No está en la lista. Avísanos y lo añadimos."
                />
                <span className="text-sm text-[var(--fg-muted)]">
                  Sus compras se registran como importación.
                </span>
              </div>
            ) : (
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Tipo de compra</span>
                <SelectNativo
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as "local" | "importacion")}
                >
                  <option value="local">Local</option>
                  <option value="importacion">Importación</option>
                </SelectNativo>
                <span className="text-sm text-[var(--fg-muted)]">
                  «Importación» permite anotar courier, desaduanaje y fletes.
                </span>
              </label>
            )}

            {/* Opcionales, para los dos (Luis, 01/10). */}
            <div className="grid gap-4 border-t border-[var(--border-soft)] pt-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">
                  Teléfono{" "}
                  <span className="font-normal text-[var(--fg-muted)]">(opcional)</span>
                </span>
                <Input
                  type="tel"
                  inputMode="tel"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value.slice(0, 40))}
                  placeholder={extranjero ? "+86 137 6406 3822" : "987 654 321"}
                  autoComplete="off"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">
                  Correo{" "}
                  <span className="font-normal text-[var(--fg-muted)]">(opcional)</span>
                </span>
                <Input
                  type="email"
                  inputMode="email"
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value.slice(0, 160))}
                  placeholder="ventas@empresa.com"
                  autoComplete="off"
                  aria-invalid={correoMalo || undefined}
                  className={correoMalo ? "border-[var(--danger)]" : ""}
                />
                {correoMalo ? (
                  <span className="text-sm text-[var(--danger)]">
                    Le falta algo: tiene que ser como ventas@empresa.com
                  </span>
                ) : null}
              </label>
            </div>

            {error ? (
              <p className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger)]">
                {error}
              </p>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={enviar} disabled={guardando || !listo}>
            {guardando ? "Guardando…" : "Crear proveedor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Origen = "peru" | "extranjero";

interface UbigeoElegido {
  codigo: string;
  departamento: string;
  provincia: string;
  distrito: string;
}

const UBIGEO_VACIO: UbigeoElegido = { codigo: "", departamento: "", provincia: "", distrito: "" };

const ORIGENES: readonly (readonly [Origen, string, string])[] = [
  ["peru", "De Perú", "Con RUC"],
  ["extranjero", "Del extranjero", "Sin RUC"],
];

const OPCIONES_PAIS = PAISES.map((p) => ({
  valor: p.nombre,
  etiqueta: p.nombre,
  claves: p.claves,
}));
