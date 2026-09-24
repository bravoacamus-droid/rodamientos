"use client";

/*
 * "use client" OBLIGATORIO: selects que disparan una Server Action al cambiar.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, SelectNativo, toast } from "@rodatech/ui";

import { cambiarUsuario, type ResultadoConfig } from "../acciones/guardar";
import { AYUDA_ROL, ETIQUETA_ROL, ROLES, type Rol, type Usuario } from "../dominio/tipos";

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
  idPropio,
  puedeEditar,
}: {
  usuarios: Usuario[];
  idPropio: string | null;
  puedeEditar: boolean;
}) {
  return (
    <>
      <div className="flex flex-col gap-3 md:hidden">
        {usuarios.map((u) => (
          <TarjetaUsuario
            key={u.id}
            usuario={u}
            esUnoMismo={u.id === idPropio}
            puedeEditar={puedeEditar}
          />
        ))}
      </div>

      <div className="hidden md:block">
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
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Lo que las dos formas comparten: llamar a la acción y avisar. */
function useCambiar() {
  const router = useRouter();
  const [ocupado, setOcupado] = React.useState(false);

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
      }
    },
    [router],
  );

  return { ocupado, correr };
}

function SelectorRol({
  usuario,
  ocupado,
  onCambiar,
  className = "",
}: {
  usuario: Usuario;
  ocupado: boolean;
  onCambiar: (rol: Rol) => void;
  className?: string;
}) {
  return (
    <SelectNativo
      value={usuario.rol}
      aria-label={`Rol de ${usuario.nombre}`}
      disabled={ocupado}
      onChange={(e) => onCambiar(e.target.value as Rol)}
      className={className}
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {ETIQUETA_ROL[r]}
        </option>
      ))}
    </SelectNativo>
  );
}

function BotonEstado({
  usuario,
  ocupado,
  onCambiar,
}: {
  usuario: Usuario;
  ocupado: boolean;
  onCambiar: () => void;
}) {
  return (
    /*
      `outline` y no `ghost`. Luis, sobre otra pantalla: «esos botones sin
      color, no veo mejora acá». Un botón que solo es texto gris no parece un
      botón, y este da de baja a una persona.
    */
    <Button
      variant="outline"
      size="sm"
      disabled={ocupado}
      onClick={onCambiar}
      /* `text-sm` porque el tamaño `sm` del sistema de diseño es `text-xs`, y
         12,75 px en un BOTÓN es exactamente lo que no puede pasar aquí. */
      className="text-sm"
    >
      {usuario.activo ? "Desactivar" : "Activar"}
    </Button>
  );
}

/*
  Las pastillas van con `text-sm` encima del tamaño del componente.

  Todos los tamaños de `Badge` son `text-xs` (12,75 px), y «Inactivo» es un
  estado que hay que leer. Se sube aquí y no en el componente porque hay 83
  pastillas en el ERP y cambiarlas todas de golpe es una decisión de Luis, no
  un arreglo de paso. Queda apuntado.
*/
function Distintivos({ esUnoMismo, activo }: { esUnoMismo: boolean; activo: boolean }) {
  return (
    <>
      {esUnoMismo ? (
        <Badge tone="brand" size="sm" className="ml-2 text-sm">
          Tú
        </Badge>
      ) : null}
      {!activo ? (
        <Badge tone="neutral" size="sm" className="ml-2 text-sm">
          Inactivo
        </Badge>
      ) : null}
    </>
  );
}

function TarjetaUsuario({
  usuario,
  esUnoMismo,
  puedeEditar,
}: {
  usuario: Usuario;
  esUnoMismo: boolean;
  puedeEditar: boolean;
}) {
  const { ocupado, correr } = useCambiar();
  const editable = puedeEditar && !esUnoMismo;

  return (
    <div
      className={`rounded-lg border border-[var(--border)] p-3 ${usuario.activo ? "" : "opacity-60"}`}
    >
      <p className="font-medium">
        {usuario.nombre}
        <Distintivos esUnoMismo={esUnoMismo} activo={usuario.activo} />
      </p>
      <p className="text-sm text-[var(--fg-muted)]">
        {usuario.email ?? "sin correo"}
        {usuario.cargo ? ` · ${usuario.cargo}` : ""}
      </p>

      <div className="mt-3">
        {editable ? (
          <SelectorRol
            usuario={usuario}
            ocupado={ocupado}
            onCambiar={(rol) => correr(() => cambiarUsuario(usuario.id, { rol }))}
            className="w-full"
          />
        ) : (
          <p className="font-medium">{ETIQUETA_ROL[usuario.rol]}</p>
        )}
        <p className="mt-1 text-sm text-[var(--fg-muted)]">{AYUDA_ROL[usuario.rol]}</p>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-sm text-[var(--fg-muted)]">
          Último acceso:{" "}
          {usuario.ultimo_acceso ? usuario.ultimo_acceso.slice(0, 10) : "nunca"}
        </span>
        {editable ? (
          <BotonEstado
            usuario={usuario}
            ocupado={ocupado}
            onCambiar={() => correr(() => cambiarUsuario(usuario.id, { activo: !usuario.activo }))}
          />
        ) : null}
      </div>

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
}: {
  usuario: Usuario;
  esUnoMismo: boolean;
  puedeEditar: boolean;
}) {
  const { ocupado, correr } = useCambiar();
  const editable = puedeEditar && !esUnoMismo;

  return (
    <tr className={`border-b border-[var(--border-soft)] ${usuario.activo ? "" : "opacity-60"}`}>
      <td className="px-3 py-2">
        <span className="font-medium">{usuario.nombre}</span>
        <Distintivos esUnoMismo={esUnoMismo} activo={usuario.activo} />
        {/*
          `text-sm` y no `text-xs`. El correo es con lo que esa persona entra:
          si hay que confirmárselo por teléfono, tiene que leerse. Nada por
          debajo de 14 px en algo que hay que leer.
        */}
        <span className="block text-sm text-[var(--fg-subtle)]">
          {usuario.email ?? "sin correo"}
          {usuario.cargo ? ` · ${usuario.cargo}` : ""}
        </span>
      </td>

      <td className="px-3 py-2">
        {editable ? (
          <SelectorRol
            usuario={usuario}
            ocupado={ocupado}
            onCambiar={(rol) => correr(() => cambiarUsuario(usuario.id, { rol }))}
            className="w-auto"
          />
        ) : (
          <span>{ETIQUETA_ROL[usuario.rol]}</span>
        )}
        <span className="mt-0.5 block text-sm text-[var(--fg-subtle)]">
          {AYUDA_ROL[usuario.rol]}
        </span>
      </td>

      <td className="tabular px-3 py-2 text-sm text-[var(--fg-muted)]">
        {usuario.ultimo_acceso ? usuario.ultimo_acceso.slice(0, 10) : "nunca"}
      </td>

      <td className="whitespace-nowrap px-3 py-2 text-right">
        {editable ? (
          <BotonEstado
            usuario={usuario}
            ocupado={ocupado}
            onCambiar={() => correr(() => cambiarUsuario(usuario.id, { activo: !usuario.activo }))}
          />
        ) : esUnoMismo && puedeEditar ? (
          <span className="text-sm text-[var(--fg-subtle)]">
            Tu propia ficha no se toca desde aquí
          </span>
        ) : null}
      </td>
    </tr>
  );
}
