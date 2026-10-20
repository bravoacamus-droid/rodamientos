"use client";

// Cliente: el alta rápida consulta el documento contra SUNAT/RENIEC y rellena
// campos mientras la persona mira, el panel de «más datos» se pliega, y la
// condición de pago habilita o apaga el bloque de crédito. Todo eso es estado
// local y eventos: no hay forma de hacerlo en el servidor.

import * as React from "react";
import { useBorrador } from "@/componentes/borrador";
import { useRouter } from "next/navigation";
import { Check, Pencil } from "lucide-react";
import {
  Badge,
  Button,
  Campo,
  Input,
  SelectNativo,
} from "@rodatech/ui";

import { buscarPorDocumento } from "../acciones/consultar";
import { ContactosNuevos, type ContactoNuevo } from "./contactos-nuevos";
import { EditorContactos } from "./editor-contactos";
import { SelectorUbigeoCascada, type DistritoUbigeo } from "./selector-ubigeo";
import { guardarCliente } from "../acciones/guardar";
import {
  crearRubro,
  crearZona,
  eliminarRubro,
  eliminarZona,
  renombrarRubro,
  renombrarZona,
} from "../acciones/rubros";
import { SelectorCatalogo } from "@/modules/cotizaciones/ui/constructor/selector-catalogo";
import { esConsultable, revisarDocumento } from "../dominio/documento";
import {
  ETIQUETA_DOCUMENTO,
  LARGO_DOCUMENTO,
  type ClienteDetalle,
  type CondicionPago,
  type DatosDocumento,
  type ResultadoCliente,
  type RubroCliente,
  type TipoDocumento,
  type ZonaCliente,
} from "../dominio/tipos";

/**
 * Alta y edición de un cliente.
 *
 * El formulario está partido en dos por una razón muy concreta que dijo el
 * cliente: *"hay muchos clientes técnicos que a las justas me dan correo"*.
 *
 *   · Arriba, el ALTA RÁPIDA: tipo de documento, número, «Traer datos» y razón
 *     social. Con eso ya se puede guardar. Es el 90% de las altas reales.
 *   · Abajo, la zona y el rubro, y los contactos. «Más datos» se quitó el 20/10.
 *
 * Nada de lo que devuelva la consulta puede impedir guardar. Si la cuota se
 * agotó, si SUNAT no responde o si el contribuyente está NO HABIDO, se avisa y
 * se sigue a mano: bloquear el alta convierte una molestia en una venta
 * perdida.
 */

export interface CatalogosCliente {
  vendedores: { id: string; nombre: string }[];
  /** Los distritos de Lima y el Callao que se ofrecen como zona (141). */
  zonas: ZonaCliente[];
  rubros: RubroCliente[];
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
  cargarDepartamentos,
  cargarProvincias,
  cargarDistritos,
}: {
  catalogos: CatalogosCliente;
  cliente?: ClienteDetalle;
  /** Los tres niveles de la cascada. Van al servidor, no precargados. */
  cargarDepartamentos: () => Promise<string[]>;
  cargarProvincias: (departamento: string) => Promise<string[]>;
  cargarDistritos: (d: string, p: string) => Promise<DistritoUbigeo[]>;
}) {
  const router = useRouter();

  const [resultado, guardar, guardando] = React.useActionState<
    ResultadoCliente | null,
    FormData
  >(async (previo, formData) => {
    const r = await guardarCliente(previo, formData);
    // A la ficha: después de crearlo o editarlo lo que se quiere es verlo, no
    // volver a buscarlo en el listado.
    if (r.ok) {
      // Ya está en la base: el borrador sobra.
      olvidarBorrador();
      router.push(`/clientes/${r.id}`);
    }
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
  /** Agente de retención (118): enciende sola la retención en sus facturas. */
  const [agenteRetencion, setAgenteRetencion] = React.useState(cliente?.agente_retencion ?? false);

  const [f, setF] = React.useState({
    numero_documento: cliente?.numero_documento ?? "",
    razon_social: cliente?.razon_social ?? "",
    nombre_comercial: cliente?.nombre_comercial ?? "",
    sector: cliente?.sector ?? "",
    email: cliente?.email ?? "",
    telefono: cliente?.telefono ?? "",
    whatsapp: cliente?.whatsapp ?? "",
    direccion: cliente?.direccion ?? "",
    ubigeo_codigo: cliente?.ubigeo_codigo ?? "",
    referencia_direccion: cliente?.referencia_direccion ?? "",
    zona_id: cliente?.zona_id ?? "",
    rubro_id: cliente?.rubro_id ?? "",
    linea_credito: String(cliente?.linea_credito ?? "0"),
    dias_credito: String(cliente?.dias_credito ?? "0"),
    dias_gracia: String(cliente?.dias_gracia ?? "0"),
    vendedor_id: cliente?.vendedor_id ?? "",
    notas: cliente?.notas ?? "",
  });

  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  /**
   * Zonas y rubros, con lo que se cree, corrija o borre aquí mismo (142). Un
   * solo mensaje de error para los dos: el que diga qué pasó con el último.
   */
  const [rubros, setRubros] = React.useState(catalogos.rubros);
  const [zonas, setZonas] = React.useState(catalogos.zonas);
  const [errorCatalogo, setErrorCatalogo] = React.useState<string | null>(null);

  type Opc = { id: string; nombre: string };
  const ordenar = (xs: Opc[]) => [...xs].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  /** Las tres operaciones de un catálogo, con la lista local al día. */
  const gestion = (
    setLista: React.Dispatch<React.SetStateAction<Opc[]>>,
    campo: "zona_id" | "rubro_id",
    acciones: {
      crear: (n: string) => Promise<{ ok: true; datos: Opc } | { ok: false; error: string }>;
      renombrar: (id: string, n: string) => Promise<{ ok: true; datos: Opc } | { ok: false; error: string }>;
      eliminar: (id: string) => Promise<{ ok: true; datos: null } | { ok: false; error: string }>;
    },
  ) => ({
    onCrear: async (nombre: string) => {
      const r = await acciones.crear(nombre);
      if (!r.ok) return (setErrorCatalogo(r.error), null);
      setErrorCatalogo(null);
      setLista((l) => (l.some((x) => x.id === r.datos.id) ? l : ordenar([...l, r.datos])));
      set(campo, r.datos.id);
      return r.datos;
    },
    onRenombrar: async (id: string, nombre: string) => {
      const r = await acciones.renombrar(id, nombre);
      if (!r.ok) return (setErrorCatalogo(r.error), null);
      setErrorCatalogo(null);
      setLista((l) => ordenar(l.map((x) => (x.id === id ? r.datos : x))));
      return r.datos;
    },
    onEliminar: async (id: string) => {
      const r = await acciones.eliminar(id);
      if (!r.ok) return (setErrorCatalogo(r.error), false);
      setErrorCatalogo(null);
      setLista((l) => l.filter((x) => x.id !== id));
      return true;
    },
  });
  const gestionZonas = gestion(setZonas, "zona_id", { crear: crearZona, renombrar: renombrarZona, eliminar: eliminarZona });
  const gestionRubros = gestion(setRubros, "rubro_id", {
    crear: crearRubro,
    renombrar: renombrarRubro,
    eliminar: eliminarRubro,
  });

  /**
   * ¿Se está corrigiendo a mano lo que trajo SUNAT?
   *
   * Cuando la consulta responde, sus cuatro campos —razón social, dirección,
   * distrito y su código— se pliegan en una TARJETA DE RESUMEN en vez de
   * quedarse como cuatro cajas de texto. El motivo es que casi nunca se
   * corrigen: son el dato oficial, y tenerlos abiertos solo hace la pantalla
   * más larga. Quien necesite tocarlos pulsa «corregir».
   */
  const [corrigiendo, setCorrigiendo] = React.useState(false);


  /**
   * Los contactos que se crean junto con la empresa, solo en el ALTA.
   *
   * Viven aquí y no dentro de `ContactosNuevos` porque el payload que viaja al
   * servidor se arma en este componente: si el estado estuviera abajo habría
   * que subirlo con un efecto, que es la forma cara de hacer lo mismo.
   */
  const [contactos, setContactos] = React.useState<ContactoNuevo[]>([]);


  // El nombre del distrito se lleva aparte del código porque son datos de
  // origen distinto: el código puede venir de SUNAT (que no manda el nombre) o
  // de la ficha guardada (que lo trae ya resuelto). Sin esto, al editar un
  // cliente el selector mostraría «150131» en vez de «San Isidro».
  const [ubigeoNombre, setUbigeoNombre] = React.useState(cliente?.ubigeo_nombre ?? "");

  /**
   * Dónde está parada la cascada de ubigeo.
   *
   * Se lleva aparte del código porque los tres desplegables se rellenan de
   * arriba abajo y el de abajo no puede saber solo en qué provincia está.
   * Al editar viene de la ficha; al pulsar «Traer datos», de lo que respondió
   * SUNAT.
   */
  const [ubigeoDep, setUbigeoDep] = React.useState(cliente?.ubigeo_departamento ?? "");
  const [ubigeoProv, setUbigeoProv] = React.useState(cliente?.ubigeo_provincia ?? "");
  const [ubigeoDist, setUbigeoDist] = React.useState(cliente?.ubigeo_distrito ?? "");


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
      // Solo si la consulta lo AFIRMA: el plan básico no trae el dato.
      if (d.agente_retencion) setAgenteRetencion(true);
      setF((x) => ({
        ...x,
        razon_social: d.razon_social || x.razon_social,
        nombre_comercial: x.nombre_comercial || (d.nombre_comercial ?? ""),
        direccion: d.direccion ?? x.direccion,
        ubigeo_codigo: d.ubigeo_codigo ?? x.ubigeo_codigo,
      }));
      // SUNAT manda el código Y los tres nombres —comprobado contra la
      // respuesta real—, así que desde la 036 el selector puede enseñar el
      // distrito escrito en vez del código pelado, aunque ese distrito no
      // esté todavía en nuestra tabla. Al guardar se da de alta con esto
      // mismo (`asegurar_ubigeo`).
      if (d.ubigeo_codigo) {
        setUbigeoNombre(
          d.ubigeo_distrito
            ? [d.ubigeo_departamento, d.ubigeo_provincia, d.ubigeo_distrito]
                .filter(Boolean)
                .join(" · ")
            : "",
        );
        // Y la cascada queda parada donde corresponde, para que al pulsar
        // «Corregir» los tres desplegables salgan ya puestos en vez de vacíos.
        //
        // Se guardan los nombres TAL COMO LOS MANDA SUNAT (mayúsculas, sin
        // tildes) y no los de nuestra tabla. Es a propósito: `ubigeo_provincias`
        // compara con `normalizar_texto`, así que «LIMA» encuentra «Lima», y
        // así el payload de guardado sigue llevando lo que dijo SUNAT, que es
        // lo que `asegurar_ubigeo` necesita si el distrito no existiera.
        setUbigeoDep(d.ubigeo_departamento ?? "");
        setUbigeoProv(d.ubigeo_provincia ?? "");
        setUbigeoDist(d.ubigeo_distrito ?? "");
      }

      // El panel de «Más datos» ya NO se abre solo. Lo hacía porque la
      // dirección y el distrito vivían dentro y había que poder ver lo que se
      // acababa de rellenar; ahora salen en la tarjeta de resumen, arriba y a
      // la vista. Abrirlo aquí solo alargaría la pantalla con siete campos que
      // nadie ha llenado nunca.
      //
      // Y se pliega lo que estuviera corrigiéndose: la consulta acaba de traer
      // el dato oficial, así que hay algo que resumir otra vez.
      setCorrigiendo(false);
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


  /**
   * ¿Se puede plegar lo de SUNAT en la tarjeta de resumen?
   *
   * Solo si hay algo que resumir. Con la razón social vacía la tarjeta diría
   * un nombre en blanco, y en un alta a mano —CE, pasaporte, o SUNAT caída—
   * no hay consulta que plegar: ahí los campos van abiertos desde el primer
   * momento, que es lo correcto.
   */
  const puedePlegar = f.razon_social.trim() !== "" && (padron !== null || Boolean(cliente));
  const resumenPlegado = puedePlegar && !corrigiendo;

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
    zona_id: f.zona_id || null,
    rubro_id: f.rubro_id || null,
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
    agente_retencion: agenteRetencion,
    vendedor_id: f.vendedor_id || null,
    notas: f.notas.trim() || null,
    // Los tres nombres del distrito, para que el servidor pueda darlo de alta
    // si no lo tenemos (036). Van vacíos cuando el código lo eligió a mano de
    // la lista: entonces el distrito ya existe y no hay nada que crear.
    // Los tres nombres salen de la CASCADA, que es donde está lo elegido de
    // verdad —a mano o rellenado por «Traer datos»—. Antes salían del padrón
    // y llegaban en null cuando el distrito se elegía a mano, que es cuando
    // más falta harían si el distrito no existiera todavía.
    ubigeo_departamento: ubigeoDep || padron?.ubigeo_departamento || null,
    ubigeo_provincia: ubigeoProv || padron?.ubigeo_provincia || null,
    ubigeo_distrito: ubigeoDist || padron?.ubigeo_distrito || null,
    // Solo en el alta. Al editar, los contactos ya se guardaron por su cuenta.
    //
    // Van en el mismo envío que la empresa porque hasta que esta no exista no
    // hay `cliente_id` al que colgarlos. El orden se conserva: el servidor los
    // inserta tal cual llegan y el marcado como principal es el que manda.
    contactos_iniciales: cliente
      ? []
      : contactos.map((c) => ({
          nombre: c.nombre.trim(),
          cargo: c.cargo.trim() || null,
          area: c.area.trim() || null,
          email: c.email.trim() || null,
          telefono: c.telefono.trim() || null,
          whatsapp: c.whatsapp.trim() || null,
          principal: c.principal,
        })),
  };

  // Lo mínimo del contrato: documento utilizable y razón social. Nada más.
  const listo = f.razon_social.trim() !== "" && revision.ok;

  const errorDe = (campo: string) =>
    resultado && !resultado.ok && resultado.campo === campo ? resultado.error : undefined;

  /*
    Lo que se está llenando, guardado solo en el navegador (13/10). Si se
    cierra la página, al volver se ofrece seguir donde se quedó.
  */
  const { aviso: avisoBorrador, olvidar: olvidarBorrador } = useBorrador({
    formulario: "cliente",
    id: cliente?.id ?? null,
    datos: { tipoDocumento, condicionPago, f, contactos, ubigeoNombre, ubigeoDep, ubigeoProv, ubigeoDist },
    valeLaPena: (d) => Boolean(d.f.numero_documento || d.f.razon_social || d.contactos.length > 0),
    recuperar: (d) => {
      setTipoDocumento(d.tipoDocumento);
      setCondicionPago(d.condicionPago);
      setF(d.f);
      setContactos(d.contactos);
      setUbigeoNombre(d.ubigeoNombre);
      setUbigeoDep(d.ubigeoDep);
      setUbigeoProv(d.ubigeoProv);
      setUbigeoDist(d.ubigeoDist);
    },
  });

  return (
    <form action={guardar} className="flex flex-col gap-4">
      <input type="hidden" name="cliente" value={JSON.stringify(payload)} />

      {avisoBorrador}

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
          <h2 className="text-sm font-semibold">¿Quién es?</h2>
          <p className="text-sm text-[var(--fg-muted)]">
            Pega el RUC y dale a «Traer datos»: razón social, dirección y
            distrito se rellenan solos. Con eso ya se puede guardar.
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
            className="sm:col-span-9"
          >
            {/*
              El botón va DENTRO del campo del número, en la misma fila que el
              input.

              Antes ocupaba su propia celda de la rejilla con `items-end`, y eso
              lo alineaba con el fondo de la FILA, no con el input: la fila la
              estiran la etiqueta de arriba y el «11 dígitos» de abajo, así que
              el botón quedaba caído media altura y desalineado. Y al ser una
              celda de 4 de 12 salía absurdamente ancho.

              Aquí se alinea solo, porque comparte contenedor con el input. Es
              además lo que ya hacía el maestro de proveedores, que tenía el
              mismo botón bien puesto desde el principio.

              En móvil se apila y va a ancho completo: es el segundo gesto del
              alta y tiene que ser imposible de fallar.
            */}
            <div className="flex flex-col gap-2 sm:flex-row">
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
              <Button
                type="button"
                variant="subtle"
                className={`${ALTO_TACTIL} w-full shrink-0 sm:w-auto`}
                disabled={!puedeConsultar}
                loading={consultando}
                onClick={traerDatos}
              >
                {consultando ? "Consultando…" : "Traer datos"}
              </Button>
            </div>
          </Campo>
        </div>

        {/* Ni Decolecta ni nadie expone un padrón de carnés de extranjería o
            pasaportes. Se dice, para que no parezca que el botón está roto. */}
        {tipoDocumento !== "RUC" && tipoDocumento !== "DNI" && !sinDocumento ? (
          <p className="text-sm text-[var(--fg-muted)]">
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

        {/* ─────────────────────────────────────── Lo que trajo SUNAT ───
            Cuatro campos —razón social, dirección, distrito y referencia— que
            en el 95 % de las altas NO se tocan: son el dato oficial. Se
            pliegan en una tarjeta, y quien necesite corregirlos lo pide.
            Antes eran cuatro cajas abiertas, o sea cuatro de las 22 que hacían
            la pantalla larga. */}
        {resumenPlegado ? (
          /*
           * La tarjeta de lo que trajo SUNAT.
           *
           * Willy, 01/09: *«el lápiz no se ve mucho, para el cliente que es
           * corto de vista no ve bien»*. Tenía razón y era peor de lo que
           * parece: el botón era `ghost` en tamaño `xs`, o sea 12 px de texto
           * gris sobre un fondo de color, sin borde. En una pantalla de
           * oficina a metro y medio, eso no es un botón, es una decoración.
           *
           * Ahora es un `outline` a altura completa, con borde, con el nombre
           * de lo que hace —«Corregir datos», no «Corregir»— y a ancho
           * completo en móvil. Y el nombre de la empresa sube a `text-base`:
           * es el dato que se viene a comprobar.
           */
          <div className="flex flex-col gap-3 rounded-md border-2 border-brand-300 bg-brand-50 p-4 sm:flex-row sm:items-center dark:bg-brand-950/40">
            <Check className="size-5 shrink-0 text-brand-600" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold">{f.razon_social}</p>
              <p className="mt-1 text-sm text-[var(--fg-muted)]">
                {f.direccion || "Sin dirección"}
                {ubigeoNombre ? ` · ${ubigeoNombre}` : ""}
              </p>
              {/* Que el distrito NO haya venido importa lo suyo: sin él no se
                  puede emitir una guía de remisión a ese cliente. */}
              {!f.ubigeo_codigo ? (
                <p className="mt-1 text-sm font-medium text-[var(--warn)]">
                  Sin distrito. Hace falta para la guía de remisión; se puede
                  poner después.
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full shrink-0 sm:w-auto md:h-control-md"
              onClick={() => setCorrigiendo(true)}
            >
              <Pencil aria-hidden="true" />
              Corregir datos
            </Button>
          </div>
        ) : (
          <>
            <Campo
              id="razon_social"
              label={tipoDocumento === "DNI" ? "Nombre y apellidos" : "Razón social"}
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

            <Campo
              id="direccion"
              label={tipoDocumento === "DNI" ? "Dirección (opcional)" : "Dirección fiscal"}
              ayuda={
                tipoDocumento === "DNI"
                  ? "Con DNI no hace falta. Si la pones, sale en la guía de remisión."
                  : "La que sale en la factura y en la guía de remisión."
              }
            >
              <Input
                id="direccion"
                className={ALTO_TACTIL}
                value={f.direccion}
                onChange={(e) => set("direccion", e.target.value)}
              />
            </Campo>

            <div className="grid gap-3 sm:grid-cols-2">
              {/* Departamento → provincia → distrito, que es lo que pidió
                  Willy. Antes era UNA caja que buscaba por nombre, y con 64
                  distritos cargados era lo único que se podía ofrecer: una
                  cascada sobre un padrón incompleto se ve rota —elegir Cusco y
                  que solo salga la provincia «Cusco»—. Con el padrón entero
                  (037) ya son 25 · 196 · 1.874. */}
              <div className="sm:col-span-2">
                <SelectorUbigeoCascada
                  id="ubigeo_codigo"
                  codigo={f.ubigeo_codigo}
                  departamento={ubigeoDep}
                  provincia={ubigeoProv}
                  cargarDepartamentos={cargarDepartamentos}
                  cargarProvincias={cargarProvincias}
                  cargarDistritos={cargarDistritos}
                  onElegir={(u) => {
                    setUbigeoDep(u.departamento);
                    setUbigeoProv(u.provincia);
                    setUbigeoDist(u.distrito);
                    set("ubigeo_codigo", u.codigo);
                    // La tarjeta de resumen lee de aquí.
                    setUbigeoNombre(
                      u.distrito
                        ? [u.departamento, u.provincia, u.distrito].filter(Boolean).join(" · ")
                        : "",
                    );
                  }}
                />
              </div>

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

            {/* Cerrar la corrección es un BOTÓN, no un enlace de 12 px.
                Willy, 01/09: *«después de corregir, el "listo plegar" debería
                ser un botón de listo»*. Y no dice «plegar», que es jerga de
                interfaz: dice qué acabas de hacer.

                No guarda nada —lo que se escribe ya está en el estado del
                formulario y se manda con «Crear cliente»—, así que la etiqueta
                no puede ser «Guardar»: prometería un guardado que no ocurre y
                dejaría a la persona pensando que ya terminó. */}
            {puedePlegar ? (
              <Button
                type="button"
                variant="outline"
                className="h-11 self-start md:h-control-md"
                onClick={() => setCorrigiendo(false)}
              >
                <Check aria-hidden="true" />
                Listo, ya está bien
              </Button>
            ) : null}
          </>
        )}
      </section>

      {/* ═══════════════════════════════════════ Zona y rubro ═════════════
          En el sitio de «¿Cómo paga?», que se fue (Willy, 20/10, ≈42:40):
          *«esto se pone en la cotización y en la factura… un cliente puede
          empezar con crédito y de ahí se le puede quitar»*; y la retención
          *«se define en la factura»*. Lo que ya tuviera guardado un cliente se
          conserva: solo deja de editarse aquí.

          Y en su lugar, lo que pidió para trabajar (141): la ZONA, para
          agrupar las visitas —*«un día se trabaja por el Callao, otro día me
          voy a Chorrillos»*—, que no es la dirección fiscal; y el RUBRO, para
          saber *«con cuántas empresas agroindustriales contamos»*. */}
      <section className="card flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold">¿Por dónde lo visitas y a qué se dedica?</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectorCatalogo
            id="zona_id"
            label="Zona"
            ayuda="El distrito donde se le visita. No tiene que ser el de la dirección fiscal."
            opciones={zonas}
            valor={f.zona_id}
            onElegir={(o) => set("zona_id", o?.id ?? "")}
            placeholder="Elige o escribe la zona"
            {...gestionZonas}
          />
          <SelectorCatalogo
            id="rubro_id"
            label="Rubro"
            masculino
            ayuda="El sector: textil, pesquera, metalmecánica… Si no está, créalo con el +."
            opciones={rubros}
            valor={f.rubro_id}
            onElegir={(o) => set("rubro_id", o?.id ?? "")}
            placeholder="Elige o escribe el rubro"
            {...gestionRubros}
          />
        </div>
        {errorCatalogo ? <p className="text-sm font-medium text-[var(--danger)]">{errorCatalogo}</p> : null}
      </section>

      {/* ══════════════════════════════════ ¿Con quién hablas ahí? ═══════
          Una empresa tiene VARIOS contactos, y hay que poder escribirlos en
          los dos sitios donde aparecen: al darla de alta y después en su
          ficha.

          · EDITANDO, `EditorContactos`: cada contacto guarda contra el
            servidor por su cuenta, porque el cliente ya existe.
          · CREANDO, `ContactosNuevos`: se acumulan en memoria y viajan dentro
            del mismo envío, porque todavía no hay `cliente_id` al que
            colgarlos.

          Hasta el 01/09 el alta aceptaba UNO. Willy: *«recuerda que puede
          tener uno o varios contactos; falta un botón que guarde y añada más
          contactos»*. Para el segundo había que crear la empresa, entrar en su
          ficha y volver a escribir — justo cuando se tienen los tres nombres
          delante, en el correo que acaba de llegar. */}
      {cliente ? (
        <EditorContactos clienteId={cliente.id} iniciales={cliente.contactos_lista} />
      ) : (
        <ContactosNuevos lista={contactos} onCambio={setContactos} />
      )}

      {/* «Más datos» se fue (Luis, 20/10): nombre comercial, teléfonos,
          vendedor y notas no se llenaban nunca, y lo que importa de una
          empresa es su gente —los contactos de arriba, a quienes se les
          vende—. Lo que ya tuviera guardado un cliente se conserva: el
          envío sigue mandando esos campos como estaban. */}

      {/* Los botones se apilan en móvil y el de guardar va primero visualmente
          abajo: el pulgar llega antes al borde inferior. */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full sm:w-auto md:h-control-md"
          onClick={() => {
            // Cancelar es decidir no seguir: no se ofrece otra vez.
            olvidarBorrador();
            router.push(cliente ? `/clientes/${cliente.id}` : "/clientes");
          }}
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

