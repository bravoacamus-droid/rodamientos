"use client";

// Cliente solo por el estado del envío (useActionState / useFormStatus).
// No importa nada de Supabase: de eso se encarga la Server Action, y por eso
// esta pantalla no arrastra el SDK al navegador.

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight } from "lucide-react";
import { Button, Input, InputContrasena, Label } from "@rodatech/ui";

import { MARCA_RECIEN_ENTRA } from "@/componentes/bienvenida";
import { iniciarSesion, type ResultadoLogin } from "./acciones";

const INICIAL: ResultadoLogin = { error: null };

function BotonEntrar() {
  const { pending } = useFormStatus();
  return (
    // Dorado (26/11): es lo único de ese color en la pantalla, así que el ojo
    // va solo a él. Texto casi negro sobre dorado: más de 10:1.
    <Button
      type="submit"
      variant="accent"
      size="lg"
      disabled={pending}
      className="group mt-2 min-h-14 w-full gap-2 rounded-lg text-lg font-bold [&_svg]:size-5"
    >
      {pending ? "Entrando…" : "Entrar"}
      {pending ? null : (
        <ArrowRight className="transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden="true" />
      )}
    </Button>
  );
}

export function FormularioLogin({ destino }: { destino: string }) {
  const [estado, accion] = useActionState(iniciarSesion, INICIAL);

  return (
    // `noValidate`: el error lo dice siempre el aviso de abajo, en grande y
    // en español, no el globo del navegador (pequeño y a veces en inglés).
    <form
      action={accion}
      noValidate
      className="flex flex-col gap-5"
      // La marca para la bienvenida del ERP (ver Bienvenida). Si la clave
      // está mal no se llega al ERP y la marca se queda esperando al
      // siguiente intento, que es justo cuando hace falta.
      onSubmit={() => {
        try {
          window.sessionStorage.setItem(MARCA_RECIEN_ENTRA, "1");
        } catch {
          // Sin almacenamiento: se entra igual, solo que sin bienvenida.
        }
      }}
    >
      <input type="hidden" name="destino" value={destino} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="correo" className="text-base">Correo o usuario</Label>
        {/*
          `type="text"` y no `email` desde la 171: con `email`, el teclado del
          celular esconde letras y el navegador marca «wfernandez» como mal
          escrito. `name` sigue siendo `correo`, que es lo que lee la acción.
        */}
        <Input
          id="correo"
          name="correo"
          type="text"
          inputMode="email"
          autoComplete="username"
          required
          defaultValue={estado.correo ?? ""}
          key={estado.correo ?? ""}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="nombre@rodatech.pe o su usuario"
          className="min-h-14 px-4 text-lg placeholder:text-base"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="clave" className="text-base">Contraseña</Label>
        <InputContrasena
          id="clave"
          name="clave"
          autoComplete="current-password"
          required
          className="min-h-14 px-4 text-lg"
        />
      </div>

      {estado.error ? (
        <p
          role="alert"
          className="rounded-md bg-[var(--danger-bg)] px-4 py-3 text-base text-[var(--danger)]"
        >
          {estado.error}
        </p>
      ) : null}

      <BotonEntrar />
    </form>
  );
}
