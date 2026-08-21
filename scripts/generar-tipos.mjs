#!/usr/bin/env node
/**
 * Regenera packages/db/src/tipos.generados.ts desde el esquema real de Postgres.
 *
 * Igual que aplicar-migraciones.mjs, acepta dos vías y usa la que esté:
 *   SUPABASE_DB_URL                          (preferida)
 *   SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF
 *
 * Uso:  pnpm db:tipos
 */

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const DESTINO = join(RAIZ, "packages", "db", "src", "tipos.generados.ts");

cargarEnvLocal();

const DB_URL = process.env.SUPABASE_DB_URL;
const TOKEN =
  process.env.SUPABASE_ACCESS_TOKEN ?? process.env.SUPABASE_MGMT_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;

function cargarEnvLocal() {
  const ruta = join(RAIZ, ".env.local");
  if (!existsSync(ruta)) return;
  for (const linea of readFileSync(ruta, "utf8").split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const igual = limpia.indexOf("=");
    if (igual === -1) continue;
    const clave = limpia.slice(0, igual).trim();
    let valor = limpia.slice(igual + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    if (!(clave in process.env)) process.env[clave] = valor;
  }
}

const CABECERA = `/**
 * ARCHIVO GENERADO — no editar a mano.
 *
 * Se regenera con:  pnpm db:tipos
 */

`;

function main() {
  const args = ["--yes", "supabase", "gen", "types", "typescript", "--schema", "public"];

  if (DB_URL) {
    args.push("--db-url", DB_URL);
  } else if (TOKEN && REF) {
    args.push("--project-id", REF);
    process.env.SUPABASE_ACCESS_TOKEN = TOKEN;
  } else {
    console.error(
      "No hay forma de conectarse. Configura en .env.local una de las dos:\n" +
        "  SUPABASE_DB_URL=postgresql://...   (preferida)\n" +
        "  SUPABASE_ACCESS_TOKEN=sbp_... junto con SUPABASE_PROJECT_REF=...",
    );
    process.exit(1);
  }

  let salida;
  try {
    salida = execFileSync("npx", args, {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      shell: process.platform === "win32",
    });
  } catch (e) {
    console.error("Falló la generación de tipos:\n");
    console.error(e.stderr || e.message);
    process.exit(1);
  }

  if (!salida.includes("export type Database") && !salida.includes("export interface Database")) {
    console.error(
      "La salida no contiene el tipo Database. Revisa que el esquema esté aplicado.\n",
    );
    console.error(salida.slice(0, 2000));
    process.exit(1);
  }

  writeFileSync(DESTINO, CABECERA + salida, "utf8");
  console.log(`Tipos regenerados en ${DESTINO}`);
  console.log(
    "Revisa packages/db/src/tipos.ts: los alias de dominio pueden necesitar ampliarse.",
  );
}

main();
