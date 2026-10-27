#!/usr/bin/env node
// Activa los avisos de cada hora (163): guarda en el Vault de Supabase la
// dirección del ERP desplegado y el CRON_SECRET de .env.local, sin imprimirlo.
//
//   node scripts/configurar-avisos.mjs https://erp.rodatech.pe
//
// El CRON_SECRET tiene que ser EL MISMO que se puso en Vercel: la ruta
// /api/avisos/enviar lo compara. Si se cambia en Vercel, se vuelve a correr.
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

const url = process.argv[2];
if (!url || !/^https:\/\/[^/\s']+\/?$/.test(url)) {
  console.error("Uso: node scripts/configurar-avisos.mjs https://<dominio-del-erp>");
  process.exit(1);
}
const secreto = process.env.CRON_SECRET;
if (!secreto || /'/.test(secreto)) {
  console.error("Falta CRON_SECRET en .env.local (o lleva comillas simples).");
  process.exit(1);
}

const sql = `
  delete from vault.secrets where name in ('avisos_url', 'avisos_cron_secret');
  select vault.create_secret('${url.replace(/\/$/, "")}', 'avisos_url');
  select vault.create_secret('${secreto}', 'avisos_cron_secret');
  select public.avisar_al_celular() as resultado;`;

const resp = await fetch(
  `https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN ?? process.env.SUPABASE_MGMT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  },
);
// Solo el resultado de la última sentencia («llamada N»); nunca el secreto.
const texto = await resp.text();
console.log(resp.status, resp.ok ? texto.replace(/[^\[\]{}":,\w\s.-]/g, "") : "error al guardar");
