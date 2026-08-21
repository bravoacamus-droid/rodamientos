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
