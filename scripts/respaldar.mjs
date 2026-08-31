#!/usr/bin/env node
/**
 * Copia de seguridad de la base a ficheros JSON.
 *
 * ---------------------------------------------------------------------------
 * Por qué existe esto
 * ---------------------------------------------------------------------------
 * El proyecto Supabase del cliente está en **plan free**, y el plan free
 * **no tiene copias de seguridad**. Comprobado contra la API de gestión el
 * 31/08/2026:
 *
 *     GET /v1/projects/{ref}/database/backups
 *     → { "pitr_enabled": false, "backups": [] }
 *
 * Cero. Ni una. Y dentro hay dos años del histórico de ventas de Willy, su
 * cartera de clientes y su catálogo — datos que él no nos puede volver a dar
 * porque salieron de un Excel que se armó una vez.
 *
 * Un `drop table` mal escrito, una migración con un `delete` sin `where`, o que
 * alguien borre el proyecto del panel, y no hay vuelta atrás. Esto no la
 * sustituye —una copia de verdad es PITR del plan Pro— pero convierte «se
 * perdió todo» en «se perdió lo de hoy».
 *
 * ---------------------------------------------------------------------------
 * Cuándo ejecutarlo
 * ---------------------------------------------------------------------------
 *   · ANTES de aplicar migraciones que borren o reescriban datos.
 *   · Después de una carga grande (un Excel del cliente, el maestro).
 *   · Una vez por semana mientras el proyecto siga en plan free.
 *
 *     node scripts/respaldar.mjs
 *
 * Escribe en `documentosrodamiento/respaldos/`, que está en `.gitignore`: son
 * los RUC, los precios y la facturación reales del cliente y no pueden acabar
 * en GitHub. Ver docs/PENDIENTES.md.
 *
 * ---------------------------------------------------------------------------
 * Cómo se restaura
 * ---------------------------------------------------------------------------
 * A mano y con cuidado, que es lo correcto para algo que se hace una vez cada
 * nunca y bajo presión. El manifiesto lleva el número de filas de cada tabla
 * para poder comprobar el resultado, y `orden.json` el orden en que hay que
 * insertarlas para no romper las claves foráneas. El procedimiento está en
 * docs/PENDIENTES.md §7.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Las tablas, EN ORDEN DE DEPENDENCIA.
 *
 * Restaurar en este orden respeta las claves foráneas: primero los maestros
 * que nadie referencia, después lo que los referencia. Al revés, el primer
 * `insert` de una cotización fallaría porque su cliente todavía no existe.
 *
 * Las vistas (`v_*`) no se copian: se recalculan solas. Las tablas de caché
 * de consultas tampoco tendrían por qué, pero se llevan igual — son 100
 * consultas al mes y la caché ahorra cuota real.
 */
const TABLAS = [
  // Maestros sin dependencias
  "empresa",
  "perfiles",
  "permisos_rol",
  "ubigeo",
  "unidades_medida",
  "motivos_traslado",
  "motivos_nota",
  "series_documento",
  "agencias_transporte",
  "config_sunat",
  // Catálogo
  "marcas",
  "familias",
  "subfamilias",
  "tipos",
  "productos",
  "producto_equivalencias",
  // Terceros
  "clientes",
  "cliente_contactos",
  "proveedores",
  "proveedor_marcas",
  // Inventario
  "stock",
  "movimientos_inventario",
  "ajustes_inventario",
  "ajuste_items",
  // Abastecimiento
  "compras",
  "compra_items",
  "gastos_importacion",
  "recepciones",
  "recepcion_items",
  // Ciclo comercial
  "cotizaciones",
  "cotizacion_items",
  "guias_remision",
  "guia_items",
  "comprobantes",
  "comprobante_items",
  "comprobante_cuotas",
  "pagos",
  "gestiones_cobranza",
  // Operación
  "alertas",
  "actividad",
  "consultas_cache",
  "consultas_cuota",
  "consultas_log",
];

/**
 * Lo que NO se copia, y a propósito.
 *
 * `config_sunat_secretos` guarda la clave del certificado digital cifrada con
 * `SUNAT_ENCRYPTION_KEY`. Sacarla a un fichero JSON en el disco es mover un
 * secreto a un sitio peor sin ganar nada: si se pierde, se vuelve a subir el
 * certificado, que es un trámite de cinco minutos.
 */
const NUNCA = ["config_sunat_secretos"];

function cargarEnv() {
  const ruta = join(RAIZ, ".env.local");
  if (!existsSync(ruta)) {
    console.error("No encuentro .env.local. Sin credenciales no hay copia.");
    process.exit(1);
  }
  for (const linea of readFileSync(ruta, "utf8").split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const i = limpia.indexOf("=");
    if (i === -1) continue;
    const clave = limpia.slice(0, i).trim();
    let valor = limpia.slice(i + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    if (!(clave in process.env)) process.env[clave] = valor;
  }
}

cargarEnv();
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const LLAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !LLAVE) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local.");
  process.exit(1);
}

const CABECERAS = { apikey: LLAVE, Authorization: `Bearer ${LLAVE}` };
/** PostgREST corta en 1.000 filas por respuesta, así que se pagina siempre. */
const PAGINA = 1000;

/** Trae una tabla entera, paginando. */
async function traer(tabla) {
  const filas = [];
  for (let desde = 0; ; desde += PAGINA) {
    const r = await fetch(`${URL_BASE}/rest/v1/${tabla}?select=*`, {
      headers: { ...CABECERAS, Range: `${desde}-${desde + PAGINA - 1}` },
    });
    if (!r.ok) {
      // Una tabla que no existe no es un fallo de la copia: puede ser una que
      // añadió una migración que este entorno todavía no tiene.
      if (r.status === 404) return null;
      throw new Error(`${tabla}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    }
    const lote = await r.json();
    filas.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return filas;
}

const ahora = new Date();
const sello = ahora.toISOString().slice(0, 16).replace("T", "-").replace(":", "");
const destino = join(RAIZ, "documentosrodamiento", "respaldos", sello);
mkdirSync(destino, { recursive: true });

console.log(`Copia de seguridad → documentosrodamiento/respaldos/${sello}`);
console.log(`Proyecto: ${process.env.SUPABASE_PROJECT_REF ?? "(sin ref)"}\n`);

const manifiesto = { fecha: ahora.toISOString(), proyecto: process.env.SUPABASE_PROJECT_REF ?? null, tablas: {} };
let total = 0;
let fallos = 0;

for (const tabla of TABLAS) {
  if (NUNCA.includes(tabla)) continue;
  try {
    const filas = await traer(tabla);
    if (filas === null) {
      console.log(`  ${tabla.padEnd(24)} —  no existe en este entorno`);
      continue;
    }
    writeFileSync(join(destino, `${tabla}.json`), JSON.stringify(filas));
    manifiesto.tablas[tabla] = filas.length;
    total += filas.length;
    console.log(`  ${tabla.padEnd(24)} ${String(filas.length).padStart(6)}`);
  } catch (e) {
    fallos += 1;
    console.error(`  ${tabla.padEnd(24)} ERROR · ${e instanceof Error ? e.message : e}`);
  }
}

// El orden importa al restaurar y se guarda con la copia: dentro de un año
// nadie se va a acordar de que las cotizaciones van después de los clientes.
writeFileSync(join(destino, "orden.json"), JSON.stringify(TABLAS, null, 2));
writeFileSync(join(destino, "manifiesto.json"), JSON.stringify(manifiesto, null, 2));

console.log(`\n${total} filas en ${Object.keys(manifiesto.tablas).length} tablas.`);
if (fallos > 0) {
  console.error(`\n${fallos} tabla(s) fallaron. La copia está INCOMPLETA.`);
  process.exit(1);
}
console.log("Copia completa. El manifiesto lleva el recuento para poder comprobar una restauración.");
