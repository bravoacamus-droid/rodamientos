/**
 * Configuración compartida del monorepo.
 *
 * Solo constantes y utilidades de entorno. Nada que dependa de React,
 * Supabase ni de un módulo de negocio concreto: este paquete lo importan
 * todos los demás, así que tiene que quedarse en el nivel más bajo.
 */

/** Moneda única del negocio. Willy cotiza y factura siempre en dólares. */
export const MONEDA = "USD" as const;

/** IGV vigente en Perú. */
export const IGV = 0.18;

/**
 * Unidades de medida que usa Rodatech, con su código del catálogo 03 de SUNAT.
 * Willy nombró exactamente estas cuatro en la reunión (11:56).
 */
export const UNIDADES = [
  { codigo: "NIU", etiqueta: "Unidad", abreviatura: "und" },
  { codigo: "MTR", etiqueta: "Metro", abreviatura: "m" },
  { codigo: "BX", etiqueta: "Caja", abreviatura: "caja" },
  { codigo: "SET", etiqueta: "Kit / Set", abreviatura: "kit" },
] as const;

export type CodigoUnidad = (typeof UNIDADES)[number]["codigo"];

/** Roles del ERP. El rol decide qué puede escribir, y se valida en Postgres. */
export const ROLES = [
  "gerencia",
  "admin",
  "ventas",
  "almacen",
  "compras",
  "cobranzas",
] as const;

export type Rol = (typeof ROLES)[number];

/** Roles con permiso de administración (configuración, usuarios, anulaciones). */
export const ROLES_ADMIN: readonly Rol[] = ["gerencia", "admin"];

/**
 * Lee una variable de entorno obligatoria y falla ruidosamente si no está.
 * Preferimos romper al arrancar antes que fallar a mitad de una emisión.
 */
export function requerirEnv(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) {
    throw new Error(
      `Falta la variable de entorno ${nombre}. Revisa .env.local — la plantilla está en .env.example.`,
    );
  }
  return valor;
}

/** Igual que requerirEnv pero devuelve undefined en vez de lanzar. */
export function envOpcional(nombre: string): string | undefined {
  return process.env[nombre] || undefined;
}

// ---------------------------------------------------------------------------
// Aritmética de dinero
// ---------------------------------------------------------------------------

/**
 * Los redondeos, aquí y en un solo sitio.
 *
 * Vivían duplicados en `cotizaciones/dominio/totales.ts` y en
 * `recepciones/dominio/costeo.ts`. La duplicación era deliberada —el barrel de
 * cotizaciones reexporta Server Components, así que importarlo desde el
 * constructor de recepciones, que corre en el navegador, rompía el build del
 * cliente— pero quedó anotada para resolverla al tercer módulo que los
 * necesitara. Compras es el tercero.
 *
 * Este paquete es el nivel más bajo del monorepo: no depende de React, ni de
 * Supabase, ni de ningún módulo de negocio, así que lo puede importar tanto un
 * Server Component como un componente de navegador.
 *
 * El `Number.EPSILON` no es adorno: sin él `Math.round(1.005 * 100) / 100` da
 * 1 en vez de 1.01, porque 1.005 no es representable en binario. Sobre una
 * columna de importes eso es un descuadre de céntimos que aparece semanas
 * después, sumando a mano.
 */
export const redondear2 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;

/** Redondeo a 4 decimales, para valores y costos unitarios. */
export const redondear4 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 10000) / 10000;

/** Redondeo a 6 decimales, para factores de prorrateo (`numeric(12,6)`). */
export const redondear6 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 1000000) / 1000000;

/**
 * Importe de una línea: cantidad × precio, redondeado a 2 decimales, con el
 * MISMO resultado que Postgres.
 *
 * `redondear2(cantidad * precio)` NO sirve, y esto no es teoría: en la base,
 * `round(3 * 1.005, 2)` da **3.02**; en JavaScript, `3 * 1.005` ya vale
 * 3.0149999999999997 antes de redondear nada, así que sale **3.01**. El medio
 * céntimo se pierde en la multiplicación, no en el redondeo, y por eso
 * `Number.EPSILON` no lo salva: la diferencia es mil veces mayor que él.
 *
 * Postgres calcula con `numeric`, que es aritmética decimal exacta. Aquí se
 * replica pasando a enteros: la base limita `cantidad` a 2 decimales y
 * `costo_unitario`/`valor_unitario` a 4, así que el producto exacto cabe en
 * 6 decimales y se puede hacer con enteros, que en coma flotante binaria sí
 * son exactos hasta 2^53.
 *
 * Importa porque este número es una columna GENERADA en la base
 * (`compra_items.importe`, `cotizacion_items.importe`). Si la pantalla y la
 * base no coinciden, el operador teclea una cosa, ve otra y se graba una
 * tercera — y en una cotización es justo la resta de céntimos que hace que
 * SUNAT observe un comprobante.
 */
export function importeExacto(cantidad: number, precio: number): number {
  return importeConDescuento(cantidad, precio, 0);
}

/**
 * Importe de una línea CON descuento, igual que lo calcula Postgres.
 *
 * Réplica exacta de la columna generada que comparten `cotizacion_items` y
 * `comprobante_items`:
 *
 *     round(cantidad * valor_unitario * (1 - descuento_pct / 100.0), 2)
 *
 * Y son TRES factores, no dos, que es lo que hace que no valga arreglarlo
 * sustituyendo la multiplicación: cada uno pierde su parte por el camino.
 *
 * Se hace con `BigInt` y no con enteros normales por una razón concreta. El
 * numerador exacto es `cantidad×100 · valor×10000 · (10000 − dscto×100)`, que
 * con valores del todo razonables —mil unidades a cien dólares con un 5 %—
 * ronda los 10^17. Por encima de 2^53 (unos 9·10^15) los enteros de JavaScript
 * dejan de ser exactos, y perder precisión en el paso que existe justamente
 * para no perderla sería absurdo. `BigInt` no tiene tope, y aquí se calculan
 * decenas de líneas, no millones: el coste no se nota.
 *
 * El redondeo es «medio hacia arriba», que es el de `round()` sobre `numeric`
 * en Postgres. `Math.round` de JavaScript hace lo mismo con positivos, pero
 * aquí se implementa a mano porque se opera sobre enteros grandes.
 */
export function importeConDescuento(
  cantidad: number,
  valorUnitario: number,
  descuentoPct: number,
): number {
  if (
    !Number.isFinite(cantidad) ||
    !Number.isFinite(valorUnitario) ||
    !Number.isFinite(descuentoPct)
  ) {
    return 0;
  }

  // Las escalas son las de las columnas: cantidad numeric(14,2),
  // valor_unitario numeric(14,4), descuento_pct numeric(5,2).
  const c = BigInt(Math.round(cantidad * 100));
  const v = BigInt(Math.round(valorUnitario * 10000));
  const d = BigInt(Math.round(descuentoPct * 100));

  // (1 − dscto/100) escalado a 1e4. El numerador queda a escala 1e10.
  const numerador = c * v * (10_000n - d);

  // Bajar de 1e10 a 1e2 es dividir entre 1e8, redondeando al más cercano.
  const DIVISOR = 100_000_000n;
  const negativo = numerador < 0n;
  const absoluto = negativo ? -numerador : numerador;

  const cociente = absoluto / DIVISOR;
  const resto = absoluto % DIVISOR;
  // El empate va hacia arriba, como `round()` de Postgres.
  const redondeado = resto * 2n >= DIVISOR ? cociente + 1n : cociente;

  return Number(negativo ? -redondeado : redondeado) / 100;
}
