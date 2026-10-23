#!/usr/bin/env node
/**
 * Copia de seguridad de la base y de los archivos a ficheros en el disco.
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
 * ---------------------------------------------------------------------------
 * Por qué se reescribió el 23/10
 * ---------------------------------------------------------------------------
 * La versión anterior llevaba la lista de tablas escrita a mano, y la lista se
 * quedó en la del 31/08: **45 tablas de 72**. No copiaba pedidos, roles,
 * permisos, cuentas bancarias, el análisis de costos de las cotizaciones, las
 * retenciones ni los papeles de los proveedores, y seguía pidiendo
 * `permisos_rol`, que se borró en la 143. Como una tabla que no existe se
 * daba por «no existe en este entorno», nadie lo vio: la copia salía
 * «completa» con un tercio de la base fuera (consultor ERP, 23/10).
 *
 * Es la variante de siempre: la pieza existía, y nadie la volvió a mirar
 * cuando la base creció. Ahora:
 *
 *   · Las tablas se leen DE LA BASE, y el orden de dependencias se calcula de
 *     sus claves foráneas. Una tabla nueva entra sola.
 *   · Cada tabla se cuenta en la base y se compara con lo copiado. Si no
 *     cuadra, la copia FALLA. Antes se paginaba sin `order`, y PostgREST no
 *     promete el mismo orden entre dos páginas: con 7 800 productos se podían
 *     repetir unos y perder otros sin que el total cambiara.
 *   · Se copian los ARCHIVOS de Storage (papeles de proveedor, vouchers,
 *     constancias de retención), que antes no se copiaban.
 *   · Se copian las cuentas de acceso (sin contraseñas) y el esquema vivo: las
 *     funciones, vistas y políticas tal como están en la base, que no siempre
 *     es lo que dicen las migraciones (CLAUDE.md §4).
 *   · Al terminar, deja apuntado en la base cómo fue (tabla `respaldos`,
 *     147), y la pantalla de Datos de la empresa avisa cuando la última copia
 *     buena tiene más de una semana. Una copia que falla en silencio o que
 *     nadie corre vale lo mismo que ninguna.
 *
 * ---------------------------------------------------------------------------
 * Cuándo ejecutarlo
 * ---------------------------------------------------------------------------
 *   · ANTES de aplicar migraciones que borren o reescriban datos.
 *   · Después de una carga grande (un Excel del cliente, el maestro).
 *   · Una vez por semana como mínimo; mejor programado (docs/RESPALDO.md).
 *
 *     pnpm db:respaldar
 *
 * Escribe en `documentosrodamiento/respaldos/`, que está en `.gitignore`: son
 * los RUC, los precios y la facturación reales del cliente y no pueden acabar
 * en GitHub. Cómo se restaura: docs/RESPALDO.md.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { hostname } from "node:os";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Lo que NO se copia, y a propósito.
 *
 * `config_sunat_secretos` guarda la clave del certificado digital cifrada con
 * `SUNAT_ENCRYPTION_KEY`. Sacarla a un fichero JSON en el disco es mover un
 * secreto a un sitio peor sin ganar nada: si se pierde, se vuelve a subir el
 * certificado, que es un trámite de cinco minutos.
 *
 * `intentos_login` son los intentos fallidos de entrar (136): caducan solos y
 * restaurarlos solo serviría para dejar a alguien bloqueado.
 */
const NUNCA = ["config_sunat_secretos", "intentos_login"];

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
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN ?? process.env.SUPABASE_MGMT_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;
if (!URL_BASE || !LLAVE || !TOKEN || !REF) {
  console.error(
    "Faltan en .env.local NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,\n" +
      "SUPABASE_ACCESS_TOKEN o SUPABASE_PROJECT_REF. Sin las cuatro no hay copia.",
  );
  process.exit(1);
}

const CABECERAS = { apikey: LLAVE, Authorization: `Bearer ${LLAVE}` };
/** PostgREST corta en 1.000 filas por respuesta, así que se pagina siempre. */
const PAGINA = 1000;

/** Ejecuta SQL por la API de gestión. Se usa para leer el catálogo y contar. */
async function sql(consulta) {
  for (let intento = 1; ; intento++) {
    const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: consulta }),
    });
    // Supabase devuelve un 502 de vez en cuando y al segundo intento contesta.
    if (r.status >= 500 && intento < 3) {
      await new Promise((ok) => setTimeout(ok, 2000 * intento));
      continue;
    }
    if (!r.ok) throw new Error(`SQL: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
    return r.json();
  }
}

const ident = (nombre) => `"${nombre.replaceAll('"', '""')}"`;
const literal = (texto) => `'${String(texto).replaceAll("'", "''")}'`;

/**
 * Las tablas de `public`, con su clave primaria y las tablas de las que
 * dependen. Las referencias a `auth.users` no cuentan: las cuentas se
 * restauran antes que nada (docs/RESPALDO.md).
 */
async function catalogo() {
  return sql(`
    select c.relname as tabla,
      coalesce((
        select array_agg(a.attname::text order by k.ord)
        from pg_constraint pk
        cross join unnest(pk.conkey) with ordinality k(attnum, ord)
        join pg_attribute a on a.attrelid = pk.conrelid and a.attnum = k.attnum
        where pk.conrelid = c.oid and pk.contype = 'p'
      ), '{}') as pk,
      coalesce((
        select array_agg(distinct rc.relname::text)
        from pg_constraint f join pg_class rc on rc.oid = f.confrelid
        where f.conrelid = c.oid and f.contype = 'f'
          and rc.relnamespace = c.relnamespace and rc.oid <> c.oid
      ), '{}') as depende
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
    order by 1`);
}

/**
 * Orden de restauración: primero lo que nadie referencia, después lo que lo
 * referencia. Si alguna vez hay un ciclo de claves foráneas, esas tablas van
 * al final y se avisa — habría que restaurarlas con las restricciones
 * diferidas.
 */
function ordenar(tablas) {
  const pendientes = new Map(tablas.map((t) => [t.tabla, new Set(t.depende)]));
  const orden = [];
  while (pendientes.size > 0) {
    const listas = [...pendientes]
      .filter(([, deps]) => [...deps].every((d) => !pendientes.has(d)))
      .map(([t]) => t)
      .sort();
    if (listas.length === 0) {
      const ciclo = [...pendientes.keys()].sort();
      console.warn(`  AVISO · dependencias en ciclo, van al final: ${ciclo.join(", ")}`);
      orden.push(...ciclo);
      break;
    }
    for (const t of listas) {
      orden.push(t);
      pendientes.delete(t);
    }
  }
  return orden;
}

/**
 * Trae una tabla entera, paginando EN ORDEN DE CLAVE PRIMARIA. Sin `order`,
 * PostgREST no garantiza que la página 2 empiece donde acabó la 1.
 */
async function traer(tabla, pk) {
  const orden = pk.length > 0 ? `&order=${pk.map(encodeURIComponent).join(",")}` : "";
  const filas = [];
  for (let desde = 0; ; desde += PAGINA) {
    const r = await fetch(`${URL_BASE}/rest/v1/${encodeURIComponent(tabla)}?select=*${orden}`, {
      headers: { ...CABECERAS, Range: `${desde}-${desde + PAGINA - 1}` },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    const lote = await r.json();
    filas.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return filas;
}

async function contar(tabla) {
  const [{ n }] = await sql(`select count(*)::int as n from public.${ident(tabla)}`);
  return n;
}

/** Deja apuntado en la base cómo fue. Si esto falla, la copia sigue valiendo. */
async function apuntar(r) {
  try {
    await sql(`
      insert into public.respaldos (ok, tablas, filas, archivos, bytes_archivos, equipo, detalle)
      values (${r.ok}, ${r.tablas}, ${r.filas}, ${r.archivos}, ${r.bytes},
              ${literal(hostname())}, ${r.detalle ? literal(r.detalle) : "null"})`);
  } catch (e) {
    console.warn(`  (no se pudo apuntar la copia en la base: ${e instanceof Error ? e.message : e})`);
  }
}

const ahora = new Date();
const sello = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Lima",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
})
  .format(ahora)
  .replace(" ", "-")
  .replace(":", "");
const destino = join(RAIZ, "documentosrodamiento", "respaldos", sello);
mkdirSync(destino, { recursive: true });

console.log(`Copia de seguridad → documentosrodamiento/respaldos/${sello}`);
console.log(`Proyecto: ${REF}\n`);

const manifiesto = {
  fecha: ahora.toISOString(),
  proyecto: REF,
  tablas: {},
  archivos: {},
  omitidas: NUNCA,
};
const errores = [];
let total = 0;

try {
  // 1 · Las tablas, todas las que haya.
  const tablas = (await catalogo()).filter((t) => !NUNCA.includes(t.tabla));
  const porNombre = new Map(tablas.map((t) => [t.tabla, t]));
  const orden = ordenar(tablas);
  console.log(`Tablas (${orden.length})`);

  for (const tabla of orden) {
    const { pk } = porNombre.get(tabla);
    try {
      // Si alguien escribe mientras se copia, el recuento no cuadra: se
      // repite una vez antes de darlo por fallo.
      let filas = await traer(tabla, pk);
      let enBase = await contar(tabla);
      if (filas.length !== enBase) {
        filas = await traer(tabla, pk);
        enBase = await contar(tabla);
      }
      if (filas.length !== enBase) {
        throw new Error(`copiadas ${filas.length}, en la base ${enBase}`);
      }
      writeFileSync(join(destino, `${tabla}.json`), JSON.stringify(filas));
      manifiesto.tablas[tabla] = filas.length;
      total += filas.length;
      console.log(`  ${tabla.padEnd(30)} ${String(filas.length).padStart(6)}${pk.length ? "" : "  (sin clave primaria)"}`);
    } catch (e) {
      errores.push(`${tabla}: ${e instanceof Error ? e.message : e}`);
      console.error(`  ${tabla.padEnd(30)} ERROR · ${e instanceof Error ? e.message : e}`);
    }
  }
  writeFileSync(join(destino, "orden.json"), JSON.stringify(orden, null, 2));

  // 2 · Las cuentas de acceso. SIN el hash de la contraseña: al restaurar,
  // cada uno pone una nueva. Sin estas filas, `perfiles` no se puede
  // restaurar, porque su id ES el de la cuenta.
  const cuentas = await sql(`
    select id, email, phone, created_at, email_confirmed_at, banned_until,
           raw_app_meta_data, raw_user_meta_data
    from auth.users order by created_at`);
  writeFileSync(join(destino, "_cuentas.json"), JSON.stringify(cuentas, null, 2));
  manifiesto.cuentas = cuentas.length;
  console.log(`\nCuentas de acceso: ${cuentas.length} (sin contraseñas)`);

  // 3 · Los archivos de Storage, con su ruta tal cual.
  const objetos = await sql(`
    select bucket_id, name, coalesce((metadata->>'size')::bigint, 0) as bytes
    from storage.objects order by bucket_id, name`);
  console.log(`Archivos: ${objetos.length}`);
  for (const o of objetos) {
    try {
      const ruta = o.name.split("/").map(encodeURIComponent).join("/");
      const r = await fetch(`${URL_BASE}/storage/v1/object/${o.bucket_id}/${ruta}`, {
        headers: CABECERAS,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const datos = Buffer.from(await r.arrayBuffer());
      const archivo = join(destino, "_archivos", o.bucket_id, ...o.name.split("/"));
      mkdirSync(dirname(archivo), { recursive: true });
      writeFileSync(archivo, datos);
      const b = (manifiesto.archivos[o.bucket_id] ??= { archivos: 0, bytes: 0 });
      b.archivos += 1;
      b.bytes += datos.length;
      console.log(`  ${o.bucket_id}/${o.name}  ${Math.ceil(datos.length / 1024)} KB`);
    } catch (e) {
      errores.push(`archivo ${o.bucket_id}/${o.name}: ${e instanceof Error ? e.message : e}`);
      console.error(`  ${o.bucket_id}/${o.name} ERROR · ${e instanceof Error ? e.message : e}`);
    }
  }

  // 4 · El esquema VIVO: funciones, vistas, disparadores y políticas tal como
  // están en la base. Las migraciones dicen lo que se quiso aplicar; esto dice
  // lo que hay.
  const funciones = await sql(`
    select pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind in ('f', 'p')
    order by p.proname, pg_get_function_identity_arguments(p.oid)`);
  const vistas = await sql(`
    select c.relname as nombre, c.relkind as tipo, pg_get_viewdef(c.oid, true) as def
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('v', 'm') order by 1`);
  const disparadores = await sql(`
    select pg_get_triggerdef(t.oid) as def
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal order by c.relname, t.tgname`);
  const politicas = await sql(`
    select tablename, policyname, cmd, roles::text as roles, qual, with_check
    from pg_policies where schemaname = 'public' order by 1, 2`);
  const esquema = [
    `-- Esquema vivo de ${REF}, ${ahora.toISOString()}`,
    "-- NO es una migración: es la foto de lo que había, para comparar.\n",
    "-- ===== Vistas =====",
    ...vistas.map((v) => `create or replace ${v.tipo === "m" ? "materialized " : ""}view public.${ident(v.nombre)} as\n${v.def}\n`),
    "-- ===== Funciones =====",
    ...funciones.map((f) => `${f.def};\n`),
    "-- ===== Disparadores =====",
    ...disparadores.map((d) => `${d.def};`),
    "\n-- ===== Políticas =====",
    ...politicas.map(
      (p) =>
        `-- ${p.tablename} · ${p.policyname} · ${p.cmd} · ${p.roles}\n--   using: ${p.qual ?? "—"}\n--   check: ${p.with_check ?? "—"}`,
    ),
  ].join("\n");
  writeFileSync(join(destino, "_esquema.sql"), esquema);
  manifiesto.esquema = {
    funciones: funciones.length,
    vistas: vistas.length,
    disparadores: disparadores.length,
    politicas: politicas.length,
  };
  console.log(
    `Esquema: ${funciones.length} funciones, ${vistas.length} vistas, ${disparadores.length} disparadores, ${politicas.length} políticas`,
  );
} catch (e) {
  errores.push(e instanceof Error ? e.message : String(e));
  console.error(`\nERROR · ${e instanceof Error ? e.message : e}`);
}

manifiesto.errores = errores;
writeFileSync(join(destino, "manifiesto.json"), JSON.stringify(manifiesto, null, 2));

const archivos = Object.values(manifiesto.archivos).reduce((s, b) => s + b.archivos, 0);
const bytes = Object.values(manifiesto.archivos).reduce((s, b) => s + b.bytes, 0);
const nTablas = Object.keys(manifiesto.tablas).length;
await apuntar({
  ok: errores.length === 0,
  tablas: nTablas,
  filas: total,
  archivos,
  bytes,
  detalle: errores.length ? errores.join("\n").slice(0, 2000) : null,
});

console.log(`\n${total} filas en ${nTablas} tablas, ${archivos} archivos.`);
if (errores.length > 0) {
  console.error(`\n${errores.length} fallo(s). La copia está INCOMPLETA:`);
  for (const e of errores) console.error(`  · ${e}`);
  process.exit(1);
}
console.log("Copia completa y comprobada: cada tabla cuadra con su recuento en la base.");
