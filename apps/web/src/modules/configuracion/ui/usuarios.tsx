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
 * No da de alta a nadie, y es deliberado: el usuario nace en Supabase Auth y el
 * trigger `trg_usuario_nuevo` le crea el perfil. Poner aquí un «crear usuario»
 * obligaría a manejar contraseñas desde el ERP, que es exactamente lo que no
 * hay que hacer teniendo Auth al lado.
 *
 * La fila de uno mismo va sin controles: si el único gerente se cambia el rol,
 * ya nadie puede devolvérselo sin entrar por SQL. RLS no lo impide —la política
 * de `perfiles` deja a gerencia escribir cualquier fila, incluida la suya—, así
 * que lo impide la aplicación, en el servidor y también aquí.
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
    <div className="scroll-x">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
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

  const editable = puedeEditar && !esUnoMismo;

  return (
    <tr className={`border-b border-[var(--border-soft)] ${usuario.activo ? "" : "opacity-60"}`}>
      <td className="px-3 py-2">
        <span className="font-medium">{usuario.nombre}</span>
        {esUnoMismo ? (
          <Badge tone="brand" size="xs" className="ml-2">
            Tú
          </Badge>
        ) : null}
        {!usuario.activo ? (
          <Badge tone="neutral" size="xs" className="ml-2">
            Inactivo
          </Badge>
        ) : null}
        <span className="block text-xs text-[var(--fg-subtle)]">
          {usuario.email ?? "sin correo"}
          {usuario.cargo ? ` · ${usuario.cargo}` : ""}
        </span>
      </td>

      <td className="px-3 py-2">
        {editable ? (
          <SelectNativo
            value={usuario.rol}
            aria-label={`Rol de ${usuario.nombre}`}
            disabled={ocupado}
            title={AYUDA_ROL[usuario.rol]}
            onChange={(e) => correr(() => cambiarUsuario(usuario.id, { rol: e.target.value as Rol }))}
            className="h-8 w-auto text-xs"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ETIQUETA_ROL[r]}
              </option>
            ))}
          </SelectNativo>
        ) : (
          <span>{ETIQUETA_ROL[usuario.rol]}</span>
        )}
        <span className="mt-0.5 block text-xs text-[var(--fg-subtle)]">
          {AYUDA_ROL[usuario.rol]}
        </span>
      </td>

      <td className="px-3 py-2 tabular text-xs text-[var(--fg-muted)]">
        {usuario.ultimo_acceso ? usuario.ultimo_acceso.slice(0, 10) : "nunca"}
      </td>

      <td className="whitespace-nowrap px-3 py-2 text-right">
        {editable ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={ocupado}
            onClick={() => correr(() => cambiarUsuario(usuario.id, { activo: !usuario.activo }))}
          >
            {usuario.activo ? "Desactivar" : "Activar"}
          </Button>
        ) : esUnoMismo && puedeEditar ? (
          <span className="text-xs text-[var(--fg-subtle)]">
            Tu propia ficha no se toca desde aquí
          </span>
        ) : null}
      </td>
    </tr>
  );
}
