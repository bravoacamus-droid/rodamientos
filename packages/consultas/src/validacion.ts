/**
 * Validación local de documentos peruanos. SIN NINGÚN IMPORT.
 *
 * Ese "sin ningún import" es el punto del archivo, no un detalle.
 *
 * `rucValido` vivía dentro de `ruc.ts`, junto a `consultarRuc`. Y `ruc.ts`
 * importa `./proveedor`, que importa `node:crypto` para firmar la clave de
 * caché. Resultado: cualquier componente de navegador que solo quisiera
 * comprobar un dígito verificador arrastraba el cliente HTTP, la caché y un
 * módulo de Node al bundle — y el build reventaba con
 * `UnhandledSchemeError: Reading from "node:crypto"`.
 *
 * Poner `sideEffects: false` y exportar subrutas no alcanzó: webpack resuelve
 * el grafo completo antes de poder podarlo, así que el import de arriba de
 * `ruc.ts` se sigue mirando aunque nadie use `consultarRuc`.
 *
 * La separación real es la única que funciona, y además es la correcta: una
 * cuenta aritmética no tiene por qué saber que existe la red. `ruc.ts` y
 * `dni.ts` reexportan desde aquí, así que la API pública del paquete no
 * cambia.
 */

/**
 * Prefijos de RUC que SUNAT emite.
 *
 * 10 = persona natural con negocio · 15 y 17 = casos históricos que siguen
 * vigentes · 20 = persona jurídica. Cualquier otro par inicial es un número
 * inventado, y conviene rechazarlo ANTES de gastar una consulta de la cuota.
 */
const PREFIJOS_RUC = ["10", "15", "17", "20"];

/** Pesos del módulo 11 para los diez primeros dígitos del RUC. */
const PESOS_MODULO_11 = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/**
 * ¿Es un RUC válido?
 *
 * Once dígitos, prefijo emitido por SUNAT y dígito verificador módulo 11.
 * No dice si EXISTE —para eso hay que preguntarle a SUNAT—, dice si puede
 * existir.
 */
export function rucValido(valor: string): boolean {
  if (!/^\d{11}$/.test(valor)) return false;
  if (!PREFIJOS_RUC.includes(valor.slice(0, 2))) return false;

  let suma = 0;
  for (let i = 0; i < PESOS_MODULO_11.length; i += 1) {
    suma += (PESOS_MODULO_11[i] ?? 0) * Number(valor[i] ?? "0");
  }
  const resto = 11 - (suma % 11);
  const digitoVerificador = resto === 10 ? 0 : resto === 11 ? 1 : resto;
  return digitoVerificador === Number(valor[10]);
}

/**
 * ¿Es un DNI válido?
 *
 * Ocho dígitos y nada más. El DNI peruano lleva un carácter verificador, pero
 * no viaja con el número en la mayoría de los sistemas y exigirlo rechazaría
 * documentos buenos.
 */
export function dniValido(valor: string): boolean {
  return /^\d{8}$/.test(valor);
}
