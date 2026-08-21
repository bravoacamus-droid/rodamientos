export { refrescarSesion as middleware } from "@rodatech/db/middleware";

export const config = {
  matcher: [
    /**
     * Todo salvo assets estáticos y archivos con extensión. Importa que el
     * middleware NO corra sobre imágenes ni fuentes: cada ejecución es una
     * llamada al servidor de auth, y en Vercel eso se paga.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)",
  ],
};
