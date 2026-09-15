"use client";

/*
 * "use client" OBLIGATORIO: dos formularios con estado y envío por Server
 * Action, y uno de ellos limpia sus campos al acertar.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Campo, Input, toast } from "@rodatech/ui";

import { cambiarMiContrasena, guardarMiPerfil } from "../acciones/guardar";
import { MINIMO_CONTRASENA, type MiPerfil } from "../dominio/tipos";

/**
 * Mis datos.
 *
 * Tres campos y ninguno es una credencial. El correo y el rol se enseñan al
 * lado, apagados, porque la pregunta «¿y esto por qué no lo puedo cambiar?» se
 * responde mejor enseñando el dato que escondiéndolo.
 */
export function FormMisDatos({ perfil }: { perfil: MiPerfil }) {
  const [datos, setDatos] = React.useState({
    nombre: perfil.nombre,
    telefono: perfil.telefono ?? "",
    cargo: perfil.cargo ?? "",
  });
  const router = useRouter();

  /*
    Dentro de una transición, y no con un `await` a pelo.

    Una Server Action que hace `revalidatePath` devuelve también el árbol nuevo
    del servidor, y fuera de una transición React no tiene dónde aplicarlo: la
    promesa no vuelve y el botón se queda en «Guardando…» para siempre, aunque
    el servidor haya respondido bien. Es el patrón que ya usa el resto del ERP.
  */
  const [guardando, empezar] = React.useTransition();

  const sinCambios =
    datos.nombre === perfil.nombre &&
    datos.telefono === (perfil.telefono ?? "") &&
    datos.cargo === (perfil.cargo ?? "");

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    empezar(async () => {
      const r = await guardarMiPerfil({
        nombre: datos.nombre,
        telefono: datos.telefono || null,
        cargo: datos.cargo || null,
      });
      if (r.ok) {
        toast.success(r.mensaje);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="nombre" label="Nombre" requerido ayuda="Es el que sale en la cabecera y el que firma tus cotizaciones.">
          <Input
            id="nombre"
            value={datos.nombre}
            onChange={(e) => setDatos((d) => ({ ...d, nombre: e.target.value }))}
            required
          />
        </Campo>

        <Campo id="cargo" label="Cargo" ayuda="Por ejemplo: Asesor comercial.">
          <Input
            id="cargo"
            value={datos.cargo}
            onChange={(e) => setDatos((d) => ({ ...d, cargo: e.target.value }))}
          />
        </Campo>

        <Campo id="telefono" label="Teléfono" ayuda="Para que te encuentren dentro de la empresa.">
          <Input
            id="telefono"
            value={datos.telefono}
            onChange={(e) => setDatos((d) => ({ ...d, telefono: e.target.value }))}
          />
        </Campo>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={guardando || sinCambios}>
          {guardando ? "Guardando…" : "Guardar cambios"}
        </Button>
        {sinCambios ? (
          <span className="text-sm text-[var(--fg-muted)]">
            No has cambiado nada todavía.
          </span>
        ) : null}
      </div>
    </form>
  );
}

/**
 * Cambiar la contraseña.
 *
 * Tres campos y no dos: la actual, la nueva y la nueva otra vez. La
 * repetición no es burocracia — una contraseña se escribe a ciegas, y sin ella
 * un dedo resbalado deja a alguien fuera de su propio sistema hasta que
 * gerencia se lo arregle.
 *
 * Y hace falta de verdad: las seis cuentas nacieron con la misma contraseña de
 * desarrollo. Hasta hoy no había forma de cambiarla desde el ERP.
 */
export function FormContrasena() {
  const [actual, setActual] = React.useState("");
  const [nueva, setNueva] = React.useState("");
  const [repetida, setRepetida] = React.useState("");
  const [enviando, empezar] = React.useTransition();

  const cortaDeMas = nueva.length > 0 && nueva.length < MINIMO_CONTRASENA;
  const noCoinciden = repetida.length > 0 && nueva !== repetida;
  const listo =
    actual.length > 0 &&
    nueva.length >= MINIMO_CONTRASENA &&
    nueva === repetida &&
    !enviando;

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    empezar(async () => {
      const r = await cambiarMiContrasena(actual, nueva);
      if (r.ok) {
        toast.success(r.mensaje);
        setActual("");
        setNueva("");
        setRepetida("");
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo id="clave-actual" label="Contraseña actual" requerido>
          <Input
            id="clave-actual"
            type="password"
            autoComplete="current-password"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            required
          />
        </Campo>

        <Campo
          id="clave-nueva"
          label="Contraseña nueva"
          requerido
          ayuda={`Mínimo ${MINIMO_CONTRASENA} caracteres.`}
        >
          <Input
            id="clave-nueva"
            type="password"
            autoComplete="new-password"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            required
          />
        </Campo>

        <Campo id="clave-repetida" label="Repite la nueva" requerido>
          <Input
            id="clave-repetida"
            type="password"
            autoComplete="new-password"
            value={repetida}
            onChange={(e) => setRepetida(e.target.value)}
            required
          />
        </Campo>
      </div>

      {/* Los avisos, mientras se escribe y no al mandar: enterarse de que era
          corta después de teclearla tres veces es la peor forma de enterarse. */}
      {cortaDeMas ? (
        <p className="text-sm text-[var(--warn)]">
          Le faltan {MINIMO_CONTRASENA - nueva.length} caracteres.
        </p>
      ) : null}
      {noCoinciden ? (
        <p className="text-sm text-[var(--danger)]">Las dos nuevas no son iguales.</p>
      ) : null}

      <div>
        <Button type="submit" disabled={!listo}>
          {enviando ? "Cambiando…" : "Cambiar contraseña"}
        </Button>
      </div>
    </form>
  );
}
