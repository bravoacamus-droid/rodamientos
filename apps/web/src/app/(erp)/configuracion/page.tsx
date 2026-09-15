import { redirect } from "next/navigation";

/**
 * `/configuracion` ya no es una pantalla: es tres.
 *
 * Se mantiene la ruta y redirige a la primera en vez de devolver un 404. Es la
 * dirección que está en los marcadores de Luis y la que enlazaban las pantallas
 * viejas; romperla no arregla nada.
 */
export default function PaginaConfiguracion() {
  redirect("/configuracion/empresa");
}
