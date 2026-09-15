/**
 * Lo que una persona puede cambiar de sí misma.
 *
 * La lista es corta a propósito, y lo que NO está es lo importante:
 *
 *   · **el rol** no se toca desde aquí, ni desde ningún sitio que no sea la
 *     pantalla de usuarios de gerencia. Y ya no es solo una regla de la
 *     pantalla: la migración 077 (11/09) puso un trigger en la base, porque
 *     hasta entonces cualquier empleado podía ascenderse a gerencia con una
 *     petición directa;
 *   · **`activo`**, por lo mismo: quien se desactiva a sí mismo se deja fuera
 *     y necesita que otro lo vuelva a meter;
 *   · **el correo**, porque es con el que se entra. Cambiarlo es cambiar la
 *     credencial, y eso no se hace en el mismo formulario donde se corrige un
 *     teléfono. Se enseña, y se dice a quién pedírselo.
 */
export interface MiPerfil {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  cargo: string | null;
  /** Solo para enseñarlo. No se edita aquí. */
  rol: string;
  ultimo_acceso: string | null;
}

/** Lo que viaja al guardar. Tres campos, y ninguno es una credencial. */
export interface CambiosPerfil {
  nombre: string;
  telefono: string | null;
  cargo: string | null;
}

/**
 * El mínimo de la contraseña.
 *
 * Ocho, que es lo que exige Supabase Auth por defecto. Se repite aquí para
 * poder decirlo ANTES de mandar el formulario: enterarse del mínimo por un
 * error del servidor, después de escribirla dos veces, es la peor forma de
 * enterarse.
 */
export const MINIMO_CONTRASENA = 8;
