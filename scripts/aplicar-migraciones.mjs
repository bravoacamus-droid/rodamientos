#!/usr/bin/env node
/**
 * Aplica los .sql de supabase/migrations/ contra el proyecto Supabase.
 *
 * Acepta dos formas de conectarse; usa la primera que esté configurada:
 *
 *   1. SUPABASE_DB_URL   — cadena de conexión Postgres directa. Es la vía
 *                          preferida: no depende de la Management API y
 *                          permite transacciones de verdad.
 *                          Dashboard → Project Settings → Database → Connection string (URI)
 *
 *   2. SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF
 *                        — personal access token (sbp_...) contra
 *                          /v1/projects/{ref}/database/query.
 *                          Dashboard → Account → Access Tokens
 *
 * Uso:
 *   node scripts/aplicar-migraciones.mjs                  # todas, en orden
 *   node scripts/aplicar-migraciones.mjs 001_esquema.sql  # solo una
 *   node scripts/aplicar-migraciones.mjs --dry            # lista sin ejecutar
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR_MIGRACIONES = join(RAIZ, "supabase", "migrations");

cargarEnvLocal();

const DB_URL = process.env.SUPABASE_DB_URL;
const TOKEN =
  process.env.SUPABASE_ACCESS_TOKEN ?? process.env.SUPABASE_MGMT_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;

/** Lee .env.local sin dependencias: KEY=valor, ignora comentarios y vacíos. */
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

/** Ejecuta SQL por la Management API. Devuelve { ok, detalle }. */
async function ejecutarViaApi(sql) {
  const resp = await fetch(
    `https://api.supabase.com/v1/projects/${REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const texto = await resp.text();
  return { ok: resp.ok, detalle: texto.slice(0, 4000) };
}

/** Ejecuta SQL por conexión directa a Postgres, dentro de una transacción. */
async function ejecutarViaPostgres(sql) {
  let pg;
  try {
    pg = await import("pg");
  } catch {
    return {
      ok: false,
      detalle:
        "SUPABASE_DB_URL está configurada pero falta el paquete 'pg'. Instálalo con: pnpm add -Dw pg",
    };
  }
  const cliente = new pg.default.Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await cliente.connect();
    await cliente.query("begin");
    await cliente.query(sql);
    await cliente.query("commit");
    return { ok: true, detalle: "aplicada en transacción" };
  } catch (e) {
    try {
      await cliente.query("rollback");
    } catch {
      /* la conexión ya puede estar rota; el rollback es best-effort */
    }
    return { ok: false, detalle: String(e?.message ?? e) };
  } finally {
    await cliente.end().catch(() => {});
  }
}

function elegirTransporte() {
  if (DB_URL) return { nombre: "postgres directo", ejecutar: ejecutarViaPostgres };
  if (TOKEN && REF)
    return { nombre: "Management API", ejecutar: ejecutarViaApi };
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const solo = args.filter((a) => !a.startsWith("--"));

  if (!existsSync(DIR_MIGRACIONES)) {
    console.error(`No existe ${DIR_MIGRACIONES}`);
    process.exit(1);
  }

  const archivos = readdirSync(DIR_MIGRACIONES)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => solo.length === 0 || solo.includes(f));

  if (archivos.length === 0) {
    console.log("No hay migraciones que aplicar.");
    return;
  }

  if (dry) {
    console.log(`Se aplicarían ${archivos.length} migraciones, en este orden:`);
    for (const f of archivos) console.log(`  · ${f}`);
    return;
  }

  const transporte = elegirTransporte();
  if (!transporte) {
    console.error(
      "No hay forma de conectarse. Configura en .env.local una de las dos:\n" +
        "  SUPABASE_DB_URL=postgresql://...   (preferida)\n" +
        "  SUPABASE_ACCESS_TOKEN=sbp_... junto con SUPABASE_PROJECT_REF=...",
    );
    process.exit(1);
  }

  console.log(`Transporte: ${transporte.nombre}`);
  console.log(`Migraciones: ${archivos.length}\n`);

  const aplicadas = [];

  for (const archivo of archivos) {
    const sql = readFileSync(join(DIR_MIGRACIONES, archivo), "utf8");
    process.stdout.write(`  ${archivo} … `);
    const { ok, detalle } = await transporte.ejecutar(sql);

    if (!ok) {
      console.log("ERROR");
      console.error(`\n${detalle}\n`);
      console.error(`Se detuvo en ${archivo}.`);
      if (aplicadas.length > 0) {
        console.error(
          `Ya se habían aplicado: ${aplicadas.join(", ")}. ` +
            "Vuelve a correr el comando tras corregir; las migraciones son " +
            "idempotentes (create ... if not exists / create or replace).",
        );
      } else {
        console.error("No se aplicó ninguna migración.");
      }
      // exitCode y no exit(): con una petición HTTP recién cerrada, process.exit()
      // aborta libuv en Windows con una aserción en vez de un error legible.
      process.exitCode = 1;
      return;
    }

    console.log("ok");
    aplicadas.push(archivo);
  }

  console.log(`\nSe aplicaron ${aplicadas.length} migraciones correctamente.`);
  console.log("Siguiente paso:  pnpm db:tipos");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
