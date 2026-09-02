"use client";

// `global-error` reemplaza el `<html>` entero cuando el layout raíz revienta,
// así que tiene que traer sus propias etiquetas. Es la única pantalla del ERP
// que no puede apoyarse en nada del proyecto: si el fallo está en el layout,
// importar de `@rodatech/ui` volvería a romperlo.

import * as React from "react";

import { anotarFalloDelNavegador } from "./acciones-error";

/**
 * Lo último que ve alguien cuando el ERP se cae del todo.
 *
 * De la auditoría del 31/08 (PENDIENTES §0.2): no había `global-error.tsx`, y
 * un fallo del layout dejaba la pantalla en blanco del navegador. En blanco no
 * se puede ni contar qué pasó: la persona llama diciendo «no abre».
 *
 * Hace dos cosas, y las dos importan:
 *
 *   · **Lo apunta**, para que alguien se entere sin que nadie llame.
 *   · **Enseña el `digest`**, que es lo único que ata lo que ve el operador
 *     con lo que quedó guardado. En producción React esconde el mensaje real
 *     a propósito —puede llevar datos— y deja ese código.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Sin `await` y sin romperse: si el registro falla, la pantalla de error
    // tiene que seguir en pie. Es lo único que le queda a quien está delante.
    void anotarFalloDelNavegador(
      error.message || "La aplicación se cayó",
      error.digest ?? null,
      typeof window === "undefined" ? null : window.location.pathname,
    ).catch(() => {});
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#f8fafc",
          color: "#0f172a",
        }}
      >
        <main style={{ maxWidth: 460, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Algo se rompió</h1>
          <p style={{ margin: "0 0 4px", color: "#475569", lineHeight: 1.5 }}>
            No es cosa tuya y no se ha perdido nada de lo que estaba guardado.
            Ya quedó anotado para que lo revisemos.
          </p>
          <p style={{ margin: "0 0 20px", color: "#475569", lineHeight: 1.5 }}>
            Prueba a recargar. Si vuelve a pasar, dinos el código de abajo.
          </p>

          <button
            type="button"
            onClick={reset}
            style={{
              padding: "10px 18px",
              fontSize: 15,
              borderRadius: 6,
              border: "none",
              background: "#0369a1",
              color: "white",
              cursor: "pointer",
            }}
          >
            Volver a intentarlo
          </button>

          {error.digest ? (
            <p style={{ marginTop: 20, fontSize: 12, color: "#94a3b8" }}>
              Código del fallo:{" "}
              <code style={{ fontFamily: "ui-monospace, monospace" }}>
                {error.digest}
              </code>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
