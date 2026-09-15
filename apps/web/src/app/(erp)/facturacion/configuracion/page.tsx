import { redirect } from "next/navigation";

/**
 * El certificado y las credenciales SOL se mudaron a Configuración (15/09).
 *
 * Es configuración, y estar bajo facturación obligaba a saber que para cambiar
 * el certificado había que entrar a emitir una factura. La ruta se queda y
 * redirige: es la que enlazaban las pantallas viejas y la que está en los
 * marcadores.
 */
export default function PaginaConfiguracionFacturacion() {
  redirect("/configuracion/sunat");
}
