"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
  toast,
} from "@rodatech/ui";
import { Check, Lock, Pencil, Plus, Trash2, Users } from "lucide-react";

import { ACCIONES, ETIQUETA_ACCION, type Accion } from "@/lib/permisos-comun";

import { cambiarPermiso, crearRol, eliminarRol, renombrarRol } from "../acciones/permisos";
import { aplicarCambio, resumenDelRol, tiene, type ModuloDef, type Permiso } from "../dominio/permisos";
import type { RolDef } from "../dominio/tipos";

/**
 * Roles y permisos (143).
 *
 * Se elige un ROL arriba y debajo sale lo que puede en cada MÓDULO: ver,
 * crear, editar, eliminar. Es como lo dijo Luis el 20/10: *«un rol, ya sea
 * admin, puede ser esto, esto, esto; lo que no pueden hacer ya se le marca o
 * no»*.
 *
 * Antes era una rejilla de áreas × seis roles con una sola casilla por cruce.
 * Con cuatro acciones serían 15 × 6 × 4 = 360 casillas en una pantalla: eso no
 * lo lee nadie, y menos Willy. Un rol a la vez son 15 filas de cuatro.
 *
 * Cada casilla es un botón con su palabra —«Sí» / «No»—, no un checkbox de
 * 13 px: *«una persona que no sabe que tiene que darle click ahí»*.
 */
export function RolesYPermisos({
  roles,
  modulos,
  permisos,
  puedeEditar,
}: {
  roles: RolDef[];
  modulos: ModuloDef[];
  permisos: Permiso[];
  puedeEditar: boolean;
}) {
  const router = useRouter();

  // Estado del servidor + parches locales: la casilla cambia al instante y,
  // cuando vuelve el refresco, manda lo del servidor.
  const [lista, setLista] = React.useState(permisos);
  React.useEffect(() => setLista(permisos), [permisos]);

  const [elegido, setElegido] = React.useState<string>(
    roles.find((r) => r.clave === "ventas")?.clave ?? roles[0]?.clave ?? "gerencia",
  );
  const rol = roles.find((r) => r.clave === elegido) ?? roles[0];
  const [enCurso, setEnCurso] = React.useState<string | null>(null);
  const [dialogo, setDialogo] = React.useState<"crear" | "editar" | null>(null);
  const [borrando, setBorrando] = React.useState(false);

  if (!rol) return null;
  const esGerencia = rol.clave === "gerencia";
  const bloqueado = !puedeEditar || esGerencia;

  async function alternar(modulo: ModuloDef, accion: Accion) {
    if (!rol) return;
    const puede = !tiene(lista, rol.clave, modulo.clave, accion);
    const cambio = { rol: rol.clave, modulo: modulo.clave, accion, puede };
    const antes = lista;
    setLista(aplicarCambio(lista, cambio));
    setEnCurso(`${modulo.clave}:${accion}`);
    const r = await cambiarPermiso(cambio);
    setEnCurso(null);
    if (!r.ok) {
      setLista(antes);
      toast.error(r.error);
      return;
    }
    // Lo que arrastra la regla (dar editar da ver; quitar ver quita todo) se
    // dice, para que nadie crea que la casilla de al lado cambió sola.
    const arrastre =
      puede && accion !== "ver" && !tiene(antes, rol.clave, modulo.clave, "ver")
        ? " También puede verlo: no se crea lo que no se ve."
        : !puede && accion === "ver" && antes.some((p) => p.rol === rol.clave && p.modulo === modulo.clave && p.accion !== "ver")
          ? " Sin ver, tampoco puede crear, editar ni eliminar ahí."
          : "";
    toast.success(`${rol.nombre} · ${modulo.nombre}: ${puede ? "ahora puede" : "ya no puede"} ${ETIQUETA_ACCION[accion].toLowerCase()}.${arrastre}`);
    router.refresh();
  }

  async function borrar() {
    if (!rol) return;
    const r = await eliminarRol(rol.clave);
    setBorrando(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(`Rol «${rol.nombre}» eliminado.`);
    setElegido("ventas");
    router.refresh();
  }

  return (
    <div className="@container flex flex-col gap-5">
      {/* ── Los roles ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Elige un rol para ver y cambiar lo que puede hacer</p>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Roles">
          {roles.map((r) => {
            const activo = r.clave === rol.clave;
            const { ve, cambia } = resumenDelRol(lista, modulos, r.clave);
            return (
              <button
                key={r.clave}
                type="button"
                role="tab"
                aria-selected={activo}
                onClick={() => {
                  setElegido(r.clave);
                  setBorrando(false);
                }}
                className={`flex min-h-14 min-w-[8.5rem] flex-col items-start justify-center rounded-lg border px-3 py-2 text-left transition ${
                  activo
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-[var(--border-strong)] bg-[var(--surface)] hover:border-brand-300"
                }`}
              >
                <span className="text-base font-semibold leading-tight">{r.nombre}</span>
                <span className={`text-sm ${activo ? "text-white/85" : "text-[var(--fg-muted)]"}`}>
                  {r.clave === "gerencia" ? "Todo" : `Ve ${ve} · cambia ${cambia}`}
                </span>
              </button>
            );
          })}
          {puedeEditar ? (
            <button
              type="button"
              onClick={() => setDialogo("crear")}
              className="flex min-h-14 items-center gap-1.5 rounded-lg border border-dashed border-brand-600 px-4 text-sm font-semibold text-brand-600 hover:bg-[var(--surface-2)] dark:text-brand-300"
            >
              <Plus className="size-4" aria-hidden="true" />
              Crear rol
            </button>
          ) : null}
        </div>
      </div>

      {/* ── El rol elegido ───────────────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{rol.nombre}</h2>
          {rol.descripcion ? <p className="text-sm text-[var(--fg-muted)]">{rol.descripcion}</p> : null}
          <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-[var(--fg-muted)]">
            <Users className="size-4" aria-hidden="true" />
            {rol.usuarios === 0
              ? "Nadie tiene este rol todavía."
              : `Lo ${rol.usuarios === 1 ? "tiene 1 usuario" : `tienen ${rol.usuarios} usuarios`}.`}
          </p>
        </div>
        {puedeEditar && !esGerencia ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setDialogo("editar")}>
              <Pencil className="size-4" aria-hidden="true" />
              Cambiar nombre
            </Button>
            {!rol.sistema ? (
              <Button type="button" variant="outline" onClick={() => setBorrando(true)}>
                <Trash2 className="size-4" aria-hidden="true" />
                Eliminar rol
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {borrando ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm">
          {rol.usuarios > 0 ? (
            <>
              <span className="flex-1">
                No se puede eliminar: lo {rol.usuarios === 1 ? "tiene 1 usuario" : `tienen ${rol.usuarios} usuarios`}.
                Cámbiales el rol en Usuarios y vuelve.
              </span>
              <Button type="button" variant="outline" onClick={() => setBorrando(false)}>
                Entendido
              </Button>
            </>
          ) : (
            <>
              <span className="flex-1">
                ¿Eliminar el rol <strong>{rol.nombre}</strong>? Se borran también sus permisos.
              </span>
              <button
                type="button"
                onClick={() => void borrar()}
                className="h-10 rounded-md bg-[var(--danger)] px-3 text-sm font-medium text-white"
              >
                Sí, eliminar
              </button>
              <Button type="button" variant="outline" onClick={() => setBorrando(false)}>
                No
              </Button>
            </>
          )}
        </div>
      ) : null}

      {esGerencia ? (
        <p className="flex items-start gap-2 rounded-lg border border-[var(--border)] p-3 text-sm">
          <Lock className="mt-0.5 size-4 shrink-0 text-[var(--fg-subtle)]" aria-hidden="true" />
          <span>
            <strong>Gerencia lo puede todo, siempre</strong>, y no se cambia desde aquí: quitárselo sería
            un botón para quedarse fuera del sistema. Es también el único rol que puede cambiar esta
            pantalla y Usuarios; Administración las ve, sin tocar.
          </span>
        </p>
      ) : null}

      {/* ── En el teléfono: una tarjeta por módulo ───────────────── */}
      <div className="flex flex-col gap-3 @3xl:hidden">
        {modulos.map((m) => (
          <div key={m.clave} className="rounded-lg border border-[var(--border)] p-3">
            <p className="font-medium">{m.nombre}</p>
            <p className="mt-0.5 text-sm text-[var(--fg-muted)]">{m.ayuda}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {ACCIONES.filter((a) => m.acciones.includes(a)).map((a) => (
                <div key={a} className="flex flex-col gap-1">
                  <span className="text-sm text-[var(--fg-subtle)]">{ETIQUETA_ACCION[a]}</span>
                  <Casilla
                    si={tiene(lista, rol.clave, m.clave, a)}
                    etiqueta={`${m.nombre} · ${ETIQUETA_ACCION[a]}`}
                    bloqueada={bloqueado}
                    ocupada={enCurso === `${m.clave}:${a}`}
                    onClick={() => void alternar(m, a)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── En escritorio: la tabla ──────────────────────────────── */}
      <div className="hidden @3xl:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-sm uppercase tracking-wide text-[var(--fg-subtle)]">
              <th className="px-3 py-2 font-medium">Módulo</th>
              {ACCIONES.map((a) => (
                <th key={a} className="w-28 px-2 py-2 text-center font-medium">
                  {ETIQUETA_ACCION[a]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modulos.map((m) => (
              <tr key={m.clave} className="border-b border-[var(--border)] align-middle last:border-0">
                <td className="px-3 py-3">
                  <p className="font-medium">{m.nombre}</p>
                  <p className="text-sm text-[var(--fg-muted)]">{m.ayuda}</p>
                </td>
                {ACCIONES.map((a) => (
                  <td key={a} className="px-2 py-3 text-center">
                    {m.acciones.includes(a) ? (
                      <Casilla
                        si={tiene(lista, rol.clave, m.clave, a)}
                        etiqueta={`${m.nombre} · ${ETIQUETA_ACCION[a]}`}
                        bloqueada={bloqueado}
                        ocupada={enCurso === `${m.clave}:${a}`}
                        onClick={() => void alternar(m, a)}
                      />
                    ) : (
                      <span className="text-[var(--fg-subtle)]" title="No aplica en este módulo">
                        —
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-[var(--fg-muted)]">
        <strong>Ver</strong> es que le salga en el menú y pueda abrir sus pantallas. No esconde los datos
        que hacen falta para trabajar en otro módulo: quien cotiza sigue pudiendo buscar un producto aunque no
        tenga «Productos». Dar crear, editar o eliminar le da también ver; quitarle ver le quita todo lo del
        módulo. El ajuste de inventario sigue siendo solo de Gerencia y Administración.
      </p>

      <DialogoRol
        modo={dialogo}
        rol={dialogo === "editar" ? rol : null}
        roles={roles}
        onCerrar={() => setDialogo(null)}
        onListo={(clave) => {
          setDialogo(null);
          setElegido(clave);
          router.refresh();
        }}
      />
    </div>
  );
}

function Casilla({
  si,
  etiqueta,
  bloqueada,
  ocupada,
  onClick,
}: {
  si: boolean;
  etiqueta: string;
  bloqueada: boolean;
  ocupada: boolean;
  onClick: () => void;
}) {
  if (bloqueada) {
    // Lo que no se cambia NO lleva caja: una casilla gris con borde parece un
    // botón roto (revisión por módulos del 02/10).
    return (
      <span className="inline-flex h-10 items-center justify-center gap-1.5 px-2 text-sm font-medium text-[var(--fg-muted)]">
        <Lock className="size-4 text-[var(--fg-subtle)]" aria-hidden="true" />
        {si ? "Sí" : "No"}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={ocupada}
      aria-pressed={si}
      aria-label={`${etiqueta}: ${si ? "Sí" : "No"}`}
      className={`inline-flex h-10 w-full min-w-[4.5rem] items-center justify-center gap-1.5 rounded-md border px-2 text-sm font-semibold transition disabled:opacity-60 @3xl:w-20 ${
        si
          ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok)] hover:brightness-95"
          : "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--fg-muted)] hover:border-[var(--fg-subtle)]"
      }`}
    >
      {si ? <Check className="size-4" aria-hidden="true" /> : null}
      {ocupada ? "…" : si ? "Sí" : "No"}
    </button>
  );
}

function DialogoRol({
  modo,
  rol,
  roles,
  onCerrar,
  onListo,
}: {
  modo: "crear" | "editar" | null;
  rol: RolDef | null;
  roles: RolDef[];
  onCerrar: () => void;
  onListo: (clave: string) => void;
}) {
  const [nombre, setNombre] = React.useState("");
  const [descripcion, setDescripcion] = React.useState("");
  const [copiarDe, setCopiarDe] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, setGuardando] = React.useState(false);

  // Al abrir, los campos empiezan con lo del rol (o vacíos).
  React.useEffect(() => {
    if (!modo) return;
    setNombre(rol?.nombre ?? "");
    setDescripcion(rol?.descripcion ?? "");
    setCopiarDe("");
    setError(null);
  }, [modo, rol]);

  async function guardar() {
    setGuardando(true);
    const r =
      modo === "editar" && rol
        ? await renombrarRol({ clave: rol.clave, nombre, descripcion })
        : await crearRol({ nombre, descripcion, copiarDe: copiarDe || null });
    setGuardando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    toast.success(modo === "editar" ? "Rol guardado." : `Rol «${r.datos.nombre}» creado. Ahora marca lo que puede hacer.`);
    onListo(r.datos.clave);
  }

  return (
    <Dialog open={modo !== null} onOpenChange={(v) => (!v ? onCerrar() : null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{modo === "editar" ? `Cambiar el rol «${rol?.nombre ?? ""}»` : "Crear un rol"}</DialogTitle>
          <DialogDescription>
            {modo === "editar"
              ? "Cambia el nombre o lo que dice. Sus permisos no cambian."
              : "Un rol agrupa lo que puede hacer quien lo tenga. Después se le asigna a cada usuario."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <Campo id="rol-nombre" label="Nombre del rol" requerido>
            <Input
              id="rol-nombre"
              value={nombre}
              autoFocus
              maxLength={40}
              placeholder="Por ejemplo: Vendedor de mostrador"
              onChange={(e) => setNombre(e.target.value)}
            />
          </Campo>
          <Campo id="rol-descripcion" label="Qué hace (opcional)" ayuda="Sale debajo del nombre, al elegir el rol de un usuario.">
            <Input
              id="rol-descripcion"
              value={descripcion}
              maxLength={200}
              placeholder="Por ejemplo: cotiza y atiende en tienda, no factura"
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </Campo>
          {modo === "crear" ? (
            <Campo
              id="rol-copiar"
              label="Empezar con los permisos de"
              ayuda="Así no hay que marcarlo todo desde cero. Después se cambia lo que haga falta."
            >
              <SelectNativo id="rol-copiar" value={copiarDe} onChange={(e) => setCopiarDe(e.target.value)}>
                <option value="">Ninguno: empezar sin permisos</option>
                {roles.map((r) => (
                  <option key={r.clave} value={r.clave}>
                    {r.nombre}
                  </option>
                ))}
              </SelectNativo>
            </Campo>
          ) : null}
          {error ? (
            <p role="alert" className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void guardar()} disabled={guardando || nombre.trim().length < 2}>
            {guardando ? "Guardando…" : modo === "editar" ? "Guardar" : "Crear rol"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
