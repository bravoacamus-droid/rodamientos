/**
 * Lo que el selector de proveedor sabe decir sin preguntarle a nadie.
 *
 * Gemelo de `cotizaciones/dominio/cliente.ts`, y por el mismo reparto: el
 * ORDEN de los resultados lo decide Postgres (`buscar_proveedores`, migración
 * 033), donde están los índices; aquí vive qué se lee en cada fila y qué se
 * puede elegir, que es puro y se prueba sin base y sin React.
 *
 * Lo compartido —resaltar, reconocer un documento, contar días— está en
 * `lib/texto-busqueda.ts`. Vive aquí lo que solo vale para un proveedor: cómo
 * se paga, cuánto tarda y qué marcas trae.
 */

import { hace } from "@/lib/texto-busqueda";

/**
 * Un proveedor tal y como lo devuelven `buscar_proveedores` y
 * `proveedores_sugeridos`.
 *
 * Es un supraconjunto de los `ProveedorOpcion` que ya tenían compras y
 * recepciones cada uno por su lado: trae además `marcas`, `compras` y
 * `ultima_compra`, que son los tres datos que distinguen a dos proveedores de
 * nombre parecido.
 */
export interface ProveedorOpcion {
  id: string;
  codigo: string;
  razon_social: string;
  numero_documento: string | null;
  tipo_documento: string;
  /** `local` o `importado`. Decide si la compra lleva gastos de importación. */
  tipo: string;
  pais: string | null;
  direccion: string | null;
  contacto: string | null;
  telefono: string | null;
  whatsapp: string | null;
  email: string | null;
  dias_pago: number;
  lead_time_dias: number;
  activo: boolean;
  /** Las marcas que provee. Es como se le busca la mitad de las veces. */
  marcas: string[];
  /** Cuántas compras se le han hecho, sin contar las anuladas. */
  compras: number;
  /** Fecha `aaaa-mm-dd` de la última compra, o null si nunca. */
  ultima_compra: string | null;
}

/* ------------------------------------------------------------------ Estado */

/**
 * Por qué NO se puede comprar a este proveedor, o null si sí se puede.
 *
 * Un proveedor no tiene «bloqueado» como el cliente —no hay crédito que
 * vigilar en esta dirección—, así que el único impedimento es estar dado de
 * baja. Se devuelve el motivo y no un booleano por lo mismo que en clientes:
 * una fila que no se deja pulsar y no dice por qué parece una pantalla rota.
 */
export function motivoNoSeleccionable(
  proveedor: Pick<ProveedorOpcion, "activo">,
): string | null {
  if (!proveedor.activo) {
    return "Está dado de baja. Reactívalo en su ficha antes de comprarle.";
  }
  return null;
}

/**
 * Cómo se le paga y cuánto tarda, en una línea.
 *
 * Los dos datos juntos porque juntos se deciden: a quién pedirle algo urgente
 * es cuestión de `lead_time_dias`, y si conviene es cuestión de `dias_pago`.
 * Antes había que abrir la ficha del proveedor para ver cualquiera de los dos.
 */
export function resumenPago(
  proveedor: Pick<ProveedorOpcion, "dias_pago" | "lead_time_dias">,
): string {
  const pago = proveedor.dias_pago > 0 ? `Paga a ${proveedor.dias_pago} días` : "Al contado";
  if (proveedor.lead_time_dias <= 0) return pago;
  const entrega =
    proveedor.lead_time_dias === 1
      ? "entrega en 1 día"
      : `entrega en ${proveedor.lead_time_dias} días`;
  return `${pago} · ${entrega}`;
}

/**
 * Las marcas, recortadas a las que caben en una fila.
 *
 * Un distribuidor grande trae quince y no se pueden pintar todas sin que la
 * fila deje de leerse. Se enseñan las primeras y se dice cuántas quedan: «SKF,
 * FAG, NSK +12». Decir el número importa —es la diferencia entre «trae tres
 * marcas» y «trae quince»— y es justo lo que un recorte mudo se come.
 */
export function resumenMarcas(marcas: string[], cuantas = 3): string {
  if (marcas.length === 0) return "";
  if (marcas.length <= cuantas) return marcas.join(", ");
  return `${marcas.slice(0, cuantas).join(", ")} +${marcas.length - cuantas}`;
}

/* ------------------------------------------------------------- Cuánto hace */

/**
 * «Comprado ayer», «Comprado hace 3 meses», «Nunca se le compró».
 *
 * Mismo cálculo que el «Cotizado …» del selector de cliente; cambia el verbo,
 * que es lo único propio de esta pantalla.
 */
export function ultimaVez(fecha: string | null, hoy: string): string {
  if (!fecha) return "Nunca se le compró";
  return `Comprado ${hace(fecha, hoy)}`;
}
