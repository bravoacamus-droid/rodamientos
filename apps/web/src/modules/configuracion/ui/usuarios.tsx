"use client";

/*
 * "use client" OBLIGATORIO: selects que disparan una Server Action al cambiar.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Campo, EstadoBadge, Input, SelectNativo, toast } from "@rodatech/ui";
import { KeyRound, Pencil } from "lucide-react";

import { cambiarUsuario, type ResultadoConfig } from "../acciones/guardar";
import { darContrasenaNueva, editarDatosUsuario } from "../acciones/usuarios";
import type { Rol, RolDef, Usuario } from "../dominio/tipos";
import { ContrasenaReciencreada } from "./alta-usuario";

/**
 * Los roles vienen de la base (143): los seis de siempre y los que cree
 * gerencia. Van por contexto para no pasarlos por tres niveles de props.
 */
const Roles = React.createContext<RolDef[]>([]);
function useRol(clave: string): { nombre: string; descripcion: string | null } {
  const r = React.useContext(Roles).find((x) => x.clave === clave);
  return { nombre: r?.nombre ?? clave, descripcion: r?.descripcion ?? null };
}

/**
 * «05/10/2026», en hora de Lima. Era `slice(0, 10)` del ISO en UTC: «2026-10-05»
 * al revés y, entrando después de las 7 de la tarde, con el día siguiente
 * (revisión por módulos del 02/10).
 */
function fechaAcceso(iso: string | null): string {
  if (!iso) return "nunca";
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

/**
 * Quién entra y con qué rol.
 *
 * El ALTA vive en `alta-usuario.tsx`, encima de esta tabla, desde el 24/09.
 * Aquí solo se cambia lo que ya existe.
 *
 * La fila de uno mismo va sin controles: si el único gerente se cambia el rol,
 * ya nadie puede devolvérselo sin entrar por SQL. RLS no lo impide —la política
 * de `perfiles` deja a gerencia escribir cualquier fila, incluida la suya—, así
 * que lo impide la aplicación, en el servidor y también aquí.
 *
 * ---------------------------------------------------------------------------
 * En móvil son tarjetas, no una tabla
 * ---------------------------------------------------------------------------
 * Medido el 24/09: la tabla pide 662 px y un teléfono tiene 390. Con
 * `scroll-x` no se rompe, pero para llegar al desplegable del rol hay que
 * arrastrar hasta perder de vista de quién era la fila — y elegir el rol
 * equivocado aquí le cambia a alguien lo que puede hacer. Así que en móvil
 * cada persona es una tarjeta y su nombre nunca se va de la pantalla.
 */
export function TablaUsuarios({
  usuarios,
  roles,
  idPropio,
  puedeEditar,
  hayClave,
}: {
  usuarios: Usuario[];
  roles: RolDef[];
  idPropio: string | null;
  puedeEditar: boolean;
  /** Sin la clave de servicio no se puede dar una contraseña nueva: no se ofrece. */
  hayClave: boolean;
}) {
  // @container: a 820 con el menú abierto la tabla pedía 232 px más de los
  // que había y «Desactivar» quedaba fuera (revisión por módulos del 02/10).
  return (
    <Roles.Provider value={roles}>
    <div className="@container">
      <div className="flex flex-col gap-3 @3xl:hidden">
        {usuarios.map((u) => (
          <TarjetaUsuario
            key={u.id}
            usuario={u}
            esUnoMismo={u.id === idPropio}
            puedeEditar={puedeEditar}
            hayClave={hayClave}
          />
        ))}
      </div>

      <div className="hidden @3xl:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-sm uppercase tracking-wide text-[var(--fg-subtle)]">
              <th className="px-3 py-2 font-medium">Nombre</th>
              <th className="px-3 py-2 font-medium">Rol</th>
              <th className="px-3 py-2 font-medium">Último acceso</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <FilaUsuario
                key={u.id}
                usuario={u}
                esUnoMismo={u.id === idPropio}
                puedeEditar={puedeEditar}
                hayClave={hayClave}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
    </Roles.Provider>
  );
}

/**
 * Lo que está a punto de pasar y espera un «Sí» (auditoría, 21/10).
 *
 * Antes el desplegable del rol guardaba al elegir y «Desactivar» actuaba con
 * un clic: un toque sin querer le cambiaba a alguien lo que puede hacer, o le
 * dejaba sin entrar. Ahora se pregunta en línea, como «Eliminar rol».
 * Reactivar no se pregunta: no quita nada a nadie.
 */
// «datos» no pregunta: abre el formulario, y lo que se confirma es «Guardar».
type Pendiente = { tipo: "rol"; rol: Rol } | { tipo: "baja" } | { tipo: "clave" } | { tipo: "datos" } | null;

type Nueva = { nombre: string; email: string; contrasena: string };

/** Lo que comparten la tarjeta y la fila: el cambio pendiente y la acción. */
function useFicha(usuario: Usuario) {
  const router = useRouter();
  const [ocupado, setOcupado] = React.useState(false);
  const [pendiente, setPendiente] = React.useState<Pendiente>(null);
  const [nueva, setNueva] = React.useState<Nueva | null>(null);

  const correr = React.useCallback(
    async (fn: () => Promise<ResultadoConfig>) => {
      setOcupado(true);
      try {
        const r = await fn();
        if (r.ok) {
          toast.success(r.mensaje);
          router.refresh();
        } else {
          toast.error(r.error);
        }
      } finally {
        setOcupado(false);
        setPendiente(null);
      }
    },
    [router],
  );

  const confirmar = React.useCallback(async () => {
    if (!pendiente || pendiente.tipo === "datos") return;
    if (pendiente.tipo === "rol") {
      await correr(() => cambiarUsuario(usuario.id, { rol: pendiente.rol }));
    } else if (pendiente.tipo === "baja") {
      await correr(() => cambiarUsuario(usuario.id, { activo: false }));
    } else {
      setOcupado(true);
      try {
        const r = await darContrasenaNueva(usuario.id);
        if (r.ok) setNueva({ nombre: r.nombre, email: r.email, contrasena: r.contrasena });
        else toast.error(r.error);
      } finally {
        setOcupado(false);
        setPendiente(null);
      }
    }
  }, [pendiente, usuario.id, correr]);

  const cambiarEstado = React.useCallback(() => {
    if (usuario.activo) setPendiente({ tipo: "baja" });
    else void correr(() => cambiarUsuario(usuario.id, { activo: true }));
  }, [usuario.activo, usuario.id, correr]);

  const guardarDatos = React.useCallback(
    (d: { nombre: string; email: string; telefono: string }) =>
      correr(async () => {
        const r = await editarDatosUsuario(usuario.id, d);
        return r.ok ? { ok: true, mensaje: r.mensaje } : { ok: false, error: r.error };
      }),
    [usuario.id, correr],
  );

  return { ocupado, pendiente, setPendiente, confirmar, cambiarEstado, nueva, setNueva, guardarDatos };
}

function Confirmacion({
  usuario,
  pendiente,
  ocupado,
  onSi,
  onNo,
}: {
  usuario: Usuario;
  pendiente: Exclude<NonNullable<Pendiente>, { tipo: "datos" }>;
  ocupado: boolean;
  onSi: () => void;
  onNo: () => void;
}) {
  const actual = useRol(usuario.rol);
  const nuevo = useRol(pendiente.tipo === "rol" ? pendiente.rol : usuario.rol);
  const peligro = pendiente.tipo !== "rol";

  const pregunta =
    pendiente.tipo === "rol" ? (
      <>
        ¿Pasar a <strong>{usuario.nombre}</strong> de {actual.nombre} a <strong>{nuevo.nombre}</strong>? Desde
        que recargue, verá y podrá hacer lo de su nuevo rol.
      </>
    ) : pendiente.tipo === "baja" ? (
      <>
        ¿Dar de baja a <strong>{usuario.nombre}</strong>? No podrá entrar al sistema hasta que lo vuelvas a
        activar.
      </>
    ) : (
      <>
        ¿Darle a <strong>{usuario.nombre}</strong> una contraseña nueva? La de ahora deja de valer y tendrá que
        cambiarla al entrar.
      </>
    );
  const si = pendiente.tipo === "rol" ? "Sí, cambiar" : pendiente.tipo === "baja" ? "Sí, dar de baja" : "Sí, darle una nueva";

  return (
    <div
      role="alert"
      className={`flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm ${
        peligro ? "border-[var(--danger)] bg-[var(--danger-bg)]" : "border-[var(--warn)] bg-[var(--warn-bg)]"
      }`}
    >
      <span className="min-w-0 flex-1 basis-56">{pregunta}</span>
      <button
        type="button"
        disabled={ocupado}
        onClick={onSi}
        className={`h-10 rounded-md px-3 text-sm font-medium text-white disabled:opacity-60 ${
          peligro ? "bg-[var(--danger)]" : "bg-brand-600 hover:bg-brand-700"
        }`}
      >
        {ocupado ? "Un momento…" : si}
      </button>
      <Button type="button" variant="outline" disabled={ocupado} onClick={onNo}>
        No
      </Button>
    </div>
  );
}

function SelectorRol({
  usuario,
  valor,
  ocupado,
  onCambiar,
  className = "",
}: {
  usuario: Usuario;
  /** El rol a la espera del «Sí», para que se vea lo que se eligió. */
  valor: Rol;
  ocupado: boolean;
  onCambiar: (rol: Rol) => void;
  className?: string;
}) {
  const roles = React.useContext(Roles);
  return (
    <SelectNativo
      value={valor}
      aria-label={`Rol de ${usuario.nombre}`}
      disabled={ocupado}
      onChange={(e) => onCambiar(e.target.value as Rol)}
      className={className}
    >
      {roles.map((r) => (
        <option key={r.clave} value={r.clave}>
          {r.nombre}
        </option>
      ))}
    </SelectNativo>
  );
}

function Botones({
  usuario,
  ocupado,
  hayClave,
  onEstado,
  onClave,
  onDatos,
}: {
  usuario: Usuario;
  ocupado: boolean;
  hayClave: boolean;
  onEstado: () => void;
  onClave: () => void;
  onDatos: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {hayClave ? (
        <Button variant="outline" size="sm" disabled={ocupado} onClick={onDatos} className="gap-1.5 text-sm">
          <Pencil className="size-4" aria-hidden="true" />
          Editar datos
        </Button>
      ) : null}
      {/* Para quien olvidó la suya (21/10): antes solo desde el panel de Supabase. */}
      {hayClave && usuario.activo ? (
        <Button variant="outline" size="sm" disabled={ocupado} onClick={onClave} className="gap-1.5 text-sm">
          <KeyRound className="size-4" aria-hidden="true" />
          Darle una contraseña nueva
        </Button>
      ) : null}
      {/*
        `outline` y no `ghost`. Luis, sobre otra pantalla: «esos botones sin
        color, no veo mejora acá». Un botón que solo es texto gris no parece un
        botón, y este da de baja a una persona. `text-sm` porque el tamaño `sm`
        del sistema de diseño es `text-sm`, y 12,75 px en un BOTÓN es
        exactamente lo que no puede pasar aquí.
      */}
      <Button variant="outline" size="sm" disabled={ocupado} onClick={onEstado} className="text-sm">
        {usuario.activo ? "Desactivar" : "Activar"}
      </Button>
    </div>
  );
}

function Distintivos({ esUnoMismo, activo }: { esUnoMismo: boolean; activo: boolean }) {
  return (
    <>
      {esUnoMismo ? (
        <Badge tone="brand" size="sm" className="ml-2">
          Tú
        </Badge>
      ) : null}
      {/* «De baja», como clientes, proveedores y agencias: es lo que se le
          hace a un usuario, que no se borra. */}
      {!activo ? <EstadoBadge estado="de_baja" size="sm" className="ml-2" /> : null}
    </>
  );
}

function TarjetaUsuario({
  usuario,
  esUnoMismo,
  puedeEditar,
  hayClave,
}: {
  usuario: Usuario;
  esUnoMismo: boolean;
  puedeEditar: boolean;
  hayClave: boolean;
}) {
  const f = useFicha(usuario);
  const editable = puedeEditar && !esUnoMismo;
  const rol = useRol(usuario.rol);

  return (
    /*
      Sin `opacity-60` para el inactivo. Medido el 21/10: el correo y la
      descripción del rol bajaban a 1,86:1 en claro (2,52 a 390 px), justo lo
      que hay que leer para saber a quién se reactiva. Lo dice el distintivo
      «De baja» y el fondo, no el texto desvaído.
    */
    <div
      className={`rounded-lg border border-[var(--border)] p-3 ${usuario.activo ? "" : "bg-[var(--surface-2)]"}`}
    >
      <p className="font-medium">
        {usuario.nombre}
        <Distintivos esUnoMismo={esUnoMismo} activo={usuario.activo} />
      </p>
      <p className="text-sm text-[var(--fg-muted)]">
        {usuario.email ?? "sin correo"}
      </p>

      <div className="mt-3">
        {editable ? (
          <SelectorRol
            usuario={usuario}
            valor={f.pendiente?.tipo === "rol" ? f.pendiente.rol : usuario.rol}
            ocupado={f.ocupado}
            onCambiar={(r) => f.setPendiente(r === usuario.rol ? null : { tipo: "rol", rol: r })}
            className="w-full"
          />
        ) : (
          <p className="font-medium">{rol.nombre}</p>
        )}
        {rol.descripcion ? <p className="mt-1 text-sm text-[var(--fg-muted)]">{rol.descripcion}</p> : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-[var(--fg-muted)]">
          Último acceso:{" "}
          {fechaAcceso(usuario.ultimo_acceso)}
        </span>
        {editable ? (
          <Botones
            usuario={usuario}
            ocupado={f.ocupado}
            hayClave={hayClave}
            onEstado={f.cambiarEstado}
            onClave={() => f.setPendiente({ tipo: "clave" })}
            onDatos={() => f.setPendiente({ tipo: "datos" })}
          />
        ) : null}
      </div>

      {f.pendiente ? (
        <div className="mt-3">
          {f.pendiente.tipo === "datos" ? (
            <FormDatos
              usuario={usuario}
              ocupado={f.ocupado}
              onGuardar={(d) => void f.guardarDatos(d)}
              onCancelar={() => f.setPendiente(null)}
            />
          ) : (
            <Confirmacion
              usuario={usuario}
              pendiente={f.pendiente}
              ocupado={f.ocupado}
              onSi={() => void f.confirmar()}
              onNo={() => f.setPendiente(null)}
            />
          )}
        </div>
      ) : null}

      {f.nueva ? (
        <div className="mt-3">
          <ContrasenaReciencreada
            datos={f.nueva}
            titulo={`Contraseña nueva para ${f.nueva.nombre}`}
            onCerrar={() => f.setNueva(null)}
          />
        </div>
      ) : null}

      {esUnoMismo && puedeEditar ? (
        <p className="mt-2 text-sm text-[var(--fg-subtle)]">
          Tu propia ficha no se toca desde aquí.
        </p>
      ) : null}
    </div>
  );
}

function FilaUsuario({
  usuario,
  esUnoMismo,
  puedeEditar,
  hayClave,
}: {
  usuario: Usuario;
  esUnoMismo: boolean;
  puedeEditar: boolean;
  hayClave: boolean;
}) {
  const f = useFicha(usuario);
  const editable = puedeEditar && !esUnoMismo;
  const rol = useRol(usuario.rol);
  const fondo = usuario.activo ? "" : "bg-[var(--surface-2)]";

  return (
    <>
      {/* Sin `opacity-60`: ver la tarjeta de arriba (1,86:1 medido el 21/10). */}
      <tr className={`${f.pendiente || f.nueva ? "" : "border-b"} border-[var(--border-soft)] ${fondo}`}>
        <td className="px-3 py-2">
          <span className="font-medium">{usuario.nombre}</span>
          <Distintivos esUnoMismo={esUnoMismo} activo={usuario.activo} />
          {/*
            El correo es con lo que esa persona entra: si hay que confirmárselo
            por teléfono, tiene que leerse. Nada por debajo de 14 px en algo que
            hay que leer.
          */}
          <span className="block text-sm text-[var(--fg-subtle)]">
            {usuario.email ?? "sin correo"}
          </span>
        </td>

        <td className="px-3 py-2">
          {editable ? (
            <SelectorRol
              usuario={usuario}
              valor={f.pendiente?.tipo === "rol" ? f.pendiente.rol : usuario.rol}
              ocupado={f.ocupado}
              onCambiar={(r) => f.setPendiente(r === usuario.rol ? null : { tipo: "rol", rol: r })}
              className="w-auto"
            />
          ) : (
            <span>{rol.nombre}</span>
          )}
          {rol.descripcion ? (
            <span className="mt-0.5 block text-sm text-[var(--fg-subtle)]">{rol.descripcion}</span>
          ) : null}
        </td>

        <td className="tabular px-3 py-2 text-sm text-[var(--fg-muted)]">
          {fechaAcceso(usuario.ultimo_acceso)}
        </td>

        <td className="px-3 py-2 text-right">
          {editable ? (
            <Botones
              usuario={usuario}
              ocupado={f.ocupado}
              hayClave={hayClave}
              onEstado={f.cambiarEstado}
              onClave={() => f.setPendiente({ tipo: "clave" })}
              onDatos={() => f.setPendiente({ tipo: "datos" })}
            />
          ) : esUnoMismo && puedeEditar ? (
            <span className="text-sm text-[var(--fg-subtle)]">
              Tu propia ficha no se toca desde aquí
            </span>
          ) : null}
        </td>
      </tr>
      {f.pendiente || f.nueva ? (
        <tr className={`border-b border-[var(--border-soft)] ${fondo}`}>
          <td colSpan={4} className="px-3 pb-3">
            {f.pendiente ? (
              f.pendiente.tipo === "datos" ? (
                <FormDatos
                  usuario={usuario}
                  ocupado={f.ocupado}
                  onGuardar={(d) => void f.guardarDatos(d)}
                  onCancelar={() => f.setPendiente(null)}
                />
              ) : (
                <Confirmacion
                  usuario={usuario}
                  pendiente={f.pendiente}
                  ocupado={f.ocupado}
                  onSi={() => void f.confirmar()}
                  onNo={() => f.setPendiente(null)}
                />
              )
            ) : null}
            {f.nueva ? (
              <ContrasenaReciencreada
                datos={f.nueva}
                titulo={`Contraseña nueva para ${f.nueva.nombre}`}
                onCerrar={() => f.setNueva(null)}
              />
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

/**
 * Nombre, correo, cargo y teléfono de otra persona (21/10). El correo es con
 * lo que entra: lo dice la ayuda, para que nadie lo cambie sin avisarle.
 */
function FormDatos({
  usuario,
  ocupado,
  onGuardar,
  onCancelar,
}: {
  usuario: Usuario;
  ocupado: boolean;
  onGuardar: (d: { nombre: string; email: string; telefono: string }) => void;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = React.useState(usuario.nombre);
  const [email, setEmail] = React.useState(usuario.email ?? "");
  const [telefono, setTelefono] = React.useState(usuario.telefono ?? "");
  const id = (c: string) => `datos-${c}-${usuario.id}`;
  const listo = nombre.trim().length >= 3 && email.includes("@") && !ocupado;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (listo) onGuardar({ nombre, email, telefono });
      }}
      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id={id("nombre")} label="Nombre y apellidos" requerido>
          <Input id={id("nombre")} value={nombre} onChange={(e) => setNombre(e.target.value)} required autoFocus />
        </Campo>
        <Campo id={id("email")} label="Correo" requerido ayuda="Con este correo entra. Si lo cambias, avísale.">
          <Input id={id("email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Campo>
        <Campo id={id("telefono")} label="Teléfono">
          <Input id={id("telefono")} value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        </Campo>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="submit" disabled={!listo}>
          {ocupado ? "Guardando…" : "Guardar"}
        </Button>
        <Button type="button" variant="outline" disabled={ocupado} onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
