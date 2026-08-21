/**
 * Validaciones y cálculos tributarios peruanos.
 *
 * Código propio (no dependemos de librerías de terceros para esto). Son reglas
 * estables: el dígito verificador del RUC y el redondeo del IGV no cambian.
 */

/**
 * Valida un RUC peruano (11 dígitos) incluyendo su dígito verificador (módulo 11).
 * SUNAT rechaza el comprobante si el RUC del emisor o del receptor es inválido,
 * así que conviene atajarlo antes de emitir.
 */
export function rucValido(ruc: string): boolean {
  if (!/^\d{11}$/.test(ruc)) return false;
  // Solo tipos de contribuyente reales empiezan por 10, 15, 17 o 20.
  const prefijo = ruc.slice(0, 2);
  if (!["10", "15", "17", "20"].includes(prefijo)) return false;

  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((acc, p, i) => acc + p * Number(ruc[i]), 0);
  const resto = 11 - (suma % 11);
  const dv = resto === 10 ? 0 : resto === 11 ? 1 : resto;
  return dv === Number(ruc[10]);
}

/** Valida un DNI peruano (8 dígitos). */
export function dniValido(dni: string): boolean {
  return /^\d{8}$/.test(dni);
}

/**
 * Construye el usuario que espera el web service: RUC + usuario SOL secundario
 * (p. ej. 20609715732MODDATOS).
 *
 * En el portal de SUNAT el usuario se ve solo como "MODDATOS", así que es
 * natural escribirlo así en el panel; pero enviado sin el RUC delante, SUNAT
 * responde "El Usuario ingresado no existe" —un error que no apunta a la causa
 * real—. Se normaliza aquí para que dé igual cómo se haya escrito.
 */
export function usuarioSolCompleto(ruc: string, usuario: string): string {
  const u = usuario.trim();
  const r = ruc.trim();
  return u.startsWith(r) ? u : `${r}${u}`;
}

/** Redondea a 2 decimales con redondeo aritmético (half-up), como espera SUNAT. */
export function redondear(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Desglosa un precio que YA incluye IGV en su base gravada e IGV.
 * En retail el precio de lista suele venir con IGV incluido.
 */
export function desglosarConIgv(
  totalConIgv: number,
  tasaIgv: number,
): { base: number; igv: number } {
  const base = redondear(totalConIgv / (1 + tasaIgv / 100));
  const igv = redondear(totalConIgv - base);
  return { base, igv };
}

/** Calcula el IGV sobre una base que NO lo incluye. */
export function igvSobreBase(base: number, tasaIgv: number): number {
  return redondear(base * (tasaIgv / 100));
}
