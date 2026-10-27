"use client";

// Cliente: lee la ficha al abrir y guarda con dos acciones estrechas.

import * as React from "react";
import {
  Button,
  Campo,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@rodatech/ui";
import { ExternalLink } from "lucide-react";

import {
  corregirDireccionCliente,
  datosParaCorregirCliente,
  ponerContactoCliente,
  type DatosClienteCorregible,
} from "../acciones/contacto-directo";
import { departamentosUbigeo, distritosUbigeo, provinciasUbigeo } from "../acciones/ubigeo";
import { SelectorUbigeoCascada } from "./selector-ubigeo";

/** Lo que cambió, para que quien llama repinte sin volver a buscar. */
export interface ClienteCorregido {
  razon_social: string;
  telefono: string | null;
  whatsapp: string | null;
  email: string | null;
  direccion: string | null;
}

/**
 * Corregir al cliente sin salir de donde se le está cotizando.
 *
 * Luis, sobre el selector de cliente: poder *«buscar y crear, o editar
 * también»* desde el propio selector. Crear ya se podía (`ClienteRapido`);
 * corregir obligaba a irse a Clientes y perder la cotización a medias, y es
 * justo lo que más falta hace: de los 113 clientes, ninguno tiene teléfono.
 *
 * Los campos son los del alta rápida —teléfono, WhatsApp, correo, dirección y
 * distrito—, y la razón social solo cuando no es la del padrón (con RUC o DNI
 * se corrige en la ficha, que vuelve a consultar SUNAT). Lo demás —crédito,
 * zona, rubro, vendedor— es una decisión comercial y se queda en la ficha: el
 * enlace de abajo la abre en otra pestaña, sin perder nada de aquí.
 *
 * Guarda con dos acciones estrechas y no con `guardarCliente`, que valida la
 * ficha entera: un cliente del Excel a medio llenar rebotaría el guardado por
 * algo que no tiene nada que ver con el número que acaban de dictar.
 */
export function DialogoEditarCliente({
  abierto,
  clienteId,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean;
  clienteId: string;
  onCerrar: () => void;
  onGuardado: (c: ClienteCorregido) => void;
}) {
  const [original, setOriginal] = React.useState<DatosClienteCorregible | null>(null);
  const [razonSocial, setRazonSocial] = React.useState("");
  const [telefono, setTelefono] = React.useState("");
  const [whatsapp, setWhatsapp] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [direccion, setDireccion] = React.useState("");
  const [ubigeo, setUbigeo] = React.useState({
    codigo: "",
    departamento: "",
    provincia: "",
    distrito: "",
  });
  const [cargando, setCargando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, empezar] = React.useTransition();

  // Se lee al ABRIR, no al elegir el cliente: así sale lo de ahora, aunque
  // alguien lo haya tocado en la ficha mientras tanto.
  React.useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    setError(null);
    setOriginal(null);
    setCargando(true);
    void datosParaCorregirCliente(clienteId)
      .then((r) => {
        if (!vigente) return;
        if (!r.ok) {
          setError(r.error);
          return;
        }
        const d = r.datos;
        setOriginal(d);
        setRazonSocial(d.razon_social);
        setTelefono(d.telefono ?? "");
        setWhatsapp(d.whatsapp ?? "");
        setEmail(d.email ?? "");
        setDireccion(d.direccion ?? "");
        setUbigeo({
          codigo: d.ubigeo_codigo ?? "",
          departamento: d.ubigeo_departamento ?? "",
          provincia: d.ubigeo_provincia ?? "",
          distrito: d.ubigeo_distrito ?? "",
        });
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [abierto, clienteId]);

  const limpio = (v: string) => (v.trim() === "" ? null : v.trim());

  function guardar() {
    if (!original) return;
    setError(null);

    const correo = limpio(email);
    if (correo !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      setError("Ese correo no tiene un formato válido.");
      return;
    }
    if (!original.razon_social_oficial && razonSocial.trim().length < 2) {
      setError("Falta la razón social.");
      return;
    }

    const cambiaContacto =
      limpio(telefono) !== original.telefono ||
      limpio(whatsapp) !== original.whatsapp ||
      correo !== original.email;
    const nuevaRazon = original.razon_social_oficial ? original.razon_social : razonSocial.trim();
    const cambiaDireccion =
      limpio(direccion) !== original.direccion ||
      (ubigeo.codigo || null) !== original.ubigeo_codigo ||
      nuevaRazon !== original.razon_social;

    if (!cambiaContacto && !cambiaDireccion) {
      onCerrar();
      return;
    }

    empezar(async () => {
      if (cambiaContacto) {
        // `ponerContactoCliente` escribe los TRES a la vez: se le mandan
        // siempre los tres, también los que no se tocaron, o los borraría.
        const r = await ponerContactoCliente({
          id: original.id,
          telefono: limpio(telefono),
          whatsapp: limpio(whatsapp),
          email: correo,
        });
        if (!r.ok) {
          setError(r.error);
          return;
        }
      }
      if (cambiaDireccion) {
        const r = await corregirDireccionCliente({
          id: original.id,
          direccion: limpio(direccion),
          ubigeo_codigo: ubigeo.codigo || null,
          ubigeo_departamento: ubigeo.departamento || null,
          ubigeo_provincia: ubigeo.provincia || null,
          ubigeo_distrito: ubigeo.distrito || null,
          ...(original.razon_social_oficial ? {} : { razon_social: nuevaRazon }),
        });
        if (!r.ok) {
          setError(
            cambiaContacto
              ? `El teléfono y el correo se guardaron, pero la dirección no: ${r.error}`
              : r.error,
          );
          return;
        }
      }
      onGuardado({
        razon_social: nuevaRazon,
        telefono: limpio(telefono),
        whatsapp: limpio(whatsapp),
        email: correo,
        direccion: limpio(direccion),
      });
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => (!v ? onCerrar() : null)}>
      <DialogContent ancho="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar cliente</DialogTitle>
          <DialogDescription>
            Se guarda en su ficha. No se pierde nada de lo que llevas en esta
            pantalla.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          {cargando ? (
            <p className="text-sm text-[var(--fg-muted)]">Cargando sus datos…</p>
          ) : null}

          {original ? (
            <>
              <Campo
                id="editar-cliente-razon"
                label={original.tipo_documento === "DNI" ? "Nombre y apellidos" : "Razón social"}
                ayuda={
                  original.razon_social_oficial
                    ? `Es la de ${original.tipo_documento === "DNI" ? "RENIEC" : "SUNAT"} para el ${original.tipo_documento} ${original.numero_documento}. Si está mal, se corrige en su ficha.`
                    : undefined
                }
              >
                <Input
                  id="editar-cliente-razon"
                  value={razonSocial}
                  onChange={(e) => setRazonSocial(e.target.value)}
                  readOnly={original.razon_social_oficial}
                />
              </Campo>

              <div className="grid gap-3 sm:grid-cols-3">
                <Campo id="editar-cliente-tel" label="Teléfono">
                  <Input
                    id="editar-cliente-tel"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    placeholder="987 654 321"
                    inputMode="tel"
                    autoFocus
                  />
                </Campo>
                <Campo id="editar-cliente-wsp" label="WhatsApp">
                  <Input
                    id="editar-cliente-wsp"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="987 654 321"
                    inputMode="tel"
                  />
                </Campo>
                <Campo id="editar-cliente-mail" label="Correo">
                  <Input
                    id="editar-cliente-mail"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="compras@empresa.com"
                    inputMode="email"
                  />
                </Campo>
              </div>

              <Campo id="editar-cliente-dir" label="Dirección">
                <Input
                  id="editar-cliente-dir"
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value.slice(0, 300))}
                  placeholder="Av. … n.° …"
                />
              </Campo>

              <SelectorUbigeoCascada
                id="editar-cliente-ubigeo"
                codigo={ubigeo.codigo}
                departamento={ubigeo.departamento}
                provincia={ubigeo.provincia}
                onElegir={setUbigeo}
                cargarDepartamentos={departamentosUbigeo}
                cargarProvincias={provinciasUbigeo}
                cargarDistritos={distritosUbigeo}
              />

              {/* Crédito, zona, rubro y vendedor son decisiones de la ficha.
                  En otra pestaña, para no perder la cotización. */}
              <a
                href={`/clientes/${original.id}/editar`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-9 items-center gap-1.5 self-start rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--fg)] transition-colors hover:bg-[var(--surface-2)]"
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                Abrir la ficha completa en otra pestaña
              </a>
            </>
          ) : null}

          {error ? (
            <p
              role="alert"
              className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm text-[var(--danger)]"
            >
              {error}
            </p>
          ) : null}
        </DialogBody>

        <DialogFooter>
          {/* `type="button"` en los dos: vive dentro del formulario de la
              cotización y sin eso lo enviarían. */}
          <Button type="button" variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="button" onClick={guardar} disabled={!original || guardando} loading={guardando}>
            {guardando ? "Guardando…" : "Guardar cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
