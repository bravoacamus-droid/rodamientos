"use client";

import * as React from "react";
import { Pencil, Plus, TriangleAlert } from "lucide-react";
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
  SelectNativo,
} from "@rodatech/ui";

import type { ConductorMaestro, VehiculoMaestro } from "@/modules/transporte";
// Las acciones directamente y no por el índice del módulo: el índice exporta
// también sus lecturas, que son `server-only`, y este es un componente de
// navegador.
import { guardarConductor, guardarVehiculo } from "@/modules/transporte/acciones/guardar";

import { consultarDniPersona } from "../acciones/consultar-dni";

/**
 * El transporte PROPIO de la guía: el vehículo y quién la lleva (14/10).
 *
 * Luis, con la pantalla delante: *«si va a pie no debería salirme quién
 * conduce»*, y *«falta en los select, al costado, poner el + para registrar
 * un vehículo, también conductor; entonces los datos de los input están de
 * más: esos son datos maestros, que se puede hacer CRUD ahí mismo»*.
 *
 * Hasta hoy había un desplegable que RELLENABA tres cajas (nombre, DNI,
 * licencia) y una cuarta con la placa, todas editables. Eso tenía dos fallos:
 * se podía corregir el DNI en la guía y el maestro seguía con el malo para
 * la próxima, y lo que se tecleaba a mano no quedaba apuntado en ningún
 * sitio. Ahora la guía se arma ELIGIENDO del maestro, y lo que falta o está
 * mal se arregla en el maestro desde aquí mismo («+» y «Editar»).
 *
 * La guía sigue guardando una COPIA de los datos —placa, nombre, DNI,
 * licencia—, no una referencia: lo que se imprimió el día que se emitió no
 * puede cambiar porque mañana se corrija el maestro.
 */

export interface DatosTransportePropio {
  placa: string;
  conductorNombre: string;
  conductorDocumento: string;
  conductorLicencia: string;
  conductorTelefono: string;
}

const placaNormal = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** La persona del maestro que coincide con lo que lleva la guía. */
function personaDe(lista: ConductorMaestro[], v: DatosTransportePropio): ConductorMaestro | null {
  const dni = v.conductorDocumento.trim();
  if (dni) {
    const porDni = lista.find((c) => c.numero_documento === dni);
    if (porDni) return porDni;
  }
  const nombre = v.conductorNombre.trim().toUpperCase();
  return nombre ? (lista.find((c) => c.nombre.trim().toUpperCase() === nombre) ?? null) : null;
}

/** Junta la lista que llegó del servidor con lo dado de alta o corregido aquí. */
function juntar<T extends { id: string }>(base: T[], locales: T[]): T[] {
  const porId = new Map(base.map((x) => [x.id, x]));
  for (const l of locales) porId.set(l.id, l);
  return [...porId.values()];
}

export function TransportePropio({
  aPie,
  vehiculos,
  conductores,
  valor,
  onCambio,
}: {
  aPie: boolean;
  vehiculos: VehiculoMaestro[];
  conductores: ConductorMaestro[];
  valor: DatosTransportePropio;
  onCambio: (parcial: Partial<DatosTransportePropio>) => void;
}) {
  // Lo dado de alta o editado aquí, sumado a lo del servidor. No una copia
  // de la prop: `useState(prop)` no vuelve a leerla.
  const [vehiculosLocales, setVehiculosLocales] = React.useState<VehiculoMaestro[]>([]);
  const [personasLocales, setPersonasLocales] = React.useState<ConductorMaestro[]>([]);
  const listaVehiculos = React.useMemo(() => juntar(vehiculos, vehiculosLocales), [vehiculos, vehiculosLocales]);
  const listaPersonas = React.useMemo(() => juntar(conductores, personasLocales), [conductores, personasLocales]);

  const [dialogoVehiculo, setDialogoVehiculo] = React.useState<"nuevo" | VehiculoMaestro | null>(null);
  const [dialogoPersona, setDialogoPersona] = React.useState<"nuevo" | ConductorMaestro | null>(null);

  const vehiculo = valor.placa
    ? (listaVehiculos.find((v) => placaNormal(v.placa) === placaNormal(valor.placa)) ?? null)
    : null;
  const persona = personaDe(listaPersonas, valor);

  const elegirPersona = (c: ConductorMaestro) =>
    onCambio({
      conductorNombre: c.nombre,
      conductorDocumento: c.numero_documento ?? "",
      // A pie no conduce nada: la licencia no va (la base tampoco la pide).
      conductorLicencia: aPie ? "" : (c.licencia ?? ""),
      conductorTelefono: c.telefono ?? "",
    });

  /*
    Al volver de «a pie» a vehículo, la licencia de la persona elegida vuelve.
    El reducer la borra al pasar a pie (no conduce nada), y sin esto quedaría
    elegida una persona con licencia en el maestro y la guía sin ella.
  */
  const aPieAntes = React.useRef(aPie);
  React.useEffect(() => {
    if (aPieAntes.current && !aPie && persona?.licencia && !valor.conductorLicencia) {
      onCambio({ conductorLicencia: persona.licencia });
    }
    aPieAntes.current = aPie;
    // Solo cuando cambia «a pie».
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aPie]);

  const quien = aPie ? "Quién la lleva" : "Quién conduce";
  const faltas = persona
    ? [
        !persona.numero_documento ? "el DNI" : null,
        !aPie && !persona.licencia ? "la licencia" : null,
        aPie && !persona.telefono ? "el celular" : null,
      ].filter((x): x is string => Boolean(x))
    : [];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {/* ---------------------------------------------------- El vehículo */}
      {aPie ? null : (
        <Fila
          id="tp-vehiculo"
          etiqueta="Vehículo"
          onNuevo={() => setDialogoVehiculo("nuevo")}
          onEditar={vehiculo ? () => setDialogoVehiculo(vehiculo) : null}
          que="vehículo"
        >
          <SelectNativo
            id="tp-vehiculo"
            value={vehiculo?.id ?? ""}
            onChange={(e) => {
              const v = listaVehiculos.find((x) => x.id === e.target.value);
              onCambio({ placa: v ? v.placa : "" });
            }}
          >
            <option value="">{listaVehiculos.length ? "Elige el vehículo…" : "Todavía no hay ninguno: pulsa Nuevo"}</option>
            {listaVehiculos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.placa}
                {v.descripcion ? ` · ${v.descripcion}` : ""}
              </option>
            ))}
          </SelectNativo>
          {/* Una guía vieja con una placa escrita a mano que no está en la
              lista: se dice, y se ofrece apuntarla. */}
          {valor.placa && !vehiculo ? (
            <p className="text-sm text-[var(--warn)]">
              Esta guía lleva la placa <strong className="font-mono">{valor.placa}</strong>, que no está en la
              lista. Pulsa «Nuevo» para apuntarla.
            </p>
          ) : null}
        </Fila>
      )}

      {/* ------------------------------------------- Quién conduce / la lleva */}
      <Fila
        id="tp-persona"
        etiqueta={quien}
        onNuevo={() => setDialogoPersona("nuevo")}
        onEditar={persona ? () => setDialogoPersona(persona) : null}
        que="persona"
        ancho={aPie}
      >
        <SelectNativo
          id="tp-persona"
          value={persona?.id ?? ""}
          onChange={(e) => {
            const c = listaPersonas.find((x) => x.id === e.target.value);
            if (c) elegirPersona(c);
            else onCambio({ conductorNombre: "", conductorDocumento: "", conductorLicencia: "", conductorTelefono: "" });
          }}
        >
          <option value="">{listaPersonas.length ? "Elige a la persona…" : "Todavía no hay nadie: pulsa Nuevo"}</option>
          {listaPersonas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
              {c.numero_documento ? ` · DNI ${c.numero_documento}` : ""}
            </option>
          ))}
        </SelectNativo>
        {persona ? (
          <p className="text-sm text-[var(--fg-muted)]">
            {[
              persona.numero_documento ? `DNI ${persona.numero_documento}` : null,
              aPie ? null : persona.licencia ? `Licencia ${persona.licencia}` : null,
              persona.telefono ? `Cel. ${persona.telefono}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : valor.conductorNombre ? (
          <p className="text-sm text-[var(--warn)]">
            Esta guía lleva a <strong>{valor.conductorNombre}</strong>, que no está en la lista. Pulsa «Nuevo»
            para apuntarlo.
          </p>
        ) : null}
        {faltas.length > 0 ? (
          <p className="flex items-start gap-1.5 text-sm text-[var(--warn)]">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Le falta {faltas.join(" y ")}. Pulsa «Editar» para ponérselo
            {faltas.includes("la licencia") || faltas.includes("el DNI") ? ": sin eso la guía no se emite." : "."}
          </p>
        ) : null}
      </Fila>

      <DialogoVehiculo
        abierto={dialogoVehiculo !== null}
        inicial={dialogoVehiculo === "nuevo" ? null : dialogoVehiculo}
        placaSugerida={dialogoVehiculo === "nuevo" && !vehiculo ? valor.placa : ""}
        onCerrar={() => setDialogoVehiculo(null)}
        onGuardado={(v) => {
          setVehiculosLocales((p) => [...p.filter((x) => x.id !== v.id), v]);
          onCambio({ placa: v.placa });
          setDialogoVehiculo(null);
        }}
      />
      <DialogoPersona
        abierto={dialogoPersona !== null}
        aPie={aPie}
        inicial={
          dialogoPersona === "nuevo"
            ? persona
              ? null
              : // Lo que traía la guía escrito a mano, para no teclearlo dos veces.
                valor.conductorNombre
                ? {
                    id: "",
                    nombre: valor.conductorNombre,
                    numero_documento: valor.conductorDocumento || null,
                    licencia: valor.conductorLicencia || null,
                    telefono: valor.conductorTelefono || null,
                    activo: true,
                  }
                : null
            : dialogoPersona
        }
        onCerrar={() => setDialogoPersona(null)}
        onGuardado={(c) => {
          setPersonasLocales((p) => [...p.filter((x) => x.id !== c.id), c]);
          elegirPersona(c);
          setDialogoPersona(null);
        }}
      />
    </div>
  );
}

/** La etiqueta con sus dos botones al lado, y el desplegable debajo. */
function Fila({
  id,
  etiqueta,
  que,
  onNuevo,
  onEditar,
  ancho = false,
  children,
}: {
  id: string;
  etiqueta: string;
  que: string;
  onNuevo: () => void;
  onEditar: (() => void) | null;
  ancho?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1 ${ancho ? "sm:col-span-2" : ""}`}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {etiqueta}
        </label>
        <div className="flex gap-2">
          {onEditar ? (
            <Button type="button" variant="outline" size="sm" className="text-sm" onClick={onEditar} aria-label={`Editar ${que}`}>
              <Pencil className="size-4" aria-hidden="true" />
              Editar
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" className="text-sm" onClick={onNuevo} aria-label={`Nuevo ${que}`}>
            <Plus className="size-4" aria-hidden="true" />
            Nuevo
          </Button>
        </div>
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Las dos ventanas del maestro
// ---------------------------------------------------------------------------

function DialogoVehiculo({
  abierto,
  inicial,
  placaSugerida,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean;
  inicial: VehiculoMaestro | null;
  placaSugerida: string;
  onCerrar: () => void;
  onGuardado: (v: VehiculoMaestro) => void;
}) {
  const [placa, setPlaca] = React.useState("");
  const [descripcion, setDescripcion] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, empezar] = React.useTransition();

  React.useEffect(() => {
    if (!abierto) return;
    setPlaca(inicial?.placa ?? placaSugerida);
    setDescripcion(inicial?.descripcion ?? "");
    setError(null);
    // Solo al ABRIR: `inicial` puede llegar como objeto nuevo en cada
    // render, y rellenar en cada uno borraría lo que se está tecleando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const guardar = () => {
    setError(null);
    empezar(async () => {
      const r = await guardarVehiculo({
        id: inicial?.id ?? null,
        placa,
        descripcion: descripcion || null,
        marca: inicial?.marca ?? null,
      });
      if (!r.ok) return setError(r.error);
      onGuardado({
        id: r.id,
        placa: placaNormal(placa),
        descripcion: descripcion.trim() || null,
        marca: inicial?.marca ?? null,
        activo: true,
      });
    });
  };

  return (
    <Dialog open={abierto} onOpenChange={(v) => (!v ? onCerrar() : null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{inicial ? "Editar vehículo" : "Nuevo vehículo"}</DialogTitle>
          <DialogDescription>
            Queda en la lista para las próximas guías. No se pierde nada de lo que llevas escrito.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <Campo id="tp-placa" label="Placa" requerido ayuda="Con guion o sin él: ABC-123 o ABC123.">
            <Input
              id="tp-placa"
              value={placa}
              onChange={(e) => setPlaca(e.target.value.toUpperCase())}
              className="font-mono"
              autoFocus
            />
          </Campo>
          <Campo id="tp-desc" label="Cómo lo llaman" ayuda="Para reconocerlo en la lista: «la camioneta blanca».">
            <Input id="tp-desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </Campo>
          {error ? (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="button" onClick={guardar} disabled={guardando || placa.trim() === ""}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoPersona({
  abierto,
  aPie,
  inicial,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean;
  aPie: boolean;
  inicial: ConductorMaestro | null;
  onCerrar: () => void;
  onGuardado: (c: ConductorMaestro) => void;
}) {
  const [dni, setDni] = React.useState("");
  const [nombre, setNombre] = React.useState("");
  const [licencia, setLicencia] = React.useState("");
  const [telefono, setTelefono] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [aviso, setAviso] = React.useState<string | null>(null);
  const [guardando, empezar] = React.useTransition();
  const [consultando, consultar] = React.useTransition();

  React.useEffect(() => {
    if (!abierto) return;
    setDni(inicial?.numero_documento ?? "");
    setNombre(inicial?.nombre ?? "");
    setLicencia(inicial?.licencia ?? "");
    setTelefono(inicial?.telefono ?? "");
    setError(null);
    setAviso(null);
    // Solo al abrir, por lo mismo que el del vehículo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  // El nombre de RENIEC por el DNI: es el que sale impreso en la guía.
  const traer = () => {
    setAviso(null);
    consultar(async () => {
      const r = await consultarDniPersona(dni);
      if (!r.ok) {
        setAviso(
          r.agotada
            ? "Se agotó la cuota de consultas de este mes. Escribe el nombre a mano."
            : `${r.error} Escribe el nombre a mano.`,
        );
        return;
      }
      setNombre(r.datos.razon_social);
    });
  };

  const editando = Boolean(inicial?.id);

  const guardar = () => {
    setError(null);
    empezar(async () => {
      const r = await guardarConductor({
        id: inicial?.id || null,
        nombre,
        numero_documento: dni || null,
        licencia: licencia || null,
        telefono: telefono || null,
      });
      if (!r.ok) return setError(r.error);
      onGuardado({
        id: r.id,
        nombre: nombre.trim(),
        numero_documento: dni.trim() || null,
        licencia: licencia.trim().toUpperCase() || null,
        telefono: telefono.trim() || null,
        activo: true,
      });
    });
  };

  return (
    <Dialog open={abierto} onOpenChange={(v) => (!v ? onCerrar() : null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editando ? "Editar" : "Nuevo"}: {aPie ? "quién la lleva" : "quién conduce"}
          </DialogTitle>
          <DialogDescription>
            Queda en la lista para las próximas guías. No se pierde nada de lo que llevas escrito.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <div className="flex items-end gap-2">
            <Campo id="tp-dni" label="DNI" className="min-w-0 flex-1" ayuda="Escríbelo y pulsa «Traer nombre».">
              <Input
                id="tp-dni"
                value={dni}
                onChange={(e) => setDni(e.target.value.replace(/\D/g, "").slice(0, 8))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && dni.length === 8) {
                    e.preventDefault();
                    traer();
                  }
                }}
                className="tabular"
                inputMode="numeric"
                autoFocus
              />
            </Campo>
            <Button
              type="button"
              variant="outline"
              onClick={traer}
              disabled={consultando || dni.length !== 8}
              className="mb-6"
            >
              {consultando ? "Buscando…" : "Traer nombre"}
            </Button>
          </div>
          {aviso ? <p className="text-sm text-[var(--warn)]">{aviso}</p> : null}
          <Campo id="tp-nombre" label="Nombre completo" requerido>
            <Input id="tp-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </Campo>
          {/* A pie no hay licencia que pedir; la columna sigue en el maestro
              por si mañana esa misma persona maneja. */}
          {aPie ? null : (
            <Campo id="tp-licencia" label="Licencia de conducir" ayuda="Sin ella la guía no se puede emitir.">
              <Input
                id="tp-licencia"
                value={licencia}
                onChange={(e) => setLicencia(e.target.value.toUpperCase())}
                className="font-mono"
              />
            </Campo>
          )}
          <Campo id="tp-cel" label="Celular">
            <Input
              id="tp-cel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              inputMode="tel"
              placeholder="9XX XXX XXX"
            />
          </Campo>
          {error ? (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="button" onClick={guardar} disabled={guardando || nombre.trim().length < 3}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
