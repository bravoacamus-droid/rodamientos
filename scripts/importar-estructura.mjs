/**
 * Lee el archivo que mandó el cliente ("ESTRUCTURA DE BASE DE PRODUCTOS.xlsx")
 * y emite la taxonomía como SQL, más un JSON que consume el generador de la
 * plantilla de carga.
 *
 * El archivo NO es un listado de productos: es el ÁRBOL DE CLASIFICACIÓN de
 * Rodatech, con solo 7 productos de ejemplo (las filas amarillas de la foto).
 * Tiene tres niveles, y el vocabulario del cliente manda:
 *
 *     FAMILIA        RODAMIENTO / CHUMACERA / ACCESORIOS
 *     SUB-FAMILIA    RIGIDO DE BOLAS / DE PIE / MANGUITO
 *     DESCRIPCION    RODAMIENTO RIGIDO DE BOLAS 1 HIL.   <- el TIPO
 *
 * Las celdas vienen combinadas: cuando FAMILIA o SUB-FAMILIA están vacías
 * heredan la de arriba. Cuando DESCRIPCION está vacía pero hay CODIGO, la
 * fila es un PRODUCTO que cuelga del último tipo declarado — que es
 * exactamente el caso que hace que varios productos compartan descripción y
 * solo se distingan por el código.
 *
 *     node scripts/importar-estructura.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs");

const ORIGEN = "docs/ESTRUCTURA DE BASE DE PRODUCTOS.xlsx";
const SQL_SALIDA = "supabase/migrations/008_taxonomia_rodatech.sql";
const JSON_SALIDA = "docs/taxonomia.json";

// Erratas de tipeo del archivo original. Se corrigen aquí y no a mano en el
// Excel para que el archivo del cliente quede intacto y este paso sea
// repetible si él manda una versión nueva.
const ERRATAS = new Map([
  [
    "RODAMIENTO DE RODILLOS ESF. PARA APLIC. VIVRATORIAS",
    "RODAMIENTO DE RODILLOS ESF. PARA APLIC. VIBRATORIAS",
  ],
  [
    "RODAMIENTO AXIAL DE RODILLO S ESFERICOS",
    "RODAMIENTO AXIAL DE RODILLOS ESFERICOS",
  ],
  [
    "CHUMACERA DE PAREDE DE BASE CIRCULAR",
    "CHUMACERA DE PARED DE BASE CIRCULAR",
  ],
  [
    "CHUMACERA DE PAREDE DE BASE TRIAUNGULAR",
    "CHUMACERA DE PARED DE BASE TRIANGULAR",
  ],
]);

// Prefijos de código por familia. Cortos porque se concatenan hasta el tercer
// nivel y `codigo` tiene tope de 20 caracteres.
const PREFIJO = new Map([
  ["RODAMIENTO", "ROD"],
  ["CHUMACERA", "CHU"],
  ["ACCESORIOS", "ACC"],
]);

// Rango de marcas diacríticas combinantes, construido sin escapes para que el
// archivo sea seguro de mover entre herramientas.
const COMBINANTES = new RegExp(
  "[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]",
  "g",
);
const sinTildes = (s) => s.normalize("NFD").replace(COMBINANTES, "");

/**
 * Siglas de una subfamilia.
 *
 * Con una sola palabra con contenido se toman hasta 6 letras; con varias, las
 * 3 primeras de cada una. La distinción no es estética: recortando siempre a 3
 * letras, "DE PARED" y "PARTIDA" daban las dos "PAR" y chocaban dentro de
 * CHUMACERA. Igual `codigosUnicos` cubre el caso general.
 */
function siglas(nombre) {
  const vacias = new Set([
    "DE", "DEL", "LA", "EL", "LOS", "LAS", "A", "Y", "CON", "SIN",
  ]);
  const palabras = sinTildes(nombre)
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((p) => p && !vacias.has(p));

  if (palabras.length === 0) return "GEN";
  if (palabras.length === 1) return palabras[0].slice(0, 6);
  return palabras.map((p) => p.slice(0, 3)).join("").slice(0, 6);
}

/**
 * Reparte códigos garantizando que no se repitan.
 *
 * Las siglas salen de los nombres del cliente, así que el día que agregue dos
 * subfamilias parecidas volverían a chocar. Sin esto, el choque no aparece
 * aquí: aparece al aplicar la migración, como un
 * "ON CONFLICT DO UPDATE command cannot affect row a second time" que no dice
 * ni qué fila fue.
 */
function codigosUnicos() {
  const usados = new Set();
  return (base) => {
    let codigo = base;
    let n = 2;
    while (usados.has(codigo)) {
      codigo = `${base}${n}`;
      n += 1;
    }
    usados.add(codigo);
    return codigo;
  };
}

const escapar = (s) => s.split("'").join("''");

function leerCelda(celda) {
  const v = celda.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
    if (v.result !== undefined) return String(v.result);
    if (v.text) return String(v.text);
    return "";
  }
  return String(v);
}

const main = async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(ORIGEN);
  const ws = wb.worksheets[0];

  const familias = new Map(); // nombre -> { codigo, orden, subfamilias: Map }
  const nuevoCodigo = codigosUnicos();
  const productos = [];
  let familiaActual = "";
  let subfamiliaActual = "";
  let tipoActual = "";

  for (let r = 3; r <= ws.rowCount; r += 1) {
    const fila = ws.getRow(r);
    const col = (n) => leerCelda(fila.getCell(n)).trim().replace(/ +/g, " ");

    const cruda = {
      codigo: col(1),
      familia: col(2),
      subfamilia: col(3),
      descripcion: col(4),
      marca: col(5),
      stock: col(6),
      stockMin: col(7),
      pc: col(8),
      pv: col(9),
      pm: col(10),
    };
    if (Object.values(cruda).every((v) => v === "")) continue;

    // Herencia de celdas combinadas.
    if (cruda.familia) familiaActual = cruda.familia.toUpperCase();
    if (cruda.subfamilia) subfamiliaActual = cruda.subfamilia.toUpperCase();
    if (!familiaActual || !subfamiliaActual) continue;

    if (cruda.descripcion) {
      const limpio = cruda.descripcion.toUpperCase();
      tipoActual = ERRATAS.get(limpio) ?? limpio;
    }
    if (!tipoActual) continue;

    // ---- registra el árbol ----
    if (!familias.has(familiaActual)) {
      const pref = PREFIJO.get(familiaActual);
      if (!pref) throw new Error(`Familia sin prefijo definido: ${familiaActual}`);
      familias.set(familiaActual, {
        codigo: pref,
        orden: familias.size + 1,
        subfamilias: new Map(),
      });
    }
    const fam = familias.get(familiaActual);

    if (!fam.subfamilias.has(subfamiliaActual)) {
      fam.subfamilias.set(subfamiliaActual, {
        codigo: nuevoCodigo(`${fam.codigo}-${siglas(subfamiliaActual)}`),
        orden: fam.subfamilias.size + 1,
        tipos: new Map(),
      });
    }
    const sub = fam.subfamilias.get(subfamiliaActual);

    if (!sub.tipos.has(tipoActual)) {
      const n = String(sub.tipos.size + 1).padStart(2, "0");
      sub.tipos.set(tipoActual, {
        codigo: `${sub.codigo}-${n}`,
        orden: sub.tipos.size + 1,
      });
    }

    // ---- fila de producto ----
    if (cruda.codigo) {
      productos.push({
        codigo: cruda.codigo,
        marca: cruda.marca.toUpperCase(),
        familia: familiaActual,
        subfamilia: subfamiliaActual,
        tipo: tipoActual,
        stock: Number(cruda.stock) || 0,
        stockMinimo: Number(cruda.stockMin) || 0,
        precioCompra: Number(cruda.pc) || 0,
        precioVenta: Number(cruda.pv) || 0,
        precioMinimo: Number(cruda.pm) || 0,
      });
    }
  }

  // ---------------------------------------------------------------- resumen
  let nSub = 0;
  let nTipo = 0;
  for (const f of familias.values()) {
    nSub += f.subfamilias.size;
    for (const s of f.subfamilias.values()) nTipo += s.tipos.size;
  }
  console.log(
    `familias=${familias.size}  subfamilias=${nSub}  tipos=${nTipo}  productos=${productos.length}`,
  );

  // Comprueba el markup que el cliente aplica sobre el costo.
  const markups = productos
    .filter((p) => p.precioCompra > 0 && p.precioVenta > 0)
    .map((p) => p.precioVenta / p.precioCompra);
  if (markups.length > 0) {
    console.log(
      `markup P.V./P.C.: ${Math.min(...markups).toFixed(4)} .. ${Math.max(...markups).toFixed(4)}`,
    );
  }
  const pisos = productos
    .filter((p) => p.precioCompra > 0 && p.precioMinimo > 0)
    .map((p) => p.precioMinimo / p.precioCompra);
  if (pisos.length > 0) {
    console.log(
      `P.M./P.C.:        ${Math.min(...pisos).toFixed(4)} .. ${Math.max(...pisos).toFixed(4)}`,
    );
  }

  // ------------------------------------------------------- códigos únicos
  // El UNIQUE de cada nivel es global, así que se comprueba global. Si algo se
  // repite, que reviente aquí con el nombre del culpable y no en la migración
  // con un mensaje que no dice qué fila fue.
  const duplicados = (etiqueta, pares) => {
    const vistos = new Map();
    const choques = [];
    for (const [codigo, nombre] of pares) {
      if (vistos.has(codigo)) choques.push(`${etiqueta} ${codigo}: "${vistos.get(codigo)}" y "${nombre}"`);
      else vistos.set(codigo, nombre);
    }
    return choques;
  };
  const paresFam = [...familias].map(([n, f]) => [f.codigo, n]);
  const paresSub = [];
  const paresTipo = [];
  for (const [, f] of familias) {
    for (const [sn, s] of f.subfamilias) {
      paresSub.push([s.codigo, sn]);
      for (const [tn, t] of s.tipos) paresTipo.push([t.codigo, tn]);
    }
  }
  const choques = [
    ...duplicados("familia", paresFam),
    ...duplicados("subfamilia", paresSub),
    ...duplicados("tipo", paresTipo),
  ];
  if (choques.length > 0) {
    throw new Error("Códigos repetidos:\n  - " + choques.join("\n  - "));
  }

  // ------------------------------------------------------------------- JSON
  const arbol = [...familias].map(([nombre, f]) => ({
    nombre,
    codigo: f.codigo,
    orden: f.orden,
    subfamilias: [...f.subfamilias].map(([sn, s]) => ({
      nombre: sn,
      codigo: s.codigo,
      orden: s.orden,
      tipos: [...s.tipos].map(([tn, t]) => ({
        nombre: tn,
        codigo: t.codigo,
        orden: t.orden,
      })),
    })),
  }));
  mkdirSync("docs", { recursive: true });
  writeFileSync(
    JSON_SALIDA,
    JSON.stringify({ familias: arbol, productos }, null, 2) + "\n",
  );

  // -------------------------------------------------------------------- SQL
  const L = [];
  L.push("-- ###########################################################################");
  L.push("-- 008 · TAXONOMÍA REAL DE RODATECH");
  L.push("-- ###########################################################################");
  L.push("--");
  L.push("-- GENERADO por scripts/importar-estructura.mjs a partir de");
  L.push(`-- ${ORIGEN}, el archivo que mandó el cliente el 21/08/2026.`);
  L.push("-- No editar a mano: volver a correr el script.");
  L.push("--");
  L.push(`-- ${familias.size} familias · ${nSub} subfamilias · ${nTipo} tipos`);
  L.push("--");
  L.push("-- Sustituye al árbol tentativo de 007_seed_maestros, que se dedujo de la");
  L.push("-- reunión. Este sale del propio cliente, así que manda este.");
  L.push("");
  L.push("set local search_path = public, extensions;");
  L.push("");

  L.push("insert into familias (codigo, nombre, orden) values");
  L.push(
    [...familias]
      .map(([n, f]) => `  ('${f.codigo}', '${escapar(n)}', ${f.orden})`)
      .join(",\n"),
  );
  L.push("on conflict (codigo) do update set nombre = excluded.nombre, orden = excluded.orden;");
  L.push("");

  L.push("insert into subfamilias (familia_id, codigo, nombre, orden)");
  L.push("select f.id, v.codigo, v.nombre, v.orden");
  L.push("from (values");
  const filasSub = [];
  for (const [fn, f] of familias) {
    void fn;
    for (const [sn, s] of f.subfamilias) {
      filasSub.push(`  ('${f.codigo}', '${s.codigo}', '${escapar(sn)}', ${s.orden})`);
    }
  }
  L.push(filasSub.join(",\n"));
  L.push(") as v(fam, codigo, nombre, orden)");
  L.push("join familias f on f.codigo = v.fam");
  L.push("on conflict (codigo) do update set nombre = excluded.nombre, orden = excluded.orden;");
  L.push("");

  L.push("insert into tipos (subfamilia_id, familia_id, codigo, nombre, orden)");
  L.push("select s.id, s.familia_id, v.codigo, v.nombre, v.orden");
  L.push("from (values");
  const filasTipo = [];
  for (const [, f] of familias) {
    for (const [, s] of f.subfamilias) {
      for (const [tn, t] of s.tipos) {
        filasTipo.push(`  ('${s.codigo}', '${t.codigo}', '${escapar(tn)}', ${t.orden})`);
      }
    }
  }
  L.push(filasTipo.join(",\n"));
  L.push(") as v(sub, codigo, nombre, orden)");
  L.push("join subfamilias s on s.codigo = v.sub");
  L.push("on conflict (codigo) do update set nombre = excluded.nombre, orden = excluded.orden;");
  L.push("");

  // Marcas que aparecen en las filas de ejemplo.
  //
  // `marcas` se identifica por `nombre_norm`, no por código: no tiene columna
  // `codigo`. Y casi todas ya vienen en 007_seed_maestros con su país y
  // segmento, así que esto es una red por si el archivo del cliente trae una
  // marca que la semilla no contempla — por eso `do nothing` y no `do update`,
  // que borraría los datos buenos de la semilla.
  const marcas = [...new Set(productos.map((p) => p.marca).filter(Boolean))].sort();
  if (marcas.length > 0) {
    L.push("-- Marcas vistas en las filas de ejemplo del archivo.");
    L.push("insert into marcas (nombre)");
    L.push("select v.nombre from (values");
    L.push(marcas.map((m) => `  ('${escapar(m)}')`).join(",\n"));
    L.push(") as v(nombre)");
    L.push("on conflict (nombre_norm) do nothing;");
    L.push("");
  }

  // Verificación: si el árbol no entra completo, que reviente aquí y no dos
  // módulos más adelante con un desplegable vacío.
  L.push("-- ---------------------------------------------------------------------");
  L.push("do $$");
  L.push("declare v_fam int; v_sub int; v_tip int;");
  L.push("begin");
  L.push("  select count(*) into v_fam from familias;");
  L.push("  select count(*) into v_sub from subfamilias;");
  L.push("  select count(*) into v_tip from tipos;");
  L.push("  raise notice 'Taxonomia: % familias, % subfamilias, % tipos', v_fam, v_sub, v_tip;");
  L.push(`  if v_fam < ${familias.size} then raise exception 'Faltan familias: % de ${familias.size}', v_fam; end if;`);
  L.push(`  if v_sub < ${nSub} then raise exception 'Faltan subfamilias: % de ${nSub}', v_sub; end if;`);
  L.push(`  if v_tip < ${nTipo} then raise exception 'Faltan tipos: % de ${nTipo}', v_tip; end if;`);
  L.push("end $$;");
  L.push("");

  writeFileSync(SQL_SALIDA, L.join("\n"));
  console.log(`escrito ${SQL_SALIDA}`);
  console.log(`escrito ${JSON_SALIDA}`);
};

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
