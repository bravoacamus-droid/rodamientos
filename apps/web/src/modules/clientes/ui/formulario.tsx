"use client";

// Cliente: el alta rápida consulta el documento contra SUNAT/RENIEC y rellena
// campos mientras la persona mira, el panel de «más datos» se pliega, y la
// condición de pago habilita o apaga el bloque de crédito. Todo eso es estado
// local y eventos: no hay forma de hacerlo en el servidor.

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Campo,
  Combobox,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SelectNativo,
  Textarea,
} from "@rodatech/ui";

import { buscarPorDocumento } from "../acciones/consultar";
import { guardarCliente } from "../acciones/guardar";
import { esConsultable, revisarDocumento } from "../dominio/documento";
import {
  ETIQUETA_CONDICION,
  ETIQUETA_DOCUMENTO,
  LARGO_DOCUMENTO,
  type ClienteDetalle,
  type CondicionPago,
  type DatosDocumento,
  type ResultadoCliente,
  type TipoDocumento,
} from "../dominio/tipos";

/**
 * Alta y edición de un cliente.
 *
 * El formulario está partido en dos por una razón muy concreta que dijo el
 * cliente: *"hay muchos clientes técnicos que a las justas me dan correo"*.
 *
 *   · Arriba, el ALTA RÁPIDA: tipo de documento, número, «Traer datos» y razón
 *     social. Con eso ya se puede guardar. Es el 90% de las altas reales.
 *   · Abajo, «Más datos» plegado: comercial, dirección, crédito y asignación.
 *     Existe, pero no se le planta delante a quien solo tiene un RUC.
 *
 * Nada de lo que devuelva la consulta puede impedir guardar. Si la cuota se
 * agotó, si SUNAT no responde o si el contribuyente está NO HABIDO, se avisa y
 * se sigue a mano: bloquear el alta convierte una molestia en una venta
 * perdida.
 */

export interface CatalogosCliente {
  vendedores: { id: string; nombre: string }[];
}

/** Un distrito, tal como lo devuelve la búsqueda de ubigeo. */
export interface OpcionUbigeo {
  codigo: string;
  nombre: string;
}

/**
 * 44 px de alto en móvil y la altura de control del ERP a partir de `md`.
 *
 * El ERP se opera con el ratón en escritorio, donde los 38 px de `h-control-md`
 * están bien; en el almacén se opera con el pulgar, y ahí 38 px se falla.
 */
const ALTO_TACTIL = "h-11 md:h-control-md";

export function FormularioCliente({
  catalogos,
  cliente,
  buscarDistrito,
}: {
  catalogos: CatalogosCliente;
  cliente?: ClienteDetalle;
  /**
   * Búsqueda de distrito contra el servidor. Los casi 1.900 distritos del país
   * NO se precargan en el navegador: el orden por relevancia lo calcula
   * Postgres sobre su índice, no esta página sobre una lista traída entera.
   */
  buscarDistrito: (q: string) => Promise<OpcionUbigeo[]>;
}) {
  const router = useRouter();

  const [resultado, guardar, guardando] = React.useActionState<
    ResultadoCliente | null,
    FormData
  >(async (previo, formData) => {
    const r = await guardarCliente(previo, formData);
    // A la ficha: después de crearlo o editarlo lo que se quiere es verlo, no
    // volver a buscarlo en el listado.
    if (r.ok) router.push(`/clientes/${r.id}`);
    return r;
  }, null);

  // Los dos campos con tipo cerrado van en su propio estado. Meterlos en el
  // objeto de strings obligaría a castear en cada lectura, y son justo los dos
  // que deciden la forma del resto del formulario.
  const [tipoDocumento, setTipoDocumento] = React.useState<TipoDocumento>(
    cliente?.tipo_documento ?? "RUC",
  );
  const [condicionPago, setCondicionPago] = React.useState<CondicionPago>(
    cliente?.condicion_pago ?? "contado",
  );

  const [f, setF] = React.useState({
    numero_documento: cliente?.numero_documento ?? "",
    razon_social: cliente?.razon_social ?? "",
    nombre_comercial: cliente?.nombre_comercial ?? "",
    sector: cliente?.sector ?? "",
    contacto: cliente?.contacto ?? "",
    cargo_contacto: cliente?.cargo_contacto ?? "",
    email: cliente?.email ?? "",
    telefono: cliente?.telefono ?? "",
    whatsapp: cliente?.whatsapp ?? "",
    direccion: cliente?.direccion ?? "",
    ubigeo_codigo: cliente?.ubigeo_codigo ?? "",
    referencia_direccion: cliente?.referencia_direccion ?? "",
    linea_credito: String(cliente?.linea_credito ?? "0"),
    dias_credito: String(cliente?.dias_credito ?? "0"),
    dias_gracia: String(cliente?.dias_gracia ?? "0"),
    vendedor_id: cliente?.vendedor_id ?? "",
    notas: cliente?.notas ?? "",
  });

  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  // Al editar el panel arranca abierto: los datos ya existen y esconderlos
  // obligaría a un clic extra para ver lo que se viene a cambiar. Al crear
  // arranca cerrado, que es justamente el punto del alta rápida.
  const [masDatos, setMasDatos] = React.useState(Boolean(cliente));

  // El nombre del distrito se lleva aparte del código porque son datos de
  // origen distinto: el código puede venir de SUNAT (que no manda el nombre) o
  // de la ficha guardada (que lo trae ya resuelto). Sin esto, al editar un
  // cliente el selector mostraría «150131» en vez de «San Isidro».
  const [ubigeoNombre, setUbigeoNombre] = React.useState(cliente?.ubigeo_nombre ?? "");

  // Si el servidor rechaza el guardado señalando un campo que vive dentro del
  // panel, el panel se abre solo. Si no, el mensaje de error apuntaría a un
  // input que no está en pantalla y la persona no sabría qué corregir.
  const campoCulpable = resultado && !resultado.ok ? resultado.campo : undefined;
  React.useEffect(() => {
    if (
      campoCulpable &&
      !["tipo_documento", "numero_documento", "razon_social"].includes(campoCulpable)
    ) {
      setMasDatos(true);
    }
  }, [campoCulpable]);

  // Lo que dijo el padrón la última vez que se consultó. Se guarda para poder
  // seguir mostrando el aviso de NO HABIDO mientras se llena el resto.
  const [padron, setPadron] = React.useState<DatosDocumento | null>(null);
  /** Mensaje de por qué la consulta automática no sirvió esta vez. Nunca bloquea. */
  const [avisoConsulta, setAvisoConsulta] = React.useState<string | null>(null);
  const [consultando, iniciarConsulta] = React.useTransition();

  const largoEsperado = LARGO_DOCUMENTO[tipoDocumento];
  const sinDocumento = tipoDocumento === "SIN_DOC";

  // La validación NO se reimplementa aquí: es la misma función pura que usa la
  // acción de servidor. Si la interfaz tuviera su propia copia, un día
  // aceptaría un RUC que el servidor rechaza y el error saldría después de
  // pulsar «Guardar», que es el peor momento posible para enterarse.
  const revision = revisarDocumento(tipoDocumento, f.numero_documento);

  // El dígito verificador se comprueba en el navegador antes de salir a la red.
  // Es el ahorro de cuota más barato que existe: son 100 consultas al mes y no
  // se recargan, y un RUC mal tecleado quemaría una para nada.
  const puedeConsultar = esConsultable(tipoDocumento, f.numero_documento) && !consultando;

  // El error del documento solo se enseña cuando ya hay algo escrito: recibir
  // «Falta el número» en un formulario recién abierto es regañar sin motivo.
  const errorDocumento =
    !revision.ok && f.numero_documento.trim() !== "" ? revision.error : undefined;

  /**
   * «Traer datos».
   *
   * Rellena razón social, dirección y ubigeo — lo que promete el botón — y
   * pisa lo que hubiera: quien lo pulsa quiere el dato oficial. El nombre
   * comercial solo se rellena si está vacío, porque ahí sí puede haber algo
   * escrito a mano que el padrón no conoce.
   */
  const traerDatos = () => {
    setAvisoConsulta(null);
    iniciarConsulta(async () => {
      // `revision.numero` y no lo tecleado: lo que sale a la red va ya
      // normalizado, sin guiones ni espacios pegados desde un correo.
      const r = await buscarPorDocumento(tipoDocumento, revision.ok ? revision.numero ?? "" : "");

      if (!r.ok) {
        setPadron(null);
        setAvisoConsulta(
          r.agotada
            ? "Se agotó la cuota de consultas automáticas de este mes. No pasa nada: escribe los datos a mano y guarda igual. La cuota se renueva el día 1."
            : `${r.error} Escribe los datos a mano y guarda igual.`,
        );
        return;
      }

      const d = r.datos;
      setPadron(d);
      setF((x) => ({
        ...x,
        razon_social: d.razon_social || x.razon_social,
        nombre_comercial: x.nombre_comercial || (d.nombre_comercial ?? ""),
        direccion: d.direccion ?? x.direccion,
        ubigeo_codigo: d.ubigeo_codigo ?? x.ubigeo_codigo,
      }));
      // SUNAT manda el código de ubigeo, no el nombre del distrito. Se deja el
      // nombre vacío a propósito: el selector mostrará el código y quien
      // quiera verlo escrito lo confirma buscándolo.
      if (d.ubigeo_codigo) setUbigeoNombre("");

      // Si vino dirección o ubigeo, se despliega el panel: hay que poder ver
      // lo que se acaba de rellenar sin tener que ir a buscarlo.
      if (d.direccion || d.ubigeo_codigo) setMasDatos(true);
      setAvisoConsulta(null);
    });
  };

  // Avisos del padrón. Ninguno bloquea: informan de un riesgo comercial, no de
  // un error de captura.
  const estadoRaro =
    padron?.estado != null && padron.estado.toUpperCase().trim() !== "ACTIVO";
  const noHabido =
    padron?.condicion != null && padron.condicion.toUpperCase().includes("NO HABIDO");

  const num = (s: string) => {
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const aCredito = condicionPago === "credito";

  const payload = {
    ...(cliente ? { id: cliente.id } : {}),
    tipo_documento: tipoDocumento,
    numero_documento: revision.ok ? revision.numero : null,
    razon_social: f.razon_social.trim(),
    nombre_comercial: f.nombre_comercial.trim() || null,
    direccion: f.direccion.trim() || null,
    ubigeo_codigo: f.ubigeo_codigo || null,
    referencia_direccion: f.referencia_direccion.trim() || null,
    sector: f.sector.trim() || null,
    contacto: f.contacto.trim() || null,
    cargo_contacto: f.cargo_contacto.trim() || null,
    email: f.email.trim() || null,
    telefono: f.telefono.trim() || null,
    whatsapp: f.whatsapp.trim() || null,
    condicion_pago: condicionPago,
    // Al contado se manda cero en los tres. Guardar una línea de crédito en un
    // cliente que paga al contado es una trampa: el día que alguien le cambie
    // la condición hereda un límite que nadie aprobó.
    linea_credito: aCredito ? num(f.linea_credito) : 0,
    dias_credito: aCredito ? num(f.dias_credito) : 0,
    dias_gracia: aCredito ? num(f.dias_gracia) : 0,
    vendedor_id: f.vendedor_id || null,
    notas: f.notas.trim() || null,
  };

  // Lo mínimo del contrato: documento utilizable y razón social. Nada más.
  const listo = f.razon_social.trim() !== "" && revision.ok;

  const errorDe = (campo: string) =>
    resultado && !resultado.ok && resultado.campo === campo ? resultado.error : undefined;

  return (
    <form action={guardar} className="flex flex-col gap-4">
      <input type="hidden" name="cliente" value={JSON.stringify(payload)} />

      {resultado && !resultado.ok && !resultado.campo ? (
        <p
          role="alert"
          className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger)]"
        >
          {resultado.error}
        </p>
      ) : null}

      {/* ═════════════════════════════════════════════════ Alta rápida ═══ */}
      <section className="card flex flex-col gap-3 p-4">
        <div>
          <h2 className="text-sm font-semibold">Identificación</h2>
          <p className="text-xs text-[var(--fg-muted)]">
            Con el documento y la razón social ya se puede guardar. Lo demás
            puede esperar.
          </p>
        </div>

        {/* Tres controles en una fila que en móvil se apila. La rejilla de 12
            columnas deja el número más ancho que el tipo, que es como se lee. */}
        <div className="grid gap-3 sm:grid-cols-12">
          <Campo
            id="tipo_documento"
            label="Tipo"
            requerido
            className="sm:col-span-3"
          >
            <SelectNativo
              id="tipo_documento"
              className={ALTO_TACTIL}
              value={tipoDocumento}
              onChange={(e) => {
                // Cambiar de documento invalida lo consultado: el número
                // anterior ya no describe a nadie.
                setPadron(null);
                setAvisoConsulta(null);
                // El `as` es honesto: las opciones del select son exactamente
                // las claves de ETIQUETA_DOCUMENTO.
                setTipoDocumento(e.target.value as TipoDocumento);
                set("numero_documento", "");
              }}
            >
              {(Object.keys(ETIQUETA_DOCUMENTO) as TipoDocumento[]).map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_DOCUMENTO[t]}
                </option>
              ))}
            </SelectNativo>
          </Campo>

          <Campo
            id="numero_documento"
            label="Número"
            requerido={!sinDocumento}
            error={errorDe("numero_documento") ?? errorDocumento}
            ayuda={
              sinDocumento
                ? "Sin documento: solo para boletas menores. No se le puede facturar."
                : largoEsperado
                  ? `${largoEsperado} dígitos.`
                  : undefined
            }
            className="sm:col-span-5"
          >
            <Input
              id="numero_documento"
              // Numérico solo cuando el documento lo es: el carné de
              // extranjería y el pasaporte llevan letras, y abrir el teclado
              // de cifras en un móvil dejaría a la persona sin poder escribirlo.
              inputMode={largoEsperado === null ? "text" : "numeric"}
              autoComplete="off"
              aria-invalid={errorDocumento ? true : undefined}
              className={`${ALTO_TACTIL} tabular`}
              disabled={sinDocumento}
              maxLength={largoEsperado ?? 20}
              value={f.numero_documento}
              onChange={(e) => {
                setPadron(null);
                set("numero_documento", e.target.value);
              }}
              placeholder={tipoDocumento === "RUC" ? "20512345678" : ""}
              autoFocus={!cliente}
            />
          </Campo>

          {/* El botón ocupa su propia celda para no empujar al input. En móvil
              va a ancho completo: es el segundo gesto del alta y tiene que ser
              imposible de fallar. */}
          <div className="flex items-end sm:col-span-4">
            <Button
              type="button"
              variant="subtle"
              className="h-11 w-full md:h-control-md"
              disabled={!puedeConsultar}
              loading={consultando}
              onClick={traerDatos}
            >
              {consultando ? "Consultando…" : "Traer datos"}
            </Button>
          </div>
        </div>

        {/* Ni Decolecta ni nadie expone un padrón de carnés de extranjería o
            pasaportes. Se dice, para que no parezca que el botón está roto. */}
        {tipoDocumento !== "RUC" && tipoDocumento !== "DNI" && !sinDocumento ? (
          <p className="text-xs text-[var(--fg-muted)]">
            Este documento no tiene padrón que consultar: los datos se escriben a
            mano.
          </p>
        ) : null}

        {avisoConsulta ? (
          <p
            role="status"
            className="rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm"
          >
            {avisoConsulta}
          </p>
        ) : null}

        {/* El padrón puede decir que este contribuyente es un problema. Se
            muestra arriba y en color, no en letra chica: a un NO HABIDO no se
            le factura tranquilo. */}
        {noHabido || estadoRaro ? (
          <div
            role="alert"
            className={`flex flex-col gap-1 rounded-md border p-3 text-sm ${
              noHabido
                ? "border-[var(--danger)] bg-[var(--danger-bg)]"
                : "border-[var(--warn)] bg-[var(--warn-bg)]"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              {estadoRaro ? (
                <Badge tone="warning" size="xs">
                  {padron?.estado}
                </Badge>
              ) : null}
              {noHabido ? (
                <Badge tone="danger" size="xs">
                  {padron?.condicion}
                </Badge>
              ) : null}
            </div>
            <p>
              {noHabido
                ? "SUNAT lo tiene como NO HABIDO: la factura que se le emita puede no darle derecho a crédito fiscal y a ti te la pueden observar. Puedes darlo de alta, pero consúltalo antes de venderle a crédito."
                : `El contribuyente no figura como ACTIVO en SUNAT. Puedes darlo de alta igual, pero revisa antes de facturarle.`}
            </p>
          </div>
        ) : null}

        <Campo
          id="razon_social"
          label="Razón social"
          requerido
          error={errorDe("razon_social")}
          ayuda="Es el nombre que sale impreso en la factura."
        >
          <Input
            id="razon_social"
            className={ALTO_TACTIL}
            value={f.razon_social}
            onChange={(e) => set("razon_social", e.target.value)}
            placeholder="INDUSTRIAS SAN MIGUEL S.A.C."
          />
        </Campo>
      </section>

      {/* ═════════════════════════════════════════════════ Más datos ═════ */}
      <button
        type="button"
        onClick={() => setMasDatos((v) => !v)}
        aria-expanded={masDatos}
        aria-controls="mas-datos"
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-left text-sm font-medium hover:bg-[var(--surface-2)]"
      >
        <span>
          Más datos
          <span className="ml-2 font-normal text-[var(--fg-muted)]">
            contacto, dirección, crédito y vendedor · todo opcional
          </span>
        </span>
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={`size-4 shrink-0 transition-transform ${masDatos ? "rotate-180" : ""}`}
        >
          <path
            d="m6 9 6 6 6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* Se monta y desmonta en vez de ocultarse con CSS: si un error del
          servidor apunta a un campo de aquí, el panel se abre solo (ver abajo)
          y el campo existe con su valor. */}
      {masDatos ? (
        <div id="mas-datos" className="flex flex-col gap-4">
          {/* ───────────────────────────────────────────────── Comercial */}
          <section className="card flex flex-col gap-3 p-4">
            <h2 className="text-sm font-semibold">Datos comerciales</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Campo id="nombre_comercial" label="Nombre comercial">
                <Input
                  id="nombre_comercial"
                  className={ALTO_TACTIL}
                  value={f.nombre_comercial}
                  onChange={(e) => set("nombre_comercial", e.target.value)}
                  placeholder="Como lo conocen en el taller"
                />
              </Campo>

              <Campo id="sector" label="Sector">
                <Input
                  id="sector"
                  className={ALTO_TACTIL}
                  value={f.sector}
                  onChange={(e) => set("sector", e.target.value)}
                  placeholder="Minería, pesca, transporte…"
                />
              </Campo>

              <Campo id="contacto" label="Persona de contacto">
                <Input
                  id="contacto"
                  className={ALTO_TACTIL}
                  value={f.contacto}
                  onChange={(e) => set("contacto", e.target.value)}
                  autoComplete="off"
                />
              </Campo>

              <Campo id="cargo_contacto" label="Cargo">
                <Input
                  id="cargo_contacto"
                  className={ALTO_TACTIL}
                  value={f.cargo_contacto}
                  onChange={(e) => set("cargo_contacto", e.target.value)}
                  placeholder="Jefe de mantenimiento"
                />
              </Campo>

              <Campo
                id="email"
                label="Correo"
                error={errorDe("email")}
                ayuda="A donde llega la cotización en PDF."
              >
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  className={ALTO_TACTIL}
                  value={f.email}
                  onChange={(e) => set("email", e.target.value)}
                />
              </Campo>

              <Campo id="telefono" label="Teléfono">
                <Input
                  id="telefono"
                  type="tel"
                  inputMode="tel"
                  className={ALTO_TACTIL}
                  value={f.telefono}
                  onChange={(e) => set("telefono", e.target.value)}
                />
              </Campo>

              <Campo
                id="whatsapp"
                label="WhatsApp"
                ayuda="Es por donde de verdad se les escribe."
              >
                <Input
                  id="whatsapp"
                  type="tel"
                  inputMode="tel"
                  className={ALTO_TACTIL}
                  value={f.whatsapp}
                  onChange={(e) => set("whatsapp", e.target.value)}
                  placeholder="9XX XXX XXX"
                />
              </Campo>
            </div>
          </section>

          {/* ───────────────────────────────────────────────── Dirección */}
          <section className="card flex flex-col gap-3 p-4">
            <h2 className="text-sm font-semibold">Dirección</h2>

            <Campo
              id="direccion"
              label="Dirección fiscal"
              ayuda="La que sale en la factura y en la guía de remisión."
            >
              <Input
                id="direccion"
                className={ALTO_TACTIL}
                value={f.direccion}
                onChange={(e) => set("direccion", e.target.value)}
              />
            </Campo>

            <div className="grid gap-3 sm:grid-cols-2">
              <Campo
                id="ubigeo_codigo"
                label="Distrito"
                error={errorDe("ubigeo_codigo")}
                ayuda="SUNAT lo exige en la guía de remisión."
              >
                <SelectorUbigeo
                  id="ubigeo_codigo"
                  codigo={f.ubigeo_codigo}
                  nombre={ubigeoNombre}
                  buscar={buscarDistrito}
                  onElegir={(u) => {
                    set("ubigeo_codigo", u?.codigo ?? "");
                    setUbigeoNombre(u?.nombre ?? "");
                  }}
                />
              </Campo>

              <Campo id="referencia_direccion" label="Referencia">
                <Input
                  id="referencia_direccion"
                  className={ALTO_TACTIL}
                  value={f.referencia_direccion}
                  onChange={(e) => set("referencia_direccion", e.target.value)}
                  placeholder="Frente al grifo, portón azul"
                />
              </Campo>
            </div>
          </section>

          {/* ─────────────────────────────────────────────────── Crédito */}
          <section className="card flex flex-col gap-3 p-4">
            <h2 className="text-sm font-semibold">Condición de pago</h2>

            <div className="grid gap-3 sm:grid-cols-2">
              <Campo id="condicion_pago" label="Condición">
                <SelectNativo
                  id="condicion_pago"
                  className={ALTO_TACTIL}
                  value={condicionPago}
                  onChange={(e) => setCondicionPago(e.target.value as CondicionPago)}
                >
                  <option value="contado">{ETIQUETA_CONDICION.contado}</option>
                  <option value="credito">{ETIQUETA_CONDICION.credito}</option>
                </SelectNativo>
              </Campo>
            </div>

            {/* Los tres campos de crédito se deshabilitan en vez de esconderse:
                así se ve que existen y que dependen de la condición, y al
                volver a crédito siguen ahí los valores que ya se habían puesto. */}
            <fieldset
              disabled={!aCredito}
              className="grid gap-3 disabled:opacity-60 sm:grid-cols-3"
            >
              <Campo
                id="linea_credito"
                label="Línea de crédito"
                ayuda="Tope de deuda. 0 = sin tope."
              >
                <Input
                  id="linea_credito"
                  type="number"
                  min={0}
                  step="0.01"
                  numerico
                  className={ALTO_TACTIL}
                  value={f.linea_credito}
                  onChange={(e) => set("linea_credito", e.target.value)}
                />
              </Campo>

              <Campo id="dias_credito" label="Días de crédito">
                <Input
                  id="dias_credito"
                  type="number"
                  min={0}
                  step="1"
                  numerico
                  className={ALTO_TACTIL}
                  value={f.dias_credito}
                  onChange={(e) => set("dias_credito", e.target.value)}
                />
              </Campo>

              <Campo
                id="dias_gracia"
                label="Días de gracia"
                ayuda="Antes de contarla como vencida."
              >
                <Input
                  id="dias_gracia"
                  type="number"
                  min={0}
                  step="1"
                  numerico
                  className={ALTO_TACTIL}
                  value={f.dias_gracia}
                  onChange={(e) => set("dias_gracia", e.target.value)}
                />
              </Campo>
            </fieldset>

            {aCredito && num(f.dias_credito) === 0 ? (
              <p className="text-xs text-[var(--warn)]">
                A crédito con 0 días: la factura nace vencida el mismo día que se
                emite. Revisa si es lo que quieres.
              </p>
            ) : null}
          </section>

          {/* ────────────────────────────────────────────── Seguimiento */}
          <section className="card flex flex-col gap-3 p-4">
            <h2 className="text-sm font-semibold">Seguimiento</h2>

            <div className="grid gap-3 sm:grid-cols-2">
              <Campo
                id="vendedor_id"
                label="Vendedor asignado"
                ayuda="Quien lo atiende. Se puede dejar vacío."
              >
                <Combobox
                  id="vendedor_id"
                  opciones={catalogos.vendedores.map((v) => ({
                    valor: v.id,
                    etiqueta: v.nombre,
                  }))}
                  valor={f.vendedor_id || null}
                  onCambio={(v) => set("vendedor_id", v ?? "")}
                  placeholder="Sin asignar"
                  placeholderBusqueda="Nombre del vendedor"
                  textoVacio="Ningún vendedor coincide."
                  className={ALTO_TACTIL}
                />
              </Campo>
            </div>

            <Campo
              id="notas"
              label="Notas"
              ayuda="Lo que haya que recordar: cómo paga, quién autoriza, a qué hora recibe."
            >
              <Textarea
                id="notas"
                rows={3}
                value={f.notas}
                onChange={(e) => set("notas", e.target.value)}
              />
            </Campo>
          </section>
        </div>
      ) : null}

      {/* Los botones se apilan en móvil y el de guardar va primero visualmente
          abajo: el pulgar llega antes al borde inferior. */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full sm:w-auto md:h-control-md"
          onClick={() => router.push(cliente ? `/clientes/${cliente.id}` : "/clientes")}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          className="h-11 w-full sm:w-auto md:h-control-md"
          disabled={!listo || guardando}
          loading={guardando}
        >
          {guardando ? "Guardando…" : cliente ? "Guardar cambios" : "Crear cliente"}
        </Button>
      </div>
    </form>
  );
}

/**
 * Selector de distrito.
 *
 * Vive aquí y no en `@rodatech/ui` porque es el único sitio del ERP que lo usa;
 * el día que lo pida otro módulo, se sube al paquete. No es el `Combobox` de
 * las primitivas porque aquel filtra en memoria y esta lista son casi 1.900
 * distritos que no tiene sentido mandarle al navegador.
 *
 * Descarta las respuestas que llegan tarde: si la búsqueda de «san» vuelve
 * después que la de «san isi», se ignora. Sin eso la lista muestra resultados
 * que no corresponden a lo escrito y se termina eligiendo el distrito de al lado.
 */
function SelectorUbigeo({
  id,
  codigo,
  nombre,
  buscar,
  onElegir,
}: {
  id: string;
  codigo: string;
  nombre: string;
  buscar: (q: string) => Promise<OpcionUbigeo[]>;
  onElegir: (u: OpcionUbigeo | null) => void;
}) {
  const [abierto, setAbierto] = React.useState(false);
  const [termino, setTermino] = React.useState("");
  const [resultados, setResultados] = React.useState<OpcionUbigeo[]>([]);
  const [cargando, setCargando] = React.useState(false);

  // Número de orden de la petición. Una ref y no estado: cambiarlo no tiene
  // que repintar nada, solo sirve para saber cuál es la respuesta vigente.
  const peticion = React.useRef(0);

  React.useEffect(() => {
    const t = termino.trim();
    // El servidor ya corta por debajo de dos letras; se corta también aquí
    // para no gastar el viaje.
    if (t.length < 2) {
      setResultados([]);
      setCargando(false);
      return;
    }

    const propia = ++peticion.current;
    setCargando(true);

    const temporizador = setTimeout(() => {
      void buscar(t)
        .then((lista) => {
          if (propia !== peticion.current) return;
          setResultados(lista);
          setCargando(false);
        })
        .catch(() => {
          if (propia !== peticion.current) return;
          setResultados([]);
          setCargando(false);
        });
    }, 250);

    return () => clearTimeout(temporizador);
  }, [termino, buscar]);

  // Con nombre se lee el distrito; sin él —código traído de SUNAT— al menos se
  // ve el código, que es mejor que un campo aparentemente vacío.
  const etiqueta = nombre || codigo;

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger
        id={id}
        type="button"
        role="combobox"
        aria-expanded={abierto}
        className={`${ALTO_TACTIL} flex w-full items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-left text-sm`}
      >
        <span className={`min-w-0 truncate ${etiqueta ? "" : "text-[var(--fg-subtle)]"}`}>
          {etiqueta || "Busca el distrito…"}
        </span>
        {codigo ? (
          <span
            role="button"
            tabIndex={0}
            aria-label="Quitar el distrito"
            // Un `<button>` dentro del trigger sería un botón dentro de un
            // botón, que el HTML no permite. Con `span` + rol se conserva el
            // teclado sin anidar controles.
            onClick={(e) => {
              e.stopPropagation();
              onElegir(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onElegir(null);
              }
            }}
            className="shrink-0 rounded-sm px-1 text-xs text-[var(--fg-muted)] hover:text-[var(--fg)]"
          >
            ✕
          </span>
        ) : null}
      </PopoverTrigger>

      <PopoverContent className="w-[min(22rem,calc(100vw-2rem))] p-0" align="start">
        {/* `shouldFilter={false}`: el orden por relevancia ya lo decidió
            Postgres; volver a filtrar aquí descartaría aciertos. */}
        <Command shouldFilter={false} loop label="Buscar distrito">
          <CommandInput
            value={termino}
            onValueChange={setTermino}
            placeholder="Distrito, provincia o departamento"
          />
          <CommandList>
            {cargando && resultados.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-[var(--fg-muted)]">
                Buscando…
              </div>
            ) : resultados.length === 0 ? (
              <CommandEmpty>
                {termino.trim().length < 2
                  ? "Escribe al menos dos letras."
                  : `Ningún distrito coincide con «${termino.trim()}».`}
              </CommandEmpty>
            ) : (
              <CommandGroup>
                {resultados.map((u) => (
                  <CommandItem
                    key={u.codigo}
                    value={u.codigo}
                    onSelect={() => {
                      onElegir(u);
                      setAbierto(false);
                      setTermino("");
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{u.nombre}</span>
                    <span className="tabular shrink-0 text-xs text-[var(--fg-subtle)]">
                      {u.codigo}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
