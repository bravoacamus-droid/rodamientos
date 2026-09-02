#!/usr/bin/env node
/**
 * Revisa la carpeta de migraciones sin tocar la base.
 *
 * Existe porque el orden de las migraciones es su única garantía: se aplican
 * por nombre, en orden alfabético, y una sola vez cada una. Dos archivos con
 * el mismo número rompen eso en silencio — se aplica uno de los dos, el que
 * el sistema de archivos devuelva primero, y el otro se queda fuera sin que
 * nadie vea un error.
 *
 * No es hipotético. Este repositorio tuvo hasta el 02/09 una segunda carpeta
 * `apps/demo/supabase/migrations` numerada del 001 al 015 (§0.8), y en este
 * proyecto es normal que dos hilos de trabajo distintos escriban la migración
 * siguiente el mismo día: los dos la llaman «055».
 *
 * Corre en CI, donde no hay base de datos, y en `pnpm verificar`.
 */
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const CARPETA = join(RAIZ, "supabase", "migrations");

/** `001_extensiones.sql`: tres dígitos, guion bajo, minúsculas y guiones bajos. */
const NOMBRE = /^(\d{3})_[a-z0-9_]+\.sql$/;

const problemas = [];
const archivos = readdirSync(CARPETA).filter((f) => f.endsWith(".sql")).sort();

if (archivos.length === 0) {
  problemas.push("No hay ninguna migración en supabase/migrations.");
}

const porNumero = new Map();

for (const archivo of archivos) {
  const m = NOMBRE.exec(archivo);
  if (!m) {
    problemas.push(
      `${archivo} · el nombre no encaja con NNN_descripcion.sql (tres dígitos, ` +
        `minúsculas y guiones bajos). Se aplican en orden alfabético, así que ` +
        `el nombre ES el orden.`,
    );
    continue;
  }
  const numero = m[1];
  const yaHabia = porNumero.get(numero);
  if (yaHabia) {
    problemas.push(
      `${numero} está dos veces: ${yaHabia} y ${archivo}. Se aplican por ` +
        `nombre y una sola vez; con el número repetido una de las dos se ` +
        `queda sin aplicar y nadie ve un error. Renumera la más nueva.`,
    );
  } else {
    porNumero.set(numero, archivo);
  }
}

// Los huecos NO son un problema: una migración que se descarta antes de
// aplicarse deja su número libre, y renumerar las de después cambiaría
// archivos ya aplicados en la base del cliente. Solo se avisa.
const numeros = [...porNumero.keys()].map(Number).sort((a, b) => a - b);
const huecos = [];
for (let n = 1; n < (numeros[numeros.length - 1] ?? 0); n++) {
  if (!numeros.includes(n)) huecos.push(String(n).padStart(3, "0"));
}

if (problemas.length > 0) {
  console.error(`\n${problemas.length} problema(s) en supabase/migrations:\n`);
  for (const p of problemas) console.error(`  · ${p}`);
  console.error("");
  process.exit(1);
}

const detalle = huecos.length > 0 ? ` (huecos, que no estorban: ${huecos.join(", ")})` : "";
console.log(
  `${archivos.length} migraciones, numeración limpia hasta la ${
    porNumero.get(String(numeros[numeros.length - 1]).padStart(3, "0")) ?? "?"
  }${detalle}`,
);
