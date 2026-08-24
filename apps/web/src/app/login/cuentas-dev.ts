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
  { correo: "gerencia@rodatech.pe", nombre: "Willy Rodríguez", rol: "Gerencia", atajo: true },
  { correo: "admin@rodatech.pe", nombre: "Ana Salazar", rol: "Administración", atajo: false },
  { correo: "ventas@rodatech.pe", nombre: "Carlos Mendoza", rol: "Ventas", atajo: true },
  { correo: "almacen@rodatech.pe", nombre: "Julio Ramos", rol: "Almacén", atajo: false },
  { correo: "compras@rodatech.pe", nombre: "Rosa Quispe", rol: "Compras", atajo: false },
  { correo: "cobranzas@rodatech.pe", nombre: "Luis Tafur", rol: "Cobranzas", atajo: false },
] as const;

/**
 * Los botones que se pintan. Solo dos.
 *
 * Las seis cuentas existen y todas sirven para entrar escribiendo el correo:
 * la lista de arriba es la que siembra `pnpm db:usuarios` y contra la que
 * valida la Server Action. Lo que se recorta es el PANEL — seis botones para
 * enseñar el sistema es ruido, y el que enseña quiere dos: la vista del dueño
 * y la del vendedor.
 *
 * Gerencia lo ve todo y puede tocar productos y cuadrar stock; Ventas es el
 * día a día y además deja ver que los permisos funcionan, porque a él esas
 * dos cosas le salen bloqueadas. Para cambiar cuáles se muestran basta mover
 * el `atajo` de arriba.
 */
export const ATAJOS_VISIBLES = CUENTAS_DEV.filter((c) => c.atajo);

/**
 * ¿Se pueden ofrecer los atajos?
 *
 * Hacen falta DOS cosas, y las dos son deliberadas:
 *
 *   1. Que exista `RODATECH_DEV_PASSWORD`. Sin contraseña no hay atajo que dar.
 *   2. Que estemos fuera de producción, O que alguien haya puesto
 *      `RODATECH_ATAJOS=1` a mano.
 *
 * El segundo caso existe por el despliegue de pruebas: Vercel compila con
 * `NODE_ENV=production` aunque sea un preview, así que solo con la primera
 * condición el panel desaparecía justo donde más falta hace — enseñándole el
 * sistema al cliente.
 *
 * Se pide una variable EXPLÍCITA y no se deduce del nombre del despliegue: el
 * día de la entrega se borra esa variable y el panel se va, sin depender de
 * que alguien se acuerde de tocar el código. Mientras esté puesta, cualquiera
 * con la URL entra con un clic; conviene tenerlo presente.
 */
export function hayAtajos(): boolean {
  if (!process.env.RODATECH_DEV_PASSWORD) return false;
  if (process.env.RODATECH_ATAJOS === "1") return true;
  return process.env.NODE_ENV !== "production";
}
