"use client";

// Cliente: es un diálogo con estado propio y llama a dos Server Actions.

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
  Input,
  SelectNativo,
} from "@rodatech/ui";
import { AlertTriangle, Download, Info, UserPlus } from "lucide-react";

import { buscarPorDocumento } from "@/modules/clientes/acciones/consultar";
import { guardarCliente } from "@/modules/clientes/acciones/guardar";
import type { TipoDocumento } from "@/modules/clientes/dominio/tipos";

import type { ClienteOpcion } from "../../dominio/cliente";

/**
 * Alta rápida de cliente sin salir de la cotización.
 *
 * Willy lo pidió así (34:12): *pegar el RUC desde la propia cotización*. El
 * caso es concreto y frecuente — llega un cliente nuevo, hay que cotizarle
 * ahora, y mandarlo a otra pantalla significa perder la cotización a medias.
 *
 * Guarda con la MISMA Server Action que el maestro. Un alta paralela sería un
 * segundo sitio donde validar el RUC, generar el código y desambiguar
 * duplicados, y los dos se separarían al primer cambio.
 *
 * ---------------------------------------------------------------------------
 * Qué cambió respecto de la primera versión
 * ---------------------------------------------------------------------------
 *  · ERA UN ENLACE de texto de 12 px encima del desplegable. En la demo del
 *    26/08 no lo vio, y eso que era suyo el pedido. Ahora es un botón, al lado
 *    de la caja de búsqueda, con su icono.
 *
 *  · LLEGA CON EL DOCUMENTO PUESTO. Se abre desde una búsqueda que no encontró
 *    nada, así que lo tecleado ya es el RUC —o el nombre— y volver a escribirlo
 *    es el paso que sobra. Si el documento está completo, además se consulta
 *    solo: es el clic que se iba a dar igual.
 *
 *  · EL DIÁLOGO ESTÁ ORDENADO. Antes eran cuatro campos sueltos entre el
 *    título y los botones, sin cabecera ni separaciones. Ahora van en dos
 *    bloques —quién es, y cómo se le contacta— con el segundo plegado.
 *
 *  · SE GUARDA LO QUE SUNAT REGALA. La consulta ya devolvía dirección y
 *    ubigeo y se tiraban. Son obligatorios para emitir una guía de remisión
 *    más adelante: guardarlos ahora no cuesta nada y evita volver a la ficha.
 *
 * Lo que NO cambió: los campos obligatorios siguen siendo tres. *«Hay muchos
 * clientes técnicos que a las justas me dan correo»*; pedir la ficha entera en
 * mitad de una venta no hace que los datos aparezcan.
 */
export function ClienteRapido({
  documentoInicial = "",
  nombreInicial = "",
  onCreado,
}: {
  /** Los dígitos que se estaban buscando, si parecían un documento. */
  documentoInicial?: string;
  /** Lo tecleado, si NO parecía un documento: sirve de razón social. */
  nombreInicial?: string;
  /** Recibe el cliente ya guardado para seleccionarlo en la cotización. */
  onCreado: (cliente: ClienteOpcion) => void;
}) {
  const [abierto, setAbierto] = React.useState(false);
  const [tipo, setTipo] = React.useState<TipoDocumento>("RUC");
  const [numero, setNumero] = React.useState("");
  const [razonSocial, setRazonSocial] = React.useState("");
  const [contacto, setContacto] = React.useState("");
  const [cargo, setCargo] = React.useState("");
  const [telefono, setTelefono] = React.useState("");
  const [email, setEmail] = React.useState("");
  // De SUNAT, no se teclean: se guardan tal cual vienen.
  const [direccion, setDireccion] = React.useState<string | null>(null);
  const [ubigeo, setUbigeo] = React.useState<string | null>(null);
  /**
   * Los tres nombres del distrito que devolvió SUNAT.
   *
   * Viajan con el código para que el servidor pueda dar de alta el distrito
   * si no lo tenemos (036). Sin esto, un cliente de Trujillo se guardaba sin
   * distrito y nadie se enteraba.
   */
  const [ubigeoNombres, setUbigeoNombres] = React.useState<{
    departamento: string | null;
    provincia: string | null;
    distrito: string | null;
  } | null>(null);
  const [aviso, setAviso] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [consultando, consultar] = React.useTransition();
  const [guardando, guardar] = React.useTransition();

  const limpiar = () => {
    setTipo("RUC");
    setNumero("");
    setRazonSocial("");
    setContacto("");
    setCargo("");
    setTelefono("");
    setEmail("");
    setDireccion(null);
    setUbigeo(null);
    setUbigeoNombres(null);
    setAviso(null);
    setError(null);
  };

  const traerDatos = React.useCallback(
    (tipoDoc: TipoDocumento, numeroDoc: string) => {
      setError(null);
      setAviso(null);
      consultar(async () => {
        const r = await buscarPorDocumento(tipoDoc, numeroDoc.trim());
        if (!r.ok) {
          // Cuota agotada NO bloquea: se escribe a mano y se sigue.
          setError(
            r.agotada
              ? `${r.error} Escribe la razón social a mano y guarda igual.`
              : r.error,
          );
          return;
        }
        setRazonSocial(r.datos.razon_social);
        setDireccion(r.datos.direccion);
        setUbigeo(r.datos.ubigeo_codigo);
        setUbigeoNombres({
          departamento: r.datos.ubigeo_departamento,
          provincia: r.datos.ubigeo_provincia,
          distrito: r.datos.ubigeo_distrito,
        });
        if (r.datos.condicion === "NO HABIDO") {
          setAviso("SUNAT lo marca como NO HABIDO. Su crédito fiscal es observable.");
        } else if (r.datos.estado && r.datos.estado !== "ACTIVO") {
          setAviso(`Estado en SUNAT: ${r.datos.estado}.`);
        }
      });
    },
    [],
  );

  /**
   * Al abrir: se hereda lo que se estaba buscando.
   *
   * Y si el documento ya está completo se consulta solo. Gasta una de las
   * consultas del mes, sí — pero es exactamente la que se iba a gastar al
   * pulsar «Traer», y el número ya pasó su dígito verificador en el buscador.
   */
  const abrir = (v: boolean) => {
    setAbierto(v);
    if (!v) {
      limpiar();
      return;
    }
    limpiar();
    if (documentoInicial) {
      const esRuc = documentoInicial.length === 11;
      const doc = esRuc ? "RUC" : "DNI";
      setTipo(doc);
      setNumero(documentoInicial);
      if (documentoInicial.length === 11 || documentoInicial.length === 8) {
        traerDatos(doc, documentoInicial);
      }
    } else if (nombreInicial) {
      setRazonSocial(nombreInicial);
    }
  };

  const enviar = () => {
    setError(null);
    guardar(async () => {
      // La acción del maestro espera FormData con el JSON en `cliente`.
      const datos = new FormData();
      datos.set(
        "cliente",
        JSON.stringify({
          tipo_documento: tipo,
          numero_documento: numero.trim() || null,
          razon_social: razonSocial.trim(),
          nombre_comercial: null,
          direccion,
          ubigeo_codigo: ubigeo,
          referencia_direccion: null,
          sector: null,
          email: email.trim() || null,
          telefono: telefono.trim() || null,
          whatsapp: null,
          condicion_pago: "contado",
          linea_credito: 0,
          dias_credito: 0,
          dias_gracia: 0,
          vendedor_id: null,
          notas: null,
          // Los tres nombres del distrito, para que el servidor pueda darlo
          // de alta si no lo tenemos (036). Antes se perdía el distrito de
          // cualquier cliente que no fuera de Lima.
          ubigeo_departamento: ubigeoNombres?.departamento ?? null,
          ubigeo_provincia: ubigeoNombres?.provincia ?? null,
          ubigeo_distrito: ubigeoNombres?.distrito ?? null,
          // El contacto ya no es una columna del cliente: es su propia ficha
          // (035). Se manda aquí y el servidor lo crea junto con la empresa,
          // marcado como principal.
          contacto_inicial: contacto.trim()
            ? {
                nombre: contacto.trim(),
                cargo: cargo.trim() || null,
                area: null,
                email: email.trim() || null,
                telefono: telefono.trim() || null,
                whatsapp: null,
              }
            : null,
        }),
      );

      const r = await guardarCliente(null, datos);
      if (!r.ok) {
        setError(r.error);
        return;
      }

      onCreado({
        id: r.id,
        codigo: r.codigo,
        razon_social: r.razonSocial,
        nombre_comercial: null,
        numero_documento: numero.trim() || null,
        tipo_documento: tipo,
        contacto: contacto.trim() || null,
        contactos: contacto.trim() ? 1 : 0,
        telefono: telefono.trim() || null,
        // Nace al contado: dar crédito a alguien de quien no se sabe nada es
        // una decisión, no un valor por defecto.
        condicion_pago: "contado",
        dias_credito: 0,
        bloqueado: false,
        motivo_bloqueo: null,
        activo: true,
        cotizaciones: 0,
        ultima_cotizacion: null,
      });

      limpiar();
      setAbierto(false);
    });
  };

  const consultable = tipo === "RUC" || tipo === "DNI";
  const listo = razonSocial.trim().length > 2 && !guardando;

  return (
    <Dialog open={abierto} onOpenChange={abrir}>
      {/* El disparador va DENTRO del Dialog, que es como Radix lo espera: un
          botón suelto empujando el estado desde fuera funciona en teoría, pero
          aquí el clic se perdía entre el formulario y el portal.

          `type="button"` es obligatorio: el constructor entero es un `<form>`,
          y un botón sin tipo dentro de un formulario envía. */}
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <UserPlus aria-hidden="true" />
          <span className="hidden sm:inline">Cliente nuevo</span>
        </Button>
      </DialogTrigger>

      <DialogContent ancho="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cliente nuevo</DialogTitle>
          <DialogDescription>
            Lo mínimo para poder cotizarle. El resto de la ficha se completa
            después desde Clientes.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-5">
          {/* ---------------------------------------------- 1 · Quién es */}
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--fg-subtle)]">
              Identificación
            </h3>

            <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Documento</span>
                <SelectNativo
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as TipoDocumento)}
                >
                  <option value="RUC">RUC</option>
                  <option value="DNI">DNI</option>
                  <option value="CE">C.E.</option>
                  <option value="SIN_DOC">Sin doc.</option>
                </SelectNativo>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Número</span>
                <div className="flex gap-2">
                  <Input
                    value={numero}
                    onChange={(e) => setNumero(e.target.value.replace(/\D/g, ""))}
                    placeholder={tipo === "RUC" ? "20131312955" : "46027897"}
                    className="tabular"
                    inputMode="numeric"
                    autoFocus
                  />
                  {consultable ? (
                    <Button
                      type="button"
                      variant="subtle"
                      onClick={() => traerDatos(tipo, numero)}
                      disabled={consultando || numero.trim() === ""}
                      className="shrink-0"
                    >
                      <Download aria-hidden="true" />
                      {consultando ? "…" : "Traer"}
                    </Button>
                  ) : null}
                </div>
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                Razón social <span className="text-[var(--danger)]">*</span>
              </span>
              <Input
                value={razonSocial}
                onChange={(e) => setRazonSocial(e.target.value)}
                placeholder={
                  consultable
                    ? "Se rellena sola al traer los datos"
                    : "Nombre completo o razón social"
                }
              />
            </label>

            {direccion ? (
              <p className="flex items-start gap-2 text-xs text-[var(--fg-muted)]">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>
                  SUNAT también dio la dirección —<em>{direccion}</em>— y se
                  guardará. Hace falta para emitir su guía de remisión.
                </span>
              </p>
            ) : null}
          </section>

          {/* -------------------------------------------- 2 · Cómo se le habla */}
          {/*
            Plegado, y a propósito. En la cotización hay un campo «contacto»
            —«a quién va dirigida»— y tenerlo en la ficha del cliente ahorra
            escribirlo cada vez. Pero es opcional: exigirlo aquí es como se
            termina con un maestro lleno de «SIN DATO».
          */}
          <details className="group border-t border-[var(--border-soft)] pt-4">
            <summary className="cursor-pointer list-none text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]">
              <span className="inline-block transition-transform group-open:rotate-90">
                ›
              </span>{" "}
              Contacto <span className="text-[var(--fg-subtle)]">(opcional)</span>
            </summary>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Persona de contacto</span>
                <Input
                  value={contacto}
                  onChange={(e) => setContacto(e.target.value)}
                  placeholder="A quién van dirigidas las cotizaciones"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Cargo</span>
                <Input
                  value={cargo}
                  onChange={(e) => setCargo(e.target.value)}
                  placeholder="Jefe de mantenimiento…"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Teléfono</span>
                <Input
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="987 654 321"
                  inputMode="tel"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Correo</span>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="compras@empresa.com"
                  inputMode="email"
                />
              </label>
            </div>
          </details>

          {aviso ? (
            <p className="flex items-start gap-2 rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-2.5 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{aviso}</span>
            </p>
          ) : null}
          {error ? (
            <p className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm text-[var(--danger)]">
              {error}
            </p>
          ) : null}

          <p className="text-xs text-[var(--fg-muted)]">
            Nace <strong>al contado</strong>. Darle crédito es una decisión que se
            toma en su ficha, no un valor por defecto.
          </p>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => abrir(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={enviar} disabled={!listo} loading={guardando}>
            {guardando ? "Guardando…" : "Crear y usar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
