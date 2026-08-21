import "server-only";

/**
 * Cuentas de desarrollo, una por rol. Se crean con `pnpm db:usuarios`.
 *
 * Vive en su propio módulo y no junto a las Server Actions porque un archivo
 * con "use server" solo puede exportar funciones async — una constante ahí
 * rompe el build.
 *
 * El import de "server-only" garantiza que la lista no se pueda arrastrar por
 * accidente a un componente cliente.
 */
export const CUENTAS_DEV = [
  { correo: "gerencia@rodatech.pe", nombre: "Willy Rodríguez", rol: "Gerencia" },
  { correo: "admin@rodatech.pe", nombre: "Ana Salazar", rol: "Administración" },
  { correo: "ventas@rodatech.pe", nombre: "Carlos Mendoza", rol: "Ventas" },
  { correo: "almacen@rodatech.pe", nombre: "Julio Ramos", rol: "Almacén" },
  { correo: "compras@rodatech.pe", nombre: "Rosa Quispe", rol: "Compras" },
  { correo: "cobranzas@rodatech.pe", nombre: "Luis Tafur", rol: "Cobranzas" },
] as const;

/** ¿Se pueden ofrecer los atajos? Solo fuera de producción y con clave puesta. */
export function hayAtajos(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    Boolean(process.env.RODATECH_DEV_PASSWORD)
  );
}
