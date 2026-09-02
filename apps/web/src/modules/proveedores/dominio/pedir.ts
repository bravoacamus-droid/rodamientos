/**
 * El proveedor tal como lo necesita la pantalla de pedir precio.
 *
 * Vive en `dominio/` y no junto a la consulta que lo produce por una razón
 * concreta: lo importan componentes de CLIENTE, y `api/catalogo.ts` es
 * `server-only`. Un `import type` desde el índice del módulo arrastró el
 * `server-only` al bundle una vez —le pasó a `Plantilla`, en mensajes— y
 * rompió el build sin que ni el typecheck ni el lint dijeran nada.
 */

/** Un proveedor al que tiene sentido pedirle precio de una lista de productos. */
export interface ProveedorParaPedir {
  id: string;
  razon_social: string;
  telefono: string | null;
  whatsapp: string | null;
  email: string | null;
  /** Cuántos de los productos pedidos le constan como que vende. */
  coincidencias: number;
  /** Y de esos, el último costo más reciente en dólares, si lo hay. */
  ultimoCostoUsd: number | null;
}
