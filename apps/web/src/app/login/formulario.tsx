"use client";

// Cliente solo por el estado del envío (useActionState / useFormStatus).
// No importa nada de Supabase: de eso se encarga la Server Action, y por eso
// esta pantalla no arrastra el SDK al navegador.

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button, Input, Label } from "@rodatech/ui";

import { iniciarSesion, type ResultadoLogin } from "./acciones";

const INICIAL: ResultadoLogin = { error: null };

function BotonEntrar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="mt-1 w-full">
      {pending ? "Entrando…" : "Entrar"}
    </Button>
  );
}

export function FormularioLogin({ destino }: { destino: string }) {
  const [estado, accion] = useActionState(iniciarSesion, INICIAL);

  return (
    <form action={accion} className="flex flex-col gap-4">
      <input type="hidden" name="destino" value={destino} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="correo">Correo</Label>
        <Input
          id="correo"
          name="correo"
          type="email"
          autoComplete="username"
          required
          placeholder="nombre@rodatech.pe"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="clave">Contraseña</Label>
        <Input
          id="clave"
          name="clave"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      {estado.error ? (
        <p
          role="alert"
          className="rounded-sm bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger)]"
        >
          {estado.error}
        </p>
      ) : null}

      <BotonEntrar />
    </form>
  );
}
