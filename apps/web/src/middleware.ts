import type { NextRequest } from "next/server";
import { refrescarSesion } from "@rodatech/db/middleware";

import { puedeAbrir } from "@/lib/navegacion";

/**
 * La sesión, y desde el 21/10 también la puerta de «Ver»: lo que el rol no
 * puede abrir se reescribe a `/sin-permiso` ANTES de generar la página, para
 * que sus datos no viajen (auditoría, M9). Las reglas son las del menú
 * (`puedeAbrir`), las mismas que usa `GuardaVer` en el navegador.
 */
export function middleware(request: NextRequest) {
  return refrescarSesion(request, { puedeVer: puedeAbrir, rutaSinPermiso: "/sin-permiso" });
}

export const config = {
  matcher: [
    /**
     * Todo salvo assets estáticos y archivos con extensión. Importa que el
     * middleware NO corra sobre imágenes ni fuentes: cada ejecución es una
     * llamada al servidor de auth, y en Vercel eso se paga.
     */
    /*
     * 162: tres rutas sin sesión. El manifiesto y el service worker los pide
     * el navegador a pelo (sin la sesión, o antes de tenerla), y si se
     * redirigen a /login la instalación y los avisos fallan sin decir por
     * qué. `/api/avisos/` la llama Vercel Cron, que no tiene sesión: la
     * protege su `CRON_SECRET`, comprobado dentro de la ruta.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest$|sw\\.js$|api/avisos/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)",
  ],
};
