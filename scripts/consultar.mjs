#!/usr/bin/env node
// Ejecuta SQL contra la base del CLIENTE y lo imprime ("201 [...]" o "400 ...").
// OJO: no es de solo lectura, ejecuta lo que le pases. Para probar algo que
// escribe, envuélvelo en un bloque do $$ ... raise exception ... $$ y se deshace.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const RAIZ = "E:/rodamientos";
for (const linea of existsSync(join(RAIZ, ".env.local"))
  ? readFileSync(join(RAIZ, ".env.local"), "utf8").split(/\r?\n/)
  : []) {
  const l = linea.trim();
  if (!l || l.startsWith("#")) continue;
  const i = l.indexOf("=");
  if (i === -1) continue;
  const k = l.slice(0, i).trim();
  let v = l.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
    v = v.slice(1, -1);
  if (!(k in process.env)) process.env[k] = v;
}

const sql = process.argv.slice(2).join(" ");
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN ?? process.env.SUPABASE_MGMT_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;

const resp = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});
console.log(resp.status, await resp.text());
