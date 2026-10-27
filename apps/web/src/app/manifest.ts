import type { MetadataRoute } from "next";

/**
 * El manifiesto de la aplicación (162).
 *
 * Existe por los avisos al celular, no por instalar el ERP como app: en
 * iPhone, Safari solo deja recibir notificaciones a una página «añadida a
 * pantalla de inicio», y para eso necesita esto. En Android sirve para que el
 * icono del aviso y el de la pantalla de inicio sean el del ERP.
 *
 * Sin caché offline: ver `public/sw.js`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rodatech ERP",
    short_name: "Rodatech",
    description: "ERP de Inversiones Rodatech E.I.R.L.",
    lang: "es-PE",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f4f6f8",
    theme_color: "#0e4c73",
    icons: [
      { src: "/iconos/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/iconos/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/iconos/icono-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
