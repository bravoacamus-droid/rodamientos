/**
 * Convierte un importe a su representación en letras (español),
 * para la leyenda obligatoria de SUNAT (código 1000: "MONTO EN LETRAS").
 * Ej: 1180.00 → "MIL CIENTO OCHENTA CON 00/100 SOLES".
 */

const UNIDADES = [
  "",
  "UNO",
  "DOS",
  "TRES",
  "CUATRO",
  "CINCO",
  "SEIS",
  "SIETE",
  "OCHO",
  "NUEVE",
];
const DIEZ_A_QUINCE = [
  "DIEZ",
  "ONCE",
  "DOCE",
  "TRECE",
  "CATORCE",
  "QUINCE",
];
const DECENAS = [
  "",
  "DIEZ",
  "VEINTE",
  "TREINTA",
  "CUARENTA",
  "CINCUENTA",
  "SESENTA",
  "SETENTA",
  "OCHENTA",
  "NOVENTA",
];
const CENTENAS = [
  "",
  "CIENTO",
  "DOSCIENTOS",
  "TRESCIENTOS",
  "CUATROCIENTOS",
  "QUINIENTOS",
  "SEISCIENTOS",
  "SETECIENTOS",
  "OCHOCIENTOS",
  "NOVECIENTOS",
];

/**
 * Lee una tabla de literales.
 *
 * Las tablas de arriba cubren todo el rango que se les pide, así que un hueco
 * sería un error de la tabla y no un dato inesperado. Conviene que reviente
 * ruidosamente: un importe en letras a medias en una factura es peor que un
 * fallo visible.
 */
function deTabla(tabla: readonly string[], i: number): string {
  const valor = tabla[i];
  if (valor === undefined) {
    throw new Error(`numeroALetras: índice ${i} fuera de la tabla`);
  }
  return valor;
}

function decenasALetras(n: number): string {
  if (n < 10) return deTabla(UNIDADES, n);
  if (n <= 15) return deTabla(DIEZ_A_QUINCE, n - 10);
  if (n < 20) return "DIECI" + deTabla(UNIDADES, n - 10);
  if (n === 20) return "VEINTE";
  if (n < 30) return "VEINTI" + deTabla(UNIDADES, n - 20);
  const d = Math.floor(n / 10);
  const u = n % 10;
  return u === 0
    ? deTabla(DECENAS, d)
    : `${deTabla(DECENAS, d)} Y ${deTabla(UNIDADES, u)}`;
}

function centenasALetras(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const centena = deTabla(CENTENAS, c);
  const rest = decenasALetras(resto);
  return resto === 0 ? centena : `${centena} ${rest}`;
}

function seccionALetras(n: number): string {
  if (n === 0) return "";
  if (n < 1000) return centenasALetras(n);
  const miles = Math.floor(n / 1000);
  const resto = n % 1000;
  const prefijoMiles =
    miles === 1 ? "MIL" : `${centenasALetras(miles)} MIL`;
  return resto === 0 ? prefijoMiles : `${prefijoMiles} ${centenasALetras(resto)}`;
}

/** Convierte un importe a la leyenda "… CON NN/100 SOLES". */
export function montoEnLetras(monto: number, moneda = "SOLES"): string {
  const entero = Math.floor(monto);
  const decimales = Math.round((monto - entero) * 100);
  const dec = decimales.toString().padStart(2, "0");

  let letras: string;
  if (entero === 0) {
    letras = "CERO";
  } else if (entero < 1_000_000) {
    letras = seccionALetras(entero);
  } else {
    const millones = Math.floor(entero / 1_000_000);
    const resto = entero % 1_000_000;
    const prefijo =
      millones === 1 ? "UN MILLON" : `${seccionALetras(millones)} MILLONES`;
    letras = resto === 0 ? prefijo : `${prefijo} ${seccionALetras(resto)}`;
  }

  return `${letras} CON ${dec}/100 ${moneda}`.replace(/\s+/g, " ").trim();
}
