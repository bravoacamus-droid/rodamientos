"use client";

/*
 * "use client" OBLIGATORIO: depende del permiso de notificaciones y de la
 * suscripción de ESTE navegador, que el servidor no conoce.
 */

import * as React from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@rodatech/ui";

import { estadoDelNavegador, suscripcionActual } from "./navegador";

const CLAVE = "rodatech:avisos:recordatorio-cerrado";

/**
 * El recordatorio del tablero (162): sale solo en un aparato que PUEDE
 * recibir avisos, todavía no los recibe y nadie le ha dicho «Ahora no».
 *
 * Existe porque el botón vive en «Mi perfil», y a «Mi perfil» se entra una
 * vez. Es la lección de la tabla de CLAUDE.md: una función que nadie
 * encuentra vale lo mismo que una que no existe.
 */
export function RecordatorioAvisos() {
  const [ver, setVer] = React.useState(false);

  React.useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        if (window.localStorage.getItem(CLAVE)) return;
      } catch {
        // Sin almacenamiento (modo privado) se ofrece igual.
      }
      const e = estadoDelNavegador();
      if (e === "bloqueado" || e === "no-compatible") return;
      if (e !== "ios-instalar" && (await suscripcionActual())) return;
      if (vivo) setVer(true);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  if (!ver) return null;

  function cerrar() {
    try {
      window.localStorage.setItem(CLAVE, new Date().toISOString());
    } catch {
      // Sin almacenamiento se cierra solo por esta vez.
    }
    setVer(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <Bell aria-hidden="true" className="size-5 shrink-0 text-brand-600" />
      <p className="min-w-0 flex-1 text-sm">
        <strong>¿Quieres que los avisos te lleguen al celular?</strong> Así no hace falta entrar al
        sistema para enterarte.
      </p>
      <div className="flex gap-2">
        <Button asChild size="md">
          <Link href="/perfil#avisos">Activar avisos</Link>
        </Button>
        <Button variant="outline" size="md" onClick={cerrar}>
          Ahora no
        </Button>
      </div>
    </div>
  );
}
