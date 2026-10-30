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
/**
 * ¿Es que se publicó una versión nueva mientras la pestaña estaba abierta?
 *
 * Pasó dos veces en «SUNAT y numeración» (29 y 30/10): Luis tenía la pantalla
 * abierta desde antes de un despliegue, pulsó «Guardar», y el servidor nuevo
 * ya no reconocía el botón de la versión vieja («Server Action … was not found
 * on the server»). No se guardó nada, no quedó anotado —el aviso usa el mismo
 * camino— y la pantalla decía «Algo se rompió». Lo mismo con un trozo de la
 * aplicación que ya no existe («Loading chunk … failed»). Ninguno es un fallo:
 * se arregla recargando, y eso es lo que hay que decir.
 */
function esVersionVieja(error: Error): boolean {
  return /was not found on the server|failed-to-find-server-action|unexpected response was received from the server|Loading chunk|ChunkLoadError/i.test(
    `${error.name} ${error.message}`,
  );
}

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

  if (esVersionVieja(error)) {
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
          <main style={{ maxWidth: 480, padding: 24, textAlign: "center" }}>
            <h1 style={{ fontSize: 22, margin: "0 0 10px" }}>Hay una versión nueva del sistema</h1>
            <p style={{ margin: "0 0 6px", fontSize: 16, color: "#475569", lineHeight: 1.5 }}>
              Esta pantalla estaba abierta desde antes de la actualización, y lo último
              que hiciste <strong>no llegó a guardarse</strong>.
            </p>
            <p style={{ margin: "0 0 22px", fontSize: 16, color: "#475569", lineHeight: 1.5 }}>
              Recarga la página y vuelve a hacerlo.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: "12px 22px",
                fontSize: 16,
                borderRadius: 6,
                border: "none",
                background: "#0369a1",
                color: "white",
                cursor: "pointer",
              }}
            >
              Recargar la página
            </button>
          </main>
        </body>
      </html>
    );
  }

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
            <p style={{ marginTop: 20, fontSize: 14, color: "#94a3b8" }}>
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
