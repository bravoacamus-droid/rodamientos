"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Campo, Input, toast } from "@rodatech/ui";

import { cambiarMiContrasena } from "../acciones/guardar";
import { MINIMO_CONTRASENA } from "../dominio/tipos";

/**
 * La contraseña del primer día.
 *
 * Es casi `FormContrasena`, con tres diferencias que justifican que sea otro
 * componente en vez de un `prop` más:
 *
 *   1. Al terminar ENTRA al ERP. En `/perfil` se queda donde está, porque ya
 *      estaba dentro; aquí quedarse sería dejarlo mirando la misma pantalla
 *      sin saber que ya pasó.
 *   2. La etiqueta de la actual dice «la que te dieron», no «contraseña
 *      actual». Es la misma casilla y la misma comprobación, pero quien está
 *      delante acaba de recibir un papelito de su jefe y esa es la palabra que
 *      va a buscar.
 *   3. No hay forma de salir sin cambiarla — ni botón de cancelar ni menú.
 *
 * La comprobación de la actual NO es de adorno aquí tampoco: sin ella, quien
 * se encuentre una sesión abierta en el mostrador se queda con la cuenta.
 */
export function FormPrimeraContrasena() {
  const router = useRouter();
  const [actual, setActual] = React.useState("");
  const [nueva, setNueva] = React.useState("");
  const [repetida, setRepetida] = React.useState("");
  const [enviando, empezar] = React.useTransition();

  const cortaDeMas = nueva.length > 0 && nueva.length < MINIMO_CONTRASENA;
  const noCoinciden = repetida.length > 0 && nueva !== repetida;
  const esLaMisma = nueva.length > 0 && nueva === actual;
  const listo =
    actual.length > 0 &&
    nueva.length >= MINIMO_CONTRASENA &&
    nueva === repetida &&
    !esLaMisma &&
    !enviando;

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    empezar(async () => {
      const r = await cambiarMiContrasena(actual, nueva);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Listo. Esta es tu contraseña a partir de ahora.");
      /*
        `refresh()` antes de navegar: el layout del ERP lee la marca en el
        servidor, y sin refrescar volvería a mandarnos aquí con la copia vieja.
      */
      router.refresh();
      router.replace("/dashboard");
    });
  }

  return (
    <form onSubmit={enviar} className="mt-5 flex flex-col gap-4">
      <Campo id="clave-dada" label="La contraseña que te dieron" requerido>
        <Input
          id="clave-dada"
          type="password"
          autoComplete="current-password"
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          required
          autoFocus
        />
      </Campo>

      <Campo
        id="clave-nueva"
        label="Tu contraseña nueva"
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

      <Campo id="clave-repetida" label="Repite tu contraseña nueva" requerido>
        <Input
          id="clave-repetida"
          type="password"
          autoComplete="new-password"
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
          required
        />
      </Campo>

      {/* Mientras escribe, no al mandar: enterarse de que era corta después de
          teclearla tres veces es la peor forma de enterarse. */}
      {cortaDeMas ? (
        <p className="text-sm text-[var(--warn)]">
          Le faltan {MINIMO_CONTRASENA - nueva.length} caracteres.
        </p>
      ) : null}
      {esLaMisma ? (
        <p className="text-sm text-[var(--danger)]">
          Esa es la que te dieron. Tiene que ser una distinta.
        </p>
      ) : null}
      {noCoinciden ? (
        <p className="text-sm text-[var(--danger)]">Las dos nuevas no son iguales.</p>
      ) : null}

      <Button type="submit" disabled={!listo} className="w-full">
        {enviando ? "Guardando…" : "Guardar y entrar"}
      </Button>
    </form>
  );
}
