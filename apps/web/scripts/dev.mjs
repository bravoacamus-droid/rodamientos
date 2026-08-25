#!/usr/bin/env node
/**
 * Arranca `next dev` con el tope de cabeceras subido.
 *
 * ---------------------------------------------------------------------------
 * Por qué existe este archivo
 * ---------------------------------------------------------------------------
 *
 * Sin esto, el servidor acaba respondiendo **431 Request Header Fields Too
 * Large** y el navegador enseña «Esta página no funciona» sin más pista. La
 * causa es siempre la misma y no es nada obvia:
 *
 * **Las cookies NO se separan por puerto.** `localhost:3000`, `localhost:4005`
 * y cualquier otro proyecto que se levante en esta máquina comparten el mismo
 * bote de cookies — el puerto no forma parte del origen a efectos de cookies.
 * Supabase guarda la sesión entera (el JWT de acceso, el de refresco y el
 * objeto de usuario) troceada en `sb-<ref>-auth-token.0`, `.1`, `.2`…, así que
 * cada proyecto deja su propio juego. Con tres o cuatro proyectos abiertos a lo
 * largo del día, la cabecera `Cookie` pasa de los **16 kB** que Node acepta por
 * defecto y **todas** las peticiones a `localhost` empiezan a fallar, incluidas
 * las de este proyecto, que no ha hecho nada mal.
 *
 * Síntomas por los que se reconoce:
 *   · `curl` funciona y el navegador no  → curl no manda cookies.
 *   · `http://[::1]:4005` funciona y `localhost` no → otro origen, otro bote.
 *   · Falla hasta `/manifest.webmanifest`, que no toca la base de datos.
 *
 * La bandera TIENE que ir al arrancar el proceso: ponerla desde
 * `next.config.ts` no sirve, porque ese archivo se evalúa cuando Node ya está
 * corriendo y el servidor HTTP ya se creó con el límite viejo.
 *
 * Solo en desarrollo. En producción cada despliegue tiene su dominio y el
 * problema no existe; además, subir el tope de cabeceras en un servidor
 * expuesto agranda la superficie de un ataque por cabeceras infladas.
 *
 * El apaño de borrar las cookies del navegador también funciona, pero hay que
 * repetirlo cada vez que se entra a otro proyecto. Esto no.
 */

import { spawn } from "node:child_process";

const TOPE = "--max-http-header-size=32768";

const opciones = process.env.NODE_OPTIONS ?? "";
const env = {
  ...process.env,
  NODE_OPTIONS: opciones.includes("max-http-header-size")
    ? opciones
    : `${opciones} ${TOPE}`.trim(),
};

// `shell: true` en Windows: `next` es un .cmd y spawn no lo encuentra sin él.
const hijo = spawn("next", ["dev", "-p", "4005", ...process.argv.slice(2)], {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});

hijo.on("exit", (codigo, senal) => {
  // Se propaga la señal para que Ctrl+C corte de verdad y no deje el puerto
  // ocupado, que es lo que obliga a matar procesos a mano después.
  if (senal) process.kill(process.pid, senal);
  else process.exit(codigo ?? 0);
});
