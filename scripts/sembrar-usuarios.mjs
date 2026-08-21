#!/usr/bin/env node
/**
 * Crea las cuentas de desarrollo, una por rol.
 *
 * Usa la Admin API de Supabase, que exige la service_role. Por eso vive aquí
 * y no en la aplicación: esa clave nunca sale del entorno local.
 *
 * Si el esquema ya está aplicado, además inserta la fila en `perfiles` con su
 * rol. Si no lo está, crea igual las cuentas de Auth y avisa: los roles se
 * completan corriendo esto otra vez después de `pnpm db:aplicar`.
 *
 * Uso:  pnpm db:usuarios
 */

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_LOCAL = join(RAIZ, ".env.local");

cargarEnvLocal();

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Las seis cuentas, una por rol del ERP. */
const CUENTAS = [
  { correo: "gerencia@rodatech.pe", nombre: "Willy Rodríguez", rol: "gerencia", cargo: "Gerente General" },
  { correo: "admin@rodatech.pe", nombre: "Ana Salazar", rol: "admin", cargo: "Administración" },
  { correo: "ventas@rodatech.pe", nombre: "Carlos Mendoza", rol: "ventas", cargo: "Asesor comercial" },
  { correo: "almacen@rodatech.pe", nombre: "Julio Ramos", rol: "almacen", cargo: "Jefe de almacén" },
  { correo: "compras@rodatech.pe", nombre: "Rosa Quispe", rol: "compras", cargo: "Compras e importaciones" },
  { correo: "cobranzas@rodatech.pe", nombre: "Luis Tafur", rol: "cobranzas", cargo: "Créditos y cobranzas" },
];

function cargarEnvLocal() {
  if (!existsSync(ENV_LOCAL)) return;
  for (const linea of readFileSync(ENV_LOCAL, "utf8").split(/\r?\n/)) {
    const l = linea.trim();
    if (!l || l.startsWith("#")) continue;
    const i = l.indexOf("=");
    if (i === -1) continue;
    const k = l.slice(0, i).trim();
    let v = l.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (v && !(k in process.env)) process.env[k] = v;
  }
}

/**
 * Devuelve la contraseña de desarrollo. Si no existe, genera una aleatoria y
 * la guarda en .env.local — que está en .gitignore, así que no se versiona.
 * Nunca se escribe en el código ni llega al navegador.
 */
function obtenerClaveDev() {
  const existente = process.env.RODATECH_DEV_PASSWORD;
  if (existente) return { clave: existente, nueva: false };

  const clave = "Dev-" + randomBytes(9).toString("base64url");
  const contenido = existsSync(ENV_LOCAL) ? readFileSync(ENV_LOCAL, "utf8") : "";
  const sufijo =
    (contenido.endsWith("\n") || contenido === "" ? "" : "\n") +
    "\n# Contraseña de las cuentas de desarrollo. Solo local: los atajos del\n" +
    "# login la usan desde el servidor y nunca llega al navegador.\n" +
    `RODATECH_DEV_PASSWORD=${clave}\n`;
  writeFileSync(ENV_LOCAL, contenido + sufijo, "utf8");
  process.env.RODATECH_DEV_PASSWORD = clave;
  return { clave, nueva: true };
}

async function api(ruta, opciones = {}) {
  const resp = await fetch(`${URL_BASE}${ruta}`, {
    ...opciones,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      ...(opciones.headers ?? {}),
    },
  });
  const texto = await resp.text();
  let cuerpo = null;
  try {
    cuerpo = texto ? JSON.parse(texto) : null;
  } catch {
    cuerpo = texto;
  }
  return { ok: resp.ok, estado: resp.status, cuerpo };
}

async function main() {
  if (!URL_BASE || !SERVICE) {
    console.error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en .env.local.",
    );
    process.exitCode = 1;
    return;
  }

  const { clave, nueva } = obtenerClaveDev();

  const existentes = await api("/auth/v1/admin/users?per_page=200");
  if (!existentes.ok) {
    console.error("No se pudo listar usuarios:", existentes.cuerpo);
    process.exitCode = 1;
    return;
  }
  const porCorreo = new Map(
    (existentes.cuerpo.users ?? []).map((u) => [u.email, u.id]),
  );

  const creadas = [];

  for (const cuenta of CUENTAS) {
    let id = porCorreo.get(cuenta.correo);

    if (id) {
      // Ya existe: se resincroniza la contraseña para que los atajos funcionen.
      const r = await api(`/auth/v1/admin/users/${id}`, {
        method: "PUT",
        body: JSON.stringify({ password: clave, email_confirm: true }),
      });
      console.log(`  ${r.ok ? "ok " : "err"} ${cuenta.correo.padEnd(24)} (ya existía)`);
    } else {
      const r = await api("/auth/v1/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: cuenta.correo,
          password: clave,
          email_confirm: true,
          user_metadata: { nombre: cuenta.nombre },
        }),
      });
      if (!r.ok) {
        console.log(`  err ${cuenta.correo.padEnd(24)} ${JSON.stringify(r.cuerpo)}`);
        continue;
      }
      id = r.cuerpo.id;
      console.log(`  ok  ${cuenta.correo.padEnd(24)} creada`);
    }

    if (id) creadas.push({ ...cuenta, id });
  }

  // Perfiles: solo si la tabla existe. El rol vive ahí y NO en los metadatos
  // del usuario, que el propio usuario puede editar.
  const sonda = await api("/rest/v1/perfiles?select=id&limit=1");
  if (sonda.ok) {
    const filas = creadas.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      email: c.correo,
      rol: c.rol,
      cargo: c.cargo,
      activo: true,
    }));
    const r = await api("/rest/v1/perfiles", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(filas),
    });
    console.log(
      r.ok
        ? `\nPerfiles sincronizados: ${filas.length}.`
        : `\nNo se pudieron escribir los perfiles: ${JSON.stringify(r.cuerpo)}`,
    );
  } else {
    console.log(
      "\nLa tabla `perfiles` todavía no existe, así que las cuentas quedan sin rol.",
    );
    console.log(
      "Aplica el esquema y vuelve a correr esto:  pnpm db:aplicar && pnpm db:usuarios",
    );
  }

  console.log(`\n${creadas.length} cuentas listas.`);
  if (nueva) {
    console.log(`Contraseña generada y guardada en .env.local: ${clave}`);
  } else {
    console.log("Contraseña: la de RODATECH_DEV_PASSWORD en .env.local.");
  }
  console.log(
    "\nLos atajos del login solo aparecen en desarrollo. En producción no se compilan.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
