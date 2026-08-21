import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rodatech ERP · Inversiones Rodatech E.I.R.L.",
    short_name: "Rodatech ERP",
    description:
      "ERP comercial para distribución de rodamientos y repuestos de mantenimiento industrial.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0E4C73",
    theme_color: "#0E4C73",
    lang: "es-PE",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
