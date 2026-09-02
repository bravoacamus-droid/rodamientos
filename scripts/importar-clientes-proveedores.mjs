/**
 * Carga el maestro de clientes y proveedores que mandó Willy el 02/09.
 *
 *     node scripts/importar-clientes-proveedores.mjs            ← solo informa
 *     node scripts/importar-clientes-proveedores.mjs --aplicar  ← escribe
 *
 * ---------------------------------------------------------------------------
 * Por qué es un script y no una migración
 * ---------------------------------------------------------------------------
 * Son 203 filas con la razón social, el RUC y la dirección de los clientes y
 * los proveedores reales de Rodatech. Eso es información comercial del
 * cliente: `documentosrodamiento/` está en `.gitignore` justo por esto, y una
 * migración con esas filas dentro las metería en el repositorio para siempre.
 *
 * El precio es que esto no se aplica solo al levantar una base nueva. Es el
 * precio correcto.
 *
 * ---------------------------------------------------------------------------
 * Qué NO hace
 * ---------------------------------------------------------------------------
 * **No pisa nada de lo que ya está en la base.** De los 100 clientes del
 * Excel, 36 ya existían —entraron con el histórico de ventas— y sus nombres
 * coinciden letra por letra. De esos solo se completa el `ubigeo_codigo` si
 * está vacío. Todo lo demás se deja como está: alguien puede haberlo corregido
 * a mano, y una carga que machaca correcciones se convierte en una carga que
 * nadie se atreve a repetir.
 *
 * **No inventa un documento.** Un RUC que no pasa el dígito verificador no se
 * guarda: la fila entra como `SIN_DOC` con el número que vino anotado en
 * `notas`, para que se pueda arreglar mirando el original. Guardar un RUC
 * inválido es peor que no tenerlo — acabaría en una factura.
 *
 * ---------------------------------------------------------------------------
 * El ubigeo, que es la parte que más valor añade
 * ---------------------------------------------------------------------------
 * Las direcciones vienen de SUNAT y terminan en
 * «… DISTRITO - PROVINCIA - DEPARTAMENTO». Nadie lo había resuelto nunca: los
 * 37 clientes que ya estaban tienen `ubigeo_codigo` en null. Hace falta para
 * la guía de remisión electrónica, que sin el ubigeo del punto de llegada no
 * se puede emitir.
 *
 * Se resuelven 200 de 203 contra el padrón (037). Los tres que no, se dicen.
 */

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs");

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGEN = join(RAIZ, "documentosrodamiento", "LISTA DE CLIENTES Y PROVEEDORES.xlsx");

const APLICAR = process.argv.includes("--aplicar");

// ---------------------------------------------------------------------------
// Credenciales
// ---------------------------------------------------------------------------
function cargarEnv() {
  const ruta = join(RAIZ, ".env.local");
  if (!existsSync(ruta)) {
    console.error("No encuentro .env.local. Sin credenciales no hay carga.");
    process.exit(1);
  }
  for (const linea of readFileSync(ruta, "utf8").split(/\r?\n/)) {
    const l = linea.trim();
    if (!l || l.startsWith("#")) continue;
    const i = l.indexOf("=");
    if (i === -1) continue;
    let v = l.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(l.slice(0, i).trim() in process.env)) process.env[l.slice(0, i).trim()] = v;
  }
}

cargarEnv();
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const LLAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !LLAVE) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local.");
  process.exit(1);
}
const CABECERAS = {
  apikey: LLAVE,
  Authorization: `Bearer ${LLAVE}`,
  "Content-Type": "application/json",
};

async function traer(tabla, columnas) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const r = await fetch(`${URL_BASE}/rest/v1/${tabla}?select=${columnas}`, {
      headers: { ...CABECERAS, Range: `${desde}-${desde + 999}` },
    });
    if (!r.ok) throw new Error(`${tabla}: ${r.status} ${await r.text()}`);
    const lote = await r.json();
    filas.push(...lote);
    if (lote.length < 1000) return filas;
  }
}

async function insertar(tabla, filas) {
  // De 100 en 100: un solo POST con 203 filas es una transacción larga y, si
  // falla una, no se sabe cuál sin volver a empezar.
  for (let i = 0; i < filas.length; i += 100) {
    const lote = filas.slice(i, i + 100);
    const r = await fetch(`${URL_BASE}/rest/v1/${tabla}`, {
      method: "POST",
      headers: { ...CABECERAS, Prefer: "return=minimal" },
      body: JSON.stringify(lote),
    });
    if (!r.ok) throw new Error(`insert ${tabla}: ${r.status} ${await r.text()}`);
  }
}

async function parchear(tabla, id, campos) {
  const r = await fetch(`${URL_BASE}/rest/v1/${tabla}?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...CABECERAS, Prefer: "return=minimal" },
    body: JSON.stringify(campos),
  });
  if (!r.ok) throw new Error(`patch ${tabla}: ${r.status} ${await r.text()}`);
}

// ---------------------------------------------------------------------------
// Reglas puras. Las mismas que la aplicación, a propósito.
// ---------------------------------------------------------------------------

/** RUC peruano: 11 dígitos y dígito verificador módulo 11. */
function rucValido(ruc) {
  if (!/^\d{11}$/.test(ruc)) return false;
  if (!/^(10|15|17|20)/.test(ruc)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let suma = 0;
  for (let i = 0; i < 10; i++) suma += Number(ruc[i]) * pesos[i];
  const resto = 11 - (suma % 11);
  return (resto === 10 ? 0 : resto === 11 ? 1 : resto) === Number(ruc[10]);
}

/**
 * El código, igual que lo arma la aplicación.
 *
 * Tiene que coincidir con `codigoDeCliente` y `codigoDeProveedor`, que
 * viven en el `dominio/documento.ts` de cada módulo. Si divergieran, el
 * mismo proveedor dado de alta desde la pantalla generaría un código
 * distinto del que puso esta carga y el UNIQUE dejaría de protegerlo.
 */
function codigoDe(tipo, numero, razonSocial, prefijoVacio) {
  if (numero) return `${tipo}-${numero}`;
  const raiz = razonSocial
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16);
  return raiz === "" ? prefijoVacio : `SD-${raiz}`;
}

const norm = (s) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toUpperCase()
    // Los paréntesis del padrón de SUNAT: «PUEBLO LIBRE (MAGDALENA VIEJA)».
    .replace(/\(.*?\)/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

/** SUNAT escribe el Callao como «PROV. CONST. DEL CALLAO»; el padrón, «Callao». */
const alias = (s) => (s === "PROV CONST DEL CALLAO" ? "CALLAO" : s);

/**
 * El ubigeo que hay al final de una dirección de SUNAT.
 *
 * El distrito NO se corta por el último punto: hay direcciones con numeración
 * del tipo «NRO. 441 - 447)» que meten puntos y guiones por medio y la
 * partirían mal. Se prueba en cambio qué distrito de esa provincia TERMINA la
 * cadena, y gana el más largo — «SAN JUAN DE LURIGANCHO» antes que «SAN JUAN».
 */
function ubigeoDe(direccion, porZona) {
  const partes = String(direccion ?? "").split(" - ");
  if (partes.length < 3) return null;
  const zona = porZona.get(`${alias(norm(partes.at(-1)))}|${alias(norm(partes.at(-2)))}`);
  if (!zona) return null;

  const resto = " " + norm(partes.slice(0, -2).join(" "));
  let mejor = null;
  for (const d of zona) {
    if (resto.endsWith(" " + d.distrito) && (!mejor || d.distrito.length > mejor.distrito.length)) {
      mejor = d;
    }
  }
  return mejor?.codigo ?? null;
}

const texto = (v) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (v.result !== undefined) return String(v.result);
    if (v.text !== undefined) return String(v.text);
    if (v.richText) return v.richText.map((t) => t.text).join("");
  }
  return String(v);
};

// ---------------------------------------------------------------------------
// Lectura del Excel
// ---------------------------------------------------------------------------
function leerHoja(wb, nombre) {
  const ws = wb.getWorksheet(nombre);
  if (!ws) throw new Error(`El Excel no trae la hoja «${nombre}».`);
  const filas = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const f = ws.getRow(r);
    const fila = {
      fila: r,
      nombre: texto(f.getCell(2).value).trim(),
      doc: texto(f.getCell(4).value).trim(),
      direccion: texto(f.getCell(6).value).trim(),
    };
    if (fila.nombre) filas.push(fila);
  }
  return filas;
}

/**
 * Deja una hoja lista para insertar: sin repetidos y con el documento juzgado.
 *
 * El repetido gana el PRIMERO. No es arbitrario: el Excel viene ordenado por
 * el ITEM de Willy, así que el primero es el que él escribió antes, y las
 * variantes posteriores suelen ser el mismo nombre peor escrito
 * («ESTAMPAD METALICOS» sin el punto).
 */
function preparar(filas, porZona, incidencias) {
  const vistos = new Map();
  const salida = [];

  for (const f of filas) {
    const tieneRuc = rucValido(f.doc);
    if (f.doc && !tieneRuc) {
      incidencias.push(
        `fila ${f.fila} · ${f.nombre} · el documento «${f.doc}» no es un RUC válido; entra SIN_DOC y el número queda en notas`,
      );
    }
    // Venir sin documento tampoco es un error —un proveedor del exterior no
    // tiene RUC— pero se dice: es una fila que se queda sin clave estable, y
    // conviene saber cuál es.
    if (!f.doc) {
      incidencias.push(`fila ${f.fila} · ${f.nombre} · viene sin documento; entra como SIN_DOC`);
    }

    const clave = tieneRuc ? f.doc : `sd:${norm(f.nombre)}`;
    const previo = vistos.get(clave);
    if (previo) {
      incidencias.push(
        `fila ${f.fila} · repetido de la fila ${previo.fila} (${previo.nombre}) · se queda el primero`,
      );
      continue;
    }
    vistos.set(clave, f);

    const ubigeo = ubigeoDe(f.direccion, porZona);
    if (!ubigeo) {
      incidencias.push(
        `fila ${f.fila} · ${f.nombre} · sin ubigeo: la dirección no trae distrito reconocible («${f.direccion.slice(-45)}»)`,
      );
    }

    salida.push({
      fila: f.fila,
      razon_social: f.nombre,
      // Si la celda del documento venía VACÍA. No es lo mismo que traer uno
      // ilegible: lo primero delata a un proveedor del exterior, lo segundo
      // es una errata de tecleo en un proveedor de Lima como cualquier otro.
      sinDocumento: f.doc === "",
      tipo_documento: tieneRuc ? "RUC" : "SIN_DOC",
      numero_documento: tieneRuc ? f.doc : null,
      direccion: f.direccion && f.direccion !== "-" ? f.direccion : null,
      ubigeo_codigo: ubigeo,
      notas: tieneRuc || !f.doc ? null : `Documento según el maestro de Willy: ${f.doc}. No pasa el dígito verificador; confirmar con él.`,
    });
  }

  return salida;
}

// ---------------------------------------------------------------------------
// Carga
// ---------------------------------------------------------------------------
async function main() {
  if (!existsSync(ORIGEN)) {
    console.error(`No encuentro el Excel:\n  ${ORIGEN}`);
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(ORIGEN);

  const padron = await traer("ubigeo", "codigo,departamento,provincia,distrito");
  const porZona = new Map();
  for (const u of padron) {
    const k = `${norm(u.departamento)}|${norm(u.provincia)}`;
    porZona.set(k, [...(porZona.get(k) ?? []), { codigo: u.codigo, distrito: norm(u.distrito) }]);
  }

  const incidencias = { clientes: [], proveedores: [] };
  const clientes = preparar(leerHoja(wb, "CLIENTES"), porZona, incidencias.clientes);
  const proveedores = preparar(leerHoja(wb, "PROVEEDORES"), porZona, incidencias.proveedores);

  console.log(`Proyecto: ${process.env.SUPABASE_PROJECT_REF ?? "(sin ref)"}`);
  console.log(`Modo:     ${APLICAR ? "APLICAR (escribe)" : "simulación (no escribe nada)"}\n`);

  await cargar("clientes", clientes, incidencias.clientes, (r) => ({
    codigo: codigoDe(r.tipo_documento, r.numero_documento, r.razon_social, "SD-CLIENTE"),
    tipo_documento: r.tipo_documento,
    numero_documento: r.numero_documento,
    razon_social: r.razon_social,
    direccion: r.direccion,
    ubigeo_codigo: r.ubigeo_codigo,
    notas: r.notas,
  }));

  await cargar("proveedores", proveedores, incidencias.proveedores, (r) => {
    // Se marca como importación al que viene SIN NINGÚN documento, no al
    // que trae uno que no valida. El único del maestro es FORUN
    // TRANSMISSION, de Shanghái, y marcarlo así es lo que hace que la
    // compra le pida tracking y courier en vez de una factura con IGV.
    //
    // La distinción no es teórica: RG CORPORATION S.A.C. tiene la dirección
    // en Lima y un RUC mal tecleado. Tratarlo de importador por eso sería
    // inventarse un dato a partir de una errata.
    const importado = r.sinDocumento;
    return {
      codigo: codigoDe(r.tipo_documento, r.numero_documento, r.razon_social, "SD-PROVEEDOR"),
      tipo_documento: r.tipo_documento,
      numero_documento: r.numero_documento,
      razon_social: r.razon_social,
      tipo: importado ? "importacion" : "local",
      // El país no se adivina de la dirección: solo se cambia cuando NO hay
      // RUC peruano, que es la única señal fiable que trae este archivo.
      pais: importado ? "Exterior" : "Perú",
      direccion: r.direccion,
      ubigeo_codigo: r.ubigeo_codigo,
      // 15 días para lo de fuera, el mismo plazo que usa la cotización para
      // «exterior» (migración 040). Lo local se queda en el 3 por defecto.
      lead_time_dias: importado ? 15 : 3,
      notas: r.notas,
    };
  });
}

async function cargar(tabla, filas, incidencias, aFila) {
  const existentes = await traer(tabla, "id,codigo,numero_documento,razon_social,ubigeo_codigo");
  const porDoc = new Map(existentes.filter((e) => e.numero_documento).map((e) => [e.numero_documento, e]));
  const porCodigo = new Map(existentes.map((e) => [e.codigo, e]));

  const nuevas = [];
  const completar = [];
  let intactas = 0;

  for (const r of filas) {
    const preparada = aFila(r);
    // Por documento cuando lo hay —es la clave de verdad— y por código
    // cuando no, que es el único asidero de una fila sin RUC.
    const yaEsta =
      (r.numero_documento ? porDoc.get(r.numero_documento) : undefined) ??
      porCodigo.get(preparada.codigo);

    if (!yaEsta) {
      nuevas.push(preparada);
      continue;
    }
    // Ya existe: solo se completa el hueco del ubigeo. Nada más se toca.
    if (!yaEsta.ubigeo_codigo && preparada.ubigeo_codigo) {
      completar.push({ id: yaEsta.id, razon_social: yaEsta.razon_social, ubigeo_codigo: preparada.ubigeo_codigo });
    } else {
      intactas++;
    }
  }

  console.log(`── ${tabla.toUpperCase()} ${"─".repeat(50 - tabla.length)}`);
  console.log(`   en el Excel, ya sin repetidos:  ${filas.length}`);
  console.log(`   ya estaban y se dejan igual:    ${intactas}`);
  console.log(`   ya estaban, se les pone ubigeo: ${completar.length}`);
  console.log(`   se dan de alta:                 ${nuevas.length}`);
  console.log(`   con ubigeo resuelto:            ${filas.filter((f) => f.ubigeo_codigo).length} de ${filas.length}`);

  if (incidencias.length) {
    console.log(`\n   Incidencias (${incidencias.length}):`);
    for (const i of incidencias) console.log(`     · ${i}`);
  }

  // Dos filas distintas que generaran el mismo código chocarían contra
  // `ux_*_codigo` a mitad de un lote y dejarían media carga hecha. Mejor
  // saberlo antes de escribir nada.
  const cuenta = new Map();
  for (const n of nuevas) cuenta.set(n.codigo, (cuenta.get(n.codigo) ?? 0) + 1);
  const choques = [...cuenta].filter(([, n]) => n > 1).map(([c]) => c);
  if (choques.length) {
    console.error(`\n   ABORTA: estos códigos saldrían repetidos: ${choques.join(", ")}`);
    process.exit(1);
  }

  if (!APLICAR) {
    console.log(`\n   [simulación] no se ha escrito nada. Añade --aplicar.\n`);
    return;
  }

  if (nuevas.length) await insertar(tabla, nuevas);
  for (const c of completar) await parchear(tabla, c.id, { ubigeo_codigo: c.ubigeo_codigo });
  console.log(`\n   Hecho: ${nuevas.length} de alta, ${completar.length} completadas.\n`);
}

await main();
